import type { AgentEvent } from "../../core/events";
import { AgentError } from "../../core/errors";
import type { TurnInput, TurnOptions } from "../../core/input";
import type { ProviderCapabilities } from "../../core/capabilities";
import type { AgentSession, SessionOptions } from "../../core/session";
import type { TurnResult } from "../../core/results";
import { mapTurnInputToClaudePrompt } from "./input";
import {
  buildClaudeBaseQueryOptions,
  buildClaudeTurnQueryOptions,
} from "./provider-options";
import { createClaudeSessionReference } from "./references";
import { createClaudeTurnState } from "./state";
import type {
  ClaudeQueryFactory,
  ClaudeQueryLike,
  ClaudeSessionState,
} from "./types";
import { mapClaudeMessageEvent } from "./events";
import { normalizeClaudeError } from "./errors";
import { mergeClaudeProviderOptions } from "./provider-option-merge";
import { validateClaudeSessionOptions } from "./validation";

export class ClaudeSession implements AgentSession {
  readonly provider = "claude" as const;
  readonly capabilities: ProviderCapabilities;

  constructor(
    private readonly queryFactory: ClaudeQueryFactory,
    private readonly state: ClaudeSessionState,
    capabilities: ProviderCapabilities,
  ) {
    this.capabilities = capabilities;
  }

  get reference() {
    return this.state.currentReference;
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
        provider: "claude",
        message: "Claude completed without a terminal result event.",
      });
    }

    return completedResult;
  }

  async *runStreamed(
    input: TurnInput,
    options: TurnOptions = {},
  ): AsyncGenerator<AgentEvent> {
    const turnState = createClaudeTurnState(input, options.outputSchema);
    let sawTerminalEvent = false;
    let query: ClaudeQueryLike | undefined;

    try {
      const prompt = mapTurnInputToClaudePrompt(input);
      const queryOptions = buildClaudeTurnQueryOptions({
        baseOptions: this.state.baseQueryOptions,
        turnOptions: options,
        resumeSessionId: this.state.nextResumeSessionId,
        forkSession: this.state.forkOnNextRun,
      });

      query = this.queryFactory({
        prompt,
        options: queryOptions,
      });

      for await (const message of query) {
        const nextReference = createClaudeSessionReference(message.session_id);

        if (
          nextReference &&
          (!this.state.currentReference ||
            this.state.currentReference.sessionId !== nextReference.sessionId)
        ) {
          this.state.currentReference = nextReference;
          this.state.nextResumeSessionId = nextReference.sessionId;
          this.state.forkOnNextRun = false;

          yield {
            type: "session.started",
            provider: "claude",
            session: nextReference,
            reference: nextReference,
            raw: message,
          };
        }

        if (!turnState.sawTurnStarted) {
          turnState.sawTurnStarted = true;
          yield {
            type: "turn.started",
            provider: "claude",
            session: this.reference,
            input,
            raw: message,
          };
        }

        for (const mappedEvent of mapClaudeMessageEvent({
          message,
          session: this.reference,
          state: turnState,
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
          normalizeClaudeError(error, {
            signal: options.signal,
            fallbackMessage:
              "Claude turn failed before a terminal event was emitted.",
          }),
        );
      }

      return;
    } finally {
      query?.close();
    }

    if (!sawTerminalEvent) {
      yield this.createTurnFailedEvent(
        new AgentError({
          code: "provider_failure",
          provider: "claude",
          message: "Claude stream ended without a terminal turn event.",
        }),
      );
    }
  }

  async fork(options: SessionOptions = {}): Promise<AgentSession> {
    const sourceSessionId =
      this.reference?.sessionId ?? this.state.nextResumeSessionId;

    if (!sourceSessionId) {
      throw new AgentError({
        code: "unsupported_feature",
        provider: "claude",
        message: "Claude sessions cannot be forked before they have a resumable session ID.",
      });
    }

    const baseSessionOptions = {
      ...this.state.baseSessionOptions,
      ...options,
      providerOptions: mergeClaudeProviderOptions(
        this.state.baseSessionOptions.providerOptions,
        options.providerOptions,
      ),
    } satisfies SessionOptions;

    validateClaudeSessionOptions(baseSessionOptions);

    return new ClaudeSession(
      this.queryFactory,
      {
        currentReference: null,
        nextResumeSessionId: sourceSessionId,
        forkOnNextRun: true,
        baseSessionOptions,
        adapterSdkOptions: this.state.adapterSdkOptions,
        baseQueryOptions: buildClaudeBaseQueryOptions({
          sessionOptions: baseSessionOptions,
          sdkOptions: this.state.adapterSdkOptions,
        }),
      },
      this.capabilities,
    );
  }

  private createTurnFailedEvent(error: AgentError): AgentEvent {
    return {
      type: "turn.failed",
      provider: "claude",
      session: this.reference,
      error,
      raw: error.raw,
    };
  }
}
