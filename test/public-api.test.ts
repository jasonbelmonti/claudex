import { expect, test } from "#test-support";
import type {
  AgentConfig,
  McpServerDescriptor,
  ResolveProviderOptions,
  SessionOptions,
} from "@jasonbelmonti/claudex";

import * as claudex from "@jasonbelmonti/claudex";

test("public api exports the core contract surface", () => {
  expect(claudex.PROVIDER_IDS).toEqual(["claude", "codex", "copilot"]);
  expect(claudex.CAPABILITY_CATALOG.length).toBeGreaterThan(0);
  expect(typeof claudex.supportsCapability).toBe("function");
  expect(typeof claudex.isProviderReady).toBe("function");
  expect(typeof claudex.AgentError).toBe("function");
  expect(typeof claudex.ClaudexAdapter).toBe("function");
  expect(typeof claudex.ProviderIdentityConflictError).toBe("function");
  expect(typeof claudex.isProviderIdentityConflictError).toBe("function");
  expect(typeof claudex.ProviderResolutionError).toBe("function");
  expect(typeof claudex.isProviderResolutionError).toBe("function");
  expect("ClaudeAdapter" in claudex).toBe(false);
  expect("CodexAdapter" in claudex).toBe(false);
  expect("CopilotAdapter" in claudex).toBe(false);
});

test("public api exports resolved-provider admission types", () => {
  const options = {
    allowedStatuses: ["ready"],
    requiredCapabilities: ["output:structured"],
  } satisfies ResolveProviderOptions;

  expect(options).toEqual({
    allowedStatuses: ["ready"],
    requiredCapabilities: ["output:structured"],
  });
});

test("public api exports normalized agent config types", () => {
  const descriptor = {
    transport: "stdio",
    command: "node",
    args: ["./mcp-server.js"],
  } satisfies McpServerDescriptor;
  const agentConfig: AgentConfig = {
    mcpServers: {
      local: descriptor,
    },
  };
  const sessionOptions: SessionOptions = {
    agentConfig,
  };

  expect(sessionOptions.agentConfig?.mcpServers?.local).toEqual(descriptor);
});

test("ClaudexAdapter exposes the unresolved metadata contract", () => {
  const adapter = new claudex.ClaudexAdapter();

  expect(adapter.provider).toBeNull();
  expect(adapter.capabilities).toBeNull();
  expect(adapter.preferredProviders).toEqual(["codex", "claude"]);
});

test("ClaudexAdapter accepts a custom preferred provider order", () => {
  const adapter = new claudex.ClaudexAdapter({
    preferredProviders: ["copilot", "claude", "codex", "copilot"],
  });

  expect(adapter.preferredProviders).toEqual(["copilot", "claude", "codex"]);
});
