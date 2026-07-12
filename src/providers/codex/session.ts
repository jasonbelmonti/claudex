import type { ProviderCapabilities } from "../../core/capabilities.js";
import { AgentError } from "../../core/errors.js";
import type { AgentEvent } from "../../core/events.js";
import type { TurnInput, TurnOptions } from "../../core/input.js";
import type { TurnResult } from "../../core/results.js";
import type { AgentSession } from "../../core/session.js";
import { normalizeCodexRunError } from "./errors.js";
import { mapCodexThreadEvent } from "./events.js";
import { mapTurnInputToCodexInput, mapTurnOptionsToCodexTurnOptions } from "./input.js";
import { createCodexSessionReference } from "./references.js";
import { createCodexTurnState } from "./state.js";
import { createCodexTerminalFailure } from "./terminal-failures.js";
import type { CodexThreadLike } from "./types.js";

export class CodexSession implements AgentSession {
  readonly provider = "codex" as const;
  readonly capabilities: ProviderCapabilities;

  constructor(
    private readonly thread: CodexThreadLike,
    capabilities: ProviderCapabilities,
  ) {
    this.capabilities = capabilities;
  }

  get reference() {
    return createCodexSessionReference(this.thread.id);
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
        provider: "codex",
        message: "Codex completed without a terminal result event.",
      });
    }

    return completedResult;
  }

  async *runStreamed(
    input: TurnInput,
    options: TurnOptions = {},
  ): AsyncGenerator<AgentEvent> {
    const turnState = createCodexTurnState(input, options.outputSchema);
    const knownSessionReference = this.reference;
    let sawTerminalEvent = false;

    try {
      const codexInput = mapTurnInputToCodexInput(input);
      const codexTurnOptions = mapTurnOptionsToCodexTurnOptions(options);
      const streamedTurn = await this.thread.runStreamed(
        codexInput,
        codexTurnOptions,
      );

      for await (const event of streamedTurn.events) {
        for (const mappedEvent of mapCodexThreadEvent({
          event,
          state: turnState,
          getSessionReference: () => this.reference,
          knownSessionReference,
        })) {
          if (
            mappedEvent.type === "turn.completed" ||
            mappedEvent.type === "turn.failed"
          ) {
            sawTerminalEvent = true;
          }

          yield mappedEvent;
        }
      }
    } catch (error) {
      if (!sawTerminalEvent) {
        yield this.createTurnFailedEvent(
          normalizeCodexRunError(error, {
            signal: options.signal,
            fallbackMessage:
              "Codex turn failed before a terminal event was emitted.",
          }),
        );
      }

      return;
    }

    if (!sawTerminalEvent) {
      yield this.createTurnFailedEvent(
        createCodexTerminalFailure({
          failureKind: "stream_ended_without_terminal",
          session: this.reference,
        }),
      );
    }
  }

  private createTurnFailedEvent(error: AgentError): AgentEvent {
    return {
      type: "turn.failed",
      provider: "codex",
      session: this.reference,
      error,
      raw: error.raw,
    };
  }
}
