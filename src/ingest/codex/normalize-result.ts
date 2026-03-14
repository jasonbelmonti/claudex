import type {
  CodexTranscriptNormalizationContext,
  ParsedArtifact,
} from "./normalize-types";

export function emptyResult(
  context: CodexTranscriptNormalizationContext,
): ParsedArtifact {
  return {
    sessionId: context.sessionId ?? undefined,
    events: [],
    warnings: [],
  };
}

export function unsupportedRecord(
  message: string,
  raw: unknown,
  context: CodexTranscriptNormalizationContext,
): ParsedArtifact {
  return {
    sessionId: context.sessionId ?? undefined,
    events: [],
    warnings: [
      {
        code: "unsupported-record",
        message,
        raw,
      },
    ],
  };
}
