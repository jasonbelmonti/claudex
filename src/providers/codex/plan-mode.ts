import type { ThreadOptions } from "@openai/codex-sdk";

export function applyPlanModeThreadOptions(
  options: ThreadOptions,
  preserveNeverApproval: boolean,
): ThreadOptions {
  return {
    ...options,
    sandboxMode: "read-only",
    approvalPolicy:
      preserveNeverApproval || options.approvalPolicy === "never"
        ? "never"
        : "untrusted",
    networkAccessEnabled: false,
    webSearchEnabled: false,
    webSearchMode: "disabled",
  };
}
