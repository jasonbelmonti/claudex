import { mkdir, mkdtemp, rename, rm, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type {
  AgentEvent,
  ProviderId,
} from "@jasonbelmonti/claudex";
import type {
  DiscoveryPhase,
  DiscoveryRootConfig,
  IngestCursor,
  IngestParseContext,
  IngestProviderRegistry,
  IngestWarning,
  ObservedAgentEvent,
  ObservedIngestRecord,
  ObservedSessionIdentity,
  ObservedSessionRecord,
} from "@jasonbelmonti/claudex/ingest";

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

export async function rotateFile(filePath: string, nextContents: string): Promise<void> {
  await rename(filePath, `${filePath}.rotated`);
  await Bun.write(filePath, nextContents);
}

export async function truncateFile(filePath: string, size: number): Promise<void> {
  await truncate(filePath, size);
}

export async function deleteFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

export async function waitForCondition(
  predicate: () => boolean | Promise<boolean>,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
  } = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 2_000;
  const pollIntervalMs = options.pollIntervalMs ?? 20;
  const startedAt = Date.now();

  while (!(await predicate())) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Timed out waiting for condition after ${timeoutMs}ms`);
    }

    await Bun.sleep(pollIntervalMs);
  }
}

export function createRegistry(options: {
  provider: ProviderId;
  matchExtension: string;
  recordFactory: (context: IngestParseContext) => ObservedIngestRecord[];
  parseCalls?: string[];
  beforeParse?: (context: IngestParseContext) => Promise<void> | void;
  errorFactory?: (context: IngestParseContext) => Error | null;
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
      await options.beforeParse?.(context);

      const error = options.errorFactory?.(context);

      if (error) {
        throw error;
      }

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
  discoveryPhase?: DiscoveryPhase;
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
      discoveryPhase: options.discoveryPhase ?? "initial_scan",
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
  discoveryPhase?: DiscoveryPhase;
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
      discoveryPhase: options.discoveryPhase ?? "initial_scan",
      rootPath: options.root.path,
      filePath: options.filePath,
    },
    completeness: "best-effort",
    reason: options.provider === "codex" ? "index" : "transcript",
    cursor: options.cursor,
    warnings: options.warnings,
  };
}
