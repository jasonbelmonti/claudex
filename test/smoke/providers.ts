import { ClaudeAdapter } from "../../src/providers/claude/adapter";
import { CodexAdapter } from "../../src/providers/codex/adapter";

export const SMOKE_PROVIDERS = {
  claude: {
    createAdapter: () => new ClaudeAdapter(),
    sessionOptions: {
      executionMode: "plan" as const,
      approvalMode: "deny" as const,
    },
  },
  codex: {
    createAdapter: () => new CodexAdapter(),
    sessionOptions: {
      executionMode: "plan" as const,
      approvalMode: "deny" as const,
    },
  },
} as const;
