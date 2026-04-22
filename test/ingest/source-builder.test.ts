import { expect, test } from "#test-support";

import { buildObservedEventSource } from "../../src/ingest/source-builder.js";

test("buildObservedEventSource preserves metadata presence and location semantics", () => {
  const baseOptions = {
    provider: "claude" as const,
    kind: "transcript" as const,
    discoveryPhase: "initial_scan" as const,
    rootPath: "/tmp/root",
    filePath: "/tmp/root/transcript.jsonl",
  };

  expect(buildObservedEventSource(baseOptions)).toEqual({
    provider: "claude",
    kind: "transcript",
    discoveryPhase: "initial_scan",
    rootPath: "/tmp/root",
    filePath: "/tmp/root/transcript.jsonl",
  });

  expect(
    buildObservedEventSource({
      ...baseOptions,
      rootMetadata: { lane: "root" },
    }),
  ).toEqual({
    provider: "claude",
    kind: "transcript",
    discoveryPhase: "initial_scan",
    rootPath: "/tmp/root",
    filePath: "/tmp/root/transcript.jsonl",
    metadata: { lane: "root" },
  });

  expect(
    buildObservedEventSource({
      ...baseOptions,
      matchMetadata: { artifact: "match" },
    }),
  ).toEqual({
    provider: "claude",
    kind: "transcript",
    discoveryPhase: "initial_scan",
    rootPath: "/tmp/root",
    filePath: "/tmp/root/transcript.jsonl",
    metadata: { artifact: "match" },
  });

  expect(
    buildObservedEventSource({
      ...baseOptions,
      rootMetadata: { lane: "root" },
      matchMetadata: { artifact: "match" },
      location: { line: 7, byteOffset: 42 },
    }),
  ).toEqual({
    provider: "claude",
    kind: "transcript",
    discoveryPhase: "initial_scan",
    rootPath: "/tmp/root",
    filePath: "/tmp/root/transcript.jsonl",
    metadata: { lane: "root", artifact: "match" },
    location: { line: 7, byteOffset: 42 },
  });
});

test("buildObservedEventSource lets match metadata win on duplicate keys", () => {
  expect(
    buildObservedEventSource({
      provider: "codex",
      kind: "session-index",
      discoveryPhase: "watch",
      rootPath: "/tmp/root",
      filePath: "/tmp/root/session-index.jsonl",
      rootMetadata: {
        lane: "root",
        nested: { source: "root" },
        shared: "root",
      },
      matchMetadata: {
        artifact: "match",
        nested: { source: "match" },
        shared: "match",
      },
    }),
  ).toEqual({
    provider: "codex",
    kind: "session-index",
    discoveryPhase: "watch",
    rootPath: "/tmp/root",
    filePath: "/tmp/root/session-index.jsonl",
    metadata: {
      lane: "root",
      artifact: "match",
      nested: { source: "match" },
      shared: "match",
    },
  });
});
