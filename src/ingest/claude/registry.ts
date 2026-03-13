import { createClaudeSnapshotTaskIngestRegistry } from "./snapshot-task-parser";
import { createClaudeTranscriptIngestRegistry } from "./transcript-parser";
import type { IngestProviderRegistry } from "../registry";

export { createClaudeSnapshotTaskIngestRegistry };
export { createClaudeTranscriptIngestRegistry };

export function createClaudeIngestRegistries(): IngestProviderRegistry[] {
  return [
    createClaudeSnapshotTaskIngestRegistry(),
    createClaudeTranscriptIngestRegistry(),
  ];
}
