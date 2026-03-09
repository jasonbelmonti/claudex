import { expect, test } from "bun:test";

import {
  CREATED_FIXTURE_SESSION_REFERENCE,
  FIXTURE_CONTRACT_SHAPE,
  FIXTURE_EVENTS,
  FIXTURE_SESSION_REFERENCE,
  FIXTURE_TURN_RESULT,
  createFixtureEvents,
  createFixtureAdapter,
  createFixtureSession,
  createFixtureTurnResult,
} from "./contract-fixtures";

test("fixture adapter exposes a resumable session contract", async () => {
  const adapter = createFixtureAdapter();
  const session = await adapter.resumeSession(FIXTURE_SESSION_REFERENCE);
  const result = await session.run({ prompt: "Summarize repository status" });

  expect(session.reference).toEqual(FIXTURE_SESSION_REFERENCE);
  expect(result).toEqual(FIXTURE_TURN_RESULT);
});

test("fixture createSession surfaces a resumable session reference after run", async () => {
  const adapter = createFixtureAdapter();
  const session = await adapter.createSession();

  expect(session.reference).toBeNull();

  const result = await session.run({ prompt: "Summarize repository status" });

  expect(session.reference).toEqual(CREATED_FIXTURE_SESSION_REFERENCE);
  expect(result).toEqual(createFixtureTurnResult(CREATED_FIXTURE_SESSION_REFERENCE));
});

test("fixture session streams the canonical event sequence", async () => {
  const session = createFixtureSession();
  const events: typeof FIXTURE_EVENTS = [];

  for await (const event of session.runStreamed({ prompt: "Summarize repository status" })) {
    events.push(event);
  }

  expect(events).toEqual(FIXTURE_EVENTS);
  expect(events.at(-1)?.type).toBe("turn.completed");
});

test("fixture createSession streams a minted session reference on first turn", async () => {
  const adapter = createFixtureAdapter();
  const session = await adapter.createSession();
  const events: ReturnType<typeof createFixtureEvents> = [];

  for await (const event of session.runStreamed({ prompt: "Summarize repository status" })) {
    events.push(event);
  }

  expect(session.reference).toEqual(CREATED_FIXTURE_SESSION_REFERENCE);
  expect(events).toEqual(createFixtureEvents(CREATED_FIXTURE_SESSION_REFERENCE));
});

test("fixture session preserves non-default session references in results and events", async () => {
  const reference = {
    provider: "codex" as const,
    sessionId: "session-fixture-999",
  };
  const session = createFixtureSession(reference);
  const result = await session.run({ prompt: "Summarize repository status" });
  const events: ReturnType<typeof createFixtureEvents> = [];

  for await (const event of session.runStreamed({ prompt: "Summarize repository status" })) {
    events.push(event);
  }

  expect(result).toEqual(createFixtureTurnResult(reference));
  expect(events).toEqual(createFixtureEvents(reference));
  expect(result.session).toEqual(reference);
  expect(events.every((event) => event.session?.sessionId === reference.sessionId)).toBe(true);
});

test("fixture session omits fork when session:fork capability is unavailable", () => {
  const session = createFixtureSession();

  expect(session.capabilities.features["session:fork"]?.available).toBe(false);
  expect(session.fork).toBeUndefined();
});

test("fixture contract shape stays aligned with the expected provider ids", () => {
  expect(FIXTURE_CONTRACT_SHAPE.providerIds).toEqual(["claude", "codex"]);
  expect(FIXTURE_CONTRACT_SHAPE.session.provider).toBe("codex");
  expect(FIXTURE_CONTRACT_SHAPE.adapter.provider).toBe("codex");
  expect(FIXTURE_CONTRACT_SHAPE.normalizationLevels.length).toBeGreaterThan(0);
});
