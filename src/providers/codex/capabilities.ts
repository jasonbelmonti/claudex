import type { ProviderCapabilities } from "../../core/capabilities";

export function createCodexCapabilities(
  overrides: Partial<ProviderCapabilities> = {},
): ProviderCapabilities {
  const base: ProviderCapabilities = {
    provider: "codex",
    features: {
      "session:create": { available: true },
      "session:resume": { available: true },
      "session:fork": {
        available: false,
        notes: "The TypeScript SDK exposes thread start/resume, but not thread fork.",
      },
      "output:structured": { available: true },
      "attachment:image": {
        available: true,
        notes: "Supports local image paths only.",
      },
      "stream:message-delta": {
        available: false,
        notes: "The SDK emits item lifecycle events rather than guaranteed text deltas.",
      },
      "event:reasoning-summary": { available: true },
      "event:tool-lifecycle": { available: true },
      "event:file-change": { available: true },
      "event:todo-update": { available: true },
      "event:approval": {
        available: false,
        notes: "Approval policy is configurable, but approval request events are not exposed.",
      },
      "event:auth-status": { available: false },
      "usage:tokens": { available: true },
      "usage:cost": { available: false },
      "mcp:managed-servers": {
        available: false,
        notes: "The TypeScript SDK surfaces MCP tool calls, not MCP server management.",
      },
      "extensions:hooks-plugins": { available: false },
    },
  };

  return {
    ...base,
    ...overrides,
    features: {
      ...base.features,
      ...overrides.features,
    },
  };
}
