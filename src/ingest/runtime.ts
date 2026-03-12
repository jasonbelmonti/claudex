import type { IngestCursorKey } from "./cursor";
import type { DiscoveryEvent, DiscoveryRootConfig } from "./discovery";
import { resolveActiveDiscoveryRoots, type SkippedDiscoveryRoot } from "./duplicate-roots";
import { listMatchedRootFiles, type UnavailableRootFile } from "./matched-root-files";
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
  private startToken: symbol | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly options: SessionIngestServiceOptions) {
    this.roots = [...options.roots];

    const resolvedRoots = resolveActiveDiscoveryRoots(this.roots);

    this.activeRoots = resolvedRoots.activeRoots;
    this.skippedRoots = resolvedRoots.skippedRoots;
  }

  async start(): Promise<void> {
    await this.runSerialized(async () => {
      if (this.started || this.startToken) {
        return;
      }

      const startToken = Symbol("ingest-start");
      this.startToken = startToken;
      const watchRoots = this.activeRoots.filter((root) => root.watch);

      try {
        await this.emitSkippedRoots();

        if (watchRoots.length > 0) {
          await this.scanRoots(watchRoots, "initial_scan");

          if (this.startToken !== startToken) {
            return;
          }

          let watchLoop: IngestWatchLoop | null = null;

          watchLoop = createIngestWatchLoop({
            intervalMs: this.options.watchIntervalMs ?? DEFAULT_WATCH_INTERVAL_MS,
            onTick: async () => {
              await this.runSerialized(async () => {
                await this.reconcileRoots(watchRoots, "watch");
              });
            },
            onTickError: async (error) => {
              await this.handleWatchTickFailure(watchRoots, watchLoop, error);
            },
          });

          if (this.startToken !== startToken) {
            await watchLoop.stop();
            return;
          }

          this.watchLoop = watchLoop;

          for (const root of watchRoots) {
            await this.emitDiscoveryEvent({
              type: "watch.started",
              provider: root.provider,
              rootPath: root.path,
              discoveryPhase: "watch",
            });
          }
        }

        this.started = true;
      } catch (error) {
        if (this.startToken === startToken) {
          this.watchLoop = null;
          this.started = false;
        }

        throw error;
      } finally {
        if (this.startToken === startToken) {
          this.startToken = null;
        }
      }
    });
  }

  async stop(): Promise<void> {
    const wasStarted = this.started;
    const wasStarting = this.startToken !== null;
    const watchLoop = this.watchLoop;
    const didCreateWatchLoop = watchLoop !== null;

    this.started = false;
    this.startToken = null;
    this.watchLoop = null;

    await watchLoop?.stop();

    await this.runSerialized(async () => {
      if ((!wasStarted && !wasStarting) || !didCreateWatchLoop) {
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

      await this.emitUnavailableFileWarnings(root, matchedFiles.unavailableFiles, discoveryPhase);

      for (const file of matchedFiles.files) {
        await processMatchedFile({
          root,
          filePath: file.filePath,
          selection: file.selection,
          discoveryPhase,
          discoveryEventType: "file.discovered",
          serviceOptions: this.options,
        });
      }

      this.rootSnapshots.set(toRootSnapshotKey(root), createRootSnapshot(matchedFiles.files));

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

      await this.emitUnavailableFileWarnings(root, matchedFiles.unavailableFiles, discoveryPhase);

      const snapshotKey = toRootSnapshotKey(root);
      const result = reconcileRootSnapshot(
        this.rootSnapshots.get(snapshotKey),
        matchedFiles.files,
        matchedFiles.unavailableFiles.map((file) => file.filePath),
      );

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

  private async emitUnavailableFileWarnings(
    root: DiscoveryRootConfig,
    unavailableFiles: UnavailableRootFile[],
    discoveryPhase: DiscoveryPhase,
  ): Promise<void> {
    for (const file of unavailableFiles) {
      await this.emitWarning({
        code: "file-open-failed",
        message: "File disappeared or is no longer readable",
        provider: root.provider,
        filePath: file.filePath,
        source: {
          provider: root.provider,
          kind: file.selection.match.kind,
          discoveryPhase,
          rootPath: root.path,
          filePath: file.filePath,
          metadata: file.selection.match.metadata,
        },
      });
    }
  }

  private async handleWatchTickFailure(
    roots: DiscoveryRootConfig[],
    watchLoop: IngestWatchLoop | null,
    error: unknown,
  ): Promise<void> {
    if (!watchLoop || this.watchLoop !== watchLoop) {
      return;
    }

    this.started = false;
    this.startToken = null;
    this.watchLoop = null;

    for (const root of roots) {
      await this.emitWarning({
        code: "watch-failed",
        message: "Watch tick failed; watcher stopped until restart",
        provider: root.provider,
        raw: error,
        cause: error,
      });

      await this.emitDiscoveryEvent({
        type: "watch.stopped",
        provider: root.provider,
        rootPath: root.path,
        discoveryPhase: "watch",
        raw: error,
      });
    }
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
