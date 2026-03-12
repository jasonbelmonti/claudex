import type { IngestCursorKey } from "./cursor";
import type { DiscoveryEvent, DiscoveryRootConfig } from "./discovery";
import { resolveActiveDiscoveryRoots, type SkippedDiscoveryRoot } from "./duplicate-roots";
import { listMatchedRootFiles } from "./matched-root-files";
import { processMatchedFile } from "./process-file";
import {
  createRootSnapshot,
  reconcileRootSnapshot,
  type RootSnapshot,
} from "./reconcile";
import type { DiscoveryPhase } from "./source";
import type { SessionIngestService, SessionIngestServiceOptions } from "./service";
import type { IngestWarning } from "./warnings";
import { createIngestWatchLoop, type IngestWatchLoop } from "./watch-loop";

const DEFAULT_WATCH_INTERVAL_MS = 250;

export function createSessionIngestService(
  options: SessionIngestServiceOptions,
): SessionIngestService {
  return new DefaultSessionIngestService(options);
}

class DefaultSessionIngestService implements SessionIngestService {
  readonly roots: DiscoveryRootConfig[];

  private readonly activeRoots: DiscoveryRootConfig[];
  private readonly skippedRoots: SkippedDiscoveryRoot[];
  private readonly rootSnapshots = new Map<string, RootSnapshot>();
  private duplicateRootsEmitted = false;
  private watchLoop: IngestWatchLoop | null = null;
  private started = false;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: SessionIngestServiceOptions) {
    this.roots = [...options.roots];

    const resolvedRoots = resolveActiveDiscoveryRoots(this.roots);

    this.activeRoots = resolvedRoots.activeRoots;
    this.skippedRoots = resolvedRoots.skippedRoots;
  }

  async start(): Promise<void> {
    await this.runSerialized(async () => {
      if (this.started) {
        return;
      }

      this.started = true;

      await this.emitSkippedRoots();

      const watchRoots = this.activeRoots.filter((root) => root.watch);

      for (const root of watchRoots) {
        await this.emitDiscoveryEvent({
          type: "watch.started",
          provider: root.provider,
          rootPath: root.path,
          discoveryPhase: "watch",
        });
      }

      if (watchRoots.length > 0) {
        await this.scanRoots(watchRoots, "initial_scan");
        this.watchLoop = createIngestWatchLoop({
          intervalMs: this.options.watchIntervalMs ?? DEFAULT_WATCH_INTERVAL_MS,
          onTick: async () => {
            await this.runSerialized(async () => {
              await this.reconcileRoots(watchRoots, "watch");
            });
          },
        });
      }
    });
  }

  async stop(): Promise<void> {
    const wasStarted = this.started;
    const watchLoop = this.watchLoop;

    this.started = false;
    this.watchLoop = null;

    await watchLoop?.stop();

    await this.runSerialized(async () => {
      if (!wasStarted) {
        return;
      }

      const watchRoots = this.activeRoots.filter((root) => root.watch);

      for (const root of watchRoots) {
        await this.emitDiscoveryEvent({
          type: "watch.stopped",
          provider: root.provider,
          rootPath: root.path,
          discoveryPhase: "watch",
        });
      }
    });
  }

  async scanNow(): Promise<void> {
    await this.runSerialized(async () => {
      await this.emitSkippedRoots();
      await this.scanRoots(this.activeRoots, "initial_scan");
    });
  }

  async reconcileNow(): Promise<void> {
    await this.runSerialized(async () => {
      await this.emitSkippedRoots();
      await this.reconcileRoots(this.activeRoots, "reconcile");
    });
  }

  private async scanRoots(
    roots: DiscoveryRootConfig[],
    discoveryPhase: Extract<DiscoveryPhase, "initial_scan">,
  ): Promise<void> {
    for (const root of roots) {
      await this.emitDiscoveryEvent({
        type: "scan.started",
        provider: root.provider,
        rootPath: root.path,
        discoveryPhase,
      });

      const matchedFiles = await listMatchedRootFiles(root, this.options.registries);

      if (!matchedFiles) {
        await this.handleMissingRoot(root, discoveryPhase);
        continue;
      }

      for (const file of matchedFiles) {
        await processMatchedFile({
          root,
          filePath: file.filePath,
          selection: file.selection,
          discoveryPhase,
          discoveryEventType: "file.discovered",
          serviceOptions: this.options,
        });
      }

      this.rootSnapshots.set(toRootSnapshotKey(root), createRootSnapshot(matchedFiles));

      await this.emitDiscoveryEvent({
        type: "scan.completed",
        provider: root.provider,
        rootPath: root.path,
        discoveryPhase,
      });
    }
  }

  private async reconcileRoots(
    roots: DiscoveryRootConfig[],
    discoveryPhase: Extract<DiscoveryPhase, "reconcile" | "watch">,
  ): Promise<void> {
    for (const root of roots) {
      if (discoveryPhase === "reconcile") {
        await this.emitDiscoveryEvent({
          type: "reconcile.started",
          provider: root.provider,
          rootPath: root.path,
          discoveryPhase,
        });
      }

      const matchedFiles = await listMatchedRootFiles(root, this.options.registries);

      if (!matchedFiles) {
        await this.handleMissingRoot(root, discoveryPhase);

        if (discoveryPhase === "reconcile") {
          await this.emitDiscoveryEvent({
            type: "reconcile.completed",
            provider: root.provider,
            rootPath: root.path,
            discoveryPhase,
          });
        }

        continue;
      }

      const snapshotKey = toRootSnapshotKey(root);
      const result = reconcileRootSnapshot(this.rootSnapshots.get(snapshotKey), matchedFiles);

      for (const file of result.discoveredFiles) {
        await processMatchedFile({
          root,
          filePath: file.filePath,
          selection: file.selection,
          discoveryPhase,
          discoveryEventType: "file.discovered",
          serviceOptions: this.options,
        });
      }

      for (const file of result.changedFiles) {
        await processMatchedFile({
          root,
          filePath: file.filePath,
          selection: file.selection,
          discoveryPhase,
          discoveryEventType: "file.changed",
          serviceOptions: this.options,
        });
      }

      for (const file of result.deletedFiles) {
        await this.handleDeletedFile(root, file.filePath, discoveryPhase);
      }

      this.rootSnapshots.set(snapshotKey, result.nextSnapshot);

      if (discoveryPhase === "reconcile") {
        await this.emitDiscoveryEvent({
          type: "reconcile.completed",
          provider: root.provider,
          rootPath: root.path,
          discoveryPhase,
        });
      }
    }
  }

  private async handleDeletedFile(
    root: DiscoveryRootConfig,
    filePath: string,
    discoveryPhase: Extract<DiscoveryPhase, "reconcile" | "watch">,
  ): Promise<void> {
    const cursorKey: IngestCursorKey = {
      provider: root.provider,
      rootPath: root.path,
      filePath,
    };

    await this.options.cursorStore?.delete(cursorKey);
    await this.emitDiscoveryEvent({
      type: "file.deleted",
      provider: root.provider,
      rootPath: root.path,
      filePath,
      discoveryPhase,
    });
  }

  private async handleMissingRoot(
    root: DiscoveryRootConfig,
    discoveryPhase: DiscoveryPhase,
  ): Promise<void> {
    await this.emitDiscoveryEvent({
      type: "root.skipped",
      provider: root.provider,
      rootPath: root.path,
      discoveryPhase,
      detail: "Root path is missing or unreadable",
    });
  }

  private async emitSkippedRoots(): Promise<void> {
    if (this.duplicateRootsEmitted) {
      return;
    }

    this.duplicateRootsEmitted = true;

    for (const skippedRoot of this.skippedRoots) {
      await this.emitWarning({
        code: "duplicate-root",
        message: skippedRoot.detail,
        provider: skippedRoot.root.provider,
        filePath: skippedRoot.root.path,
      });

      await this.emitDiscoveryEvent({
        type: "root.skipped",
        provider: skippedRoot.root.provider,
        rootPath: skippedRoot.root.path,
        discoveryPhase: "initial_scan",
        detail: skippedRoot.detail,
      });
    }
  }

  private async emitDiscoveryEvent(discoveryEvent: DiscoveryEvent): Promise<void> {
    await this.options.onDiscoveryEvent?.(discoveryEvent);
  }

  private async emitWarning(warning: IngestWarning): Promise<void> {
    await this.options.onWarning?.(warning);
  }

  private runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const nextOperation = this.operationQueue.then(operation, operation);

    this.operationQueue = nextOperation.then(
      () => undefined,
      () => undefined,
    );

    return nextOperation;
  }
}

function toRootSnapshotKey(root: DiscoveryRootConfig): string {
  return `${root.provider}:${root.path}`;
}
