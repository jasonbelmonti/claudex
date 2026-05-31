import {
  CopilotClient,
  type CopilotClientOptions,
} from "@github/copilot-sdk";

import type { CopilotClientFactory } from "./types.js";

export const createCopilotClient: CopilotClientFactory = (
  options: CopilotClientOptions = {},
) => new CopilotClient(options);
