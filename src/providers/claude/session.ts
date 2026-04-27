import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import type { AgentEvent } from "../../core/events.js";
import { AgentError } from "../../core/errors.js";
import type { TurnInput, TurnOptions } from "../../core/input.js";
import type { ProviderCapabilities } from "../../core/capabilities.js";
import type { AgentConfig } from "../../core/agent-config.js";
import type { AgentSession, SessionOptions } from "../../core/session.js";
import type { TurnResult } from "../../core/results.js";
import { mapTurnInputToClaudePrompt } from "./input.js";
import {
  buildClaudeBaseQueryOptions,
  buildClaudeTurnQueryOptions,
} from "./provider-options.js";
import { createClaudeSessionReference } from "./references.js";
import { createClaudeTurnState } from "./state.js";
import type {
  ClaudeQueryFactory,
  ClaudeQueryLike,
  ClaudeSessionState,
} from "./types.js";
import { mapClaudeMessageEvent } from "./events.js";
import { normalizeClaudeError } from "./errors.js";
import { mergeClaudeProviderOptions } from "./provider-option-merge.js";
import { createClaudeTranscriptStreamingFallback } from "./transcript-fallback.js";
import { validateClaudeSessionOptions } from "./validation.js";

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
    let sawSdkAssistantDelta = false;
    let sawAssistantCompleted = false;
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
      const transcriptFallback = await createClaudeTranscriptStreamingFallback({
        sessionId:
          queryOptions.resume &&
          !queryOptions.forkSession &&
          this.state.currentReference?.sessionId === queryOptions.resume
            ? queryOptions.resume
            : null,
        dir: queryOptions.cwd,
        loadMessages: this.state.sessionMessagesLoader,
        pollIntervalMs: this.state.transcriptPollIntervalMs,
        signal: options.signal,
      });

      query = this.queryFactory({
        prompt,
        options: queryOptions,
      });
      const queryIterator = query[Symbol.asyncIterator]();
      let pendingMessageResult = queryIterator.next();

      while (true) {
        const nextResult = transcriptFallback?.isPollingEnabled
          ? await raceClaudeQueryWithTranscriptPollTick({
              pendingMessageResult,
              pollIntervalMs: transcriptFallback.pollIntervalMs,
            })
          : {
              kind: "message" as const,
              result: await pendingMessageResult,
            };

        if (nextResult.kind === "poll") {
          if (!transcriptFallback || !turnState.sawTurnStarted) {
            continue;
          }

          for (const event of await transcriptFallback.poll(this.reference, turnState)) {
            if (event.type === "message.completed") {
              sawAssistantCompleted = true;
            }

            yield event;
          }

          continue;
        }

        const { done, value: message } = nextResult.result;

        if (done) {
          break;
        }

        pendingMessageResult = queryIterator.next();
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

        let mappedEvents = mapClaudeMessageEvent({
          message,
          session: this.reference,
          state: turnState,
        });

        if (
          message.type === "assistant" &&
          transcriptFallback &&
          !sawAssistantCompleted &&
          !sawSdkAssistantDelta
        ) {
          for (const event of await transcriptFallback.flush({
            session: this.reference,
            state: turnState,
            authoritativeMessageId: message.uuid,
            authoritativeText: turnState.latestAssistantText,
            includeCompleted: false,
          })) {
            if (event.type === "message.completed") {
              sawAssistantCompleted = true;
            }

            yield event;
          }
        }

        if (message.type === "stream_event") {
          const hasMappedDelta = mappedEvents.some(
            (event) => event.type === "message.delta",
          );

          if (hasMappedDelta) {
            transcriptFallback?.disablePolling();

            const nextMappedEvents: AgentEvent[] = [];

            for (const event of mappedEvents) {
              if (event.type !== "message.delta") {
                nextMappedEvents.push(event);
                continue;
              }

              const delta =
                transcriptFallback?.hasSyntheticDelta
                  ? transcriptFallback.reconcileSdkDelta(event.delta)
                  : event.delta;

              if (!delta) {
                continue;
              }

              turnState.latestAssistantText += delta;
              sawSdkAssistantDelta = true;

              nextMappedEvents.push({
                ...event,
                delta,
              });
            }

            mappedEvents = nextMappedEvents;
          }
        }

        if (message.type === "assistant") {
          transcriptFallback?.disablePolling();
        }

        if (
          message.type === "result" &&
          message.subtype === "success" &&
          transcriptFallback &&
          !sawAssistantCompleted
        ) {
          const authoritativeText =
            message.result.trim().length > 0 ? message.result : undefined;

          for (const event of await transcriptFallback.flush({
            session: this.reference,
            state: turnState,
            authoritativeText,
            includeDelta: !sawSdkAssistantDelta,
            includeCompleted: true,
          })) {
            if (event.type === "message.completed") {
              sawAssistantCompleted = true;
            }

            yield event;
          }
        }

        if (message.type === "result") {
          mappedEvents = mapClaudeMessageEvent({
            message,
            session: this.reference,
            state: turnState,
          });
        }

        for (const mappedEvent of mappedEvents) {
          if (mappedEvent.type === "message.completed") {
            sawAssistantCompleted = true;
          }

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
      agentConfig: mergeAgentConfig(
        this.state.baseSessionOptions.agentConfig,
        options.agentConfig,
      ),
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
        sessionMessagesLoader: this.state.sessionMessagesLoader,
        transcriptPollIntervalMs: this.state.transcriptPollIntervalMs,
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

function mergeAgentConfig(
  base?: AgentConfig,
  override?: AgentConfig,
): AgentConfig | undefined {
  const mcpServers = {
    ...(base?.mcpServers ?? {}),
    ...(override?.mcpServers ?? {}),
  };

  if (Object.keys(mcpServers).length === 0) {
    return undefined;
  }

  return {
    mcpServers,
  };
}

async function raceClaudeQueryWithTranscriptPollTick(params: {
  pendingMessageResult: Promise<IteratorResult<SDKMessage>>;
  pollIntervalMs: number;
}): Promise<
  | {
      kind: "message";
      result: IteratorResult<SDKMessage>;
    }
  | {
      kind: "poll";
    }
> {
  const result = await Promise.race([
    params.pendingMessageResult.then((messageResult) => ({
      kind: "message" as const,
      result: messageResult,
    })),
    sleep(params.pollIntervalMs).then(() => ({
      kind: "poll" as const,
    })),
  ]);

  return result;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
