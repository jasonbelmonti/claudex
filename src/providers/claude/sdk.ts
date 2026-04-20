import {
  getSessionMessages,
  query,
  type Options as ClaudeSdkOptions,
} from "@anthropic-ai/claude-agent-sdk";

import type {
  ClaudeQueryFactory,
  ClaudeSessionMessagesLoader,
} from "./types.js";

export const createClaudeQuery: ClaudeQueryFactory = (params: {
  prompt: string;
  options: ClaudeSdkOptions;
}) =>
  query({
    prompt: params.prompt,
    options: params.options,
  });

export const createClaudeSessionMessagesLoader: ClaudeSessionMessagesLoader = (
  sessionId,
  options,
) => getSessionMessages(sessionId, options);
