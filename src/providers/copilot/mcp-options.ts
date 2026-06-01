import type {
  AgentConfig,
  McpServerDescriptor,
} from "../../core/agent-config.js";
import type { CopilotMcpServerConfig } from "./types.js";

export function mapAgentConfigMcpServers(
  agentConfig?: AgentConfig,
): Record<string, CopilotMcpServerConfig> | undefined {
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
  nativeServers: Record<string, CopilotMcpServerConfig> | undefined,
  normalizedServers: Record<string, CopilotMcpServerConfig> | undefined,
): Record<string, CopilotMcpServerConfig> | undefined {
  const merged = {
    ...(nativeServers ?? {}),
    ...(normalizedServers ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mapMcpServerDescriptor(
  descriptor: McpServerDescriptor,
): CopilotMcpServerConfig {
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
