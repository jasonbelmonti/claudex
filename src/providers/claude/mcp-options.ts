import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

import type {
  AgentConfig,
  McpServerDescriptor,
} from "../../core/agent-config.js";

export function mapAgentConfigMcpServers(
  agentConfig?: AgentConfig,
): Record<string, McpServerConfig> | undefined {
  const descriptors = agentConfig?.mcpServers;

  if (!descriptors || Object.keys(descriptors).length === 0) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(descriptors).map(([name, descriptor]) => [
      name,
      mapMcpServerDescriptor(descriptor),
    ]),
  );
}

export function mergeMcpServers(
  nativeServers: Record<string, McpServerConfig> | undefined,
  normalizedServers: Record<string, McpServerConfig> | undefined,
): Record<string, McpServerConfig> | undefined {
  const merged = {
    ...(nativeServers ?? {}),
    ...(normalizedServers ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mapMcpServerDescriptor(
  descriptor: McpServerDescriptor,
): McpServerConfig {
  switch (descriptor.transport) {
    case "stdio":
      return {
        type: "stdio",
        command: descriptor.command,
        ...(descriptor.args ? { args: descriptor.args } : {}),
        ...(descriptor.env ? { env: descriptor.env } : {}),
      };
    case "http":
      return {
        type: "http",
        url: descriptor.url,
        ...(descriptor.headers ? { headers: descriptor.headers } : {}),
      };
    case "sse":
      return {
        type: "sse",
        url: descriptor.url,
        ...(descriptor.headers ? { headers: descriptor.headers } : {}),
      };
  }
}
