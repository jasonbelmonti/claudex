import { expect, test } from "#test-support";

import type { AgentEvent } from "../../../src/core/events.js";
import type { SessionReference } from "../../../src/core/session.js";
import { CopilotAdapter } from "../../../src/providers/copilot/adapter.js";
import type { CopilotSessionEvent } from "../../../src/providers/copilot/types.js";
import {
  createCopilotAssistantMessageDeltaEvent,
  createCopilotAssistantMessageEvent,
  createCopilotIdleEvent,
  createCopilotModelCallFailureEvent,
  createCopilotSessionErrorEvent,
  createCopilotSessionStartEvent,
  createCopilotUsageEvent,
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
  expect(session.reference).toEqual(COPILOT_REFERENCE);
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

  const session = await adapter.resumeSession({
    provider: "copilot",
    sessionId: "copilot-resume-1",
  });

  expect(session.reference).toEqual({
    provider: "copilot",
    sessionId: "copilot-resume-1",
  });
  expect(client.lastResumeSessionId).toBe("copilot-resume-1");
  expect(client.lastResumeSessionConfig).toMatchObject({
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
