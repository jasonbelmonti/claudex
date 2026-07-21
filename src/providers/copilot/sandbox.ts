import type { SandboxProfile } from "../../core/session.js";
import { denyCopilotPermissionRequest } from "./permissions.js";
import type { CopilotSessionConfig } from "./types.js";

const READ_ONLY_EXCLUDED_TOOLS = [
  "builtin:*",
  "mcp:*",
  "custom:*",
] as const;

export function applyCopilotSandboxProfile(
  config: CopilotSessionConfig,
  sandboxProfile?: SandboxProfile,
): CopilotSessionConfig {
  if (sandboxProfile !== "read-only") {
    return config;
  }

  return {
    ...config,
    availableTools: [],
    excludedTools: [...READ_ONLY_EXCLUDED_TOOLS],
    tools: [],
    commands: [],
    canvases: [],
    mcpServers: {},
    customAgents: [],
    skillDirectories: [],
    pluginDirectories: [],
    instructionDirectories: [],
    enableConfigDiscovery: false,
    skipCustomInstructions: true,
    customAgentsLocalOnly: true,
    coauthorEnabled: false,
    enableSessionTelemetry: false,
    enableSkills: false,
    enableOnDemandInstructionDiscovery: false,
    enableFileHooks: false,
    enableHostGitOperations: false,
    enableSessionStore: false,
    infiniteSessions: { enabled: false },
    memory: { enabled: false },
    mcpOAuthTokenStorage: "in-memory",
    skipEmbeddingRetrieval: true,
    embeddingCacheStorage: "in-memory",
    requestCanvasRenderer: false,
    requestExtensions: false,
    enableMcpApps: false,
    manageScheduleEnabled: false,
    remoteSession: "off",
    cloud: undefined,
    createSessionFsProvider: undefined,
    onPermissionRequest: denyCopilotPermissionRequest,
  };
}
