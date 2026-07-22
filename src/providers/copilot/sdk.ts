import {
  CopilotClient,
  type CopilotClientOptions,
} from "@github/copilot-sdk";

import { resolveCopilotSdkOptions } from "./cli-path-resolution.js";
import type { CopilotClientFactory } from "./types.js";

export const createCopilotClient: CopilotClientFactory = (
  options: CopilotClientOptions = {},
) => new CopilotClient(resolveCopilotSdkOptions(options));
