import type { IngestProviderRegistry } from "../registry";
import { createCodexTranscriptIngestRegistry } from "./transcript-parser";

export { createCodexTranscriptIngestRegistry };

export function createCodexIngestRegistries(): IngestProviderRegistry[] {
  return [createCodexTranscriptIngestRegistry()];
}
