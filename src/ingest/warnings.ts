import type { ProviderId } from "../core/provider";
import type { ObservedEventSource } from "./source";

export const INGEST_WARNING_CODES = [
  "watch-failed",
  "file-open-failed",
  "parse-failed",
  "unsupported-record",
  "duplicate-root",
  "cursor-reset",
  "truncated-file",
  "rotated-file",
] as const;

export type IngestWarningCode = (typeof INGEST_WARNING_CODES)[number];

export type IngestWarning = {
  code: IngestWarningCode;
  message: string;
  provider?: ProviderId;
  filePath?: string;
  source?: ObservedEventSource;
  cause?: unknown;
  raw?: unknown;
};
