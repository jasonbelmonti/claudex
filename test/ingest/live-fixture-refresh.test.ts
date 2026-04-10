import { afterEach, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  LiveFixtureProvenanceEntry,
  LiveFixtureRefreshManifestRecord,
} from "../../scripts/ingest-audit/live-fixture-types";

import {
  createLiveFixtureSidecar,
  normalizeLiveFixtureSidecar,
} from "../../scripts/ingest-audit/sidecar";
import {
  loadRefreshManifest,
  normalizeRefreshManifest,
} from "../../scripts/ingest-audit/refresh-manifest";

const tempFiles: string[] = [];
const BASE_PROVENANCE_ENTRY: LiveFixtureProvenanceEntry = {
  capturedAt: "2026-04-09T16:10:41.718Z",
  artifactVersion:
    "rollout-2026-04-09T11-10-41-019d7302-91b1-7f90-90b3-aaa72ff11be3.jsonl#excerpt",
  providerVersion: "Codex Desktop 0.103.0",
  sdkVersion: "not-recorded",
  sanitizerVersion: "bel-632-manual-v1",
  sanitizedBy: "Codex BEL-632",
};
const BASE_MANIFEST_RECORD: LiveFixtureRefreshManifestRecord = {
  scenarioId: "live-codex-replay-parity",
  provider: "codex",
  sourceFamilies: ["codex-transcript"],
  captureKind: "sanitized-live-transcript-excerpt",
  fixturePath: "test/fixtures/codex/live-transcript-excerpt.jsonl",
  supersedesFixturePath: null,
  provenanceHistory: [],
  ...BASE_PROVENANCE_ENTRY,
};

afterEach(() => {
  for (const filePath of tempFiles.splice(0)) {
    rmSync(filePath, { force: true });
  }
});

async function readCodexFixtureMetadata(
  name: string,
): Promise<Record<string, unknown>> {
  return Bun.file(new URL(`../fixtures/codex/${name}`, import.meta.url)).json();
}

function createTempManifestPath(): string {
  const filePath = join(
    tmpdir(),
    `claudex-refresh-manifest-${crypto.randomUUID()}.json`,
  );
  tempFiles.push(filePath);
  return filePath;
}

function createProvenanceEntry(
  overrides: Partial<LiveFixtureProvenanceEntry> = {},
): LiveFixtureProvenanceEntry {
  return {
    ...BASE_PROVENANCE_ENTRY,
    ...overrides,
  };
}

function createManifestRecord(
  overrides: Partial<LiveFixtureRefreshManifestRecord> = {},
): LiveFixtureRefreshManifestRecord {
  return {
    ...BASE_MANIFEST_RECORD,
    ...overrides,
    sourceFamilies: overrides.sourceFamilies ?? BASE_MANIFEST_RECORD.sourceFamilies,
    provenanceHistory:
      overrides.provenanceHistory ?? BASE_MANIFEST_RECORD.provenanceHistory,
  };
}

test("refresh manifests validate stable scenario ids, append-only supersession, and provenance history", async () => {
  const manifestPath = createTempManifestPath();
  const manifest = [
    createManifestRecord(),
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.v2.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.jsonl",
      capturedAt: "2026-04-10T16:10:41.718Z",
      artifactVersion:
        "rollout-2026-04-10T11-10-41-019d7302-91b1-7f90-90b3-aaa72ff11be3.jsonl#excerpt",
      providerVersion: "Codex Desktop 0.103.1",
      sdkVersion: "not-recorded",
      sanitizerVersion: "bel-633-manual-v1",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [createProvenanceEntry()],
    }),
  ];

  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));

  const loadedManifest = await loadRefreshManifest(manifestPath);
  expect(loadedManifest).toHaveLength(2);
  expect(loadedManifest.map((record) => record.scenarioId)).toEqual([
    "live-codex-replay-parity",
    "live-codex-replay-parity",
  ]);
  expect(loadedManifest[1]).toMatchObject({
    fixturePath: "test/fixtures/codex/live-transcript-excerpt.v2.jsonl",
    supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.jsonl",
    provenanceHistory: [
      {
        capturedAt: "2026-04-09T16:10:41.718Z",
        artifactVersion:
          "rollout-2026-04-09T11-10-41-019d7302-91b1-7f90-90b3-aaa72ff11be3.jsonl#excerpt",
        providerVersion: "Codex Desktop 0.103.0",
        sdkVersion: "not-recorded",
        sanitizerVersion: "bel-632-manual-v1",
        sanitizedBy: "Codex BEL-632",
      },
    ],
  });

  expect(normalizeRefreshManifest(manifest)).toEqual(loadedManifest);
});

test("refresh manifest loader rejects malformed append-only records", async () => {
  const manifestPath = createTempManifestPath();
  const manifest = [
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.v2.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.jsonl",
      capturedAt: "2026-04-10T16:10:41.718Z",
      artifactVersion:
        "rollout-2026-04-10T11-10-41-019d7302-91b1-7f90-90b3-aaa72ff11be3.jsonl#excerpt",
      providerVersion: "Codex Desktop 0.103.1",
      sdkVersion: "not-recorded",
      sanitizerVersion: "bel-633-manual-v1",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [
        createProvenanceEntry(),
        {
          capturedAt: "",
          artifactVersion: "broken",
          providerVersion: "Codex Desktop 0.103.0",
          sdkVersion: "not-recorded",
          sanitizerVersion: "bel-632-manual-v1",
          sanitizedBy: "Codex BEL-632",
        },
      ],
    }),
  ];

  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));

  await expect(loadRefreshManifest(manifestPath)).rejects.toThrow(
    "Refresh manifest at",
  );
  expect(normalizeRefreshManifest(manifest)).toBeNull();
});

test("refresh manifest rejects superseding records without prior provenance", () => {
  const manifest = [
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.v2.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.jsonl",
      capturedAt: "2026-04-10T16:10:41.718Z",
      artifactVersion: "artifact-b",
      providerVersion: "Codex Desktop 0.103.1",
      sdkVersion: "not-recorded",
      sanitizerVersion: "bel-633-manual-v1",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [],
    }),
  ];

  expect(normalizeRefreshManifest(manifest)).toBeNull();
});

test("refresh manifest rejects root records with unexpected prior provenance", () => {
  const manifest = [
    createManifestRecord({
      provenanceHistory: [createProvenanceEntry()],
    }),
  ];

  expect(normalizeRefreshManifest(manifest)).toBeNull();
});

test("sidecar helpers preserve scenario-specific payloads and provenance history", async () => {
  const metadata = await readCodexFixtureMetadata(
    "live-transcript-excerpt.fixture.json",
  );

  const normalized = normalizeLiveFixtureSidecar(metadata);
  expect(normalized).not.toBeNull();

  if (normalized === null) {
    throw new Error("Expected live fixture sidecar to normalize.");
  }

  expect(normalized).toMatchObject({
    scenarioId: "live-codex-replay-parity",
    provider: "codex",
    sourceFamilies: ["codex-transcript"],
    expected: {
      sessionId: "live-codex-bel-632",
    },
  });
  expect(normalized.provenanceHistory).toBeUndefined();

  const expected = normalized.expected as Record<string, unknown>;
  const rebuilt = createLiveFixtureSidecar({
    ...normalized,
    provenanceHistory: [createProvenanceEntry()],
    expected: {
      ...expected,
      note: "scenario-specific payload survives normalization",
    },
  });

  expect(rebuilt.expected).toMatchObject({
    sessionId: "live-codex-bel-632",
    note: "scenario-specific payload survives normalization",
  });
  expect(rebuilt.provenanceHistory).toEqual([
    {
      capturedAt: "2026-04-09T16:10:41.718Z",
      artifactVersion:
        "rollout-2026-04-09T11-10-41-019d7302-91b1-7f90-90b3-aaa72ff11be3.jsonl#excerpt",
      providerVersion: "Codex Desktop 0.103.0",
      sdkVersion: "not-recorded",
      sanitizerVersion: "bel-632-manual-v1",
      sanitizedBy: "Codex BEL-632",
    },
  ]);
});

test("sidecar helpers treat undefined provenance history as absent", async () => {
  const metadata = await readCodexFixtureMetadata(
    "live-transcript-excerpt.fixture.json",
  );

  const normalized = normalizeLiveFixtureSidecar(metadata);
  expect(normalized).not.toBeNull();

  if (normalized === null) {
    throw new Error("Expected live fixture sidecar to normalize.");
  }

  const rebuilt = createLiveFixtureSidecar({
    ...normalized,
    provenanceHistory: undefined,
  });

  expect(rebuilt.provenanceHistory).toBeUndefined();
});

test("refresh manifest rejects superseding a different scenario record", () => {
  const manifest = [
    createManifestRecord({
      artifactVersion: "artifact-a",
    }),
    createManifestRecord({
      scenarioId: "live-claude-replay-parity",
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.v2.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.jsonl",
      capturedAt: "2026-04-10T16:10:41.718Z",
      artifactVersion: "artifact-b",
      providerVersion: "Codex Desktop 0.103.1",
      sdkVersion: "not-recorded",
      sanitizerVersion: "bel-633-manual-v1",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [createProvenanceEntry({ artifactVersion: "artifact-a" })],
    }),
  ];

  expect(normalizeRefreshManifest(manifest)).toBeNull();
});

test("refresh manifest rejects mismatched prior provenance for in-manifest supersession", () => {
  const manifest = [
    createManifestRecord({
      artifactVersion: "artifact-a",
    }),
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.v2.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.jsonl",
      capturedAt: "2026-04-10T16:10:41.718Z",
      artifactVersion: "artifact-b",
      providerVersion: "Codex Desktop 0.103.1",
      sdkVersion: "not-recorded",
      sanitizerVersion: "bel-633-manual-v1",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [createProvenanceEntry({ artifactVersion: "different-artifact" })],
    }),
  ];

  expect(normalizeRefreshManifest(manifest)).toBeNull();
});

test("refresh manifest treats source family ordering as non-semantic", () => {
  const manifest = [
    createManifestRecord({
      sourceFamilies: ["codex-session-index", "codex-transcript"],
      fixturePath: "test/fixtures/codex/live-session-index-excerpt.jsonl",
      artifactVersion: "artifact-a",
    }),
    createManifestRecord({
      sourceFamilies: ["codex-transcript", "codex-session-index"],
      fixturePath: "test/fixtures/codex/live-session-index-excerpt.v2.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-session-index-excerpt.jsonl",
      capturedAt: "2026-04-10T16:10:41.718Z",
      artifactVersion: "artifact-b",
      providerVersion: "Codex Desktop 0.103.1",
      sdkVersion: "not-recorded",
      sanitizerVersion: "bel-633-manual-v1",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [createProvenanceEntry({ artifactVersion: "artifact-a" })],
    }),
  ];

  expect(normalizeRefreshManifest(manifest)).not.toBeNull();
});

test("refresh manifest rejects cyclic supersession graphs", () => {
  const manifest = [
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.a.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.b.jsonl",
      artifactVersion: "artifact-a",
      provenanceHistory: [createProvenanceEntry({ artifactVersion: "artifact-b" })],
    }),
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.b.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.a.jsonl",
      artifactVersion: "artifact-b",
      provenanceHistory: [createProvenanceEntry({ artifactVersion: "artifact-a" })],
    }),
  ];

  expect(normalizeRefreshManifest(manifest)).toBeNull();
});

test("refresh manifest rejects supersession fan-out branches", () => {
  const manifest = [
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.a.jsonl",
      artifactVersion: "artifact-a",
    }),
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.b.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.a.jsonl",
      artifactVersion: "artifact-b",
      capturedAt: "2026-04-10T16:10:41.718Z",
      providerVersion: "Codex Desktop 0.103.1",
      sanitizerVersion: "bel-633-manual-v1",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [createProvenanceEntry({ artifactVersion: "artifact-a" })],
    }),
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.c.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.a.jsonl",
      artifactVersion: "artifact-c",
      capturedAt: "2026-04-10T17:10:41.718Z",
      providerVersion: "Codex Desktop 0.103.2",
      sanitizerVersion: "bel-633-manual-v2",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [createProvenanceEntry({ artifactVersion: "artifact-a" })],
    }),
  ];

  expect(normalizeRefreshManifest(manifest)).toBeNull();
});

test("refresh manifest rejects truncated prior provenance chains", () => {
  const manifest = [
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.a.jsonl",
      artifactVersion: "artifact-a",
    }),
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.b.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.a.jsonl",
      artifactVersion: "artifact-b",
      capturedAt: "2026-04-10T16:10:41.718Z",
      providerVersion: "Codex Desktop 0.103.1",
      sanitizerVersion: "bel-633-manual-v1",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [createProvenanceEntry({ artifactVersion: "artifact-a" })],
    }),
    createManifestRecord({
      fixturePath: "test/fixtures/codex/live-transcript-excerpt.c.jsonl",
      supersedesFixturePath: "test/fixtures/codex/live-transcript-excerpt.b.jsonl",
      artifactVersion: "artifact-c",
      capturedAt: "2026-04-10T17:10:41.718Z",
      providerVersion: "Codex Desktop 0.103.2",
      sanitizerVersion: "bel-633-manual-v2",
      sanitizedBy: "Codex BEL-633",
      provenanceHistory: [
        createProvenanceEntry({
          capturedAt: "2026-04-10T16:10:41.718Z",
          artifactVersion: "artifact-b",
          providerVersion: "Codex Desktop 0.103.1",
          sanitizerVersion: "bel-633-manual-v1",
        }),
      ],
    }),
  ];

  expect(normalizeRefreshManifest(manifest)).toBeNull();
});
