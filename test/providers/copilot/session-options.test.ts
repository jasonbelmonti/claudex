import { expect, test } from "#test-support";

import { AgentError } from "../../../src/core/errors.js";
import {
  autoApproveSafeCopilotPermissionRequest,
  buildCopilotSessionConfig,
  denyCopilotPermissionRequest,
  isSafeAutoApprovedPermissionRequest,
} from "../../../src/providers/copilot/index.js";
import type { CopilotPermissionHandler } from "../../../src/providers/copilot/types.js";

test("buildCopilotSessionConfig maps normalized session fields into Copilot config", () => {
  const config = buildCopilotSessionConfig({
    model: "gpt-5-copilot",
    workingDirectory: "/tmp/repo",
    instructions: "Answer tersely.",
    approvalMode: "deny",
    providerOptions: {
      copilot: {
        sessionConfig: {
          clientName: "claudex-test",
          streaming: true,
          availableTools: ["builtin:*"],
          provider: {
            type: "openai",
            baseUrl: "https://example.test/v1",
            apiKey: "test-key",
          },
        },
      },
    },
  });

  expect(config).toMatchObject({
    clientName: "claudex-test",
    model: "gpt-5-copilot",
    workingDirectory: "/tmp/repo",
    streaming: true,
    availableTools: ["builtin:*"],
    provider: {
      type: "openai",
      baseUrl: "https://example.test/v1",
      apiKey: "test-key",
    },
    systemMessage: {
      mode: "append",
      content: "Answer tersely.",
    },
  });
  expect(config.onPermissionRequest).toBe(denyCopilotPermissionRequest);
});

test("buildCopilotSessionConfig maps normalized MCP descriptors with normalized precedence", () => {
  const config = buildCopilotSessionConfig({
    agentConfig: {
      mcpServers: {
        local: {
          transport: "stdio",
          command: "node",
          args: ["./server.js"],
          env: {
            NODE_ENV: "test",
          },
        },
        remote: {
          transport: "http",
          url: "https://mcp.example.test",
          headers: {
            Authorization: "Bearer token",
          },
        },
        stream: {
          transport: "sse",
          url: "https://mcp.example.test/events",
          headers: {
            "X-Test": "true",
          },
        },
      },
    },
    providerOptions: {
      copilot: {
        sessionConfig: {
          mcpServers: {
            native: {
              type: "http",
              url: "https://native.example.test",
            },
            local: {
              type: "http",
              url: "https://provider-would-lose.example.test",
            },
          },
        },
      },
    },
  });

  expect(config.mcpServers).toEqual({
    native: {
      type: "http",
      url: "https://native.example.test",
    },
    local: {
      type: "stdio",
      command: "node",
      args: ["./server.js"],
      env: {
        NODE_ENV: "test",
      },
    },
    remote: {
      type: "http",
      url: "https://mcp.example.test",
      headers: {
        Authorization: "Bearer token",
      },
    },
    stream: {
      type: "sse",
      url: "https://mcp.example.test/events",
      headers: {
        "X-Test": "true",
      },
    },
  });
});

test("buildCopilotSessionConfig keeps normalized fields authoritative over provider config", () => {
  const providerHandler: CopilotPermissionHandler = () => ({
    kind: "approve-once",
  });

  const config = buildCopilotSessionConfig({
    model: "normalized-model",
    workingDirectory: "/normalized",
    instructions: "Use normalized instructions.",
    approvalMode: "deny",
    agentConfig: {
      mcpServers: {
        shared: {
          transport: "http",
          url: "https://normalized.example.test",
        },
      },
    },
    providerOptions: {
      copilot: {
        sessionConfig: {
          model: "provider-model",
          workingDirectory: "/provider",
          systemMessage: {
            mode: "replace",
            content: "provider system message",
          },
          mcpServers: {
            shared: {
              type: "http",
              url: "https://provider.example.test",
            },
          },
          onPermissionRequest: providerHandler,
          streaming: true,
        },
      },
    },
  });

  expect(config.model).toBe("normalized-model");
  expect(config.workingDirectory).toBe("/normalized");
  expect(config.systemMessage).toEqual({
    mode: "append",
    content: "Use normalized instructions.",
  });
  expect(config.mcpServers?.shared).toEqual({
    type: "http",
    url: "https://normalized.example.test",
  });
  expect(config.onPermissionRequest).toBe(denyCopilotPermissionRequest);
  expect(config.streaming).toBe(true);
});

test("buildCopilotSessionConfig allows provider permission handler for interactive mode", () => {
  const providerHandler: CopilotPermissionHandler = () => ({
    kind: "approve-once",
  });

  const config = buildCopilotSessionConfig({
    approvalMode: "interactive",
    providerOptions: {
      copilot: {
        sessionConfig: {
          onPermissionRequest: providerHandler,
        },
      },
    },
  });

  expect(config.onPermissionRequest).toBe(providerHandler);
});

test("Copilot deny approval mode rejects permission requests deterministically", async () => {
  await expect(
    Promise.resolve(
      denyCopilotPermissionRequest(
        {
          kind: "write",
          canOfferSessionApproval: true,
          diff: "diff",
          fileName: "src/index.ts",
          intention: "write file",
        },
        {
          sessionId: "session-1",
        },
      ),
    ),
  ).resolves.toEqual({
    kind: "reject",
    feedback: 'claudex approvalMode "deny" rejects Copilot permission requests.',
  });
});

test("Copilot auto-approve-safe approves only read-only permission requests", async () => {
  expect(
    isSafeAutoApprovedPermissionRequest({
      kind: "read",
      intention: "read file",
      path: "README.md",
    }),
  ).toBe(true);
  expect(
    isSafeAutoApprovedPermissionRequest({
      kind: "mcp",
      readOnly: true,
      serverName: "docs",
      toolName: "search",
      toolTitle: "Search",
    }),
  ).toBe(true);
  expect(
    isSafeAutoApprovedPermissionRequest({
      kind: "shell",
      canOfferSessionApproval: true,
      commands: [{ identifier: "ls", readOnly: true }],
      fullCommandText: "ls",
      hasWriteFileRedirection: false,
      intention: "list files",
      possiblePaths: [],
      possibleUrls: [],
    }),
  ).toBe(true);
  expect(
    isSafeAutoApprovedPermissionRequest({
      kind: "shell",
      canOfferSessionApproval: true,
      commands: [{ identifier: "curl", readOnly: true }],
      fullCommandText: "curl https://example.test",
      hasWriteFileRedirection: false,
      intention: "fetch url",
      possiblePaths: [],
      possibleUrls: [{ url: "https://example.test" }],
    }),
  ).toBe(false);
  expect(
    isSafeAutoApprovedPermissionRequest({
      kind: "write",
      canOfferSessionApproval: true,
      diff: "diff",
      fileName: "src/index.ts",
      intention: "write file",
    }),
  ).toBe(false);

  await expect(
    Promise.resolve(
      autoApproveSafeCopilotPermissionRequest(
        {
          kind: "read",
          intention: "read file",
          path: "README.md",
        },
        {
          sessionId: "session-1",
        },
      ),
    ),
  ).resolves.toEqual({
    kind: "approve-once",
  });
  await expect(
    Promise.resolve(
      autoApproveSafeCopilotPermissionRequest(
        {
          kind: "write",
          canOfferSessionApproval: true,
          diff: "diff",
          fileName: "src/index.ts",
          intention: "write file",
        },
        {
          sessionId: "session-1",
        },
      ),
    ),
  ).resolves.toMatchObject({
    kind: "reject",
  });
});

test("buildCopilotSessionConfig fails ambiguous normalized options with AgentError", () => {
  expect(() =>
    buildCopilotSessionConfig({
      approvalMode: "interactive",
    }),
  ).toThrow(AgentError);
  expect(() =>
    buildCopilotSessionConfig({
      additionalDirectories: ["/tmp/extra"],
    }),
  ).toThrow(AgentError);
  expect(() =>
    buildCopilotSessionConfig({
      executionMode: "plan",
    }),
  ).toThrow(AgentError);
  expect(() =>
    buildCopilotSessionConfig({
      sandboxProfile: "workspace-write",
    }),
  ).toThrow(AgentError);
  expect(() =>
    buildCopilotSessionConfig({
      resumeStrategy: "fork",
    }),
  ).toThrow(AgentError);
});

test("buildCopilotSessionConfig fails invalid provider option shapes with AgentError", () => {
  expect(() =>
    buildCopilotSessionConfig({
      providerOptions: {
        copilot: "invalid",
      },
    }),
  ).toThrow(AgentError);
  expect(() =>
    buildCopilotSessionConfig({
      providerOptions: {
        copilot: {
          sessionConfig: "invalid",
        },
      },
    }),
  ).toThrow(AgentError);
  expect(() =>
    buildCopilotSessionConfig({
      providerOptions: {
        copilot: {
          sessionConfig: {
            mcpServers: "invalid",
          },
        },
      },
    }),
  ).toThrow(AgentError);
  expect(() =>
    buildCopilotSessionConfig({
      approvalMode: "interactive",
      providerOptions: {
        copilot: {
          sessionConfig: {
            onPermissionRequest: "invalid",
          },
        },
      },
    }),
  ).toThrow(AgentError);
  expect(() =>
    buildCopilotSessionConfig({
      providerOptions: {
        copilot: {
          sessionConfig: {
            systemMessage: {
              mode: "customize",
              sections: {
                safety: "invalid",
              },
            },
          },
        },
      },
    }),
  ).toThrow(AgentError);
  expect(() =>
    buildCopilotSessionConfig({
      providerOptions: {
        copilot: {
          sessionConfig: {
            systemMessage: {
              mode: "append",
              sections: {
                safety: {
                  action: "remove",
                },
              },
            },
          },
        },
      },
    }),
  ).toThrow(AgentError);
});
