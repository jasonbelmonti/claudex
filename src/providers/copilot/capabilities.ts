import type { ProviderCapabilities } from "../../core/capabilities.js";

export function createCopilotCapabilities(
  overrides: Partial<ProviderCapabilities> = {},
): ProviderCapabilities {
  const base: ProviderCapabilities = {
    provider: "copilot",
    features: {
      "session:create": {
        available: true,
        notes:
          "Copilot sessions are created through the SDK facade with normalized configuration mapping.",
      },
      "session:resume": {
        available: true,
        notes:
          "Copilot session references can be resumed through the SDK facade; live persistence remains smoke-test follow-up.",
      },
      "session:fork": {
        available: false,
        notes: "Copilot fork semantics are not implemented by the normalized adapter.",
      },
      "output:structured": {
        available: true,
        notes:
          "Structured output is validated post-hoc against the final assistant message.",
      },
      "attachment:image": {
        available: false,
        notes: "Image attachment behavior needs live vision-model validation before exposure.",
      },
      "stream:message-delta": {
        available: true,
        notes:
          "Copilot assistant.message_delta events are normalized when SDK streaming is enabled.",
      },
      "event:reasoning-summary": {
        available: false,
        notes: "Copilot reasoning events are not exposed until they are verified safe to normalize.",
      },
      "event:tool-lifecycle": {
        available: true,
        notes:
          "Copilot tool execution events are normalized into canonical tool lifecycle events.",
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
        available: true,
        notes:
          "Token usage is normalized when Copilot emits assistant.usage with input and output token counts.",
      },
      "usage:cost": {
        available: false,
        notes: "Cost telemetry is not exposed until provider values are proven stable.",
      },
      "mcp:session-descriptors": {
        available: true,
        notes:
          "Normalized MCP descriptors map into Copilot session configuration.",
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
