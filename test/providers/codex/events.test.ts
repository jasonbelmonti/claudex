import { expect, test } from "bun:test";

import { CodexAdapter } from "../../../src/providers/codex/adapter";
import {
  FakeCodexClient,
  FakeCodexThread,
  RejectingCodexThread,
} from "./fakes";

test("runStreamed maps Codex events into the normalized event contract", async () => {
  const thread = new FakeCodexThread([
    [
      {
        type: "thread.started",
        thread_id: "thread-events-1",
      },
      {
        type: "turn.started",
      },
      {
        type: "item.started",
        item: {
          id: "cmd-1",
          type: "command_execution",
          command: "git status",
          aggregated_output: "",
          status: "in_progress",
        },
      },
      {
        type: "item.updated",
        item: {
          id: "cmd-1",
          type: "command_execution",
          command: "git status",
          aggregated_output: "On branch main",
          status: "in_progress",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "cmd-1",
          type: "command_execution",
          command: "git status",
          aggregated_output: "On branch main",
          exit_code: 0,
          status: "completed",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "reasoning-1",
          type: "reasoning",
          text: "Checked working tree state.",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "todo-1",
          type: "todo_list",
          items: [
            {
              text: "Check git status",
              completed: true,
            },
          ],
        },
      },
      {
        type: "item.completed",
        item: {
          id: "patch-1",
          type: "file_change",
          changes: [
            {
              path: "README.md",
              kind: "update",
            },
          ],
          status: "completed",
        },
      },
      {
        type: "item.completed",
        item: {
          id: "message-1",
          type: "agent_message",
          text: "Repository looks healthy.",
        },
      },
      {
        type: "turn.completed",
        usage: {
          input_tokens: 10,
          cached_input_tokens: 0,
          output_tokens: 3,
        },
      },
    ],
  ]);
  const adapter = new CodexAdapter({
    client: new FakeCodexClient([thread]),
  });
  const session = await adapter.createSession();
  const eventTypes: string[] = [];
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Summarize repository status",
  })) {
    eventTypes.push(event.type);
    events.push(event);
  }

  expect(eventTypes).toEqual([
    "session.started",
    "turn.started",
    "tool.started",
    "tool.updated",
    "tool.completed",
    "reasoning.summary",
    "todo.updated",
    "file.changed",
    "message.completed",
    "turn.completed",
  ]);
  expect(events[2]).toMatchObject({
    type: "tool.started",
    toolName: "command_execution",
    kind: "command",
  });
  expect(events.at(-1)).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Repository looks healthy.",
      usage: {
        tokens: {
          input: 10,
          cachedInput: 0,
          output: 3,
        },
      },
    },
  });
});

test("structured-output parse failures surface as AgentError", async () => {
  const thread = new FakeCodexThread([
    createStructuredOutputRun("thread-events-2", "not-json", true),
    createStructuredOutputRun("thread-events-2", "not-json", false),
  ]);
  const adapter = new CodexAdapter({
    client: new FakeCodexClient([thread]),
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
      },
    },
  )) {
    streamedEvents.push(event);
  }

  expect(streamedEvents.at(-1)).toMatchObject({
    type: "turn.failed",
    error: expect.objectContaining({
      code: "structured_output_invalid",
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
        },
      },
    ),
  ).rejects.toMatchObject({
    code: "structured_output_invalid",
  });
});

test("structured-output schema mismatches surface as AgentError", async () => {
  const thread = new FakeCodexThread([
    createStructuredOutputRun("thread-events-3", "{\"status\":1}", true),
    createStructuredOutputRun("thread-events-3", "{\"status\":1}", false),
  ]);
  const adapter = new CodexAdapter({
    client: new FakeCodexClient([thread]),
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

test("runStreamed emits turn.failed for unsupported attachment sources", async () => {
  const thread = new FakeCodexThread([]);
  const adapter = new CodexAdapter({
    client: new FakeCodexClient([thread]),
  });
  const session = await adapter.createSession();
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Describe the image",
    attachments: [
      {
        kind: "image",
        source: {
          type: "url",
          url: "https://example.com/ui.png",
        },
      },
    ],
  })) {
    events.push(event);
  }

  expect(thread.lastInput).toBeUndefined();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: "turn.failed",
    error: expect.objectContaining({
      code: "unsupported_feature",
      provider: "codex",
    }),
  });
});

test("runStreamed emits turn.failed when the SDK throws before streaming", async () => {
  const adapter = new CodexAdapter({
    client: new FakeCodexClient([
      new RejectingCodexThread(new Error("CLI exited unexpectedly")),
    ]),
  });
  const session = await adapter.createSession();
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Summarize repository status",
  })) {
    events.push(event);
  }

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: "turn.failed",
    error: expect.objectContaining({
      code: "provider_failure",
      message: "CLI exited unexpectedly",
    }),
  });
});

test("runStreamed synthesizes turn.failed when the stream ends without a terminal event", async () => {
  const adapter = new CodexAdapter({
    client: new FakeCodexClient([
      new FakeCodexThread([
        [
          {
            type: "thread.started",
            thread_id: "thread-events-3",
          },
          {
            type: "turn.started",
          },
          {
            type: "item.completed",
            item: {
              id: "message-1",
              type: "agent_message",
              text: "Partial success",
            },
          },
        ],
      ]),
    ]),
  });
  const session = await adapter.createSession();
  const events = [];

  for await (const event of session.runStreamed({
    prompt: "Summarize repository status",
  })) {
    events.push(event);
  }

  expect(events.map((event) => event.type)).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
    "turn.failed",
  ]);
  expect(events.at(-1)).toMatchObject({
    type: "turn.failed",
    error: expect.objectContaining({
      code: "provider_failure",
      message: "Codex stream ended without a terminal turn event.",
    }),
  });
});

function createStructuredOutputRun(
  threadId: string,
  text: string,
  includeThreadStarted: boolean,
) {
  return [
    ...(includeThreadStarted
      ? [
          {
            type: "thread.started" as const,
            thread_id: threadId,
          },
        ]
      : []),
    {
      type: "turn.started" as const,
    },
    {
      type: "item.completed" as const,
      item: {
        id: "message-1",
        type: "agent_message" as const,
        text,
      },
    },
    {
      type: "turn.completed" as const,
      usage: {
        input_tokens: 2,
        cached_input_tokens: 0,
        output_tokens: 1,
      },
    },
  ];
}
