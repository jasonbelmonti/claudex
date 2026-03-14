import type { TurnInput } from "../../core/input";
import { createCodexSessionReference } from "../../providers/codex/references";
import type {
  CodexTranscriptNormalizationContext,
  CodexTranscriptTurnState,
  ParsedArtifact,
} from "./normalize-types";

export function emitTurnStarted(
  prompt: string,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const turn = ensureActiveTurn(context);

  if (turn.startedEmitted) {
    return {
      sessionId: context.sessionId ?? undefined,
      events: [],
      warnings: [],
    };
  }

  turn.startedEmitted = true;
  turn.inputPrompt = prompt;

  const input: TurnInput = {
    prompt,
  };

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "turn.started",
        provider: "codex",
        session: createCodexSessionReference(context.sessionId),
        turnId: turn.turnId,
        input,
        timestamp,
        raw: record,
      },
    ],
    warnings: [],
  };
}

export function ensureActiveTurn(
  context: CodexTranscriptNormalizationContext,
): CodexTranscriptTurnState {
  if (context.activeTurn) {
    return context.activeTurn;
  }

  const turn: CodexTranscriptTurnState = {
    startedEmitted: false,
    latestAssistantText: "",
    usage: null,
  };
  context.activeTurn = turn;
  return turn;
}
