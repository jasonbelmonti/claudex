import { describe, expect, it } from "vitest";

import type { CopilotSessionEvent } from "../../../src/providers/copilot/types.js";
import {
  createCopilotAssistantMessageEvent,
  createCopilotIdleEvent,
  createCopilotSessionStartEvent,
  FakeCopilotClient,
  FakeCopilotSession,
} from "./fakes.js";

describe("Copilot fakes", () => {
  it("records client lifecycle calls and returns configured sessions", async () => {
    const createdSession = new FakeCopilotSession("created-session");
    const resumedSession = new FakeCopilotSession("resumed-session");
    const stopError = new Error("stop warning");
    const client = new FakeCopilotClient({
      authStatus: {
        authType: "gh-cli",
        isAuthenticated: true,
        login: "octocat",
      },
      createSessions: [createdSession],
      resumeSessions: {
        saved: resumedSession,
      },
      status: {
        protocolVersion: 3,
        version: "1.0.56",
      },
      stopErrors: [stopError],
    });

    await client.start();
    await client.forceStop();

    expect(client.startCallCount).toBe(1);
    expect(client.forceStopCallCount).toBe(1);
    await expect(client.getStatus()).resolves.toEqual({
      protocolVersion: 3,
      version: "1.0.56",
    });
    await expect(client.getAuthStatus()).resolves.toMatchObject({
      isAuthenticated: true,
      login: "octocat",
    });
    await expect(
      client.createSession({ clientName: "claudex-test" }),
    ).resolves.toBe(createdSession);
    await expect(
      client.resumeSession("saved", { suppressResumeEvent: true }),
    ).resolves.toBe(resumedSession);
    await expect(client.stop()).resolves.toEqual([stopError]);

    expect(client.lastCreateSessionConfig).toEqual({
      clientName: "claudex-test",
    });
    expect(client.lastResumeSessionId).toBe("saved");
    expect(client.lastResumeSessionConfig).toEqual({
      suppressResumeEvent: true,
    });
    expect(client.stopCallCount).toBe(1);
  });

  it("emits deterministic session events and records sent messages", async () => {
    const assistantMessage = createCopilotAssistantMessageEvent({
      content: "deterministic response",
      messageId: "assistant-1",
    });
    const session = new FakeCopilotSession(
      "session-1",
      [
        [
          createCopilotSessionStartEvent({ sessionId: "session-1" }),
          assistantMessage,
          createCopilotIdleEvent(),
        ],
      ],
      ["sent-message-1"],
    );
    const allEvents: CopilotSessionEvent[] = [];
    const assistantContents: string[] = [];

    const unsubscribeAll = session.on((event) => {
      allEvents.push(event);
    });
    const unsubscribeAssistant = session.on("assistant.message", (event) => {
      assistantContents.push(event.data.content);
    });

    await expect(
      session.sendAndWait({ prompt: "hello" }, 1000),
    ).resolves.toBe(assistantMessage);

    expect(session.sentMessages).toEqual([{ prompt: "hello" }]);
    expect(session.lastSendAndWaitTimeout).toBe(1000);
    expect(allEvents.map((event) => event.type)).toEqual([
      "session.start",
      "assistant.message",
      "session.idle",
    ]);
    expect(assistantContents).toEqual(["deterministic response"]);
    await expect(session.getEvents()).resolves.toEqual(allEvents);

    unsubscribeAll();
    unsubscribeAssistant();

    session.enqueueRun([
      createCopilotAssistantMessageEvent({
        content: "after unsubscribe",
        messageId: "assistant-2",
      }),
    ]);
    await expect(session.send("next")).resolves.toBe("fake-message-2");

    expect(allEvents).toHaveLength(3);
    expect(assistantContents).toEqual(["deterministic response"]);
  });

  it("fails fast when a requested fake session is not configured", async () => {
    const client = new FakeCopilotClient();

    await expect(client.createSession({})).rejects.toThrow(
      "No fake Copilot create session configured.",
    );
    await expect(client.resumeSession("missing", {})).rejects.toThrow(
      "No fake Copilot resume session configured for missing.",
    );
  });
});
