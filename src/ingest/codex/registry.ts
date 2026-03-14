import type { IngestProviderRegistry } from "../registry";
import { parseCodexTranscriptFile } from "./transcript-parser";

export function createCodexTranscriptIngestRegistry(): IngestProviderRegistry {
  return {
    provider: "codex",
    matchFile(filePath) {
      const normalizedPath = filePath.toLowerCase();
      const fileName = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);

      if (!normalizedPath.endsWith(".jsonl")) {
        return null;
      }

      return fileName === "session-index.jsonl" || fileName === "session_index.jsonl"
        ? null
        : { kind: "transcript" };
    },
    parseFile: parseCodexTranscriptFile,
  };
}

export function createCodexIngestRegistries(): IngestProviderRegistry[] {
  return [createCodexTranscriptIngestRegistry()];
}
