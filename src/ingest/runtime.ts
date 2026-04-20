import type { IngestCursorKey } from "./cursor.js";
import type { DiscoveryEvent, DiscoveryRootConfig } from "./discovery.js";
import { resolveActiveDiscoveryRoots, type SkippedDiscoveryRoot } from "./duplicate-roots.js";
import { listMatchedRootFiles, type UnavailableRootFile } from "./matched-root-files.js";
import { processMatchedFile } from "./process-file.js";
import {
  createRootSnapshot,
  reconcileRootSnapshot,
  type RootSnapshot,
} from "./reconcile.js";
import { getDiscoveryRootIdentityKey } from "./root-identity.js";
import type { DiscoveryPhase } from "./source.js";
import { buildObservedEventSource } from "./source-builder.js";
import type { SessionIngestService, SessionIngestServiceOptions } from "./service.js";
import type { IngestWarning } from "./warnings.js";
import { createIngestWatchLoop, type IngestWatchLoop } from "./watch-loop.js";

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
      let startupWatchLoop: IngestWatchLoop | null = null;
      const startedWatchRoots: DiscoveryRootConfig[] = [];
      this.startToken = startToken;
      const watchRoots = this.getWatchRoots();

      try {
        await this.emitSkippedRoots();
        await this.scanRoots(this.activeRoots, "initial_scan");

        if (watchRoots.length > 0) {
          if (this.startToken !== startToken) {
            return;
          }

          await this.emitWatchStarted(watchRoots, startedWatchRoots);

          if (this.startToken !== startToken) {
            await this.emitWatchStopped(startedWatchRoots);
            startedWatchRoots.length = 0;
            return;
          }

          startupWatchLoop = this.createWatchLoop(watchRoots, () => startupWatchLoop);

          this.watchLoop = startupWatchLoop;
        }

        if (this.startToken !== startToken) {
          return;
        }

        this.started = true;
      } catch (error) {
        if (startupWatchLoop) {
          await startupWatchLoop.stop();
        }

        if (startedWatchRoots.length > 0) {
          await this.emitWatchStopped(startedWatchRoots);
          startedWatchRoots.length = 0;
        }

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

      await this.emitWatchStopped(this.getWatchRoots());
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

      this.rootSnapshots.set(getDiscoveryRootIdentityKey(root), createRootSnapshot(matchedFiles.files));

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

      const snapshotKey = getDiscoveryRootIdentityKey(root);
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
        source: buildObservedEventSource({
          provider: root.provider,
          kind: file.selection.match.kind,
          discoveryPhase,
          rootPath: root.path,
          filePath: file.filePath,
          rootMetadata: root.metadata,
          matchMetadata: file.selection.match.metadata,
        }),
      });
    }
  }

  private getWatchRoots(): DiscoveryRootConfig[] {
    return this.activeRoots.filter((root) => root.watch);
  }

  private async emitWatchStarted(
    roots: DiscoveryRootConfig[],
    startedWatchRoots: DiscoveryRootConfig[],
  ): Promise<void> {
    for (const root of roots) {
      startedWatchRoots.push(root);
      await this.emitDiscoveryEvent({
        type: "watch.started",
        provider: root.provider,
        rootPath: root.path,
        discoveryPhase: "watch",
      });
    }
  }

  private createWatchLoop(
    roots: DiscoveryRootConfig[],
    getWatchLoop: () => IngestWatchLoop | null,
  ): IngestWatchLoop {
    return createIngestWatchLoop({
      intervalMs: this.options.watchIntervalMs ?? DEFAULT_WATCH_INTERVAL_MS,
      onTick: async () => {
        await this.runSerialized(async () => {
          await this.reconcileRoots(roots, "watch");
        });
      },
      onTickError: async (error) => {
        await this.handleWatchTickFailure(roots, getWatchLoop(), error);
      },
    });
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

      await this.emitWatchStopped([root], error);
    }
  }

  private async emitWatchStopped(
    roots: DiscoveryRootConfig[],
    raw?: unknown,
  ): Promise<void> {
    for (const root of roots) {
      await this.emitDiscoveryEvent({
        type: "watch.stopped",
        provider: root.provider,
        rootPath: root.path,
        discoveryPhase: "watch",
        ...(raw === undefined ? {} : { raw }),
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
