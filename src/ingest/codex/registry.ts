import type { IngestProviderRegistry } from "../registry";
import { parseCodexTranscriptFile } from "./transcript-parser";

export function createCodexTranscriptIngestRegistry(): IngestProviderRegistry {
  return {
    provider: "codex",
    matchFile(filePath) {
      const normalizedPath = filePath.toLowerCase();

      if (!normalizedPath.endsWith(".jsonl")) {
        return null;
      }

      return normalizedPath.endsWith("session_index.jsonl")
        ? null
        : { kind: "transcript" };
    },
    parseFile: parseCodexTranscriptFile,
  };
}

export function createCodexIngestRegistries(): IngestProviderRegistry[] {
  return [createCodexTranscriptIngestRegistry()];
}
