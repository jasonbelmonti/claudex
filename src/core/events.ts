import type { AgentError } from "./errors";
import type { TurnInput } from "./input";
import type { ProviderId } from "./provider";
import type { TurnResult } from "./results";
import type { SessionReference } from "./session";

export const AGENT_EVENT_TYPES = [
  "session.started",
  "turn.started",
  "message.delta",
  "message.completed",
  "reasoning.summary",
  "tool.started",
  "tool.updated",
  "tool.completed",
  "file.changed",
  "todo.updated",
  "approval.requested",
  "approval.resolved",
  "status",
  "auth.status",
  "turn.completed",
  "turn.failed",
] as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[number];

export type AgentEventBase<Type extends AgentEventType> = {
  type: Type;
  provider: ProviderId;
  session: SessionReference | null;
  turnId?: string;
  timestamp?: string;
  raw?: unknown;
  extensions?: Record<string, unknown>;
};

export type SessionStartedEvent = AgentEventBase<"session.started"> & {
  reference: SessionReference;
};

export type TurnStartedEvent = AgentEventBase<"turn.started"> & {
  input: TurnInput;
};

export type MessageDeltaEvent = AgentEventBase<"message.delta"> & {
  messageId?: string;
  role: "assistant";
  delta: string;
};

export type MessageCompletedEvent = AgentEventBase<"message.completed"> & {
  messageId?: string;
  role: "assistant";
  text: string;
  structuredOutput?: unknown;
};

export type ReasoningSummaryEvent = AgentEventBase<"reasoning.summary"> & {
  summary: string;
};

export type ToolKind = "command" | "mcp" | "custom" | "unknown";

export type ToolStartedEvent = AgentEventBase<"tool.started"> & {
  toolCallId: string;
  toolName: string;
  kind: ToolKind;
  input?: unknown;
};

export type ToolUpdatedEvent = AgentEventBase<"tool.updated"> & {
  toolCallId: string;
  statusText?: string;
  output?: unknown;
};

export type ToolCompletedEvent = AgentEventBase<"tool.completed"> & {
  toolCallId: string;
  toolName: string;
  kind: ToolKind;
  outcome: "success" | "error" | "cancelled";
  output?: unknown;
  errorMessage?: string;
};

export type FileChange = {
  path: string;
  changeType: "add" | "delete" | "update";
};

export type FileChangedEvent = AgentEventBase<"file.changed"> & {
  changes: FileChange[];
  outcome?: "success" | "error";
};

export type TodoItem = {
  text: string;
  completed: boolean;
};

export type TodoUpdatedEvent = AgentEventBase<"todo.updated"> & {
  items: TodoItem[];
};

export type ApprovalScope = "command" | "file" | "network" | "tool" | "unknown";

export type ApprovalRequestedEvent = AgentEventBase<"approval.requested"> & {
  approvalId: string;
  actionLabel: string;
  scope: ApprovalScope;
  reason?: string;
};

export type ApprovalResolvedEvent = AgentEventBase<"approval.resolved"> & {
  approvalId: string;
  outcome: "approved" | "denied" | "cancelled";
  reason?: string;
};

export type StatusEvent = AgentEventBase<"status"> & {
  status: string;
  detail?: string;
};

export type AuthStatusEvent = AgentEventBase<"auth.status"> & {
  status: "authenticating" | "ready" | "failed" | "needs-auth";
  detail?: string;
};

export type TurnCompletedEvent = AgentEventBase<"turn.completed"> & {
  result: TurnResult;
};

export type TurnFailedEvent = AgentEventBase<"turn.failed"> & {
  error: AgentError;
};

export type AgentEvent =
  | SessionStartedEvent
  | TurnStartedEvent
  | MessageDeltaEvent
  | MessageCompletedEvent
  | ReasoningSummaryEvent
  | ToolStartedEvent
  | ToolUpdatedEvent
  | ToolCompletedEvent
  | FileChangedEvent
  | TodoUpdatedEvent
  | ApprovalRequestedEvent
  | ApprovalResolvedEvent
  | StatusEvent
  | AuthStatusEvent
  | TurnCompletedEvent
  | TurnFailedEvent;
