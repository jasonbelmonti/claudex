import type {
  Input,
  UserInput,
  TurnOptions as CodexTurnOptions,
} from "@openai/codex-sdk";

import { AgentError } from "../../core/errors";
import type { TurnInput, TurnOptions } from "../../core/input";
import type { CodexTurnProviderOptions } from "./types";

export function mapTurnInputToCodexInput(input: TurnInput): Input {
  if (!input.attachments?.length) {
    return input.prompt;
  }

  const entries: UserInput[] = [{ type: "text", text: input.prompt }];

  for (const attachment of input.attachments) {
    if (attachment.kind !== "image") {
      throw unsupportedAttachmentError(
        `Unsupported attachment kind: ${attachment.kind}`,
      );
    }

    if (attachment.source.type !== "path") {
      throw unsupportedAttachmentError(
        "Codex supports image attachments from local file paths only.",
      );
    }

    entries.push({
      type: "local_image",
      path: attachment.source.path,
    });
  }

  return entries;
}

export function mapTurnOptionsToCodexTurnOptions(
  options: TurnOptions = {},
): CodexTurnOptions {
  const providerOptions = getCodexTurnProviderOptions(options.providerOptions);

  return {
    ...providerOptions.turnOptions,
    outputSchema: options.outputSchema,
    signal: options.signal,
  };
}

function unsupportedAttachmentError(message: string): AgentError {
  return new AgentError({
    code: "unsupported_feature",
    provider: "codex",
    message,
  });
}

function getCodexTurnProviderOptions(
  providerOptions?: Record<string, unknown>,
): CodexTurnProviderOptions {
  const codexOptions = providerOptions?.codex;

  if (!isRecord(codexOptions)) {
    return {};
  }

  return codexOptions as CodexTurnProviderOptions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
