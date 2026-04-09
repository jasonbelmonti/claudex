import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "bun:test";

import {
  INGEST_AUDIT_BASELINE,
  INGEST_AUDIT_BASELINE_COMMANDS,
  INGEST_AUDIT_BASELINE_STATUSES,
  INGEST_AUDIT_DIMENSIONS,
  INGEST_AUDIT_KNOWN_BLIND_SPOTS,
  INGEST_AUDIT_PROBE_KINDS,
  INGEST_AUDIT_SCENARIOS,
  INGEST_AUDIT_SOURCE_FAMILIES,
  INGEST_LIVE_FIXTURE_REQUIRED_FIELDS,
  INGEST_LIVE_FIXTURE_METADATA,
} from "./audit-matrix";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

test("audit matrix covers every supported passive-ingest source family", () => {
  expect(INGEST_AUDIT_SOURCE_FAMILIES).toEqual([
    "claude-transcript",
    "claude-snapshot-task",
    "codex-transcript",
    "codex-session-index",
  ]);

  const familiesWithDeterministicCoverage = new Set(
    INGEST_AUDIT_SCENARIOS
      .filter((scenario) => scenario.probeKind === "deterministic-fixture")
      .flatMap((scenario) => scenario.sourceFamilies),
  );

  expect([...familiesWithDeterministicCoverage].sort()).toEqual(
    [...INGEST_AUDIT_SOURCE_FAMILIES].sort(),
  );
});

test("audit scenarios use stable ids, explicit invariants, and known enums", () => {
  const scenarioIds = new Set<string>();

  for (const scenario of INGEST_AUDIT_SCENARIOS) {
    expect(scenario.id.length).toBeGreaterThan(0);
    expect(scenario.invariants.length).toBeGreaterThan(0);
    expect(scenario.dimensions.length).toBeGreaterThan(0);
    expect(INGEST_AUDIT_PROBE_KINDS).toContain(scenario.probeKind);
    expect(INGEST_AUDIT_BASELINE_STATUSES).toContain(scenario.baselineStatus);
    expect(scenarioIds.has(scenario.id)).toBeFalse();
    scenarioIds.add(scenario.id);

    for (const family of scenario.sourceFamilies) {
      expect(INGEST_AUDIT_SOURCE_FAMILIES).toContain(family);
    }

    for (const dimension of scenario.dimensions) {
      expect(INGEST_AUDIT_DIMENSIONS).toContain(dimension);
    }
  }
});

test("baseline commands and known blind spots stay actionable", () => {
  expect(INGEST_AUDIT_BASELINE_COMMANDS).toEqual([
    "bun test test/ingest test/ingest-public-api.test.ts",
    "bun test --coverage --coverage-reporter=text test/ingest test/ingest-public-api.test.ts",
  ]);
  expect(INGEST_AUDIT_BASELINE.commands).toEqual(INGEST_AUDIT_BASELINE_COMMANDS);
  expect(INGEST_AUDIT_BASELINE.passingTests).toBe(82);
  expect(INGEST_AUDIT_BASELINE.testFiles).toBe(13);
  expect(INGEST_AUDIT_BASELINE.expectCalls).toBe(316);
  expect(INGEST_AUDIT_BASELINE.knownBlindSpots).toEqual(
    INGEST_AUDIT_KNOWN_BLIND_SPOTS,
  );

  for (const hotspot of INGEST_AUDIT_KNOWN_BLIND_SPOTS) {
    expect(hotspot.lineCoveragePct).toBeLessThan(90);
    expect(existsSync(resolve(REPO_ROOT, hotspot.path))).toBeTrue();
  }
});

test("live fixture provenance requirements remain explicit", () => {
  expect(INGEST_LIVE_FIXTURE_METADATA.sidecarSuffix).toBe(".fixture.json");
  expect(INGEST_LIVE_FIXTURE_REQUIRED_FIELDS).toEqual([
    "scenarioId",
    "provider",
    "sourceFamilies",
    "capturedAt",
    "captureKind",
    "artifactVersion",
    "providerVersion",
    "sdkVersion",
    "sanitizerVersion",
    "sanitizedBy",
  ]);
  expect(INGEST_LIVE_FIXTURE_METADATA.requiredFields).toEqual(
    INGEST_LIVE_FIXTURE_REQUIRED_FIELDS,
  );
  expect(INGEST_LIVE_FIXTURE_METADATA.notes).toHaveLength(3);
});
