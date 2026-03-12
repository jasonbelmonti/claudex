import type { IngestCursor, IngestCursorKey } from "./cursor";
import { resolveCursorRecovery } from "./cursor-recovery";
import type { DiscoveryEvent, DiscoveryRootConfig } from "./discovery";
import type { ObservedIngestRecord } from "./events";
import { readSourceFileState, type SourceFileState } from "./file-state";
import { listDiscoveryRootFiles } from "./root-files";
import { consumeParsedRecords } from "./record-consumption";
import { selectRegistryForFile } from "./registry-selection";
import { dispatchObservedRecord } from "./record-dispatch";
import type { ObservedEventSource } from "./source";
import type { SessionIngestService, SessionIngestServiceOptions } from "./service";
import type { IngestWarning } from "./warnings";

export function createSessionIngestService(
  options: SessionIngestServiceOptions,
): SessionIngestService {
  return new DefaultSessionIngestService(options);
}

class DefaultSessionIngestService implements SessionIngestService {
  readonly roots: DiscoveryRootConfig[];
  private isStarted = false;
  private lifecycleToken = 0;
  private startPromise: Promise<void> | null = null;

  constructor(private readonly options: SessionIngestServiceOptions) {
    this.roots = [...options.roots];
  }

  async start(): Promise<void> {
    if (this.isStarted) {
      return this.startPromise ?? Promise.resolve();
    }

    this.isStarted = true;
    const token = ++this.lifecycleToken;
    const startPromise = this.runScan(token)
      .catch((error) => {
        if (this.lifecycleToken === token) {
          this.isStarted = false;
          this.lifecycleToken += 1;
        }

        throw error;
      })
      .finally(() => {
        if (this.startPromise === startPromise) {
          this.startPromise = null;
        }
      });
    this.startPromise = startPromise;
    await startPromise;
  }

  async scanNow(): Promise<void> {
    await this.runScan();
  }

  async stop(): Promise<void> {
    this.isStarted = false;
    this.lifecycleToken += 1;
    await this.startPromise;
  }

  private async runScan(lifecycleToken?: number): Promise<void> {
    for (const root of this.roots) {
      if (this.shouldAbortLifecycleRun(lifecycleToken)) {
        return;
      }

      await this.emitDiscoveryEvent({
        type: "scan.started",
        provider: root.provider,
        rootPath: root.path,
        discoveryPhase: "initial_scan",
      });

      const files = await listDiscoveryRootFiles(root).catch(() => null);

      if (!files) {
        await this.emitDiscoveryEvent({
          type: "root.skipped",
          provider: root.provider,
          rootPath: root.path,
          discoveryPhase: "initial_scan",
          detail: "Root path is missing or unreadable",
        });
        continue;
      }

      for (const filePath of files) {
        if (this.shouldAbortLifecycleRun(lifecycleToken)) {
          return;
        }

        const selection = selectRegistryForFile(this.options.registries, root, filePath);

        if (!selection) {
          continue;
        }

        const source: ObservedEventSource = {
          provider: root.provider,
          kind: selection.match.kind,
          discoveryPhase: "initial_scan",
          rootPath: root.path,
          filePath,
          metadata: selection.match.metadata,
        };

        await this.emitDiscoveryEvent({
          type: "file.discovered",
          provider: root.provider,
          rootPath: root.path,
          filePath,
          discoveryPhase: "initial_scan",
        });

        const cursorKey: IngestCursorKey = {
          provider: root.provider,
          rootPath: root.path,
          filePath,
        };
        const storedCursor = (await this.options.cursorStore?.get(cursorKey)) ?? null;
        const fileState = await readSourceFileState(filePath, storedCursor);

        if (!fileState) {
          await this.emitWarning({
            code: "file-open-failed",
            message: "File disappeared or is no longer readable",
            provider: root.provider,
            filePath,
            source,
          });
          continue;
        }

        const recovery = resolveCursorRecovery({
          storedCursor,
          fileState,
          source,
        });

        for (const warning of recovery.warnings) {
          await this.emitWarning(warning);
        }

        if (recovery.skip) {
          continue;
        }

        let latestCursor = recovery.cursor;
        let shouldClearStoredCursor = storedCursor !== null && recovery.cursor === null;
        let parseError: unknown = null;
        let consumerError: unknown = null;
        let records: AsyncIterable<ObservedIngestRecord> | null = null;

        try {
          records = await selection.registry.parseFile({
            root,
            filePath,
            discoveryPhase: "initial_scan",
            cursor: recovery.cursor,
            match: selection.match,
          });
        } catch (error) {
          parseError = error;
        }

        if (records) {
          const consumption = await consumeParsedRecords({
            initialCursor: recovery.cursor,
            records,
            onRecord: async (record) => {
              await dispatchObservedRecord(this.options, record);
            },
          });

          latestCursor = consumption.latestCursor;
          parseError = consumption.parseError;
          consumerError = consumption.consumerError;
          shouldClearStoredCursor = shouldClearStoredCursor && latestCursor === null;
        }

        if (parseError) {
          await this.emitWarning({
            code: "parse-failed",
            message: "Registry parser failed while processing the file",
            provider: root.provider,
            filePath,
            source,
            cause: parseError,
          });
        }

        const persistedCursor = latestCursor
          ? await this.buildPersistedCursor({
              cursor: latestCursor,
              filePath,
              preParseState: fileState,
              source,
            })
          : null;

        if (persistedCursor) {
          await this.options.cursorStore?.set(persistedCursor);
        } else if (shouldClearStoredCursor) {
          await this.options.cursorStore?.delete(cursorKey);
        }

        if (parseError) {
          continue;
        }

        if (consumerError) {
          throw consumerError;
        }
      }

      await this.emitDiscoveryEvent({
        type: "scan.completed",
        provider: root.provider,
        rootPath: root.path,
        discoveryPhase: "initial_scan",
      });
    }
  }

  private async emitDiscoveryEvent(discoveryEvent: DiscoveryEvent): Promise<void> {
    await this.options.onDiscoveryEvent?.(discoveryEvent);
  }

  private async emitWarning(warning: IngestWarning): Promise<void> {
    await this.options.onWarning?.(warning);
  }

  private shouldAbortLifecycleRun(lifecycleToken?: number): boolean {
    return lifecycleToken !== undefined && lifecycleToken !== this.lifecycleToken;
  }

  private async buildPersistedCursor(options: {
    cursor: IngestCursor;
    filePath: string;
    preParseState: SourceFileState;
    source: ObservedEventSource;
  }): Promise<IngestCursor | null> {
    const postParseState = await readSourceFileState(options.filePath, options.cursor);

    if (!postParseState) {
      await this.emitWarning({
        code: "file-open-failed",
        message: "File disappeared or is no longer readable while updating the cursor",
        provider: options.source.provider,
        filePath: options.source.filePath,
        source: options.source,
      });
      return null;
    }

    if (
      postParseState.fingerprint !== options.preParseState.fingerprint ||
      postParseState.revision !== options.preParseState.revision ||
      options.cursor.byteOffset > postParseState.size ||
      (options.cursor.byteOffset > 0 && !postParseState.continuityToken)
    ) {
      await this.emitWarning({
        code: "cursor-reset",
        message: "File changed while parsing; not persisting the cursor",
        provider: options.source.provider,
        filePath: options.source.filePath,
        source: options.source,
      });
      return null;
    }

    return {
      ...options.cursor,
      fingerprint: postParseState.fingerprint,
      continuityToken: postParseState.continuityToken ?? undefined,
      updatedAt: new Date().toISOString(),
    };
  }
}
