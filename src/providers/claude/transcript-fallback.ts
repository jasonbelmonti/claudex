import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";

import type { AgentEvent } from "../../core/events.js";
import type { SessionReference } from "../../core/session.js";
import type { ClaudeTurnState } from "./state.js";
import type { ClaudeSessionMessagesLoader } from "./types.js";

export const DEFAULT_CLAUDE_TRANSCRIPT_POLL_INTERVAL_MS = 100;

type ClaudeTranscriptStreamingFallback = {
  readonly pollIntervalMs: number;
  readonly hasSyntheticDelta: boolean;
  readonly isPollingEnabled: boolean;
  poll(session: SessionReference | null, state: ClaudeTurnState): Promise<AgentEvent[]>;
  reconcileSdkDelta(delta: string): string;
  disablePolling(): void;
  flush(params: {
    session: SessionReference | null;
    state: ClaudeTurnState;
    authoritativeMessageId?: string;
    authoritativeText?: string;
    includeDelta?: boolean;
    includeCompleted: boolean;
  }): Promise<AgentEvent[]>;
};

export async function createClaudeTranscriptStreamingFallback(params: {
  sessionId?: string | null;
  dir?: string;
  loadMessages: ClaudeSessionMessagesLoader;
  pollIntervalMs?: number;
  signal?: AbortSignal;
}): Promise<ClaudeTranscriptStreamingFallback | null> {
  if (!params.sessionId) {
    return null;
  }

  try {
    const baselineMessages = await loadSessionMessages({
      loadMessages: params.loadMessages,
      sessionId: params.sessionId,
      dir: params.dir,
      signal: params.signal,
    });

    return new ClaudeSessionTranscriptStreamingFallback({
      sessionId: params.sessionId,
      loadMessages: params.loadMessages,
      baselineMessages,
      pollIntervalMs: params.pollIntervalMs ?? DEFAULT_CLAUDE_TRANSCRIPT_POLL_INTERVAL_MS,
      signal: params.signal,
      dir: params.dir,
    });
  } catch (error) {
    if (isAbortLikeError(error)) {
      throw error;
    }

    return null;
  }
}

class ClaudeSessionTranscriptStreamingFallback
  implements ClaudeTranscriptStreamingFallback
{
  readonly pollIntervalMs: number;

  private readonly baselineAssistantMessageIds: Set<string>;
  private readonly loadMessages: ClaudeSessionMessagesLoader;
  private readonly sessionId: string;
  private readonly dir?: string;
  private readonly signal?: AbortSignal;
  private activeMessageId?: string;
  private emittedText = "";
  private sdkProcessedTextLength = 0;
  private pollingEnabled = true;

  constructor(params: {
    sessionId: string;
    loadMessages: ClaudeSessionMessagesLoader;
    baselineMessages: SessionMessage[];
    pollIntervalMs: number;
    signal?: AbortSignal;
    dir?: string;
  }) {
    this.sessionId = params.sessionId;
    this.loadMessages = params.loadMessages;
    this.pollIntervalMs = params.pollIntervalMs;
    this.signal = params.signal;
    this.dir = params.dir;
    this.baselineAssistantMessageIds = new Set(
      params.baselineMessages.flatMap((message) =>
        message.type === "assistant" ? [message.uuid] : [],
      ),
    );
  }

  get hasSyntheticDelta() {
    return this.emittedText.length > 0;
  }

  get isPollingEnabled() {
    return this.pollingEnabled;
  }

  reconcileSdkDelta(delta: string) {
    const replayOverlap = resolveLeadingOverlap(
      this.emittedText.slice(this.sdkProcessedTextLength),
      delta,
    );
    const nextDelta = delta.slice(
      replayOverlap > 0
        ? replayOverlap
        : resolveOverlappingDeltaPrefix(this.emittedText, delta),
    );

    this.sdkProcessedTextLength += delta.length;
    this.emittedText += nextDelta;

    return nextDelta;
  }

  disablePolling() {
    this.pollingEnabled = false;
  }

  async poll(
    session: SessionReference | null,
    state: ClaudeTurnState,
  ): Promise<AgentEvent[]> {
    if (!this.pollingEnabled) {
      return [];
    }

    try {
      const snapshot = await this.readLatestAssistantSnapshot();

      if (!snapshot) {
        return [];
      }

      return this.buildEvents({
        session,
        state,
        messageId: snapshot.messageId,
        text: snapshot.text,
        includeDelta: true,
        includeCompleted: false,
      });
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error;
      }

      this.disablePolling();
      return [];
    }
  }

  async flush(params: {
    session: SessionReference | null;
    state: ClaudeTurnState;
    authoritativeMessageId?: string;
    authoritativeText?: string;
    includeDelta?: boolean;
    includeCompleted: boolean;
  }): Promise<AgentEvent[]> {
    this.disablePolling();

    let snapshot: Awaited<ReturnType<typeof this.readLatestAssistantSnapshot>> = null;

    try {
      snapshot = await this.readLatestAssistantSnapshot();
    } catch (error) {
      if (isAbortLikeError(error)) {
        throw error;
      }

      if (
        !params.authoritativeText?.length &&
        !params.state.latestAssistantText.length
      ) {
        return [];
      }
    }

    const text = resolveFinalAssistantText(
      params.authoritativeText,
      snapshot?.text,
      params.state.latestAssistantText,
    );

    if (!text) {
      return [];
    }

    return this.buildEvents({
      session: params.session,
      state: params.state,
      messageId:
        snapshot?.messageId ?? this.activeMessageId ?? params.authoritativeMessageId,
      text,
      includeDelta: params.includeDelta ?? true,
      includeCompleted: params.includeCompleted,
    });
  }

  private async readLatestAssistantSnapshot(): Promise<{
    messageId?: string;
    text: string;
  } | null> {
    const messages = await loadSessionMessages({
      loadMessages: this.loadMessages,
      sessionId: this.sessionId,
      dir: this.dir,
      signal: this.signal,
    });
    const candidate = findCandidateAssistantMessage(
      messages,
      this.baselineAssistantMessageIds,
      this.activeMessageId,
    );

    if (!candidate) {
      return null;
    }

    return {
      messageId: candidate.uuid,
      text: extractTranscriptAssistantText(candidate.message),
    };
  }

  private buildEvents(params: {
    session: SessionReference | null;
    state: ClaudeTurnState;
    messageId?: string;
    text: string;
    includeDelta: boolean;
    includeCompleted: boolean;
  }): AgentEvent[] {
    if (params.messageId && params.messageId !== this.activeMessageId) {
      this.activeMessageId = params.messageId;
      this.emittedText = "";
      this.sdkProcessedTextLength = 0;
    }

    const text = resolveMonotonicAssistantText(this.emittedText, params.text);
    const delta = resolveAppendedText(this.emittedText, text);

    params.state.latestAssistantText = resolveMonotonicAssistantText(
      params.state.latestAssistantText,
      text,
    );
    this.emittedText = text;

    const events: AgentEvent[] = [];

    if (params.includeDelta && delta) {
      events.push({
        type: "message.delta",
        provider: "claude",
        session: params.session,
        messageId: this.activeMessageId,
        role: "assistant",
        delta,
        raw: {
          source: "transcript_fallback",
          sessionId: this.sessionId,
          messageId: this.activeMessageId,
        },
      });
    }

    if (params.includeCompleted) {
      events.push({
        type: "message.completed",
        provider: "claude",
        session: params.session,
        messageId: this.activeMessageId,
        role: "assistant",
        text,
        raw: {
          source: "transcript_fallback",
          sessionId: this.sessionId,
          messageId: this.activeMessageId,
        },
      });
    }

    return events;
  }
}

function findCandidateAssistantMessage(
  messages: SessionMessage[],
  baselineAssistantMessageIds: Set<string>,
  activeMessageId?: string,
): SessionMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.type !== "assistant") {
      continue;
    }

    if (
      message.uuid === activeMessageId ||
      !baselineAssistantMessageIds.has(message.uuid)
    ) {
      return message;
    }
  }

  return null;
}

function extractTranscriptAssistantText(message: unknown): string {
  const content = getRecord(message)?.content;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content.flatMap((block) => {
    const record = getRecord(block);

    if (record?.type !== "text" || typeof record.text !== "string") {
      return [];
    }

    return [record.text];
  }).join("");
}

function resolveOverlappingDeltaPrefix(existingText: string, delta: string): number {
  const maxOverlap = Math.min(existingText.length, delta.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existingText.endsWith(delta.slice(0, overlap))) {
      return overlap;
    }
  }

  return 0;
}

function resolveLeadingOverlap(existingText: string, delta: string): number {
  const maxOverlap = Math.min(existingText.length, delta.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (existingText.startsWith(delta.slice(0, overlap))) {
      return overlap;
    }
  }

  return 0;
}

async function loadSessionMessages(params: {
  loadMessages: ClaudeSessionMessagesLoader;
  sessionId: string;
  dir?: string;
  signal?: AbortSignal;
}): Promise<SessionMessage[]> {
  throwIfAborted(params.signal);

  if (!params.signal) {
    return params.loadMessages(params.sessionId, {
      dir: params.dir,
    });
  }

  return awaitAbortable(
    params.loadMessages(params.sessionId, {
      dir: params.dir,
    }),
    params.signal,
  );
}

async function awaitAbortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw createAbortError();
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError() {
  const error = new Error("Transcript fallback load aborted.");
  error.name = "AbortError";
  return error;
}

function isAbortLikeError(error: unknown): error is Error {
  return error instanceof Error && error.name === "AbortError";
}

function resolveAppendedText(previousText: string, nextText: string): string {
  if (!nextText) {
    return "";
  }

  if (!previousText) {
    return nextText;
  }

  if (!nextText.startsWith(previousText)) {
    return "";
  }

  return nextText.slice(previousText.length);
}

function resolveFinalAssistantText(
  authoritativeText: string | undefined,
  transcriptText: string | undefined,
  latestAssistantText: string,
): string {
  if (authoritativeText?.length) {
    return authoritativeText;
  }

  return resolveMonotonicAssistantText(latestAssistantText, transcriptText ?? "");
}

function resolveMonotonicAssistantText(
  currentText: string,
  nextText: string,
): string {
  if (!currentText) {
    return nextText;
  }

  if (!nextText) {
    return currentText;
  }

  if (nextText.startsWith(currentText)) {
    return nextText;
  }

  if (currentText.startsWith(nextText)) {
    return currentText;
  }

  return nextText.length >= currentText.length ? nextText : currentText;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
