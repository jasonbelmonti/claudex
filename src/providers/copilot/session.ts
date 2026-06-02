import type { AgentEvent } from "../../core/events.js";
import { AgentError } from "../../core/errors.js";
import type { TurnInput, TurnOptions } from "../../core/input.js";
import type { ProviderCapabilities } from "../../core/capabilities.js";
import type { AgentSession, SessionReference } from "../../core/session.js";
import type { TurnResult } from "../../core/results.js";
import { AsyncEventQueue } from "./event-queue.js";
import {
  createCopilotTurnFailedEvent,
  createCopilotTurnStartedEvent,
  mapCopilotSessionEvent,
} from "./events.js";
import {
  createCopilotAbortedError,
  createCopilotTurnTimeoutError,
  normalizeCopilotRunError,
} from "./errors.js";
import {
  DEFAULT_COPILOT_TURN_TIMEOUT_MS,
  getCopilotTurnProviderOptions,
  mapTurnInputToCopilotMessage,
} from "./input.js";
import { createCopilotSessionReference } from "./references.js";
import {
  createCopilotTurnState,
  type CopilotTurnState,
} from "./results.js";
import type {
  CopilotSessionEvent,
  CopilotSessionLike,
} from "./types.js";

export class CopilotSession implements AgentSession {
  readonly provider = "copilot" as const;
  readonly capabilities: ProviderCapabilities;

  private currentReference: SessionReference | null;
  private readonly runtimeReference: SessionReference;
  private readonly pendingLifecycleEvents: CopilotSessionEvent[];

  constructor(params: {
    capabilities: ProviderCapabilities;
    initialReference: SessionReference | null;
    initialEvents?: CopilotSessionEvent[];
    session: CopilotSessionLike;
  }) {
    this.capabilities = params.capabilities;
    this.currentReference = params.initialReference;
    this.runtimeReference = createCopilotSessionReference(
      params.session.sessionId,
    );
    this.pendingLifecycleEvents = [...(params.initialEvents ?? [])];
    this.session = params.session;
  }

  private readonly session: CopilotSessionLike;

  get reference() {
    return this.currentReference;
  }

  async run(input: TurnInput, options?: TurnOptions): Promise<TurnResult> {
    let completedResult: TurnResult | null = null;

    for await (const event of this.runStreamed(input, options)) {
      if (event.type === "turn.completed") {
        completedResult = event.result;
      }

      if (event.type === "turn.failed") {
        throw event.error;
      }
    }

    if (!completedResult) {
      throw new AgentError({
        code: "provider_failure",
        provider: "copilot",
        message: "Copilot completed without a terminal result event.",
      });
    }

    return completedResult;
  }

  async *runStreamed(
    input: TurnInput,
    options: TurnOptions = {},
  ): AsyncGenerator<AgentEvent> {
    const state = createCopilotTurnState(input, options.outputSchema);
    const queue = new AsyncEventQueue<CopilotSessionEvent>();
    const unsubscribe = this.session.on((event) => {
      queue.enqueue(event);
    });
    const abortListener = () => {
      void this.abortTurn(queue);
    };
    let sawTerminalEvent = false;
    let turnTimeout: ReturnType<typeof setTimeout> | undefined;
    const clearTurnTimeout = () => {
      if (turnTimeout !== undefined) {
        clearTimeout(turnTimeout);
        turnTimeout = undefined;
      }
    };

    if (options.signal?.aborted) {
      yield this.createTurnFailedEvent(createCopilotAbortedError());
      unsubscribe();
      queue.close();
      return;
    }

    options.signal?.addEventListener("abort", abortListener, { once: true });

    try {
      const providerOptions = getCopilotTurnProviderOptions(
        options.providerOptions,
      );
      const turnTimeoutMs =
        providerOptions.turnTimeoutMs ?? DEFAULT_COPILOT_TURN_TIMEOUT_MS;
      const copilotMessage = mapTurnInputToCopilotMessage(input);
      this.enqueuePendingLifecycleEvents(queue);
      const sendPromise = this.session.send(copilotMessage);
      void sendPromise.catch((error) => {
        queue.fail(error);
      });
      turnTimeout = setTimeout(() => {
        void this.failTimedOutTurn(queue, turnTimeoutMs);
      }, turnTimeoutMs);

      for await (const event of queue) {
        for (const mappedEvent of this.mapQueuedEvent(event, state)) {
          if (mappedEvent.type === "session.started") {
            this.currentReference = mappedEvent.reference;
          }

          if (
            mappedEvent.type === "turn.completed" ||
            mappedEvent.type === "turn.failed"
          ) {
            sawTerminalEvent = true;
            clearTurnTimeout();
            queue.close();

            if (mappedEvent.type === "turn.completed") {
              this.currentReference = this.runtimeReference;
            }
          }

          yield mappedEvent;
        }

        if (sawTerminalEvent) {
          break;
        }
      }

      if (!sawTerminalEvent) {
        await sendPromise;
      }
    } catch (error) {
      if (!sawTerminalEvent) {
        yield this.createTurnFailedEvent(
          normalizeCopilotRunError(error, {
            signal: options.signal,
            fallbackMessage:
              "Copilot turn failed before a terminal event was emitted.",
          }),
        );
      }
    } finally {
      options.signal?.removeEventListener("abort", abortListener);
      clearTurnTimeout();
      unsubscribe();
      queue.close();
    }
  }

  private enqueuePendingLifecycleEvents(
    queue: AsyncEventQueue<CopilotSessionEvent>,
  ): void {
    for (const event of this.pendingLifecycleEvents.splice(0)) {
      queue.enqueue(event);
    }
  }

  private mapQueuedEvent(
    event: CopilotSessionEvent,
    state: CopilotTurnState,
  ): AgentEvent[] {
    const mappedEvents = mapCopilotSessionEvent({
      event,
      state,
      getSessionReference: () => this.runtimeReference,
    });

    if (state.sawTurnStarted) {
      return mappedEvents;
    }

    const firstNonSessionStartedIndex = mappedEvents.findIndex(
      (mappedEvent) => mappedEvent.type !== "session.started",
    );

    if (firstNonSessionStartedIndex === -1) {
      return mappedEvents;
    }

    state.sawTurnStarted = true;

    return [
      ...mappedEvents.slice(0, firstNonSessionStartedIndex),
      createCopilotTurnStartedEvent({
        input: state.input,
        session: this.runtimeReference,
      }),
      ...mappedEvents.slice(firstNonSessionStartedIndex),
    ];
  }

  private async abortTurn(
    queue: AsyncEventQueue<CopilotSessionEvent>,
  ): Promise<void> {
    try {
      await this.session.abort();
      queue.enqueue(createSyntheticCopilotAbortIdleEvent());
    } catch (error) {
      queue.fail(error);
    }
  }

  private async failTimedOutTurn(
    queue: AsyncEventQueue<CopilotSessionEvent>,
    turnTimeoutMs: number,
  ): Promise<void> {
    queue.fail(createCopilotTurnTimeoutError(turnTimeoutMs));

    try {
      await this.session.abort();
    } catch (error) {
      queue.fail(error);
    }
  }

  private createTurnFailedEvent(error: AgentError): AgentEvent {
    return createCopilotTurnFailedEvent({
      session: this.currentReference,
      error,
    });
  }
}

function createSyntheticCopilotAbortIdleEvent(): Extract<
  CopilotSessionEvent,
  { type: "session.idle" }
> {
  const timestamp = new Date().toISOString();

  return {
    id: "claudex-abort-idle",
    parentId: null,
    timestamp,
    type: "session.idle",
    ephemeral: true,
    data: {
      aborted: true,
    },
  };
}
