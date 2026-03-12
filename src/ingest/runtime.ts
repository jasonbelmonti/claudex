import type { IngestCursorKey } from "./cursor";
import type { DiscoveryEvent, DiscoveryRootConfig } from "./discovery";
import { listDiscoveryRootFiles } from "./root-files";
import { selectRegistryForFile } from "./registry-selection";
import { dispatchObservedRecord } from "./record-dispatch";
import type { SessionIngestService, SessionIngestServiceOptions } from "./service";

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
        const cursor = (await this.options.cursorStore?.get(cursorKey)) ?? null;
        const records = await selection.registry.parseFile({
          root,
          filePath,
          discoveryPhase: "initial_scan",
          cursor,
          match: selection.match,
        });
        let latestCursor = cursor;

        for await (const record of records) {
          latestCursor = record.cursor ?? latestCursor;
          await dispatchObservedRecord(this.options, record);
        }

        if (latestCursor) {
          await this.options.cursorStore?.set(latestCursor);
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
}
