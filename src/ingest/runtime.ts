import type { IngestCursorKey } from "./cursor";
import { resolveCursorRecovery } from "./cursor-recovery";
import type { DiscoveryEvent, DiscoveryRootConfig } from "./discovery";
import { readSourceFileState } from "./file-state";
import { listDiscoveryRootFiles } from "./root-files";
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

  constructor(private readonly options: SessionIngestServiceOptions) {
    this.roots = [...options.roots];
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async scanNow(): Promise<void> {
    for (const root of this.roots) {
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
        const fileState = await readSourceFileState(filePath);

        if (!fileState) {
          await this.emitWarning({
            code: "file-open-failed",
            message: "File disappeared or is no longer readable",
            provider: root.provider,
            filePath,
            source,
          });
          await this.options.cursorStore?.delete(cursorKey);
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
        const shouldClearStoredCursor = storedCursor !== null && recovery.cursor === null;
        let parseError: unknown = null;

        try {
          const records = await selection.registry.parseFile({
            root,
            filePath,
            discoveryPhase: "initial_scan",
            cursor: recovery.cursor,
            match: selection.match,
          });

          for await (const record of records) {
            latestCursor = record.cursor ?? latestCursor;
            await dispatchObservedRecord(this.options, record);
          }
        } catch (error) {
          parseError = error;
          await this.emitWarning({
            code: "parse-failed",
            message: "Registry parser failed while processing the file",
            provider: root.provider,
            filePath,
            source,
            cause: error,
          });
        }

        if (latestCursor) {
          await this.options.cursorStore?.set({
            ...latestCursor,
            fingerprint: fileState.fingerprint,
            updatedAt: new Date().toISOString(),
          });
        } else if (shouldClearStoredCursor) {
          await this.options.cursorStore?.delete(cursorKey);
        }

        if (parseError) {
          continue;
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
}
