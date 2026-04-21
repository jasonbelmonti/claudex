import { expect, test } from "#test-support";

import { createIngestSource } from "../../src/ingest/claude/parser-core.js";
import { createCodexIngestSource } from "../../src/ingest/codex/parser-core.js";
import type { IngestParseContext } from "../../src/ingest/registry.js";

function createParseContext(options: {
  provider: "claude" | "codex";
  rootMetadata?: Record<string, unknown>;
  matchMetadata?: Record<string, unknown>;
}): IngestParseContext {
  return {
    root: {
      provider: options.provider,
      path: `/tmp/${options.provider}`,
      metadata: options.rootMetadata,
    },
    filePath: `/tmp/${options.provider}/source.jsonl`,
    discoveryPhase: "initial_scan",
    cursor: null,
    match: {
      kind: options.provider === "codex" ? "session-index" : "transcript",
      metadata: options.matchMetadata,
    },
  };
}

test("Claude parser source preserves root-only, match-only, and merged metadata", () => {
  expect(
    createIngestSource(
      createParseContext({
        provider: "claude",
        rootMetadata: { lane: "root-only" },
      }),
    ).metadata,
  ).toEqual({ lane: "root-only" });

  expect(
    createIngestSource(
      createParseContext({
        provider: "claude",
        matchMetadata: { artifact: "match-only" },
      }),
    ).metadata,
  ).toEqual({ artifact: "match-only" });

  expect(
    createIngestSource(
      createParseContext({
        provider: "claude",
        rootMetadata: { lane: "root", shared: "root" },
        matchMetadata: { artifact: "match", shared: "match" },
      }),
    ).metadata,
  ).toEqual({
    lane: "root",
    artifact: "match",
    shared: "match",
  });
});

test("Codex parser source preserves root-only, match-only, and merged metadata", () => {
  expect(
    createCodexIngestSource(
      createParseContext({
        provider: "codex",
        rootMetadata: { lane: "root-only" },
      }),
    ).metadata,
  ).toEqual({ lane: "root-only" });

  expect(
    createCodexIngestSource(
      createParseContext({
        provider: "codex",
        matchMetadata: { artifact: "match-only" },
      }),
    ).metadata,
  ).toEqual({ artifact: "match-only" });

  expect(
    createCodexIngestSource(
      createParseContext({
        provider: "codex",
        rootMetadata: { lane: "root", shared: "root" },
        matchMetadata: { artifact: "match", shared: "match" },
      }),
      { line: 3 },
    ),
  ).toMatchObject({
    metadata: {
      lane: "root",
      artifact: "match",
      shared: "match",
    },
    location: { line: 3, byteOffset: undefined },
  });
});
