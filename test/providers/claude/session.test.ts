import { expect, test } from "bun:test";

import { AgentError } from "../../../src/core/errors";
import { ClaudeAdapter } from "../../../src/providers/claude/adapter";
import { FakeClaudeQuery, FakeClaudeQueryFactory } from "./fakes";
import {
  createAssistantMessage,
  createInitMessage,
  createSuccessResultMessage,
} from "./messages";

test("createSession maps normalized options into Claude query options", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-session-1"),
      createAssistantMessage("claude-session-1", "First response"),
      createSuccessResultMessage("claude-session-1", "First response", {
        structuredOutput: "First response",
      }),
    ]),
    new FakeClaudeQuery([
      createInitMessage("claude-session-1"),
      createAssistantMessage("claude-session-1", "Second response"),
      createSuccessResultMessage("claude-session-1", "Second response"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });
  const session = await adapter.createSession({
    model: "claude-sonnet-4-6",
    workingDirectory: "/tmp/claude",
    additionalDirectories: ["/tmp/claude/docs"],
    instructions: "Always answer in one sentence.",
    approvalMode: "interactive",
    providerOptions: {
      claude: {
        options: {
          hooks: {},
        },
      },
    },
  });

  const firstResult = await session.run(
    {
      prompt: "Say hello",
    },
    {
      outputSchema: {
        type: "string",
      },
    },
  );
  const secondResult = await session.run({
    prompt: "Say goodbye",
  });

  expect(factory.invocations[0]?.options).toMatchObject({
    model: "claude-sonnet-4-6",
    cwd: "/tmp/claude",
    additionalDirectories: ["/tmp/claude/docs"],
    permissionMode: "default",
    includePartialMessages: true,
    outputFormat: {
      type: "json_schema",
      schema: {
        type: "string",
      },
    },
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: "Always answer in one sentence.",
    },
  });
  expect(factory.invocations[1]?.options.resume).toBe("claude-session-1");
  expect(session.reference).toEqual({
    provider: "claude",
    sessionId: "claude-session-1",
  });
  expect(firstResult.text).toBe("First response");
  expect(secondResult.text).toBe("Second response");
});

test("createSession inherits adapter sdkOptions defaults for reserved Claude fields", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-session-sdk-defaults"),
      createAssistantMessage("claude-session-sdk-defaults", "Configured"),
      createSuccessResultMessage("claude-session-sdk-defaults", "Configured"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sdkOptions: {
      model: "claude-sonnet-4-6",
      cwd: "/tmp/sdk-defaults",
      permissionMode: "dontAsk",
      systemPrompt: "Use constructor defaults.",
    },
  });
  const session = await adapter.createSession();

  await session.run({
    prompt: "Use defaults",
  });

  expect(factory.invocations[0]?.options).toMatchObject({
    model: "claude-sonnet-4-6",
    cwd: "/tmp/sdk-defaults",
    permissionMode: "dontAsk",
    systemPrompt: "Use constructor defaults.",
  });
});

test("resumeSession uses the provided reference immediately", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-session-2"),
      createAssistantMessage("claude-session-2", "Resumed"),
      createSuccessResultMessage("claude-session-2", "Resumed"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId: "claude-session-2",
  });

  expect(session.reference).toEqual({
    provider: "claude",
    sessionId: "claude-session-2",
  });

  const result = await session.run({
    prompt: "Continue",
  });

  expect(factory.invocations[0]?.options.resume).toBe("claude-session-2");
  expect(result.text).toBe("Resumed");
});

test("structured output falls back to serialized text when Claude omits terminal text", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-session-structured"),
      createSuccessResultMessage("claude-session-structured", "", {
        structuredOutput: {
          status: "ok",
        },
      }),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });
  const session = await adapter.createSession({
    executionMode: "plan",
    approvalMode: "deny",
  });

  const result = await session.run(
    {
      prompt: "Return JSON",
    },
    {
      outputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
          },
        },
        required: ["status"],
        additionalProperties: false,
      },
    },
  );

  expect(result.text).toBe(JSON.stringify({ status: "ok" }));
  expect(result.structuredOutput).toEqual({
    status: "ok",
  });
});

test("resumeSession with fork waits for the new session reference", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-session-forked"),
      createAssistantMessage("claude-session-forked", "Forked"),
      createSuccessResultMessage("claude-session-forked", "Forked"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });
  const session = await adapter.resumeSession(
    {
      provider: "claude",
      sessionId: "claude-session-source",
    },
    {
      resumeStrategy: "fork",
    },
  );

  expect(session.reference).toBeNull();

  await session.run({
    prompt: "Fork this session",
  });

  expect(factory.invocations[0]?.options.resume).toBe("claude-session-source");
  expect(factory.invocations[0]?.options.forkSession).toBe(true);
  expect(session.reference).toEqual({
    provider: "claude",
    sessionId: "claude-session-forked",
  });
});

test("fork() creates a new Claude session that forks on first run", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-session-3"),
      createAssistantMessage("claude-session-3", "Original"),
      createSuccessResultMessage("claude-session-3", "Original"),
    ]),
    new FakeClaudeQuery([
      createInitMessage("claude-session-4"),
      createAssistantMessage("claude-session-4", "Fork copy"),
      createSuccessResultMessage("claude-session-4", "Fork copy"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });
  const session = await adapter.createSession();

  await session.run({
    prompt: "Original turn",
  });

  const forkedSession = await session.fork?.({
    approvalMode: "deny",
  });

  expect(forkedSession?.reference).toBeNull();

  await forkedSession?.run({
    prompt: "Forked turn",
  });

  expect(factory.invocations[1]?.options.resume).toBe("claude-session-3");
  expect(factory.invocations[1]?.options.forkSession).toBe(true);
  expect(factory.invocations[1]?.options.permissionMode).toBe("dontAsk");
  expect(forkedSession?.reference).toEqual({
    provider: "claude",
    sessionId: "claude-session-4",
  });
});

test("fork() preserves inherited nested Claude provider options", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-session-merge-1"),
      createAssistantMessage("claude-session-merge-1", "Original"),
      createSuccessResultMessage("claude-session-merge-1", "Original"),
    ]),
    new FakeClaudeQuery([
      createInitMessage("claude-session-merge-2"),
      createAssistantMessage("claude-session-merge-2", "Forked"),
      createSuccessResultMessage("claude-session-merge-2", "Forked"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });
  const session = await adapter.createSession({
    providerOptions: {
      claude: {
        options: {
          hooks: {},
          promptSuggestions: true,
        },
      },
    },
  });

  await session.run({
    prompt: "Original turn",
  });

  const forkedSession = await session.fork?.({
    providerOptions: {
      claude: {
        options: {
          plugins: [
            {
              type: "local",
              path: "/tmp/plugin",
            },
          ],
        },
      },
    },
  });

  await forkedSession?.run({
    prompt: "Forked turn",
  });

  expect(factory.invocations[1]?.options.hooks).toEqual({});
  expect(factory.invocations[1]?.options.promptSuggestions).toBe(true);
  expect(factory.invocations[1]?.options.plugins).toEqual([
    {
      type: "local",
      path: "/tmp/plugin",
    },
  ]);
});

test("fork() preserves adapter sdkOptions defaults", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-session-sdk-fork-1"),
      createAssistantMessage("claude-session-sdk-fork-1", "Original"),
      createSuccessResultMessage("claude-session-sdk-fork-1", "Original"),
    ]),
    new FakeClaudeQuery([
      createInitMessage("claude-session-sdk-fork-2"),
      createAssistantMessage("claude-session-sdk-fork-2", "Forked"),
      createSuccessResultMessage("claude-session-sdk-fork-2", "Forked"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sdkOptions: {
      pathToClaudeCodeExecutable: "/tmp/claude",
      systemPrompt: "Use adapter defaults.",
    },
  });
  const session = await adapter.createSession();

  await session.run({
    prompt: "Original turn",
  });

  const forkedSession = await session.fork?.();

  await forkedSession?.run({
    prompt: "Forked turn",
  });

  expect(factory.invocations[1]?.options.pathToClaudeCodeExecutable).toBe("/tmp/claude");
  expect(factory.invocations[1]?.options.systemPrompt).toBe("Use adapter defaults.");
});

test("createSession rejects explicit sandbox profiles outside plan mode", async () => {
  const adapter = new ClaudeAdapter({
    queryFactory: new FakeClaudeQueryFactory([]).create,
  });

  await expect(
    adapter.createSession({
      sandboxProfile: "workspace-write",
    }),
  ).rejects.toBeInstanceOf(AgentError);

  await expect(
    adapter.createSession({
      sandboxProfile: "full-access",
    }),
  ).rejects.toBeInstanceOf(AgentError);
});

test("run rejects unsupported attachments", async () => {
  const adapter = new ClaudeAdapter({
    queryFactory: new FakeClaudeQueryFactory([new FakeClaudeQuery([])]).create,
  });
  const session = await adapter.createSession();

  await expect(
    session.run({
      prompt: "Describe the image",
      attachments: [
        {
          kind: "image",
          source: {
            type: "path",
            path: "/tmp/image.png",
          },
        },
      ],
    }),
  ).rejects.toBeInstanceOf(AgentError);
});
