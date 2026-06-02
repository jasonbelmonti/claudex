import type {
  CopilotAssistantMessageEvent,
  CopilotSessionEvent,
} from "../../../src/providers/copilot/types.js";

type FakeCopilotEventMetadata = {
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

const defaultTimestamp = "2026-05-31T00:00:00.000Z";

const createEventMetadata = ({
  id = "fake-event",
  parentId = null,
  timestamp = defaultTimestamp,
}: FakeCopilotEventMetadata = {}) => ({
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
  ...createEventMetadata({ id, parentId, timestamp }),
  type: "model.call_failure",
  ephemeral: true,
  data: {
    errorMessage,
    model,
    source,
    statusCode,
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
