import type { AgentEvent } from "../../core/events.js";
import type { AgentUsage } from "../../core/results.js";
import { AgentError } from "../../core/errors.js";
import { createClaudeSessionReference } from "../../providers/claude/references.js";
import type { IngestWarning } from "../warnings.js";

type ParsedArtifact = {
  events: AgentEvent[];
  warnings: IngestWarning[];
  sessionId?: string;
};
type ClaudeIngestSession = ReturnType<typeof createClaudeSessionReference> | null;
type ClaudeArtifactNormalizationSessionState = {
  latestAssistantText?: string;
  workingDirectory?: string;
};

export type ClaudeArtifactNormalizationContext = {
  sessions: Map<string, ClaudeArtifactNormalizationSessionState>;
};

const CLAUDE_ARTIFACT_NORMALIZATION_METADATA_KEY = "claudePendingAssistantTexts";
const DEFAULT_CONTEXT_SESSION_KEY = "__default__";

export function createClaudeArtifactNormalizationContext(
  metadata?: Record<string, unknown>,
): ClaudeArtifactNormalizationContext {
  const persistedSessions = metadata?.[CLAUDE_ARTIFACT_NORMALIZATION_METADATA_KEY];
  const sessions = new Map<string, ClaudeArtifactNormalizationSessionState>();

  if (isRecord(persistedSessions)) {
    for (const [sessionKey, persistedSessionState] of Object.entries(
      persistedSessions,
    )) {
      const sessionState = parsePersistedSessionState(persistedSessionState);
      if (!sessionState) {
        continue;
      }

      sessions.set(sessionKey, sessionState);
    }
  }

  return {
    sessions,
  };
}

export function createClaudeArtifactNormalizationMetadata(
  context: ClaudeArtifactNormalizationContext,
): Record<string, unknown> | undefined {
  if (context.sessions.size === 0) {
    return;
  }

  const persistedSessions = Object.fromEntries(
    [...context.sessions.entries()].flatMap(([sessionKey, sessionState]) => {
      const persistedSessionState = serializeSessionState(sessionState);
      return persistedSessionState === undefined
        ? []
        : [[sessionKey, persistedSessionState]];
    }),
  );

  if (Object.keys(persistedSessions).length === 0) {
    return;
  }

  return {
    [CLAUDE_ARTIFACT_NORMALIZATION_METADATA_KEY]: persistedSessions,
  };
}

export function normalizeClaudeArtifactRecord(
  record: unknown,
  context?: ClaudeArtifactNormalizationContext,
): ParsedArtifact {
  try {
    if (!isRecord(record) || typeof record.type !== "string") {
      return {
        events: [],
        warnings: [{
          code: "unsupported-record",
          message: "Skipped malformed Claude record.",
          raw: record,
        }],
      };
    }

    const sessionId = extractSessionId(record);
    const session = sessionId ? createClaudeSessionReference(sessionId) : null;
    const sessionKey = getContextSessionKey(sessionId);
    const recordWorkingDirectory = asString(record.cwd);

    if (recordWorkingDirectory) {
      setWorkingDirectory(context, sessionKey, recordWorkingDirectory);
    }

    switch (record.type) {
      case "user": {
        const prompt = extractMessageText(record.message);

        return {
          sessionId,
          events: [
            {
              type: "turn.started",
              provider: "claude",
              session,
              input: {
                prompt,
              },
              timestamp: asString(record.timestamp),
              raw: record,
              extensions: compactUnknownRecord({
                cwd:
                  recordWorkingDirectory
                  ?? getClaudeArtifactWorkingDirectory(context, sessionId),
              }),
            },
          ],
          warnings: [],
        };
      }
      case "assistant": {
        const text = extractMessageText(record.message);

        if (!text) {
          return {
            sessionId,
            events: [],
            warnings: [
              {
                code: "unsupported-record",
                message: "Claude assistant record is missing renderable text.",
                raw: record,
              },
            ],
          };
        }

        setLatestAssistantText(context, sessionKey, text);

        return {
          sessionId,
          events: [
            {
              type: "message.completed",
              provider: "claude",
              session,
              messageId: getString(record.uuid),
              role: "assistant",
              text,
              raw: record,
            },
          ],
          warnings: [],
        };
      }
      case "stream_event": {
        const event = record.event;
        if (!isRecord(event) || event.type !== "content_block_delta") {
          return {
            sessionId,
            events: [],
            warnings: [
              {
                code: "unsupported-record",
                message: "Unsupported Claude stream event payload.",
                raw: record,
              },
            ],
          };
        }

        const delta = event.delta;
        if (
          !isRecord(delta) ||
          delta.type !== "text_delta" ||
          typeof delta.text !== "string"
        ) {
          return {
            sessionId,
            events: [],
            warnings: [
              {
                code: "unsupported-record",
                message: "Unsupported Claude stream delta payload.",
                raw: record,
              },
            ],
          };
        }

        return {
          sessionId,
          events: [
            {
              type: "message.delta",
              provider: "claude",
              session,
              messageId: getString(record.uuid),
              role: "assistant",
              delta: delta.text,
              raw: record,
            },
          ],
          warnings: [],
        };
      }
      case "result": {
        if (record.subtype !== "success") {
          clearLatestAssistantText(context, sessionKey);
          const error = createClaudeResultError(record);
          return {
            sessionId,
            events: [
              {
                type: "turn.failed",
                provider: "claude",
                session,
                error,
                raw: record,
              },
            ],
            warnings: [],
          };
        }

        const assistantText = consumeLatestAssistantText(context, sessionKey);

        return {
          sessionId,
          events: [
            {
              type: "turn.completed",
              provider: "claude",
              session,
              result: {
                provider: "claude",
                session,
                text: resolveClaudeResultText(record, assistantText),
                structuredOutput: record.structured_output,
                usage: parseUsage(record.usage, record),
                stopReason: getString(record.stop_reason),
                raw: record,
              },
              raw: record,
            },
          ],
          warnings: [],
        };
      }
      case "auth_status": {
        const normalizedStatus = normalizeAuthStatus(record);
        if (!normalizedStatus) {
          return {
            sessionId,
            events: [],
            warnings: [
              {
                code: "unsupported-record",
                message: "Unsupported Claude auth status payload.",
                raw: record,
              },
            ],
          };
        }

        return {
          sessionId,
          events: [
            {
              type: "auth.status",
              provider: "claude",
              session,
              status: normalizedStatus,
              detail: buildAuthStatusDetail(record),
              raw: record,
            },
          ],
          warnings: [],
        };
      }
      case "tool_progress": {
        const event = normalizeToolProgressRecord(record, session);
        if (!event) {
          return {
            sessionId,
            events: [],
            warnings: [
              {
                code: "unsupported-record",
                message: "Unsupported Claude tool progress payload.",
                raw: record,
              },
            ],
          };
        }

        return {
          sessionId,
          events: [event],
          warnings: [],
        };
      }
      case "system": {
        const events = normalizeSystemRecord(record, session);

        if (events === null) {
          return {
            sessionId,
            events: [],
            warnings: [],
          };
        }

        if (!events) {
          return {
            sessionId,
            events: [],
            warnings: [
              {
                code: "unsupported-record",
                message: "Unsupported Claude system payload.",
                raw: record,
              },
            ],
          };
        }

        return {
          sessionId,
          events,
          warnings: [],
        };
      }
      default:
        return {
          sessionId,
          events: [],
          warnings: [
            {
              code: "unsupported-record",
              message: `Unsupported Claude event type: ${record.type}`,
              raw: record,
            },
          ],
        };
    }
  } catch (error) {
    return {
      events: [],
      warnings: [
        {
          code: "parse-failed",
          message: "Claude artifact record parsing failed.",
          cause: error,
          raw: record,
        },
      ],
    };
  }
}

export function getClaudeArtifactWorkingDirectory(
  context: ClaudeArtifactNormalizationContext | undefined,
  sessionId: string | undefined,
): string | undefined {
  if (!context) {
    return;
  }

  return context.sessions.get(getContextSessionKey(sessionId))?.workingDirectory;
}

function normalizeAuthStatus(record: Record<string, unknown>): "authenticating" | "ready" | "failed" | "needs-auth" | undefined {
  const status = asString(record.status);
  switch (status) {
    case "authenticating":
    case "ready":
    case "failed":
    case "needs-auth":
      return status;
    default:
      break;
  }

  if (record.isAuthenticating === true) {
    return "authenticating";
  }

  if (asString(record.error)) {
    return "failed";
  }

  if (record.isAuthenticating === false || Array.isArray(record.output)) {
    return "ready";
  }

  return;
}

function buildAuthStatusDetail(record: Record<string, unknown>): string | undefined {
  const segments = [
    ...readStringArray(record.output),
    ...toOptionalList(asString(record.error)),
  ].filter((segment) => segment.trim().length > 0);

  if (segments.length > 0) {
    return segments.join("\n");
  }

  return getString(record.detail);
}

function normalizeToolProgressRecord(
  record: Record<string, unknown>,
  session: ClaudeIngestSession,
): AgentEvent | undefined {
  const toolCallId = asString(record.tool_use_id);
  if (!toolCallId) {
    return;
  }

  return {
    type: "tool.updated",
    provider: "claude",
    session,
    toolCallId,
    statusText: "in_progress",
    output: compactUnknownRecord({
      elapsedTimeSeconds: asFiniteNumber(record.elapsed_time_seconds) ?? undefined,
    }),
    raw: record,
    extensions: compactUnknownRecord({
      parentToolUseId: asString(record.parent_tool_use_id),
      taskId: asString(record.task_id),
      toolName: asString(record.tool_name),
    }),
  };
}

function normalizeSystemRecord(
  record: Record<string, unknown>,
  session: ClaudeIngestSession,
): AgentEvent[] | null | undefined {
  switch (asString(record.subtype)) {
    case "init":
      return null;
    case "status":
      return [
        {
          type: "status",
          provider: "claude",
          session,
          status: asString(record.status) ?? "idle",
          detail: asString(record.permissionMode),
          raw: record,
        },
      ];
    case "files_persisted": {
      const event = normalizeFilesPersistedRecord(record, session);
      return event ? [event] : undefined;
    }
    case "task_started": {
      const event = normalizeTaskStartedRecord(record, session);
      return event ? [event] : undefined;
    }
    case "task_progress": {
      const event = normalizeTaskProgressRecord(record, session);
      return event ? [event] : undefined;
    }
    case "task_notification": {
      const event = normalizeTaskNotificationRecord(record, session);
      return event ? [event] : undefined;
    }
    default:
      return;
  }
}

function normalizeFilesPersistedRecord(
  record: Record<string, unknown>,
  session: ClaudeIngestSession,
): AgentEvent | undefined {
  const changes = Array.isArray(record.files)
    ? record.files.flatMap((file) => {
        if (!isRecord(file)) {
          return [];
        }

        const path = asString(file.filename);
        return path ? [{ path, changeType: "update" as const }] : [];
      })
    : [];
  const failed = Array.isArray(record.failed)
    ? record.failed.flatMap((file) => {
        if (!isRecord(file)) {
          return [];
        }

        const path = asString(file.filename);
        if (!path) {
          return [];
        }

        return [{
          path,
          error: asString(file.error),
        }];
      })
    : [];

  if (changes.length === 0 && failed.length === 0) {
    return;
  }

  return {
    type: "file.changed",
    provider: "claude",
    session,
    changes,
    outcome: failed.length > 0 ? "error" : "success",
    raw: record,
    extensions: failed.length > 0 ? { failed } : undefined,
  };
}

function normalizeTaskStartedRecord(
  record: Record<string, unknown>,
  session: ClaudeIngestSession,
): AgentEvent | undefined {
  const toolCallId = getTaskToolCallId(record);
  if (!toolCallId) {
    return;
  }

  return {
    type: "tool.started",
    provider: "claude",
    session,
    toolCallId,
    toolName: asString(record.task_type) ?? "task",
    kind: "custom",
    input: compactUnknownRecord({
      description: asString(record.description),
      prompt: asString(record.prompt),
    }),
    raw: record,
    extensions: compactUnknownRecord({
      taskId: asString(record.task_id),
    }),
  };
}

function normalizeTaskProgressRecord(
  record: Record<string, unknown>,
  session: ClaudeIngestSession,
): AgentEvent | undefined {
  const toolCallId = getTaskToolCallId(record);
  if (!toolCallId) {
    return;
  }

  return {
    type: "tool.updated",
    provider: "claude",
    session,
    toolCallId,
    statusText: asString(record.description),
    output: compactUnknownRecord({
      usage: isRecord(record.usage) ? record.usage : undefined,
      lastToolName: asString(record.last_tool_name),
    }),
    raw: record,
    extensions: compactUnknownRecord({
      taskId: asString(record.task_id),
    }),
  };
}

function normalizeTaskNotificationRecord(
  record: Record<string, unknown>,
  session: ClaudeIngestSession,
): AgentEvent | undefined {
  const toolCallId = getTaskToolCallId(record);
  if (!toolCallId) {
    return;
  }

  return {
    type: "tool.completed",
    provider: "claude",
    session,
    toolCallId,
    toolName: "task",
    kind: "custom",
    outcome: normalizeTaskNotificationOutcome(record),
    output: compactUnknownRecord({
      summary: asString(record.summary),
      outputFile: asString(record.output_file),
      usage: isRecord(record.usage) ? record.usage : undefined,
    }),
    raw: record,
    extensions: compactUnknownRecord({
      taskId: asString(record.task_id),
    }),
  };
}

function normalizeTaskNotificationOutcome(
  record: Record<string, unknown>,
): "success" | "error" | "cancelled" {
  switch (asString(record.status)) {
    case "completed":
      return "success";
    case "stopped":
      return "cancelled";
    default:
      return "error";
  }
}

function getTaskToolCallId(record: Record<string, unknown>): string | undefined {
  return asString(record.tool_use_id) ?? asString(record.task_id);
}

function createClaudeResultError(record: Record<string, unknown>): AgentError {
  const errors = Array.isArray(record.errors)
    ? record.errors.filter(isString).join("\n").trim()
    : "";

  const permissionDenials = Array.isArray(record.permission_denials)
    ? record.permission_denials
    : [];

  const subtype = record.subtype;
  const code: AgentError["code"] = subtype === "error_max_structured_output_retries"
    ? "structured_output_invalid"
    : permissionDenials.length > 0 ? "permission_denied" : "provider_failure";

  return new AgentError({
    code,
    provider: "claude",
    message: errors || "Claude returned a result error.",
    details: {
      subtype,
      permissionDenials,
    },
    raw: record,
  });
}

function resolveClaudeResultText(
  record: Record<string, unknown>,
  assistantText?: string,
): string {
  const resultText = asString(record.result);

  if (resultText && resultText.trim().length > 0) {
    return resultText;
  }

  if (assistantText && assistantText.length > 0) {
    return assistantText;
  }

  if (record.structured_output === undefined) {
    return "";
  }

  return stringifyStructuredOutput(record.structured_output);
}

function stringifyStructuredOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseUsage(
  usageRecord: unknown,
  resultRecord?: Record<string, unknown>,
): AgentUsage | null {
  const usage = readUsageNumbers(usageRecord);
  if (!usage) {
    return null;
  }

  const costUsd = resultRecord ? asFiniteNumber(resultRecord.total_cost_usd) : null;
  const modelUsage = resultRecord && isRecord(resultRecord.modelUsage)
    ? resultRecord.modelUsage
    : undefined;

  return {
    tokens: {
      input: asFiniteNumber(usage.input_tokens) ?? 0,
      output: asFiniteNumber(usage.output_tokens) ?? 0,
      cachedInput: asFiniteNumber(usage.cache_read_input_tokens) ?? undefined,
    },
    costUsd: costUsd ?? undefined,
    providerUsage: {
      cacheCreationInputTokens: asFiniteNumber(usage.cache_creation_input_tokens),
      serviceTier: asString(usage.service_tier),
      modelUsage,
    },
  };
}

function readUsageNumbers(record: unknown): Record<string, unknown> | null {
  if (!isRecord(record)) {
    return null;
  }

  if (
    record.input_tokens === undefined &&
    record.output_tokens === undefined &&
    record.cache_read_input_tokens === undefined &&
    record.cache_creation_input_tokens === undefined
  ) {
    return null;
  }

  return record;
}

function extractMessageText(message: unknown): string {
  if (!isRecord(message)) {
    return "";
  }

  if (isString(message.content)) {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return "";
  }

  const contentBlocks = message.content;
  const segments: string[] = [];
  for (const block of contentBlocks) {
    if (!isRecord(block)) {
      continue;
    }

    if (block.type === "text" && typeof block.text === "string") {
      segments.push(block.text);
    }
  }

  return segments.join("");
}

function extractSessionId(record: Record<string, unknown>): string | undefined {
  return asString(record.session_id) ?? asString(record.sessionId);
}

function getContextSessionKey(sessionId: string | undefined): string {
  return sessionId ?? DEFAULT_CONTEXT_SESSION_KEY;
}

function setLatestAssistantText(
  context: ClaudeArtifactNormalizationContext | undefined,
  sessionKey: string,
  text: string,
): void {
  updateSessionState(context, sessionKey, {
    latestAssistantText: text,
  });
}

function consumeLatestAssistantText(
  context: ClaudeArtifactNormalizationContext | undefined,
  sessionKey: string,
): string | undefined {
  const latestAssistantText = getSessionState(context, sessionKey)?.latestAssistantText;
  clearLatestAssistantText(context, sessionKey);
  return latestAssistantText;
}

function clearLatestAssistantText(
  context: ClaudeArtifactNormalizationContext | undefined,
  sessionKey: string,
): void {
  updateSessionState(context, sessionKey, {
    latestAssistantText: undefined,
  });
}

function setWorkingDirectory(
  context: ClaudeArtifactNormalizationContext | undefined,
  sessionKey: string,
  workingDirectory: string,
): void {
  updateSessionState(context, sessionKey, {
    workingDirectory,
  });
}

function updateSessionState(
  context: ClaudeArtifactNormalizationContext | undefined,
  sessionKey: string,
  patch: ClaudeArtifactNormalizationSessionState,
): void {
  if (!context) {
    return;
  }

  const state = {
    ...getSessionState(context, sessionKey),
    ...patch,
  };

  if (!state.latestAssistantText && !state.workingDirectory) {
    context.sessions.delete(sessionKey);
    return;
  }

  context.sessions.set(sessionKey, state);
}

function parsePersistedSessionState(
  value: unknown,
): ClaudeArtifactNormalizationSessionState | undefined {
  if (isString(value)) {
    return {
      latestAssistantText: value,
    };
  }

  if (!isRecord(value)) {
    return;
  }

  const state = compactUnknownRecord({
    latestAssistantText: asString(value.latestAssistantText),
    workingDirectory: asString(value.workingDirectory),
  });

  return state;
}

function serializeSessionState(
  state: ClaudeArtifactNormalizationSessionState,
): string | Record<string, unknown> | undefined {
  if (state.latestAssistantText && !state.workingDirectory) {
    return state.latestAssistantText;
  }

  return compactUnknownRecord({
    latestAssistantText: state.latestAssistantText,
    workingDirectory: state.workingDirectory,
  });
}

function getSessionState(
  context: ClaudeArtifactNormalizationContext | undefined,
  sessionKey: string,
): ClaudeArtifactNormalizationSessionState | undefined {
  return context?.sessions.get(sessionKey);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function asString(value: unknown): string | undefined {
  return isString(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return asString(value);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isString) : [];
}

function toOptionalList<T>(value: T | undefined): T[] {
  return value === undefined ? [] : [value];
}

function compactUnknownRecord(
  value: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}
