import { AgentError } from "../../core/errors";
import type { TurnInput } from "../../core/input";

export function mapTurnInputToClaudePrompt(input: TurnInput): string {
  if (input.attachments?.length) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "claude",
      message:
        "Stable Claude query() attachment normalization is deferred until image input is verified end-to-end.",
    });
  }

  return input.prompt;
}
