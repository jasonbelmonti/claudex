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
