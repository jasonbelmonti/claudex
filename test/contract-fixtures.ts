import { CAPABILITY_CATALOG, type ProviderCapabilities } from "../src/core/capabilities";
import { AgentError } from "../src/core/errors";
import type { AgentEvent } from "../src/core/events";
import type { TurnInput, TurnOptions } from "../src/core/input";
import type { AgentProviderAdapter } from "../src/core/provider";
import type { ProviderReadiness } from "../src/core/readiness";
import type { TurnResult } from "../src/core/results";
import type { AgentSession, SessionOptions, SessionReference } from "../src/core/session";

export const FIXTURE_SESSION_REFERENCE: SessionReference = {
  provider: "codex",
  sessionId: "session-fixture-001",
};

export const FIXTURE_CAPABILITIES: ProviderCapabilities = {
  provider: "codex",
  adapterVersion: "0.0.0-fixture",
  features: {
    "session:create": { available: true },
    "session:resume": { available: true },
    "output:structured": { available: true },
    "event:tool-lifecycle": { available: true },
    "usage:tokens": { available: true },
    "stream:message-delta": { available: false, notes: "Buffered-only fixture" },
  },
};

export const FIXTURE_READINESS: ProviderReadiness = {
  provider: "codex",
  status: "ready",
  checks: [
    {
      kind: "cli",
      status: "pass",
      summary: "CLI detected",
    },
    {
      kind: "auth",
      status: "pass",
      summary: "CLI auth available",
    },
  ],
  capabilities: FIXTURE_CAPABILITIES,
};

export const FIXTURE_TURN_INPUT: TurnInput = {
  prompt: "Summarize repository status",
  attachments: [
    {
      kind: "image",
      name: "ui.png",
      source: {
        type: "path",
        path: "/tmp/ui.png",
      },
    },
  ],
};

export const FIXTURE_TURN_OPTIONS: TurnOptions = {
  outputSchema: {
    type: "object",
    properties: {
      summary: { type: "string" },
    },
    required: ["summary"],
    additionalProperties: false,
  },
};

const FIXTURE_TURN_TEXT = "{\"summary\":\"working tree is clean\"}";

export function createFixtureTurnResult(
  reference: SessionReference | null = FIXTURE_SESSION_REFERENCE,
): TurnResult {
  return {
    provider: "codex",
    session: reference,
    turnId: "turn-fixture-001",
    text: FIXTURE_TURN_TEXT,
    structuredOutput: {
      summary: "working tree is clean",
    },
    usage: {
      tokens: {
        input: 10,
        output: 4,
        cachedInput: 0,
      },
    },
    stopReason: "completed",
  };
}

export const FIXTURE_TURN_RESULT = createFixtureTurnResult();

export function createFixtureEvents(
  reference: SessionReference | null = FIXTURE_SESSION_REFERENCE,
): AgentEvent[] {
  const result = createFixtureTurnResult(reference);

  if (!reference) {
    return [
      {
        type: "turn.started",
        provider: "codex",
        session: null,
        turnId: "turn-fixture-001",
        input: FIXTURE_TURN_INPUT,
      },
      {
        type: "message.completed",
        provider: "codex",
        session: null,
        turnId: "turn-fixture-001",
        role: "assistant",
        text: result.text,
        structuredOutput: result.structuredOutput,
      },
      {
        type: "turn.completed",
        provider: "codex",
        session: null,
        turnId: "turn-fixture-001",
        result,
      },
    ];
  }

  return [
    {
      type: "session.started",
      provider: "codex",
      session: reference,
      reference,
    },
    {
      type: "turn.started",
      provider: "codex",
      session: reference,
      turnId: "turn-fixture-001",
      input: FIXTURE_TURN_INPUT,
    },
    {
      type: "message.completed",
      provider: "codex",
      session: reference,
      turnId: "turn-fixture-001",
      role: "assistant",
      text: result.text,
      structuredOutput: result.structuredOutput,
    },
    {
      type: "turn.completed",
      provider: "codex",
      session: reference,
      turnId: "turn-fixture-001",
      result,
    },
  ];
}

export const FIXTURE_EVENTS = createFixtureEvents();

const FIXTURE_ERROR = new AgentError({
  code: "provider_failure",
  provider: "claude",
  message: "fixture error",
});

export function createFixtureSession(
  reference: SessionReference | null = FIXTURE_SESSION_REFERENCE,
): AgentSession {
  const result = createFixtureTurnResult(reference);
  const events = createFixtureEvents(reference);

  return {
    provider: "codex",
    capabilities: FIXTURE_CAPABILITIES,
    reference,
    async run() {
      return result;
    },
    async *runStreamed() {
      for (const event of events) {
        yield event;
      }
    },
    async fork() {
      return createFixtureSession({
        provider: "codex",
        sessionId: "session-fixture-002",
      });
    },
  };
}

export function createFixtureAdapter(): AgentProviderAdapter {
  return {
    provider: "codex",
    capabilities: FIXTURE_CAPABILITIES,
    async checkReadiness() {
      return FIXTURE_READINESS;
    },
    async createSession(_options?: SessionOptions) {
      return createFixtureSession(null);
    },
    async resumeSession(reference: SessionReference, _options?: SessionOptions) {
      return createFixtureSession(reference);
    },
  };
}

export const FIXTURE_CONTRACT_SHAPE = {
  providerIds: ["claude", "codex"],
  normalizationLevels: CAPABILITY_CATALOG.map((feature) => feature.normalization),
  readiness: FIXTURE_READINESS,
  session: createFixtureSession(),
  adapter: createFixtureAdapter(),
  result: FIXTURE_TURN_RESULT,
  events: FIXTURE_EVENTS,
  error: FIXTURE_ERROR,
} as const;
