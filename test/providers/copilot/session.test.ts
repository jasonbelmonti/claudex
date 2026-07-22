import { expect, test } from "#test-support";

import { AgentError } from "../../../src/core/errors.js";
import type { AgentEvent } from "../../../src/core/events.js";
import type { SessionReference } from "../../../src/core/session.js";
import { ClaudexAdapter } from "../../../src/providers/claudex/adapter.js";
import { CopilotAdapter } from "../../../src/providers/copilot/adapter.js";
import type { CopilotSessionEvent } from "../../../src/providers/copilot/types.js";
import {
  createCopilotAssistantReasoningDeltaEvent,
  createCopilotAssistantReasoningEvent,
  createCopilotAssistantMessageDeltaEvent,
  createCopilotAssistantMessageEvent,
  createCopilotIdleEvent,
  createCopilotModelCallFailureEvent,
  createCopilotPermissionCompletedEvent,
  createCopilotPermissionRequestedEvent,
  createCopilotSessionErrorEvent,
  createCopilotSessionStartEvent,
  createCopilotSystemMessageEvent,
  createCopilotToolExecutionCompleteEvent,
  createCopilotToolExecutionStartEvent,
  createCopilotUsageEvent,
  createCopilotWorkspaceFileChangedEvent,
  FakeCopilotClient,
  FakeCopilotSession,
} from "./fakes.js";

const COPILOT_REFERENCE: SessionReference = {
  provider: "copilot",
  sessionId: "copilot-session-1",
};

const STRUCTURED_SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
    },
  },
  required: ["status"],
  additionalProperties: false,
} as const;

test("Copilot createSession returns a pre-run null reference and streams a successful terminal turn", async () => {
  const providerEarlyEvents: string[] = [];
  const fakeSession = new FakeCopilotSession(
    COPILOT_REFERENCE.sessionId,
    [
      [
        createCopilotAssistantMessageDeltaEvent({
          deltaContent: "created ",
          messageId: "message-1",
        }),
        createCopilotAssistantMessageEvent({
          content: "created ok",
          messageId: "message-1",
        }),
        createCopilotUsageEvent({
          inputTokens: 7,
          outputTokens: 3,
          cacheReadTokens: 1,
          cacheWriteTokens: 2,
          cost: 0.01,
        }),
        createCopilotIdleEvent(),
      ],
    ],
  );
  const client = new FakeCopilotClient({
    createSessionEvents: [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
    ],
    createSessions: [fakeSession],
  });
  const adapter = new CopilotAdapter({ client });
  const session = await adapter.createSession({
    approvalMode: "deny",
    model: "fake-copilot-model",
    providerOptions: {
      copilot: {
        sessionConfig: {
          onEvent: (event: CopilotSessionEvent) => {
            providerEarlyEvents.push(event.type);
          },
        },
      },
    },
  });

  expect(session.reference).toBeNull();
  expect(client.lastCreateSessionConfig).toMatchObject({
    model: "fake-copilot-model",
    streaming: true,
  });
  expect(providerEarlyEvents).toEqual(["session.start"]);

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Reply with created ok",
    }),
  );
  const terminalEvent = events.at(-1);

  expect(events.map((event) => event.type)).toEqual([
    "session.started",
    "turn.started",
    "message.delta",
    "message.completed",
    "turn.completed",
  ]);
  expect(session.reference).toEqual(COPILOT_REFERENCE);
  expect(fakeSession.sentMessages).toEqual([
    {
      prompt: "Reply with created ok",
    },
  ]);
  expect(terminalEvent).toMatchObject({
    type: "turn.completed",
    result: {
      provider: "copilot",
      session: COPILOT_REFERENCE,
      text: "created ok",
      usage: {
        tokens: {
          input: 7,
          output: 3,
          cachedInput: 1,
        },
        providerUsage: {
          cacheReadTokens: 1,
          cacheWriteTokens: 2,
          cost: 0.01,
          inputTokens: 7,
          model: "fake-copilot-model",
          outputTokens: 3,
        },
      },
    },
  });
  expect(fakeSession.handlerCount).toBe(0);
});

test("Copilot run returns structured output from the completed assistant message", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotAssistantMessageEvent({
        content: "{\"status\":\"ok\"}",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const result = await session.run(
    {
      prompt: "Return JSON",
    },
    {
      outputSchema: STRUCTURED_SCHEMA,
    },
  );

  expect(result).toMatchObject({
    provider: "copilot",
    session: COPILOT_REFERENCE,
    text: "{\"status\":\"ok\"}",
    structuredOutput: {
      status: "ok",
    },
  });
  expect(fakeSession.sentMessages).toEqual([
    {
      displayPrompt: "Return JSON",
      prompt: [
        "Return JSON",
        "<claudex_structured_output_contract>",
        "Return exactly one JSON value that validates against the JSON Schema below.",
        "Do not use Markdown fences, prose, comments, or multiple JSON values.",
        "Claudex will reject malformed or schema-invalid output without repair or retry.",
        JSON.stringify(STRUCTURED_SCHEMA),
        "</claudex_structured_output_contract>",
      ].join("\n\n"),
    },
  ]);
  expect(session.reference).toEqual(COPILOT_REFERENCE);
});

test("Copilot validates the final root assistant message selected before idle", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotAssistantMessageEvent({
        content: '{"status":42}',
        messageId: "intermediate-message",
      }),
      createCopilotAssistantMessageEvent({
        content: '{"status":"ok"}',
        messageId: "final-message",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({ createSessions: [fakeSession] }),
  });
  const session = await adapter.createSession();

  await expect(
    session.run(
      { prompt: "Return JSON" },
      { outputSchema: STRUCTURED_SCHEMA },
    ),
  ).resolves.toMatchObject({
    text: '{"status":"ok"}',
    structuredOutput: { status: "ok" },
  });
});

test.each([
  ["plain text", "not JSON"],
  ["fenced JSON", '```json\n{"status":"ok"}\n```'],
  ["prose-wrapped JSON", 'Result: {"status":"ok"}'],
])("Copilot rejects %s without extracting or repairing it", async (_name, content) => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotAssistantMessageEvent({ content }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({ createSessions: [fakeSession] }),
  });
  const session = await adapter.createSession();

  const failure = await captureFailure(
    session.run(
      { prompt: "Return JSON" },
      { outputSchema: STRUCTURED_SCHEMA },
    ),
  );

  expect(failure).toBeInstanceOf(AgentError);
  expect(failure).toMatchObject({
    code: "structured_output_invalid",
    provider: "copilot",
    message:
      "Copilot returned a non-JSON final response for a structured-output turn.",
    raw: content,
  });
  expect((failure as AgentError).cause).toBeInstanceOf(SyntaxError);
  expect((failure as AgentError).details).toBeUndefined();
});

test("Copilot preserves schema validation paths in the original AgentError", async () => {
  const content = '{"status":42}';
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotAssistantMessageEvent({ content }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({ createSessions: [fakeSession] }),
  });
  const session = await adapter.createSession();
  const failure = await captureFailure(
    session.run(
      { prompt: "Return JSON" },
      { outputSchema: STRUCTURED_SCHEMA },
    ),
  );

  expect(failure).toBeInstanceOf(AgentError);
  expect(failure).toMatchObject({
    code: "structured_output_invalid",
    provider: "copilot",
    message:
      "Copilot returned JSON that did not match the requested output schema.",
    details: {
      validationErrors: [
        {
          instancePath: "/status",
          keyword: "type",
          message: "must be string",
        },
      ],
    },
    raw: {
      text: content,
      schema: STRUCTURED_SCHEMA,
    },
  });
  expect((failure as AgentError).cause).toBeUndefined();
  expect((failure as AgentError).extensions).toBeUndefined();
});

test("Copilot preserves AJV's empty instance path for root schema failures", async () => {
  const content = "[]";
  const rootObjectSchema = { type: "object" } as const;
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotAssistantMessageEvent({ content }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({ createSessions: [fakeSession] }),
  });
  const session = await adapter.createSession();
  const failure = await captureFailure(
    session.run(
      { prompt: "Return JSON" },
      { outputSchema: rootObjectSchema },
    ),
  );

  expect(failure).toBeInstanceOf(AgentError);
  expect(failure).toMatchObject({
    code: "structured_output_invalid",
    provider: "copilot",
    details: {
      validationErrors: [
        {
          instancePath: "",
          keyword: "type",
          message: "must be object",
        },
      ],
    },
    raw: {
      text: content,
      schema: rootObjectSchema,
      validationErrors: [{ instancePath: "" }],
    },
  });
});

test("Claudex preserves Copilot structured-output AgentError fields", async () => {
  const content = '{"status":42}';
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotAssistantMessageEvent({ content }),
      createCopilotIdleEvent(),
    ],
  ]);
  const copilot = new CopilotAdapter({
    client: new FakeCopilotClient({ createSessions: [fakeSession] }),
  });
  const claudex = new ClaudexAdapter({
    preferredProviders: ["copilot"],
    providers: { copilot },
  });
  const session = await claudex.createSession();
  const failure = await captureFailure(
    session.run(
      { prompt: "Return JSON" },
      { outputSchema: STRUCTURED_SCHEMA },
    ),
  );

  expect(failure).toBeInstanceOf(AgentError);
  expect(failure).toMatchObject({
    code: "structured_output_invalid",
    provider: "copilot",
    message:
      "Copilot returned JSON that did not match the requested output schema.",
    details: {
      validationErrors: [{ instancePath: "/status" }],
    },
    raw: {
      text: content,
      schema: STRUCTURED_SCHEMA,
    },
  });
  expect((failure as AgentError).cause).toBeUndefined();
  expect((failure as AgentError).extensions).toBeUndefined();
});

test("Copilot plan sessions send every turn in plan mode under the read-only boundary", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotAssistantMessageEvent({
        content: "plan only",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const client = new FakeCopilotClient({ createSessions: [fakeSession] });
  const adapter = new CopilotAdapter({ client });
  const session = await adapter.createSession({
    executionMode: "plan",
    sandboxProfile: "read-only",
    approvalMode: "deny",
  });

  await session.run({ prompt: "Produce a plan" });

  expect(client.lastCreateSessionConfig).toMatchObject({
    availableTools: [],
    enableConfigDiscovery: false,
    enableHostGitOperations: false,
    remoteSession: "off",
  });
  expect(fakeSession.sentMessages).toEqual([
    {
      prompt: "Produce a plan",
      agentMode: "plan",
    },
  ]);
});

test("Copilot resumeSession validates references and resumes through the SDK facade", async () => {
  const fakeSession = new FakeCopilotSession("copilot-resume-1", [
    [
      createCopilotAssistantMessageEvent({
        content: "resume ok",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const client = new FakeCopilotClient({
    resumeSessions: {
      "copilot-resume-1": fakeSession,
    },
  });
  const adapter = new CopilotAdapter({ client });

  await expect(
    adapter.resumeSession({
      provider: "codex",
      sessionId: "wrong-provider",
    }),
  ).rejects.toMatchObject({
    code: "unsupported_feature",
    provider: "copilot",
  });

  await expect(
    adapter.resumeSession(
      {
        provider: "copilot",
        sessionId: "copilot-resume-1",
      },
      {
        resumeStrategy: "fork",
      },
    ),
  ).rejects.toMatchObject({
    code: "unsupported_feature",
    provider: "copilot",
  });

  const session = await adapter.resumeSession(
    {
      provider: "copilot",
      sessionId: "copilot-resume-1",
    },
    {
      executionMode: "plan",
      sandboxProfile: "read-only",
      approvalMode: "deny",
    },
  );

  expect(session.reference).toEqual({
    provider: "copilot",
    sessionId: "copilot-resume-1",
  });
  expect(client.lastResumeSessionId).toBe("copilot-resume-1");
  expect(client.lastResumeSessionConfig).toMatchObject({
    availableTools: [],
    continuePendingWork: false,
    openCanvases: [],
    streaming: true,
    suppressResumeEvent: true,
  });

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Continue",
    }),
  );

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "message.completed",
    "turn.completed",
  ]);
  expect(fakeSession.sentMessages).toEqual([
    {
      prompt: "Continue",
      agentMode: "plan",
    },
  ]);
});

test("Copilot idle without an assistant message emits a normalized failure instead of hanging", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Produce no assistant message",
    }),
  );
  const terminalEvent = events.at(-1);

  expect(terminalEvent).toMatchObject({
    type: "turn.failed",
    session: COPILOT_REFERENCE,
    error: {
      code: "provider_failure",
      provider: "copilot",
    },
  });
  expect(session.reference).toEqual(COPILOT_REFERENCE);
});

test("Copilot missing terminal events time out as one normalized failure", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotAssistantMessageEvent({
        content: "partial response without idle",
      }),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed(
      {
        prompt: "Never become idle",
      },
      {
        providerOptions: {
          copilot: {
            turnTimeoutMs: 1,
          },
        },
      },
    ),
  );
  const terminalEvents = events.filter(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  );

  expect(terminalEvents).toHaveLength(1);
  expect(terminalEvents[0]).toMatchObject({
    type: "turn.failed",
    session: COPILOT_REFERENCE,
    error: {
      code: "provider_failure",
      message: "Timeout after 1ms waiting for Copilot session.idle.",
      provider: "copilot",
    },
  });
  expect(events.at(-1)).toBe(terminalEvents[0]);
  expect(session.reference).toEqual(COPILOT_REFERENCE);
  expect(fakeSession.abortCallCount).toBe(1);
  expect(fakeSession.handlerCount).toBe(0);
});

test("Copilot timeout after session start emits turn.started before failure", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessionEvents: [
        createCopilotSessionStartEvent({
          sessionId: COPILOT_REFERENCE.sessionId,
        }),
      ],
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed(
      {
        prompt: "Start then time out",
      },
      {
        providerOptions: {
          copilot: {
            turnTimeoutMs: 1,
          },
        },
      },
    ),
  );

  expect(events.map((event) => event.type)).toEqual([
    "session.started",
    "turn.started",
    "turn.failed",
  ]);
  expect(events.at(-1)).toMatchObject({
    type: "turn.failed",
    session: COPILOT_REFERENCE,
    error: {
      message: "Timeout after 1ms waiting for Copilot session.idle.",
    },
  });
  expect(session.reference).toEqual(COPILOT_REFERENCE);
  expect(fakeSession.abortCallCount).toBe(1);
});

test("Copilot direct send failures use consistent pre-start session identity", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId);
  fakeSession.sendError = new Error("send failed before session start");
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Fail before start",
    }),
  );

  expect(events.map((event) => event.type)).toEqual([
    "turn.started",
    "turn.failed",
  ]);
  expect(events[0]).toMatchObject({
    type: "turn.started",
    session: null,
  });
  expect(events[1]).toMatchObject({
    type: "turn.failed",
    session: null,
    error: {
      provider: "copilot",
      message: "send failed before session start",
    },
  });
  expect(session.reference).toBeNull();
  expect(fakeSession.handlerCount).toBe(0);
});

test("Copilot provider failures emit one terminal event and suppress later idle terminals", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotSessionErrorEvent({
        message: "Copilot runtime failed",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Fail this turn",
    }),
  );
  const terminalEvents = events.filter(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  );

  expect(terminalEvents).toHaveLength(1);
  expect(terminalEvents[0]).toMatchObject({
    type: "turn.failed",
    session: COPILOT_REFERENCE,
    error: {
      code: "provider_failure",
      message: "Copilot runtime failed",
      provider: "copilot",
    },
  });
  expect(terminalEvents[0]?.raw).toBeDefined();
  expect(session.reference).toEqual(COPILOT_REFERENCE);
  expect(fakeSession.handlerCount).toBe(0);
});

test("Copilot model call failures emit one normalized terminal failure", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotModelCallFailureEvent({
        errorMessage: "rate limit reached",
        statusCode: 429,
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Trigger model failure",
    }),
  );
  const terminalEvents = events.filter(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  );

  expect(terminalEvents).toHaveLength(1);
  expect(terminalEvents[0]).toMatchObject({
    type: "turn.failed",
    session: COPILOT_REFERENCE,
    error: {
      code: "provider_failure",
      message: "rate limit reached",
      provider: "copilot",
    },
  });
  expect(terminalEvents[0]?.raw).toMatchObject({
    type: "model.call_failure",
    data: {
      statusCode: 429,
    },
  });
  expect(events.at(-1)).toBe(terminalEvents[0]);
  expect(session.reference).toEqual(COPILOT_REFERENCE);
  expect(fakeSession.handlerCount).toBe(0);
});

test("Copilot model call telemetry does not fail a later successful turn", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotModelCallFailureEvent({
        errorMessage: "retryable model failure",
      }),
      createCopilotAssistantMessageEvent({
        content: "retry ok",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Retry after model failure",
    }),
  );

  expect(events.map((event) => event.type)).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
    "turn.completed",
  ]);
  expect(events.at(-1)).toMatchObject({
    type: "turn.completed",
    result: {
      session: COPILOT_REFERENCE,
      text: "retry ok",
    },
  });
  expect(session.reference).toEqual(COPILOT_REFERENCE);
});

test("Copilot ignores sub-agent model failures while completing the root turn", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotModelCallFailureEvent({
        agentId: "subagent-1",
        errorMessage: "sub-agent failed",
      }),
      createCopilotAssistantMessageEvent({
        content: "root ok",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Ignore sub-agent failure",
    }),
  );
  const terminalEvents = events.filter(
    (event) => event.type === "turn.completed" || event.type === "turn.failed",
  );

  expect(events.map((event) => event.type)).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
    "turn.completed",
  ]);
  expect(terminalEvents).toHaveLength(1);
  expect(terminalEvents[0]).toMatchObject({
    type: "turn.completed",
    result: {
      session: COPILOT_REFERENCE,
      text: "root ok",
    },
  });
  expect(session.reference).toEqual(COPILOT_REFERENCE);
});

test("Copilot tool completions preserve started tool metadata", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotToolExecutionStartEvent({
        args: {
          command: "pwd",
        },
        toolCallId: "tool-call-1",
        toolName: "run_in_terminal",
      }),
      createCopilotToolExecutionCompleteEvent({
        content: "done",
        toolCallId: "tool-call-1",
      }),
      createCopilotAssistantMessageEvent({
        content: "tool ok",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Run a command",
    }),
  );

  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "tool.started",
        toolCallId: "tool-call-1",
        toolName: "run_in_terminal",
        kind: "command",
      }),
      expect.objectContaining({
        type: "tool.completed",
        toolCallId: "tool-call-1",
        toolName: "run_in_terminal",
        kind: "command",
        outcome: "success",
      }),
    ]),
  );
  expect(events.at(-1)).toMatchObject({
    type: "turn.completed",
    result: {
      text: "tool ok",
    },
  });
});

test("Copilot maps workspace file and approval events with sanitized metadata", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotWorkspaceFileChangedEvent({
        operation: "create",
        path: "files/generated.md",
      }),
      createCopilotPermissionRequestedEvent({
        permissionRequest: {
          canOfferSessionApproval: false,
          diff: "SECRET_DIFF",
          fileName: "src/output.ts",
          intention: "Update generated output",
          kind: "write",
          newFileContents: "SECRET_NEW_CONTENTS",
          toolCallId: "tool-call-write",
        },
        requestId: "permission-1",
      }),
      createCopilotPermissionCompletedEvent({
        requestId: "permission-1",
        result: {
          kind: "denied-by-content-exclusion-policy",
          message: "Denied by policy",
          path: "src/output.ts",
        },
        toolCallId: "tool-call-write",
      }),
      createCopilotAssistantMessageEvent({
        content: "approval noted",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Exercise side effects",
    }),
  );

  expect(events.map((event) => event.type)).toEqual([
    "session.started",
    "turn.started",
    "file.changed",
    "approval.requested",
    "approval.resolved",
    "message.completed",
    "turn.completed",
  ]);
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "file.changed",
        changes: [
          {
            path: "files/generated.md",
            changeType: "add",
          },
        ],
        extensions: {
          source: "session.workspace",
          operation: "create",
        },
      }),
      expect.objectContaining({
        type: "approval.requested",
        approvalId: "permission-1",
        actionLabel: "Modify src/output.ts",
        scope: "file",
        reason: "Update generated output",
        extensions: {
          permissionKind: "write",
          toolCallId: "tool-call-write",
          fileName: "src/output.ts",
          canOfferSessionApproval: false,
        },
      }),
      expect.objectContaining({
        type: "approval.resolved",
        approvalId: "permission-1",
        outcome: "denied",
        reason: "Denied by policy",
        extensions: {
          resultKind: "denied-by-content-exclusion-policy",
          toolCallId: "tool-call-write",
        },
      }),
    ]),
  );
  expect(JSON.stringify(events)).not.toContain("SECRET_DIFF");
  expect(JSON.stringify(events)).not.toContain("SECRET_NEW_CONTENTS");
});

test("Copilot omits system and reasoning payloads from normalized events by default", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId, [
    [
      createCopilotSessionStartEvent({
        sessionId: COPILOT_REFERENCE.sessionId,
      }),
      createCopilotSystemMessageEvent({
        content: "SECRET_SYSTEM_PROMPT",
      }),
      createCopilotAssistantReasoningEvent({
        content: "SECRET_REASONING_TEXT",
      }),
      createCopilotAssistantReasoningDeltaEvent({
        deltaContent: "SECRET_REASONING_DELTA",
      }),
      createCopilotAssistantMessageEvent({
        content: "safe answer",
      }),
      createCopilotIdleEvent(),
    ],
  ]);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const events = await collectEvents(
    session.runStreamed({
      prompt: "Do not leak internals",
    }),
  );

  expect(events.map((event) => event.type)).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
    "turn.completed",
  ]);
  const serializedEvents = JSON.stringify(events);
  expect(serializedEvents).not.toContain("SECRET_SYSTEM_PROMPT");
  expect(serializedEvents).not.toContain("SECRET_REASONING_TEXT");
  expect(serializedEvents).not.toContain("SECRET_REASONING_DELTA");
});

test("Copilot rejects attachments while image input remains unclaimed", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId);
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessionEvents: [
        createCopilotSessionStartEvent({
          sessionId: COPILOT_REFERENCE.sessionId,
        }),
      ],
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();

  const failedEvents = await collectEvents(
    session.runStreamed({
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
  );

  expect(failedEvents).toHaveLength(1);
  expect(failedEvents[0]).toMatchObject({
    type: "turn.failed",
    session: null,
    error: {
      code: "unsupported_feature",
      provider: "copilot",
    },
  });
  expect(fakeSession.sentMessages).toEqual([]);
  expect(session.reference).toBeNull();

  fakeSession.enqueueRun([
    createCopilotAssistantMessageEvent({
      content: "follow-up ok",
    }),
    createCopilotIdleEvent(),
  ]);

  const followUpEvents = await collectEvents(
    session.runStreamed({
      prompt: "Continue after rejected input",
    }),
  );

  expect(followUpEvents.map((event) => event.type)).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
    "turn.completed",
  ]);
  expect(session.reference).toEqual(COPILOT_REFERENCE);
});

test("Copilot abort signal calls session.abort and emits a normalized aborted failure", async () => {
  const fakeSession = new FakeCopilotSession(COPILOT_REFERENCE.sessionId);
  fakeSession.sendNeverResolves = true;
  const adapter = new CopilotAdapter({
    client: new FakeCopilotClient({
      createSessions: [fakeSession],
    }),
  });
  const session = await adapter.createSession();
  const controller = new AbortController();

  const eventsPromise = collectEvents(
    session.runStreamed(
      {
        prompt: "Keep running",
      },
      {
        signal: controller.signal,
      },
    ),
  );

  setTimeout(() => {
    controller.abort();
  }, 0);

  const events = await eventsPromise;
  const terminalEvent = events.at(-1);

  expect(events).toEqual([
    expect.objectContaining({
      type: "turn.started",
      session: null,
    }),
    expect.objectContaining({
      type: "turn.failed",
      session: null,
    }),
  ]);
  expect(fakeSession.abortCallCount).toBe(1);
  expect(terminalEvent).toMatchObject({
    type: "turn.failed",
    error: {
      code: "aborted",
      provider: "copilot",
    },
  });
  expect(session.reference).toBeNull();
  expect(fakeSession.handlerCount).toBe(0);
});

async function collectEvents(
  stream: AsyncGenerator<AgentEvent>,
): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}

async function captureFailure(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}
