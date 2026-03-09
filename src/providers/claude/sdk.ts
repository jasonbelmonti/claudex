import {
  query,
  type Options as ClaudeSdkOptions,
} from "@anthropic-ai/claude-agent-sdk";

import type { ClaudeQueryFactory } from "./types";

export const createClaudeQuery: ClaudeQueryFactory = (params: {
  prompt: string;
  options: ClaudeSdkOptions;
}) =>
  query({
    prompt: params.prompt,
    options: params.options,
  });
