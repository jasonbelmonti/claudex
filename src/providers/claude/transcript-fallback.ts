import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";

import type { AgentEvent } from "../../core/events";
import type { SessionReference } from "../../core/session";
import type { ClaudeTurnState } from "./state";
import type { ClaudeSessionMessagesLoader } from "./types";

export const DEFAULT_CLAUDE_TRANSCRIPT_POLL_INTERVAL_MS = 100;

type ClaudeTranscriptStreamingFallback = {
  readonly pollIntervalMs: number;
  readonly hasSyntheticDelta: boolean;
  poll(session: SessionReference | null, state: ClaudeTurnState): Promise<AgentEvent[]>;
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
  loadMessages: ClaudeSessionMessagesLoader;
  pollIntervalMs?: number;
}): Promise<ClaudeTranscriptStreamingFallback | null> {
  if (!params.sessionId) {
    return null;
  }

  try {
    const baselineMessages = await params.loadMessages(params.sessionId);

    return new ClaudeSessionTranscriptStreamingFallback({
      sessionId: params.sessionId,
      loadMessages: params.loadMessages,
      baselineMessages,
      pollIntervalMs: params.pollIntervalMs ?? DEFAULT_CLAUDE_TRANSCRIPT_POLL_INTERVAL_MS,
    });
  } catch {
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
  private activeMessageId?: string;
  private emittedText = "";
  private pollingEnabled = true;

  constructor(params: {
    sessionId: string;
    loadMessages: ClaudeSessionMessagesLoader;
    baselineMessages: SessionMessage[];
    pollIntervalMs: number;
  }) {
    this.sessionId = params.sessionId;
    this.loadMessages = params.loadMessages;
    this.pollIntervalMs = params.pollIntervalMs;
    this.baselineAssistantMessageIds = new Set(
      params.baselineMessages.flatMap((message) =>
        message.type === "assistant" ? [message.uuid] : [],
      ),
    );
  }

  get hasSyntheticDelta() {
    return this.emittedText.length > 0;
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
    } catch {
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
    } catch {
      if (!params.authoritativeText?.length) {
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
    const messages = await this.loadMessages(this.sessionId);
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
    }

    const delta = resolveAppendedText(this.emittedText, params.text);

    params.state.latestAssistantText = params.text;
    this.emittedText = params.text;

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
        text: params.text,
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

  if (transcriptText?.length) {
    return transcriptText;
  }

  return latestAssistantText;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}
