import type { ThreadOptions } from "@openai/codex-sdk";

const SESSION_OWNED_THREAD_OPTION_KEYS = new Set<keyof ThreadOptions>([
  "additionalDirectories",
  "approvalPolicy",
  "model",
  "sandboxMode",
  "workingDirectory",
]);

export function omitSessionOwnedThreadOptions(
  threadOptions?: Partial<ThreadOptions>,
): Partial<ThreadOptions> {
  if (!threadOptions) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(threadOptions).filter(
      ([key]) =>
        !SESSION_OWNED_THREAD_OPTION_KEYS.has(key as keyof ThreadOptions),
    ),
  ) as Partial<ThreadOptions>;
}
