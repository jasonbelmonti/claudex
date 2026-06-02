import type {
  CopilotAssistantMessageEvent,
  CopilotSessionEvent,
} from "../../../src/providers/copilot/types.js";

type FakeCopilotEventMetadata = {
  agentId?: string;
  id?: string;
  parentId?: string | null;
  timestamp?: string;
};

type FakeCopilotSessionStartEvent = Extract<
  CopilotSessionEvent,
  { type: "session.start" }
>;

type FakeCopilotIdleEvent = Extract<
  CopilotSessionEvent,
  { type: "session.idle" }
>;
type FakeCopilotAssistantMessageDeltaEvent = Extract<
  CopilotSessionEvent,
  { type: "assistant.message_delta" }
>;
type FakeCopilotAssistantUsageEvent = Extract<
  CopilotSessionEvent,
  { type: "assistant.usage" }
>;
type FakeCopilotSessionErrorEvent = Extract<
  CopilotSessionEvent,
  { type: "session.error" }
>;
type FakeCopilotModelCallFailureEvent = Extract<
  CopilotSessionEvent,
  { type: "model.call_failure" }
>;
type FakeCopilotToolExecutionStartEvent = Extract<
  CopilotSessionEvent,
  { type: "tool.execution_start" }
>;
type FakeCopilotToolExecutionCompleteEvent = Extract<
  CopilotSessionEvent,
  { type: "tool.execution_complete" }
>;

const defaultTimestamp = "2026-05-31T00:00:00.000Z";

const createEventMetadata = ({
  agentId,
  id = "fake-event",
  parentId = null,
  timestamp = defaultTimestamp,
}: FakeCopilotEventMetadata = {}) => ({
  ...(agentId === undefined ? {} : { agentId }),
  id,
  parentId,
  timestamp,
});

export const createCopilotSessionStartEvent = ({
  sessionId = "fake-copilot-session",
  copilotVersion = "fake-copilot-runtime",
  id = "fake-session-start",
  parentId = null,
  producer = "fake-copilot",
  startTime = defaultTimestamp,
  timestamp = defaultTimestamp,
}: FakeCopilotEventMetadata & {
  sessionId?: string;
  copilotVersion?: string;
  producer?: string;
  startTime?: string;
} = {}): FakeCopilotSessionStartEvent => ({
  ...createEventMetadata({ id, parentId, timestamp }),
  type: "session.start",
  data: {
    copilotVersion,
    producer,
    sessionId,
    startTime,
    version: 1,
  },
});

export const createCopilotAssistantMessageEvent = ({
  content = "fake response",
  id = "fake-assistant-message",
  messageId = "fake-message",
  model,
  parentId = null,
  timestamp = defaultTimestamp,
}: FakeCopilotEventMetadata & {
  content?: string;
  messageId?: string;
  model?: string;
} = {}): CopilotAssistantMessageEvent => ({
  ...createEventMetadata({ id, parentId, timestamp }),
  type: "assistant.message",
  data: {
    content,
    messageId,
    ...(model ? { model } : {}),
  },
});

export const createCopilotAssistantMessageDeltaEvent = ({
  deltaContent = "fake ",
  id = "fake-assistant-message-delta",
  messageId = "fake-message",
  parentId = null,
  timestamp = defaultTimestamp,
}: FakeCopilotEventMetadata & {
  deltaContent?: string;
  messageId?: string;
} = {}): FakeCopilotAssistantMessageDeltaEvent => ({
  ...createEventMetadata({ id, parentId, timestamp }),
  type: "assistant.message_delta",
  ephemeral: true,
  data: {
    deltaContent,
    messageId,
  },
});

export const createCopilotUsageEvent = ({
  cacheReadTokens = 0,
  cacheWriteTokens,
  cost,
  id = "fake-assistant-usage",
  inputTokens = 4,
  model = "fake-copilot-model",
  outputTokens = 2,
  parentId = null,
  timestamp = defaultTimestamp,
}: FakeCopilotEventMetadata & {
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cost?: number;
  inputTokens?: number;
  model?: string;
  outputTokens?: number;
} = {}): FakeCopilotAssistantUsageEvent => ({
  ...createEventMetadata({ id, parentId, timestamp }),
  type: "assistant.usage",
  ephemeral: true,
  data: {
    cacheReadTokens,
    ...(cacheWriteTokens === undefined ? {} : { cacheWriteTokens }),
    ...(cost === undefined ? {} : { cost }),
    inputTokens,
    model,
    outputTokens,
  },
});

export const createCopilotSessionErrorEvent = ({
  errorType = "query",
  id = "fake-session-error",
  message = "Copilot failed",
  parentId = null,
  timestamp = defaultTimestamp,
}: FakeCopilotEventMetadata & {
  errorType?: string;
  message?: string;
} = {}): FakeCopilotSessionErrorEvent => ({
  ...createEventMetadata({ id, parentId, timestamp }),
  type: "session.error",
  data: {
    errorType,
    message,
  },
});

export const createCopilotModelCallFailureEvent = ({
  agentId,
  errorMessage = "Copilot model call failed",
  id = "fake-model-call-failure",
  model = "fake-copilot-model",
  parentId = null,
  source = "top_level",
  statusCode = 500,
  timestamp = defaultTimestamp,
}: FakeCopilotEventMetadata & {
  errorMessage?: string;
  model?: string;
  source?: FakeCopilotModelCallFailureEvent["data"]["source"];
  statusCode?: number;
} = {}): FakeCopilotModelCallFailureEvent => ({
  ...createEventMetadata({ agentId, id, parentId, timestamp }),
  type: "model.call_failure",
  ephemeral: true,
  data: {
    errorMessage,
    model,
    source,
    statusCode,
  },
});

export const createCopilotToolExecutionStartEvent = ({
  args = {},
  id = "fake-tool-start",
  parentId = null,
  timestamp = defaultTimestamp,
  toolCallId = "fake-tool-call",
  toolName = "run_in_terminal",
  turnId = "fake-turn",
}: FakeCopilotEventMetadata & {
  args?: Record<string, unknown>;
  toolCallId?: string;
  toolName?: string;
  turnId?: string;
} = {}): FakeCopilotToolExecutionStartEvent => ({
  ...createEventMetadata({ id, parentId, timestamp }),
  type: "tool.execution_start",
  data: {
    arguments: args,
    toolCallId,
    toolName,
    turnId,
  },
});

export const createCopilotToolExecutionCompleteEvent = ({
  content = "tool ok",
  error,
  id = "fake-tool-complete",
  parentId = null,
  success = true,
  timestamp = defaultTimestamp,
  toolCallId = "fake-tool-call",
  turnId = "fake-turn",
}: FakeCopilotEventMetadata & {
  content?: string;
  error?: { message: string };
  success?: boolean;
  toolCallId?: string;
  turnId?: string;
} = {}): FakeCopilotToolExecutionCompleteEvent => ({
  ...createEventMetadata({ id, parentId, timestamp }),
  type: "tool.execution_complete",
  data: {
    ...(error === undefined ? {} : { error }),
    result: {
      content,
    },
    success,
    toolCallId,
    turnId,
  },
});

export const createCopilotIdleEvent = ({
  aborted,
  id = "fake-session-idle",
  parentId = null,
  timestamp = defaultTimestamp,
}: FakeCopilotEventMetadata & {
  aborted?: boolean;
} = {}): FakeCopilotIdleEvent => ({
  ...createEventMetadata({ id, parentId, timestamp }),
  type: "session.idle",
  ephemeral: true,
  data: {
    ...(aborted === undefined ? {} : { aborted }),
  },
});
