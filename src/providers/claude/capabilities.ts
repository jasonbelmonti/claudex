import type { ProviderCapabilities } from "../../core/capabilities";

export function createClaudeCapabilities(
  overrides: Partial<ProviderCapabilities> = {},
): ProviderCapabilities {
  const base: ProviderCapabilities = {
    provider: "claude",
    features: {
      "session:create": { available: true },
      "session:resume": { available: true },
      "session:fork": { available: true },
      "output:structured": { available: true },
      "attachment:image": {
        available: false,
        notes:
          "Stable query() attachment normalization is deferred until image input is verified end-to-end.",
      },
      "stream:message-delta": { available: true },
      "event:reasoning-summary": {
        available: false,
        notes: "Stable query() does not expose a normalized reasoning-summary event.",
      },
      "event:tool-lifecycle": {
        available: true,
        notes:
          "Task and tool progress events are exposed, but tool lifecycle granularity differs from Codex.",
      },
      "event:file-change": { available: true },
      "event:todo-update": { available: false },
      "event:approval": {
        available: false,
        notes:
          "Permission modes are configurable, but approval request/resolution events are not surfaced as SDKMessage values.",
      },
      "event:auth-status": { available: true },
      "usage:tokens": { available: true },
      "usage:cost": { available: true },
      "mcp:managed-servers": { available: true },
      "extensions:hooks-plugins": { available: true },
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
