import { expect, test } from "bun:test";

import type { MatchedRootFile } from "../../src/ingest/matched-root-files";
import { createRootSnapshot, reconcileRootSnapshot } from "../../src/ingest/reconcile";

test("reconcileRootSnapshot preserves prior entries for temporarily unavailable files", () => {
  const priorFile = createMatchedRootFile({
    filePath: "/tmp/claudex/root/live.jsonl",
    size: 4,
    modifiedAtMs: 100,
  });
  const priorSnapshot = createRootSnapshot([priorFile]);

  const result = reconcileRootSnapshot(priorSnapshot, [], [priorFile.filePath]);

  expect(result.deletedFiles).toEqual([]);
  expect(result.nextSnapshot.get(priorFile.filePath)).toEqual({
    filePath: priorFile.filePath,
    selection: priorFile.selection,
    fileState: priorFile.fileState,
  });
});

test("reconcileRootSnapshot still deletes files that are truly gone", () => {
  const priorFile = createMatchedRootFile({
    filePath: "/tmp/claudex/root/live.jsonl",
    size: 4,
    modifiedAtMs: 100,
  });
  const priorSnapshot = createRootSnapshot([priorFile]);

  const result = reconcileRootSnapshot(priorSnapshot, []);

  expect(result.deletedFiles).toEqual([
    {
      filePath: priorFile.filePath,
      selection: priorFile.selection,
      fileState: priorFile.fileState,
    },
  ]);
  expect(result.nextSnapshot.has(priorFile.filePath)).toBe(false);
});

function createMatchedRootFile(options: {
  filePath: string;
  size: number;
  modifiedAtMs: number;
}): MatchedRootFile {
  return {
    filePath: options.filePath,
    selection: {
      registry: {
        provider: "claude",
        matchFile() {
          return null;
        },
        parseFile: async function* () {
          return;
        },
      },
      match: {
        kind: "transcript",
      },
    },
    fileState: {
      size: options.size,
      fingerprint: "1:1",
      continuityToken: "token",
      modifiedAtMs: options.modifiedAtMs,
    },
  };
}
