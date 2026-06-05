import type { AgentEvent, ApprovalScope } from "../../core/events.js";
import type { SessionReference } from "../../core/session.js";
import type { CopilotSessionEvent } from "./types.js";

type CopilotPermissionRequestedEvent = Extract<
  CopilotSessionEvent,
  { type: "permission.requested" }
>;
type CopilotPermissionCompletedEvent = Extract<
  CopilotSessionEvent,
  { type: "permission.completed" }
>;
type CopilotPermissionRequest =
  CopilotPermissionRequestedEvent["data"]["permissionRequest"];
type CopilotPermissionPromptRequest = NonNullable<
  CopilotPermissionRequestedEvent["data"]["promptRequest"]
>;
type CopilotPermissionResult = CopilotPermissionCompletedEvent["data"]["result"];

export function mapCopilotPermissionRequestedEvent(
  event: CopilotPermissionRequestedEvent,
  session: SessionReference | null,
): AgentEvent {
  const { permissionRequest, promptRequest } = event.data;

  return {
    type: "approval.requested",
    provider: "copilot",
    session,
    timestamp: event.timestamp,
    approvalId: event.data.requestId,
    actionLabel: describePermissionAction(permissionRequest),
    scope: mapPermissionScope(permissionRequest.kind),
    reason: getPermissionReason(permissionRequest, promptRequest),
    extensions: compactRecord({
      permissionKind: permissionRequest.kind,
      promptKind: promptRequest?.kind,
      resolvedByHook: event.data.resolvedByHook,
      ...getPermissionRequestExtensions(permissionRequest, promptRequest),
    }),
  };
}

export function mapCopilotPermissionCompletedEvent(
  event: CopilotPermissionCompletedEvent,
  session: SessionReference | null,
): AgentEvent {
  return {
    type: "approval.resolved",
    provider: "copilot",
    session,
    timestamp: event.timestamp,
    approvalId: event.data.requestId,
    outcome: mapPermissionOutcome(event.data.result),
    reason: getPermissionResultReason(event.data.result),
    extensions: compactRecord({
      resultKind: event.data.result.kind,
      toolCallId: event.data.toolCallId,
      ...getPermissionResultExtensions(event.data.result),
    }),
  };
}

function describePermissionAction(request: CopilotPermissionRequest): string {
  switch (request.kind) {
    case "shell":
      return "Run shell command";
    case "write":
      return `Modify ${request.fileName}`;
    case "read":
      return `Read ${request.path}`;
    case "mcp":
      return `Use MCP tool ${request.toolTitle}`;
    case "url":
      return `Access ${request.url}`;
    case "memory":
      return "Update memory";
    case "custom-tool":
      return `Use ${request.toolName}`;
    case "hook":
      return `Confirm hook for ${request.toolName}`;
    case "extension-management":
      return request.extensionName
        ? `Manage ${request.extensionName}`
        : "Manage extension";
    case "extension-permission-access":
      return `Grant permissions to ${request.extensionName}`;
  }
}

function mapPermissionScope(kind: CopilotPermissionRequest["kind"]): ApprovalScope {
  switch (kind) {
    case "shell":
      return "command";
    case "read":
    case "write":
      return "file";
    case "url":
      return "network";
    case "custom-tool":
    case "extension-management":
    case "extension-permission-access":
    case "hook":
    case "mcp":
    case "memory":
      return "tool";
  }
}

function getPermissionReason(
  request: CopilotPermissionRequest,
  prompt: CopilotPermissionPromptRequest | undefined,
): string | undefined {
  return (
    getIntention(prompt) ??
    getIntention(request) ??
    getWarning(prompt) ??
    getWarning(request)
  );
}

function getIntention(
  value: CopilotPermissionRequest | CopilotPermissionPromptRequest | undefined,
): string | undefined {
  return value && "intention" in value ? value.intention : undefined;
}

function getWarning(
  value: CopilotPermissionRequest | CopilotPermissionPromptRequest | undefined,
): string | undefined {
  return value && "warning" in value ? value.warning : undefined;
}

function getPermissionRequestExtensions(
  request: CopilotPermissionRequest,
  prompt: CopilotPermissionPromptRequest | undefined,
): Record<string, unknown> {
  const toolCallId = getToolCallId(prompt) ?? getToolCallId(request);

  switch (request.kind) {
    case "shell":
      return compactRecord({
        toolCallId,
        commandIdentifiers: request.commands.map((command) => command.identifier),
        canOfferSessionApproval: request.canOfferSessionApproval,
      });
    case "write":
      return compactRecord({
        toolCallId,
        fileName: request.fileName,
        canOfferSessionApproval: request.canOfferSessionApproval,
      });
    case "read":
      return compactRecord({
        toolCallId,
        path: request.path,
      });
    case "mcp":
      return compactRecord({
        toolCallId,
        serverName: request.serverName,
        toolName: request.toolName,
        toolTitle: request.toolTitle,
      });
    case "url":
      return compactRecord({
        toolCallId,
        url: request.url,
      });
    case "memory":
      return compactRecord({
        toolCallId,
        action: request.action,
        direction: request.direction,
        subject: request.subject,
      });
    case "custom-tool":
      return compactRecord({
        toolCallId,
        toolName: request.toolName,
      });
    case "hook":
      return compactRecord({
        toolCallId,
        toolName: request.toolName,
      });
    case "extension-management":
      return compactRecord({
        toolCallId,
        extensionName: request.extensionName,
        operation: request.operation,
      });
    case "extension-permission-access":
      return compactRecord({
        toolCallId,
        extensionName: request.extensionName,
        capabilities: request.capabilities,
      });
  }
}

function getToolCallId(
  value: CopilotPermissionRequest | CopilotPermissionPromptRequest | undefined,
): string | undefined {
  return value && "toolCallId" in value ? value.toolCallId : undefined;
}

function mapPermissionOutcome(
  result: CopilotPermissionResult,
): Extract<AgentEvent, { type: "approval.resolved" }>["outcome"] {
  switch (result.kind) {
    case "approved":
    case "approved-for-location":
    case "approved-for-session":
      return "approved";
    case "cancelled":
      return "cancelled";
    default:
      return "denied";
  }
}

function getPermissionResultReason(
  result: CopilotPermissionResult,
): string | undefined {
  switch (result.kind) {
    case "cancelled":
      return result.reason;
    case "denied-by-content-exclusion-policy":
      return result.message;
    case "denied-by-permission-request-hook":
      return result.message;
    case "denied-interactively-by-user":
      return result.feedback;
    default:
      return undefined;
  }
}

function getPermissionResultExtensions(
  result: CopilotPermissionResult,
): Record<string, unknown> {
  switch (result.kind) {
    case "approved-for-location":
      return {
        approvalKind: result.approval.kind,
        locationKey: result.locationKey,
      };
    case "approved-for-session":
      return {
        approvalKind: result.approval.kind,
      };
    case "denied-interactively-by-user":
      return compactRecord({
        forceReject: result.forceReject,
      });
    case "denied-by-permission-request-hook":
      return compactRecord({
        interrupt: result.interrupt,
      });
    default:
      return {};
  }
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}
