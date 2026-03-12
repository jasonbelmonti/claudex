import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type {
  AgentEvent,
  ProviderId,
} from "claudex";
import type {
  DiscoveryRootConfig,
  IngestCursor,
  IngestParseContext,
  IngestProviderRegistry,
  IngestWarning,
  ObservedAgentEvent,
  ObservedIngestRecord,
  ObservedSessionIdentity,
  ObservedSessionRecord,
} from "claudex/ingest";

export async function createFixtureWorkspace(
  files: Record<string, string>,
): Promise<string> {
  const workspacePath = await mkdtemp(join(tmpdir(), "claudex-ingest-"));

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(workspacePath, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await Bun.write(filePath, contents);
  }

  return workspacePath;
}

export async function removeFixtureWorkspace(workspacePath: string): Promise<void> {
  await rm(workspacePath, { recursive: true, force: true });
}

export function createRegistry(options: {
  provider: ProviderId;
  matchExtension: string;
  recordFactory: (context: IngestParseContext) => ObservedIngestRecord[];
  parseCalls?: string[];
}): IngestProviderRegistry {
  return {
    provider: options.provider,
    matchFile(filePath) {
      return filePath.endsWith(options.matchExtension)
        ? { kind: options.provider === "codex" ? "session-index" : "transcript" }
        : null;
    },
    async *parseFile(context) {
      options.parseCalls?.push(context.filePath);

      for (const record of options.recordFactory(context)) {
        yield record;
      }
    },
  };
}

export function createObservedEventRecord(options: {
  provider: ProviderId;
  filePath: string;
  root: DiscoveryRootConfig;
  sessionId: string;
  cursor?: IngestCursor;
  warnings?: IngestWarning[];
}): ObservedAgentEvent {
  const observedSession: ObservedSessionIdentity = {
    provider: options.provider,
    sessionId: options.sessionId,
    state: "canonical",
  };

  const event: AgentEvent = {
    type: "message.completed",
    provider: options.provider,
    session: {
      provider: options.provider,
      sessionId: options.sessionId,
    },
    role: "assistant",
    text: `parsed:${options.filePath}`,
  };

  return {
    kind: "event",
    event,
    source: {
      provider: options.provider,
      kind: options.provider === "codex" ? "session-index" : "transcript",
      discoveryPhase: "initial_scan",
      rootPath: options.root.path,
      filePath: options.filePath,
    },
    observedSession,
    completeness: "best-effort",
    cursor: options.cursor,
    warnings: options.warnings,
  };
}

export function createObservedSessionRecord(options: {
  provider: ProviderId;
  filePath: string;
  root: DiscoveryRootConfig;
  sessionId: string;
  cursor?: IngestCursor;
  warnings?: IngestWarning[];
}): ObservedSessionRecord {
  return {
    kind: "session",
    observedSession: {
      provider: options.provider,
      sessionId: options.sessionId,
      state: "provisional",
    },
    source: {
      provider: options.provider,
      kind: options.provider === "codex" ? "session-index" : "transcript",
      discoveryPhase: "initial_scan",
      rootPath: options.root.path,
      filePath: options.filePath,
    },
    completeness: "best-effort",
    reason: options.provider === "codex" ? "index" : "transcript",
    cursor: options.cursor,
    warnings: options.warnings,
  };
}
