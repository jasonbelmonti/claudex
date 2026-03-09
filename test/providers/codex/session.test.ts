import { expect, test } from "bun:test";

import { AgentError } from "../../../src/core/errors";
import { CodexAdapter } from "../../../src/providers/codex/adapter";
import { FakeCodexClient, FakeCodexThread } from "./fakes";

test("createSession maps core session options into Codex thread options", async () => {
  const startThread = new FakeCodexThread([
    [
      {
        type: "thread.started",
        thread_id: "thread-123",
      },
      {
        type: "turn.started",
      },
      {
        type: "item.completed",
        item: {
          id: "message-1",
          type: "agent_message",
          text: "{\"summary\":\"ok\"}",
        },
      },
      {
        type: "turn.completed",
        usage: {
          input_tokens: 4,
          cached_input_tokens: 0,
          output_tokens: 2,
        },
      },
    ],
  ]);
  const client = new FakeCodexClient([startThread]);
  const adapter = new CodexAdapter({ client });
  const session = await adapter.createSession({
    model: "o3",
    workingDirectory: "/tmp/repo",
    additionalDirectories: ["/tmp/repo/docs"],
    sandboxProfile: "workspace-write",
    approvalMode: "interactive",
    providerOptions: {
      codex: {
        threadOptions: {
          skipGitRepoCheck: true,
          networkAccessEnabled: true,
        },
      },
    },
  });

  expect(session.reference).toBeNull();

  const result = await session.run(
    {
      prompt: "Summarize repository status",
      attachments: [
        {
          kind: "image",
          source: {
            type: "path",
            path: "/tmp/repo/ui.png",
          },
        },
      ],
    },
    {
      outputSchema: {
        type: "object",
      },
    },
  );

  expect(client.lastStartThreadOptions?.model).toBe("o3");
  expect(client.lastStartThreadOptions?.workingDirectory).toBe("/tmp/repo");
  expect(client.lastStartThreadOptions?.sandboxMode).toBe("workspace-write");
  expect(client.lastStartThreadOptions?.approvalPolicy).toBe("on-request");
  expect(client.lastStartThreadOptions?.skipGitRepoCheck).toBe(true);
  expect(client.lastStartThreadOptions?.networkAccessEnabled).toBe(true);
  expect(client.lastStartThreadOptions?.additionalDirectories).toEqual([
    "/tmp/repo/docs",
  ]);
  expect(startThread.lastInput).toEqual([
    {
      type: "text",
      text: "Summarize repository status",
    },
    {
      type: "local_image",
      path: "/tmp/repo/ui.png",
    },
  ]);
  expect(session.reference).toEqual({
    provider: "codex",
    sessionId: "thread-123",
  });
  expect(result.structuredOutput).toEqual({
    summary: "ok",
  });
  expect(result.usage?.tokens).toEqual({
    input: 4,
    cachedInput: 0,
    output: 2,
  });
});

test("resumeSession uses the provided reference immediately", async () => {
  const resumedThread = new FakeCodexThread(
    [
      [
        {
          type: "turn.started",
        },
        {
          type: "item.completed",
          item: {
            id: "message-1",
            type: "agent_message",
            text: "resume ok",
          },
        },
        {
          type: "turn.completed",
          usage: {
            input_tokens: 1,
            cached_input_tokens: 0,
            output_tokens: 1,
          },
        },
      ],
    ],
    "thread-resume-7",
  );
  const client = new FakeCodexClient([], {
    "thread-resume-7": resumedThread,
  });
  const adapter = new CodexAdapter({ client });
  const session = await adapter.resumeSession({
    provider: "codex",
    sessionId: "thread-resume-7",
  });

  expect(session.reference).toEqual({
    provider: "codex",
    sessionId: "thread-resume-7",
  });

  const result = await session.run({
    prompt: "Continue",
  });

  expect(client.lastResumeThreadId).toBe("thread-resume-7");
  expect(result.text).toBe("resume ok");
});

test("createSession keeps plan-mode thread options on the safe profile", async () => {
  const startThread = new FakeCodexThread([]);
  const client = new FakeCodexClient([startThread]);
  const adapter = new CodexAdapter({ client });

  await adapter.createSession({
    executionMode: "plan",
    sandboxProfile: "full-access",
    approvalMode: "interactive",
    providerOptions: {
      codex: {
        threadOptions: {
          sandboxMode: "danger-full-access",
          approvalPolicy: "on-request",
          networkAccessEnabled: true,
          webSearchEnabled: true,
          webSearchMode: "live",
        },
      },
    },
  });

  expect(client.lastStartThreadOptions).toMatchObject({
    sandboxMode: "read-only",
    approvalPolicy: "untrusted",
    networkAccessEnabled: false,
    webSearchEnabled: false,
    webSearchMode: "disabled",
  });
});

test("createSession preserves explicit deny approval inside the plan-mode safety profile", async () => {
  const startThread = new FakeCodexThread([]);
  const client = new FakeCodexClient([startThread]);
  const adapter = new CodexAdapter({ client });

  await adapter.createSession({
    executionMode: "plan",
    approvalMode: "deny",
    providerOptions: {
      codex: {
        threadOptions: {
          approvalPolicy: "on-request",
        },
      },
    },
  });

  expect(client.lastStartThreadOptions?.approvalPolicy).toBe("never");
});

test("createSession rejects unsupported session-level instructions", async () => {
  const adapter = new CodexAdapter({
    client: new FakeCodexClient([new FakeCodexThread([])]),
  });

  await expect(
    adapter.createSession({
      instructions: "Always write a haiku before making changes.",
    }),
  ).rejects.toBeInstanceOf(AgentError);
});

test("resumeSession rejects fork resumeStrategy because Codex cannot fork threads", async () => {
  const adapter = new CodexAdapter({
    client: new FakeCodexClient(),
  });

  await expect(
    adapter.resumeSession(
      {
        provider: "codex",
        sessionId: "thread-resume-8",
      },
      {
        resumeStrategy: "fork",
      },
    ),
  ).rejects.toBeInstanceOf(AgentError);
});

test("resumeSession rejects non-Codex session references", async () => {
  const adapter = new CodexAdapter({
    client: new FakeCodexClient(),
  });

  await expect(
    adapter.resumeSession({
      provider: "claude",
      sessionId: "session-claude-1",
    }),
  ).rejects.toBeInstanceOf(AgentError);
});

test("run rejects unsupported inline image attachments", async () => {
  const adapter = new CodexAdapter({
    client: new FakeCodexClient([new FakeCodexThread([])]),
  });
  const session = await adapter.createSession();

  await expect(
    session.run({
      prompt: "Describe the diagram",
      attachments: [
        {
          kind: "image",
          source: {
            type: "inline",
            mediaType: "image/png",
            data: new Uint8Array([1, 2, 3]),
          },
        },
      ],
    }),
  ).rejects.toBeInstanceOf(AgentError);
});
