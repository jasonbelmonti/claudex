import { Codex, type CodexOptions } from "@openai/codex-sdk";

import type { CodexClientFactory } from "./types.js";

export const createCodexClient: CodexClientFactory = (
  options: CodexOptions = {},
) => new Codex(options);
