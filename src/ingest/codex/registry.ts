import type { IngestProviderRegistry } from "../registry";
import { createCodexSessionIndexIngestRegistry } from "./session-index-parser";
import { parseCodexTranscriptFile } from "./transcript-parser";

export { createCodexSessionIndexIngestRegistry };

export function createCodexTranscriptIngestRegistry(): IngestProviderRegistry {
  return {
    provider: "codex",
    matchFile(filePath) {
      const normalizedPath = filePath.toLowerCase();
      const fileName = getPathFileName(normalizedPath);

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
  return [
    createCodexSessionIndexIngestRegistry(),
    createCodexTranscriptIngestRegistry(),
  ];
}

function getPathFileName(filePath: string): string {
  const lastPathSeparator = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );

  return filePath.slice(lastPathSeparator + 1);
}
