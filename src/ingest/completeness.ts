export const OBSERVED_EVENT_COMPLETENESS = [
  "complete",
  "partial",
  "best-effort",
] as const;

export type ObservedEventCompleteness =
  (typeof OBSERVED_EVENT_COMPLETENESS)[number];
