import type { ProviderId } from "./provider";

export type NormalizationLevel =
  | "normalized"
  | "capability-gated"
  | "provider-specific";

export type CapabilityDescriptor = {
  id: string;
  label: string;
  normalization: NormalizationLevel;
  description: string;
};

export const CAPABILITY_CATALOG = [
  {
    id: "session:create",
    label: "Session creation",
    normalization: "normalized",
    description: "Start a new provider-backed session without changing the call site.",
  },
  {
    id: "session:resume",
    label: "Session resume",
    normalization: "normalized",
    description: "Resume an existing provider session by explicit session reference.",
  },
  {
    id: "session:fork",
    label: "Session fork",
    normalization: "capability-gated",
    description: "Fork a prior session into a new provider session while preserving context.",
  },
  {
    id: "output:structured",
    label: "Structured output",
    normalization: "normalized",
    description: "Return JSON output that matches a caller-supplied schema.",
  },
  {
    id: "attachment:image",
    label: "Image attachments",
    normalization: "capability-gated",
    description: "Accept image attachments as part of normalized turn input.",
  },
  {
    id: "stream:message-delta",
    label: "Streaming text deltas",
    normalization: "capability-gated",
    description: "Emit partial assistant text before the final assistant message completes.",
  },
  {
    id: "event:reasoning-summary",
    label: "Reasoning summary events",
    normalization: "capability-gated",
    description: "Expose non-sensitive reasoning summaries when the provider makes them available.",
  },
  {
    id: "event:tool-lifecycle",
    label: "Tool lifecycle events",
    normalization: "normalized",
    description: "Emit canonical tool start, update, and completion events.",
  },
  {
    id: "event:file-change",
    label: "File change events",
    normalization: "capability-gated",
    description: "Report file modifications that the agent attempted or completed.",
  },
  {
    id: "event:todo-update",
    label: "Todo updates",
    normalization: "capability-gated",
    description: "Expose the agent's running task list when the provider emits one.",
  },
  {
    id: "event:approval",
    label: "Approval events",
    normalization: "capability-gated",
    description: "Expose normalized approval requests and resolutions.",
  },
  {
    id: "event:auth-status",
    label: "Auth status events",
    normalization: "provider-specific",
    description: "Emit live authentication progress when a provider exposes it during execution.",
  },
  {
    id: "usage:tokens",
    label: "Token usage",
    normalization: "normalized",
    description: "Return input, output, and cached-input token usage in a normalized shape.",
  },
  {
    id: "usage:cost",
    label: "Cost telemetry",
    normalization: "capability-gated",
    description: "Expose provider cost data when a provider reports it.",
  },
  {
    id: "mcp:managed-servers",
    label: "Managed MCP servers",
    normalization: "provider-specific",
    description: "Create, toggle, or inspect MCP servers through provider-native controls.",
  },
  {
    id: "extensions:hooks-plugins",
    label: "Hooks and plugins",
    normalization: "provider-specific",
    description: "Provider-native hooks, plugins, and other advanced extension systems.",
  },
] as const satisfies readonly CapabilityDescriptor[];

export type CapabilityId = (typeof CAPABILITY_CATALOG)[number]["id"];

export type CapabilityAvailability = {
  available: boolean;
  notes?: string;
};

export type ProviderCapabilities = {
  provider: ProviderId;
  adapterVersion?: string;
  providerVersion?: string;
  features: Partial<Record<CapabilityId, CapabilityAvailability>>;
  raw?: unknown;
  extensions?: Record<string, unknown>;
};

export function supportsCapability(
  capabilities: ProviderCapabilities,
  capabilityId: CapabilityId,
): boolean {
  return capabilities.features[capabilityId]?.available === true;
}
