import { expect, test } from "bun:test";

import { ClaudeAdapter } from "../../../src/providers/claude/adapter";
import { FakeClaudeQuery, FakeClaudeQueryFactory } from "./fakes";
import {
  createAssistantMessage,
  createAuthStatusMessage,
  createFilesPersistedMessage,
  createInitMessage,
  createStatusMessage,
  createSuccessResultMessage,
  createTaskNotificationMessage,
  createTaskProgressMessage,
  createTaskStartedMessage,
  createTextDeltaMessage,
  createToolProgressMessage,
} from "./messages";

test("runStreamed maps Claude SDK messages into the normalized event contract", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-events-1"),
      createAuthStatusMessage("claude-events-1"),
      createStatusMessage("claude-events-1"),
      createTextDeltaMessage("claude-events-1", "Hello "),
      createTextDeltaMessage("claude-events-1", "world"),
      createAssistantMessage("claude-events-1", "Hello world"),
      createTaskStartedMessage("claude-events-1"),
      createToolProgressMessage("claude-events-1"),
      createTaskProgressMessage("claude-events-1"),
      createFilesPersistedMessage("claude-events-1"),
      createTaskNotificationMessage("claude-events-1"),
      createSuccessResultMessage("claude-events-1", "Hello world"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });
  const session = await adapter.createSession();
  const eventTypes: string[] = [];
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Say hello",
  })) {
    eventTypes.push(event.type);
    events.push(event);
  }

  expect(eventTypes).toEqual([
    "session.started",
    "turn.started",
    "auth.status",
    "status",
    "message.delta",
    "message.delta",
    "message.completed",
    "tool.started",
    "tool.updated",
    "tool.updated",
    "file.changed",
    "tool.completed",
    "turn.completed",
  ]);
  expect(events.at(-1)).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Hello world",
      usage: {
        costUsd: 0.05,
        tokens: {
          input: 3,
          cachedInput: 4,
          output: 5,
        },
      },
    },
  });
});

test("structured-output schema mismatches surface as AgentError", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-events-2"),
      createAssistantMessage("claude-events-2", "{\"status\":1}"),
      createSuccessResultMessage("claude-events-2", "{\"status\":1}", {
        structuredOutput: {
          status: 1,
        },
      }),
    ]),
    new FakeClaudeQuery([
      createInitMessage("claude-events-2"),
      createAssistantMessage("claude-events-2", "{\"status\":1}"),
      createSuccessResultMessage("claude-events-2", "{\"status\":1}", {
        structuredOutput: {
          status: 1,
        },
      }),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });
  const session = await adapter.createSession();
  const streamedEvents = [];

  for await (const event of session.runStreamed(
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
  )) {
    streamedEvents.push(event);
  }

  expect(streamedEvents.at(-1)).toMatchObject({
    type: "turn.failed",
    error: expect.objectContaining({
      code: "structured_output_invalid",
      details: {
        validationErrors: expect.any(Array),
      },
    }),
  });

  await expect(
    session.run(
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
    ),
  ).rejects.toMatchObject({
    code: "structured_output_invalid",
  });
});

test("runStreamed emits turn.failed when the query stream ends without a result", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([
      createInitMessage("claude-events-3"),
      createAssistantMessage("claude-events-3", "Partial"),
    ]),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });
  const session = await adapter.createSession();
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Incomplete turn",
  })) {
    events.push(event);
  }

  expect(events.at(-1)).toMatchObject({
    type: "turn.failed",
    error: expect.objectContaining({
      code: "provider_failure",
      message: "Claude stream ended without a terminal turn event.",
    }),
  });
});
