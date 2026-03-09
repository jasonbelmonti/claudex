import { expect, test } from "bun:test";

import {
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

test("fixture session streams the canonical event sequence", async () => {
  const session = createFixtureSession();
  const events: typeof FIXTURE_EVENTS = [];

  for await (const event of session.runStreamed({ prompt: "Summarize repository status" })) {
    events.push(event);
  }

  expect(events).toEqual(FIXTURE_EVENTS);
  expect(events.at(-1)?.type).toBe("turn.completed");
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

test("fixture contract shape stays aligned with the expected provider ids", () => {
  expect(FIXTURE_CONTRACT_SHAPE.providerIds).toEqual(["claude", "codex"]);
  expect(FIXTURE_CONTRACT_SHAPE.session.provider).toBe("codex");
  expect(FIXTURE_CONTRACT_SHAPE.adapter.provider).toBe("codex");
  expect(FIXTURE_CONTRACT_SHAPE.normalizationLevels.length).toBeGreaterThan(0);
});
