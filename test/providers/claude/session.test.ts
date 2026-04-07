import { expect, test } from "bun:test";
import type {
  SDKMessage,
  SessionMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { AgentError } from "../../../src/core/errors";
import { ClaudeAdapter } from "../../../src/providers/claude/adapter";
import { FakeClaudeQuery, FakeClaudeQueryFactory } from "./fakes";
import {
  createAssistantMessage,
  createInitMessage,
  createSuccessResultMessage,
  createTextDeltaMessage,
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

test("resumeSession runStreamed synthesizes assistant deltas from the session transcript", async () => {
  const sessionId = "claude-session-resumed-stream";
  const factory = new FakeClaudeQueryFactory([
    new DelayedFakeClaudeQuery([
      {
        message: createInitMessage(sessionId),
      },
      {
        delayMs: 30,
        message: createSuccessResultMessage(sessionId, "Hello world"),
      },
    ]),
  ]);
  const transcriptSnapshots: SessionMessage[][] = [
    [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")],
    [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello", "assistant-new-1"),
    ],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello world", "assistant-new-1"),
    ],
  ];
  let transcriptReadCount = 0;
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sessionMessagesLoader: async () =>
      transcriptSnapshots[Math.min(transcriptReadCount++, transcriptSnapshots.length - 1)] ?? [],
    transcriptPollIntervalMs: 5,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(factory.invocations[0]?.options.resume).toBe(sessionId);
  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(events[1]).toMatchObject({
    type: "message.delta",
    delta: "Hello",
  });
  expect(events[2]).toMatchObject({
    type: "message.delta",
    delta: " world",
  });
  expect(events[3]).toMatchObject({
    type: "message.completed",
    text: "Hello world",
  });
  expect(events[4]).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Hello world",
    },
  });
});

test("resumeSession runStreamed captures transcript baseline before query creation", async () => {
  const sessionId = "claude-session-query-side-effect";
  let transcriptMessages: SessionMessage[] = [
    createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
  ];
  const adapter = new ClaudeAdapter({
    queryFactory: () => {
      transcriptMessages = [
        createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
        createTranscriptAssistantMessage(sessionId, "Hello world", "assistant-new-1"),
      ];

      return new DelayedFakeClaudeQuery([
        {
          delayMs: 20,
          message: createInitMessage(sessionId),
        },
        {
          delayMs: 20,
          message: createSuccessResultMessage(sessionId, ""),
        },
      ]);
    },
    sessionMessagesLoader: async () => transcriptMessages,
    transcriptPollIntervalMs: 5,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(events[1]).toMatchObject({
    type: "message.delta",
    delta: "Hello world",
  });
  expect(events[2]).toMatchObject({
    type: "message.completed",
    text: "Hello world",
  });
  expect(events[3]).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Hello world",
    },
  });
});

test("resumeSession runStreamed waits to emit transcript events until turn.started", async () => {
  const sessionId = "claude-session-delayed-init";
  let transcriptMessages: SessionMessage[] = [
    createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
  ];
  const adapter = new ClaudeAdapter({
    queryFactory: () => {
      transcriptMessages = [
        createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
        createTranscriptAssistantMessage(sessionId, "Hello world", "assistant-new-1"),
      ];

      return new DelayedFakeClaudeQuery([
        {
          delayMs: 20,
          message: createInitMessage(sessionId),
        },
        {
          delayMs: 20,
          message: createSuccessResultMessage(sessionId, "Hello world"),
        },
      ]);
    },
    sessionMessagesLoader: async () => transcriptMessages,
    transcriptPollIntervalMs: 5,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
});

test("resumeSession runStreamed emits assistant lifecycle even when result wins before the first poll", async () => {
  const sessionId = "claude-session-fast-result";
  const factory = new FakeClaudeQueryFactory([
    new DelayedFakeClaudeQuery([
      {
        message: createInitMessage(sessionId),
      },
      {
        delayMs: 30,
        message: createSuccessResultMessage(sessionId, "Hello world"),
      },
    ]),
  ]);
  let transcriptReadCount = 0;
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sessionMessagesLoader: async () => {
      transcriptReadCount += 1;

      return [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")];
    },
    transcriptPollIntervalMs: 100,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(transcriptReadCount).toBeGreaterThanOrEqual(1);
  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(events[1]).toMatchObject({
    type: "message.delta",
    delta: "Hello world",
  });
  expect(events[2]).toMatchObject({
    type: "message.completed",
    text: "Hello world",
  });
  expect(events[3]).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Hello world",
    },
  });
});

test("resumeSession runStreamed uses the authoritative result text when the transcript lags", async () => {
  const sessionId = "claude-session-stale-transcript";
  const factory = new FakeClaudeQueryFactory([
    new DelayedFakeClaudeQuery([
      {
        message: createInitMessage(sessionId),
      },
      {
        delayMs: 25,
        message: createSuccessResultMessage(sessionId, "Hello world"),
      },
    ]),
  ]);
  const transcriptSnapshots: SessionMessage[][] = [
    [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")],
    [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello", "assistant-new-1"),
    ],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello", "assistant-new-1"),
    ],
  ];
  let transcriptReadCount = 0;
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sessionMessagesLoader: async () =>
      transcriptSnapshots[Math.min(transcriptReadCount++, transcriptSnapshots.length - 1)] ?? [],
    transcriptPollIntervalMs: 5,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(events[1]).toMatchObject({
    type: "message.delta",
    delta: "Hello",
  });
  expect(events[2]).toMatchObject({
    type: "message.delta",
    delta: " world",
  });
  expect(events[3]).toMatchObject({
    type: "message.completed",
    text: "Hello world",
  });
  expect(events[4]).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Hello world",
    },
  });
});

test("resumeSession runStreamed keeps transcript fallback active across non-text stream events", async () => {
  const sessionId = "claude-session-non-text-stream";
  const factory = new FakeClaudeQueryFactory([
    new DelayedFakeClaudeQuery([
      {
        message: createInitMessage(sessionId),
      },
      {
        delayMs: 1,
        message: createNonTextStreamEvent(sessionId),
      },
      {
        delayMs: 24,
        message: createSuccessResultMessage(sessionId, "Hello world"),
      },
    ]),
  ]);
  const transcriptSnapshots: SessionMessage[][] = [
    [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")],
    [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello", "assistant-new-1"),
    ],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello world", "assistant-new-1"),
    ],
  ];
  let transcriptReadCount = 0;
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sessionMessagesLoader: async () =>
      transcriptSnapshots[Math.min(transcriptReadCount++, transcriptSnapshots.length - 1)] ?? [],
    transcriptPollIntervalMs: 5,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(events[1]).toMatchObject({
    type: "message.delta",
    delta: "Hello",
  });
  expect(events[2]).toMatchObject({
    type: "message.delta",
    delta: " world",
  });
});

test("resumeSession runStreamed does not duplicate deltas when the SDK already streamed text", async () => {
  const sessionId = "claude-session-sdk-deltas";
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage(sessionId),
      createTextDeltaMessage(sessionId, "Hello"),
      createTextDeltaMessage(sessionId, " world"),
      createSuccessResultMessage(sessionId, "Hello world"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sessionMessagesLoader: async () => [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello world", "assistant-new-1"),
    ],
    transcriptPollIntervalMs: 5,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(
    events.filter((event) => event.type === "message.delta").map((event) => event.delta),
  ).toEqual(["Hello", " world"]);
  expect(events[3]).toMatchObject({
    type: "message.completed",
    text: "Hello world",
  });
});

test("resumeSession runStreamed preserves SDK suffix deltas after synthetic fallback starts", async () => {
  const sessionId = "claude-session-synthetic-to-sdk";
  const factory = new FakeClaudeQueryFactory([
    new DelayedFakeClaudeQuery([
      {
        message: createInitMessage(sessionId),
      },
      {
        delayMs: 15,
        message: createTextDeltaMessage(sessionId, "Hello"),
      },
      {
        delayMs: 5,
        message: createTextDeltaMessage(sessionId, " world"),
      },
      {
        delayMs: 5,
        message: createSuccessResultMessage(sessionId, "Hello world"),
      },
    ]),
  ]);
  const transcriptSnapshots: SessionMessage[][] = [
    [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello", "assistant-new-1"),
    ],
  ];
  let transcriptReadCount = 0;
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sessionMessagesLoader: async () =>
      transcriptSnapshots[Math.min(transcriptReadCount++, transcriptSnapshots.length - 1)] ?? [],
    transcriptPollIntervalMs: 5,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(
    events.filter((event) => event.type === "message.delta").map((event) => event.delta),
  ).toEqual(["Hello", " world"]);
  expect(events[3]).toMatchObject({
    type: "message.completed",
    text: "Hello world",
  });
});

test("resumeSession runStreamed ignores SDK deltas already covered by synthetic text", async () => {
  const sessionId = "claude-session-synthetic-ahead";
  const factory = new FakeClaudeQueryFactory([
    new DelayedFakeClaudeQuery([
      {
        message: createInitMessage(sessionId),
      },
      {
        delayMs: 15,
        message: createTextDeltaMessage(sessionId, "Hello"),
      },
      {
        delayMs: 5,
        message: createTextDeltaMessage(sessionId, " world"),
      },
      {
        delayMs: 5,
        message: createSuccessResultMessage(sessionId, "Hello world"),
      },
    ]),
  ]);
  const transcriptSnapshots: SessionMessage[][] = [
    [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello world", "assistant-new-1"),
    ],
  ];
  let transcriptReadCount = 0;
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sessionMessagesLoader: async () =>
      transcriptSnapshots[Math.min(transcriptReadCount++, transcriptSnapshots.length - 1)] ?? [],
    transcriptPollIntervalMs: 5,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(events[1]).toMatchObject({
    type: "message.delta",
    delta: "Hello world",
  });
  expect(
    events.filter((event) => event.type === "message.delta").map((event) => event.delta),
  ).toEqual(["Hello world"]);
});

test("resumeSession runStreamed emits the remaining suffix before a fast assistant completion", async () => {
  const sessionId = "claude-session-fast-assistant";
  const factory = new FakeClaudeQueryFactory([
    new DelayedFakeClaudeQuery([
      {
        message: createInitMessage(sessionId),
      },
      {
        delayMs: 20,
        message: createAssistantMessage(sessionId, "Hello world"),
      },
      {
        delayMs: 5,
        message: createSuccessResultMessage(sessionId, "Hello world"),
      },
    ]),
  ]);
  const transcriptSnapshots: SessionMessage[][] = [
    [createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1")],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello", "assistant-new-1"),
    ],
    [
      createTranscriptAssistantMessage(sessionId, "Previous reply", "assistant-history-1"),
      createTranscriptAssistantMessage(sessionId, "Hello", "assistant-new-1"),
    ],
  ];
  let transcriptReadCount = 0;
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sessionMessagesLoader: async () =>
      transcriptSnapshots[Math.min(transcriptReadCount++, transcriptSnapshots.length - 1)] ?? [],
    transcriptPollIntervalMs: 5,
  });
  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId,
  });
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Continue",
  })) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.delta",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(events[1]).toMatchObject({
    type: "message.delta",
    delta: "Hello",
  });
  expect(events[2]).toMatchObject({
    type: "message.delta",
    delta: " world",
  });
  expect(events[3]).toMatchObject({
    type: "message.completed",
    text: "Hello world",
  });
});

class DelayedFakeClaudeQuery extends FakeClaudeQuery {
  constructor(
    private readonly steps: Array<{
      delayMs?: number;
      message: SDKMessage;
    }>,
  ) {
    super([]);
  }

  override async *[Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
    for (const step of this.steps) {
      if (step.delayMs) {
        await Bun.sleep(step.delayMs);
      }

      yield step.message;
    }
  }
}

function createTranscriptAssistantMessage(
  sessionId: string,
  text: string,
  uuid: string,
): SessionMessage {
  return {
    type: "assistant",
    uuid,
    session_id: sessionId,
    parent_tool_use_id: null,
    message: {
      role: "assistant",
      content: [
        {
          type: "text",
          text,
        },
      ],
    },
  };
}

function createNonTextStreamEvent(sessionId: string): SDKMessage {
  return {
    type: "stream_event",
    session_id: sessionId,
    uuid: "00000000-0000-4000-8000-000000009999",
    parent_tool_use_id: null,
    event: {
      type: "message_start",
      message: {
        id: `${sessionId}-partial`,
        type: "message",
        role: "assistant",
        model: "claude-sonnet-4-6",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 0,
        },
      },
    },
  } as SDKMessage;
}
