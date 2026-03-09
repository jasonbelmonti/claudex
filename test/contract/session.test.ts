import { expect, test } from "bun:test";

import type { AgentError } from "../../src/core/errors";
import { supportsCapability } from "../../src/core/capabilities";
import type { SessionReference } from "../../src/core/session";
import {
  assertEventSessionsMatch,
  assertWithContext,
  buildContractContext,
  collectEvents,
  countTerminalEvents,
  getTerminalEvent,
} from "./helpers";
import { CONTRACT_TEST_DRIVERS } from "./drivers";

for (const driver of CONTRACT_TEST_DRIVERS) {
  test(`${driver.provider} createSession produces a resumable normalized turn contract`, async () => {
    const streamScenario = driver.sessions.create();
    const streamedAdapter = streamScenario.createAdapter();
    const streamedSession = await streamedAdapter.createSession(streamScenario.sessionOptions);

    assertWithContext(
      streamedSession.reference === null,
      "New sessions must not have a reference before the first turn.",
      buildContractContext({
        label: `${driver.provider} pre-run createSession`,
      }),
    );

    const events = await collectEvents(
      streamedSession.runStreamed(streamScenario.input, streamScenario.turnOptions),
    );
    const terminalEvent = getTerminalEvent(events);

    assertWithContext(
      countTerminalEvents(events) === 1,
      "Streamed turns must emit exactly one terminal event.",
      buildContractContext({
        label: `${driver.provider} createSession stream`,
        events,
      }),
    );
    if (terminalEvent?.type !== "turn.completed") {
      throw new Error(
        `${driver.provider} successful streamed turns must end in turn.completed.\n${JSON.stringify(
          buildContractContext({
            label: `${driver.provider} createSession terminal`,
            events,
          }),
          null,
          2,
        )}`,
      );
    }

    const completedEvent = terminalEvent;

    const streamedReference = streamedSession.reference as SessionReference | null;

    if (streamedReference === null) {
      throw new Error(
        `${driver.provider} successful streamed turns must mint a session reference.\n${JSON.stringify(
          buildContractContext({
            label: `${driver.provider} createSession reference`,
            events,
          }),
          null,
          2,
        )}`,
      );
    }

    assertEventSessionsMatch({
      events,
      expectedSession: streamScenario.expectedSession,
      label: `${driver.provider} createSession event sessions`,
    });

    expect(streamedReference.provider).toBe(streamScenario.expectedSession.provider);
    expect(streamedReference.sessionId).toBe(streamScenario.expectedSession.sessionId);
    expect(completedEvent.result.session).toEqual(streamScenario.expectedSession);
    expect(completedEvent.result.text).toBe(streamScenario.expectedResult.text);

    if (streamScenario.expectedResult.structuredOutput !== undefined) {
      expect(completedEvent.result.structuredOutput).toEqual(
        streamScenario.expectedResult.structuredOutput,
      );
    }

    if (streamScenario.expectedResult.usage !== undefined) {
      expect(completedEvent.result.usage).toEqual(streamScenario.expectedResult.usage);
    }

    if (driver.capabilityExpectations.supportsMessageDelta) {
      expect(events.some((event) => event.type === "message.delta")).toBe(true);
    } else {
      expect(events.some((event) => event.type === "message.delta")).toBe(false);
    }

    const runScenario = driver.sessions.create();
    const runAdapter = runScenario.createAdapter();
    const runSession = await runAdapter.createSession(runScenario.sessionOptions);
    const result = await runSession.run(runScenario.input, runScenario.turnOptions);
    const runReference = runSession.reference as SessionReference | null;

    assertWithContext(
      runReference !== null,
      "Successful run() calls must mint a session reference.",
      buildContractContext({
        label: `${driver.provider} createSession run`,
        result,
      }),
    );

    expect(runReference.provider).toBe(runScenario.expectedSession.provider);
    expect(runReference.sessionId).toBe(runScenario.expectedSession.sessionId);
    expect(result.session).toEqual(runScenario.expectedSession);
    expect(result.text).toBe(runScenario.expectedResult.text);

    if (runScenario.expectedResult.structuredOutput !== undefined) {
      expect(result.structuredOutput).toEqual(
        runScenario.expectedResult.structuredOutput,
      );
    }

    if (runScenario.expectedResult.usage !== undefined) {
      expect(result.usage).toEqual(runScenario.expectedResult.usage);
    }
  });

  test(`${driver.provider} structured-output failures normalize to AgentError`, async () => {
    const streamScenario = driver.sessions.structuredOutputFailure();
    const streamedAdapter = streamScenario.createAdapter();
    const streamedSession = await streamedAdapter.createSession(streamScenario.sessionOptions);
    const events = await collectEvents(
      streamedSession.runStreamed(streamScenario.input, streamScenario.turnOptions),
    );
    const terminalEvent = getTerminalEvent(events);

    assertWithContext(
      countTerminalEvents(events) === 1,
      "Structured-output failures must emit exactly one terminal event.",
      buildContractContext({
        label: `${driver.provider} structured-output stream`,
        events,
      }),
    );
    assertWithContext(
      terminalEvent?.type === "turn.failed",
      "Structured-output failures must end in turn.failed.",
      buildContractContext({
        label: `${driver.provider} structured-output terminal`,
        events,
      }),
    );

    expect(terminalEvent.error.code).toBe(streamScenario.expectedError.code);

    if (streamScenario.expectedError.messageIncludes) {
      expect(terminalEvent.error.message).toContain(
        streamScenario.expectedError.messageIncludes,
      );
    }

    if (streamScenario.expectedError.rawRequired) {
      expect(terminalEvent.error.raw).toBeDefined();
    }

    const runScenario = driver.sessions.structuredOutputFailure();
    const runAdapter = runScenario.createAdapter();
    const runSession = await runAdapter.createSession(runScenario.sessionOptions);

    await expect(
      runSession.run(runScenario.input, runScenario.turnOptions),
    ).rejects.toMatchObject({
      code: runScenario.expectedError.code,
    });
  });

  test(`${driver.provider} resumeSession continues from the provided reference`, async () => {
    const streamScenario = driver.sessions.resume();
    const streamedAdapter = streamScenario.createAdapter();
    const streamedSession = await streamedAdapter.resumeSession(
      streamScenario.reference,
      streamScenario.resumeOptions,
    );

    expect(streamedSession.reference).toEqual(streamScenario.reference);

    const events = await collectEvents(
      streamedSession.runStreamed(streamScenario.input, streamScenario.turnOptions),
    );
    const terminalEvent = getTerminalEvent(events);

    assertWithContext(
      countTerminalEvents(events) === 1,
      "Resumed streamed turns must emit exactly one terminal event.",
      buildContractContext({
        label: `${driver.provider} resumeSession stream`,
        events,
      }),
    );
    assertWithContext(
      terminalEvent?.type === "turn.completed",
      "Successful resumed streamed turns must end in turn.completed.",
      buildContractContext({
        label: `${driver.provider} resumeSession terminal`,
        events,
      }),
    );

    assertEventSessionsMatch({
      events,
      expectedSession: streamScenario.expectedSession,
      label: `${driver.provider} resumeSession event sessions`,
    });

    expect(streamedSession.reference).toEqual(streamScenario.expectedSession);
    expect(terminalEvent.result.session).toEqual(streamScenario.expectedSession);
    expect(terminalEvent.result.text).toBe(streamScenario.expectedResult.text);

    if (streamScenario.expectedResult.structuredOutput !== undefined) {
      expect(terminalEvent.result.structuredOutput).toEqual(
        streamScenario.expectedResult.structuredOutput,
      );
    }

    if (streamScenario.expectedResult.usage !== undefined) {
      expect(terminalEvent.result.usage).toEqual(
        streamScenario.expectedResult.usage,
      );
    }

    const runScenario = driver.sessions.resume();
    const runAdapter = runScenario.createAdapter();
    const runSession = await runAdapter.resumeSession(
      runScenario.reference,
      runScenario.resumeOptions,
    );
    const result = await runSession.run(runScenario.input, runScenario.turnOptions);

    expect(runSession.reference).toEqual(runScenario.expectedSession);
    expect(result.text).toBe(runScenario.expectedResult.text);
    expect(result.session).toEqual(runScenario.expectedSession);

    if (runScenario.expectedResult.structuredOutput !== undefined) {
      expect(result.structuredOutput).toEqual(
        runScenario.expectedResult.structuredOutput,
      );
    }

    if (runScenario.expectedResult.usage !== undefined) {
      expect(result.usage).toEqual(runScenario.expectedResult.usage);
    }
  });

  test(`${driver.provider} provider failures preserve raw payloads`, async () => {
    const streamScenario = driver.sessions.providerFailure();
    const streamedAdapter = streamScenario.createAdapter();
    const streamedSession = await streamedAdapter.createSession(streamScenario.sessionOptions);
    const events = await collectEvents(
      streamedSession.runStreamed(streamScenario.input, streamScenario.turnOptions),
    );
    const terminalEvent = getTerminalEvent(events);

    assertWithContext(
      terminalEvent?.type === "turn.failed",
      "Provider failures must end in turn.failed.",
      buildContractContext({
        label: `${driver.provider} provider failure stream`,
        events,
      }),
    );

    expect(terminalEvent.error.code).toBe(streamScenario.expectedError.code);

    if (streamScenario.expectedError.messageIncludes) {
      expect(terminalEvent.error.message).toContain(
        streamScenario.expectedError.messageIncludes,
      );
    }

    if (streamScenario.expectedError.rawRequired) {
      expect(terminalEvent.error.raw).toBeDefined();
    }

    const runScenario = driver.sessions.providerFailure();
    const runAdapter = runScenario.createAdapter();
    const runSession = await runAdapter.createSession(runScenario.sessionOptions);

    let thrown: AgentError | null = null;

    try {
      await runSession.run(runScenario.input, runScenario.turnOptions);
    } catch (error) {
      thrown = error as AgentError;
    }

    expect(thrown).not.toBeNull();
    expect(thrown?.code).toBe(runScenario.expectedError.code);

    if (streamScenario.expectedError.rawRequired) {
      expect(thrown?.raw).toBeDefined();
    }
  });

  const createForkScenario = driver.sessions.fork;

  if (createForkScenario) {
    test(`${driver.provider} fork capability stays within the normalized session contract`, async () => {
      const scenario = createForkScenario();
      const adapter = scenario.createAdapter();
      const session = await adapter.createSession(scenario.sessionOptions);

      await session.run(scenario.initialInput);

      expect(session.reference).toEqual(scenario.expectedSourceSession);
      expect(
        supportsCapability(session.capabilities, "session:fork"),
      ).toBe(true);

      const forkedSession = await session.fork?.(scenario.forkOptions);

      expect(forkedSession?.reference).toBeNull();

      const result = await forkedSession?.run(scenario.forkInput);

      expect(forkedSession?.reference).toEqual(scenario.expectedForkSession);
      expect(result?.session).toEqual(scenario.expectedForkSession);
      expect(result?.text).toBe(scenario.expectedForkText);
    });
  }
}
