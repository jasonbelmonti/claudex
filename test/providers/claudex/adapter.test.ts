import { expect, test } from "bun:test";

import { isAgentError } from "../../../src/core/errors";
import type { ProviderCapabilities } from "../../../src/core/capabilities";
import type { AgentEvent } from "../../../src/core/events";
import type { TurnInput, TurnOptions } from "../../../src/core/input";
import type { AgentProviderAdapter, ProviderId } from "../../../src/core/provider";
import type { TurnResult } from "../../../src/core/results";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../../src/core/session";
import type { ProviderReadiness } from "../../../src/core/readiness";
import { ClaudexAdapter } from "../../../src/providers/claudex/adapter";

function createCapabilities(provider: ProviderId): ProviderCapabilities {
  return {
    provider,
    features: {
      "session:create": { available: true },
      "session:resume": { available: true },
    },
  };
}

class FakeSession implements AgentSession {
  constructor(
    readonly provider: ProviderId,
    readonly capabilities: ProviderCapabilities,
    readonly reference: SessionReference | null,
  ) {}

  async run(_input: TurnInput, _options?: TurnOptions): Promise<TurnResult> {
    return {
      provider: this.provider,
      session: this.reference,
      text: "ok",
      usage: null,
    };
  }

  async *runStreamed(
    _input: TurnInput,
    _options?: TurnOptions,
  ): AsyncGenerator<AgentEvent> {
    yield {
      type: "turn.completed",
      provider: this.provider,
      session: this.reference,
      result: {
        provider: this.provider,
        session: this.reference,
        text: "ok",
        usage: null,
      },
    };
  }
}

class FakeAdapter implements AgentProviderAdapter {
  readonly capabilities: ProviderCapabilities;
  readinessCallCount = 0;
  createSessionCallCount = 0;
  resumeSessionCallCount = 0;

  constructor(
    readonly provider: ProviderId,
    private readonly readinessResults: ProviderReadiness[],
  ) {
    this.capabilities = createCapabilities(provider);
  }

  async checkReadiness(): Promise<ProviderReadiness> {
    const index = Math.min(this.readinessCallCount, this.readinessResults.length - 1);
    const readiness = this.readinessResults[index];

    if (!readiness) {
      throw new Error(`Missing readiness fixture for ${this.provider} at index ${index}.`);
    }

    this.readinessCallCount += 1;

    return readiness;
  }

  async createSession(_options: SessionOptions = {}): Promise<AgentSession> {
    this.createSessionCallCount += 1;

    return new FakeSession(this.provider, this.capabilities, {
      provider: this.provider,
      sessionId: `${this.provider}-new`,
    });
  }

  async resumeSession(
    reference: SessionReference,
    _options: SessionOptions = {},
  ): Promise<AgentSession> {
    this.resumeSessionCallCount += 1;

    return new FakeSession(this.provider, this.capabilities, reference);
  }
}

function createReadiness(
  provider: ProviderId,
  status: ProviderReadiness["status"],
): ProviderReadiness {
  return {
    provider,
    status,
    checks: [
      {
        kind: "runtime",
        status:
          status === "ready"
            ? "pass"
            : status === "degraded"
              ? "warn"
              : "fail",
        summary: `${provider} ${status}`,
      },
    ],
    capabilities: createCapabilities(provider),
  };
}

test("checkReadiness selects the first ready provider and pins it", async () => {
  const codex = new FakeAdapter("codex", [createReadiness("codex", "ready")]);
  const claude = new FakeAdapter("claude", [createReadiness("claude", "ready")]);
  const adapter = new ClaudexAdapter({
    providers: { codex, claude },
  });

  const readiness = await adapter.checkReadiness();
  const secondReadiness = await adapter.checkReadiness();

  expect(readiness.provider).toBe("codex");
  expect(readiness.status).toBe("ready");
  expect(readiness.extensions?.resolution).toMatchObject({
    selectedProvider: "codex",
    selectedStatus: "ready",
    strategy: "ready",
    preferredProviders: ["codex", "claude"],
  });
  expect(adapter.provider).toBe("codex");
  expect(adapter.capabilities?.provider).toBe("codex");
  expect(codex.readinessCallCount).toBe(2);
  expect(claude.readinessCallCount).toBe(0);
  expect(secondReadiness.provider).toBe("codex");
});

test("checkReadiness falls back to the first degraded provider when no provider is ready", async () => {
  const codex = new FakeAdapter("codex", [createReadiness("codex", "error")]);
  const claude = new FakeAdapter("claude", [createReadiness("claude", "degraded")]);
  const adapter = new ClaudexAdapter({
    providers: { codex, claude },
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.provider).toBe("claude");
  expect(readiness.status).toBe("degraded");
  expect(adapter.provider).toBe("claude");
  expect(codex.readinessCallCount).toBe(1);
  expect(claude.readinessCallCount).toBe(1);
});

test("checkReadiness returns the first failing provider without pinning when none are runnable", async () => {
  const codex = new FakeAdapter("codex", [createReadiness("codex", "missing_cli")]);
  const claude = new FakeAdapter("claude", [createReadiness("claude", "needs_auth")]);
  const adapter = new ClaudexAdapter({
    providers: { codex, claude },
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.provider).toBe("codex");
  expect(readiness.status).toBe("missing_cli");
  expect(adapter.provider).toBeNull();
  expect(adapter.capabilities).toBeNull();
  expect(codex.readinessCallCount).toBe(1);
  expect(claude.readinessCallCount).toBe(1);
});

test("createSession resolves a runnable provider and delegates to it", async () => {
  const codex = new FakeAdapter("codex", [createReadiness("codex", "ready")]);
  const claude = new FakeAdapter("claude", [createReadiness("claude", "ready")]);
  const adapter = new ClaudexAdapter({
    providers: { codex, claude },
  });

  const session = await adapter.createSession();

  expect(session.provider).toBe("codex");
  expect(adapter.provider).toBe("codex");
  expect(codex.createSessionCallCount).toBe(1);
  expect(claude.createSessionCallCount).toBe(0);
});

test("createSession throws a typed error with probe diagnostics when no provider is runnable", async () => {
  const codex = new FakeAdapter("codex", [createReadiness("codex", "missing_cli")]);
  const claude = new FakeAdapter("claude", [createReadiness("claude", "needs_auth")]);
  const adapter = new ClaudexAdapter({
    providers: { codex, claude },
  });

  try {
    await adapter.createSession();
    throw new Error("Expected createSession to throw");
  } catch (error) {
    expect(isAgentError(error)).toBe(true);

    if (!isAgentError(error)) {
      return;
    }

    expect(error.code).toBe("missing_cli");
    expect(error.provider).toBe("codex");
    expect(error.details).toMatchObject({
      preferredProviders: ["codex", "claude"],
      selectedProvider: "codex",
      selectedStatus: "missing_cli",
      probes: [
        { provider: "codex", status: "missing_cli" },
        { provider: "claude", status: "needs_auth" },
      ],
    });
  }
});

test("resumeSession pins from the reference provider when unresolved", async () => {
  const codex = new FakeAdapter("codex", [createReadiness("codex", "ready")]);
  const claude = new FakeAdapter("claude", [createReadiness("claude", "ready")]);
  const adapter = new ClaudexAdapter({
    providers: { codex, claude },
  });

  const session = await adapter.resumeSession({
    provider: "claude",
    sessionId: "claude-123",
  });

  expect(session.provider).toBe("claude");
  expect(adapter.provider).toBe("claude");
  expect(codex.resumeSessionCallCount).toBe(0);
  expect(claude.resumeSessionCallCount).toBe(1);
});

test("resumeSession rejects unknown providers with a typed AgentError before pinning", async () => {
  const codex = new FakeAdapter("codex", [createReadiness("codex", "ready")]);
  const claude = new FakeAdapter("claude", [createReadiness("claude", "ready")]);
  const adapter = new ClaudexAdapter({
    providers: { codex, claude },
  });

  try {
    await adapter.resumeSession({
      provider: "bogus" as ProviderId,
      sessionId: "bogus-123",
    });
    throw new Error("Expected resumeSession to throw");
  } catch (error) {
    expect(isAgentError(error)).toBe(true);

    if (!isAgentError(error)) {
      return;
    }

    expect(error.code).toBe("provider_failure");
    expect(error.provider).toBe("codex");
    expect(error.details).toMatchObject({
      requestedProvider: "bogus",
      supportedProviders: ["claude", "codex"],
      preferredProviders: ["codex", "claude"],
    });
  }

  expect(adapter.provider).toBeNull();
  expect(codex.resumeSessionCallCount).toBe(0);
  expect(claude.resumeSessionCallCount).toBe(0);
});

test("resumeSession rejects mismatched providers after the adapter is pinned", async () => {
  const codex = new FakeAdapter("codex", [createReadiness("codex", "ready")]);
  const claude = new FakeAdapter("claude", [createReadiness("claude", "ready")]);
  const adapter = new ClaudexAdapter({
    providers: { codex, claude },
  });

  await adapter.createSession();

  try {
    await adapter.resumeSession({
      provider: "claude",
      sessionId: "claude-456",
    });
    throw new Error("Expected resumeSession to throw");
  } catch (error) {
    expect(isAgentError(error)).toBe(true);

    if (!isAgentError(error)) {
      return;
    }

    expect(error.code).toBe("unsupported_feature");
    expect(error.provider).toBe("codex");
    expect(error.details).toMatchObject({
      pinnedProvider: "codex",
      requestedProvider: "claude",
    });
  }
});

test("custom preferred provider order is honored during resolution", async () => {
  const codex = new FakeAdapter("codex", [createReadiness("codex", "ready")]);
  const claude = new FakeAdapter("claude", [createReadiness("claude", "ready")]);
  const adapter = new ClaudexAdapter({
    preferredProviders: ["claude", "codex"],
    providers: { codex, claude },
  });

  const session = await adapter.createSession();

  expect(session.provider).toBe("claude");
  expect(adapter.preferredProviders).toEqual(["claude", "codex"]);
  expect(codex.createSessionCallCount).toBe(0);
  expect(claude.createSessionCallCount).toBe(1);
});

test("invalid preferred provider ids fail with a typed AgentError", async () => {
  try {
    new ClaudexAdapter({
      preferredProviders: ["bogus"] as unknown as ProviderId[],
    });
    throw new Error("Expected constructor to throw");
  } catch (error) {
    expect(isAgentError(error)).toBe(true);

    if (!isAgentError(error)) {
      return;
    }

    expect(error.code).toBe("provider_failure");
    expect(error.provider).toBe("codex");
    expect(error.details).toMatchObject({
      invalidPreferredProviders: ["bogus"],
      supportedProviders: ["claude", "codex"],
      configuredPreferredProviders: ["bogus"],
    });
  }
});
