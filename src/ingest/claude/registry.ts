import { createClaudeSnapshotTaskIngestRegistry } from "./snapshot-task-parser.js";
import { createClaudeTranscriptIngestRegistry } from "./transcript-parser.js";
import type { IngestProviderRegistry } from "../registry.js";

export { createClaudeSnapshotTaskIngestRegistry };
export { createClaudeTranscriptIngestRegistry };

export function createClaudeIngestRegistries(): IngestProviderRegistry[] {
  return [
    createClaudeSnapshotTaskIngestRegistry(),
    createClaudeTranscriptIngestRegistry(),
  ];
}
