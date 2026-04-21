import { expect, test } from "bun:test";

import type { IngestCursor } from "@jasonbelmonti/claudex/ingest";

import { resolveCursorRecovery } from "../../src/ingest/cursor-recovery.js";

const SOURCE = {
  provider: "claude" as const,
  kind: "transcript" as const,
  discoveryPhase: "initial_scan" as const,
  rootPath: "/tmp/claude",
  filePath: "/tmp/claude/session.jsonl",
};

const FILE_STATE = {
  size: 10,
  fingerprint: "1:2",
  continuityToken: "token-10",
  modifiedAtMs: 1,
};

function createStoredCursor(
  overrides: Partial<IngestCursor> = {},
): IngestCursor {
  return {
    provider: "claude",
    rootPath: SOURCE.rootPath,
    filePath: SOURCE.filePath,
    byteOffset: 10,
    line: 1,
    fingerprint: FILE_STATE.fingerprint,
    continuityToken: FILE_STATE.continuityToken,
    ...overrides,
  };
}

test("resolveCursorRecovery resets cursors missing continuity state", () => {
  const result = resolveCursorRecovery({
    storedCursor: createStoredCursor({
      byteOffset: 4,
      continuityToken: undefined,
    }),
    fileState: {
      ...FILE_STATE,
      size: 4,
      continuityToken: "token-4",
    },
    source: SOURCE,
  });

  expect(result).toMatchObject({
    cursor: null,
    skip: false,
  });
  expect(result.warnings.map((warning) => warning.code)).toEqual([
    "cursor-reset",
  ]);
});

test("resolveCursorRecovery skips replay when an EOF cursor has no deferred snapshot work", () => {
  const result = resolveCursorRecovery({
    storedCursor: createStoredCursor(),
    fileState: FILE_STATE,
    source: SOURCE,
  });

  expect(result).toMatchObject({
    cursor: createStoredCursor(),
    skip: true,
    warnings: [],
  });
});

test("resolveCursorRecovery keeps EOF cursors active when deferred snapshot replay remains", () => {
  const storedCursor = createStoredCursor({
    metadata: {
      claudeSnapshotReplayIndex: 2,
    },
  });

  const result = resolveCursorRecovery({
    storedCursor,
    fileState: FILE_STATE,
    source: SOURCE,
  });

  expect(result).toMatchObject({
    cursor: storedCursor,
    skip: false,
    warnings: [],
  });
});
