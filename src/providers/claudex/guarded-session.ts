import type { ProviderCapabilities } from "../../core/capabilities.js";
import type { AgentEvent } from "../../core/events.js";
import type { TurnInput, TurnOptions } from "../../core/input.js";
import type { ProviderId } from "../../core/provider.js";
import type { TurnResult } from "../../core/results.js";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session.js";
import {
  snapshotProviderCapabilities,
  snapshotSessionReference,
} from "./canonical-provider-values.js";
import {
  assertProviderIdentity,
  canonicalizeProviderError,
  throwIfProviderErrorConflicts,
} from "./provider-identity.js";

export function guardAgentSession(
  session: AgentSession,
  provider: ProviderId,
): AgentSession {
  const guarded = new GuardedAgentSession(session, provider);
  guarded.validateSurface();
  return guarded;
}

class GuardedAgentSession implements AgentSession {
  readonly fork?: (options?: SessionOptions) => Promise<AgentSession>;

  constructor(
    private readonly session: AgentSession,
    private readonly resolvedProvider: ProviderId,
  ) {
    const fork = session.fork;
    if (fork) {
      this.fork = async (options = {}) => {
        this.validateSurface();

        try {
          return guardAgentSession(
            await fork.call(session, options),
            resolvedProvider,
          );
        } catch (error) {
          throwIfProviderErrorConflicts(resolvedProvider, error);
        }
      };
    }
  }

  get provider(): ProviderId {
    assertProviderIdentity(
      this.resolvedProvider,
      this.session.provider,
      "session",
    );
    return this.resolvedProvider;
  }

  get capabilities(): ProviderCapabilities {
    return snapshotProviderCapabilities(
      this.session.capabilities,
      this.resolvedProvider,
      "session_capabilities",
    );
  }

  get reference(): SessionReference | null {
    return snapshotSessionReference(
      this.session.reference,
      this.resolvedProvider,
      "session_reference",
    );
  }

  async run(
    input: TurnInput,
    options?: TurnOptions,
  ): Promise<TurnResult> {
    this.validateSurface();

    let result: TurnResult;
    try {
      result = await this.session.run(input, options);
    } catch (error) {
      throwIfProviderErrorConflicts(this.resolvedProvider, error);
    }

    const canonicalResult = this.snapshotResult(
      result,
      "result",
      "result_session",
    );
    this.validateSurface();
    return canonicalResult;
  }

  async *runStreamed(
    input: TurnInput,
    options?: TurnOptions,
  ): AsyncGenerator<AgentEvent> {
    this.validateSurface();

    try {
      for await (const event of this.session.runStreamed(input, options)) {
        yield this.snapshotEvent(event);
        this.validateSurface();
      }
    } catch (error) {
      throwIfProviderErrorConflicts(this.resolvedProvider, error);
    }

    this.validateSurface();
  }

  validateSurface(): void {
    void this.provider;
    void this.capabilities;
    void this.reference;
  }

  private snapshotResult(
    result: TurnResult,
    resultSource: "result" | "terminal_result",
    sessionSource: "result_session" | "terminal_result_session",
  ): TurnResult {
    assertProviderIdentity(
      this.resolvedProvider,
      result.provider,
      resultSource,
    );
    const session = snapshotSessionReference(
      result.session,
      this.resolvedProvider,
      sessionSource,
    );

    return immutableClone(result, {
      provider: this.resolvedProvider,
      session,
    });
  }

  private snapshotEvent(event: AgentEvent): AgentEvent {
    assertProviderIdentity(
      this.resolvedProvider,
      event.provider,
      "event",
    );
    const type = event.type;
    const overrides: Record<string, unknown> = {
      type,
      provider: this.resolvedProvider,
      session: snapshotSessionReference(
        event.session,
        this.resolvedProvider,
        "event_session",
      ),
    };

    switch (type) {
      case "session.started":
        overrides.reference = snapshotSessionReference(
          event.reference,
          this.resolvedProvider,
          "event_reference",
        );
        break;
      case "turn.completed":
        overrides.result = this.snapshotResult(
          event.result,
          "terminal_result",
          "terminal_result_session",
        );
        break;
      case "turn.failed":
        overrides.error = canonicalizeProviderError(
          this.resolvedProvider,
          event.error,
          "terminal_error",
        );
        break;
    }

    return immutableClone(event, overrides);
  }
}

function immutableClone<T extends object>(
  value: T,
  overrides: Readonly<Record<string, unknown>>,
): T {
  const descriptors: Record<PropertyKey, PropertyDescriptor> =
    Object.getOwnPropertyDescriptors(value);

  for (const [key, override] of Object.entries(overrides)) {
    descriptors[key] = {
      configurable: false,
      enumerable: descriptors[key]?.enumerable ?? true,
      value: override,
      writable: false,
    };
  }

  return Object.freeze(
    Object.create(Object.getPrototypeOf(value), descriptors),
  ) as T;
}
