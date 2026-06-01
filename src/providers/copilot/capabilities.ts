import type { ProviderCapabilities } from "../../core/capabilities.js";

export function createCopilotCapabilities(
  overrides: Partial<ProviderCapabilities> = {},
): ProviderCapabilities {
  const base: ProviderCapabilities = {
    provider: "copilot",
    features: {
      "session:create": {
        available: false,
        notes: "Copilot SDK session creation is deferred to a later adapter slice.",
      },
      "session:resume": {
        available: false,
        notes: "Resume support is unclaimed until persisted post-turn sessions are proven.",
      },
      "session:fork": {
        available: false,
        notes: "Copilot fork semantics are not implemented by the normalized adapter.",
      },
      "output:structured": {
        available: false,
        notes: "No native JSON-schema output contract is implemented for Copilot yet.",
      },
      "attachment:image": {
        available: false,
        notes: "Image attachment behavior needs live vision-model validation before exposure.",
      },
      "stream:message-delta": {
        available: false,
        notes: "Streaming event normalization is deferred until Copilot turn support exists.",
      },
      "event:reasoning-summary": {
        available: false,
        notes: "Copilot reasoning events are not exposed until they are verified safe to normalize.",
      },
      "event:tool-lifecycle": {
        available: false,
        notes: "Tool lifecycle event mapping is deferred until Copilot turn support exists.",
      },
      "event:file-change": {
        available: false,
        notes: "Workspace file-change event mapping is deferred until Copilot turn support exists.",
      },
      "event:todo-update": { available: false },
      "event:approval": {
        available: false,
        notes: "Approval request handling needs a normalized response design before exposure.",
      },
      "event:auth-status": {
        available: false,
        notes: "Readiness can report auth state, but execution-time auth events are not implemented.",
      },
      "usage:tokens": {
        available: false,
        notes: "Token usage mapping is deferred until Copilot turn support exists.",
      },
      "usage:cost": {
        available: false,
        notes: "Cost telemetry is not exposed until provider values are proven stable.",
      },
      "mcp:session-descriptors": {
        available: false,
        notes: "Copilot MCP descriptor mapping is deferred until session support exists.",
      },
      "mcp:managed-servers": {
        available: false,
        notes: "Managed MCP server controls are not exposed by the normalized adapter.",
      },
      "extensions:hooks-plugins": {
        available: false,
        notes: "Provider-native extension systems are not exposed by this adapter slice.",
      },
    },
  };

  return {
    ...base,
    ...overrides,
    features: {
      ...base.features,
      ...overrides.features,
    },
    extensions: {
      ...base.extensions,
      ...overrides.extensions,
    },
  };
}
