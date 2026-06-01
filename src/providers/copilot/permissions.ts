import { AgentError } from "../../core/errors.js";
import type { ApprovalMode } from "../../core/session.js";
import type {
  CopilotPermissionHandler,
  CopilotPermissionRequest,
  CopilotPermissionRequestResult,
} from "./types.js";

const DENY_FEEDBACK =
  'claudex approvalMode "deny" rejects Copilot permission requests.';
const AUTO_APPROVE_REJECT_FEEDBACK =
  'claudex approvalMode "auto-approve-safe" rejects Copilot permission requests that are not read-only.';

export function deriveCopilotPermissionHandler(params: {
  approvalMode?: ApprovalMode;
  providerHandler?: CopilotPermissionHandler;
}): CopilotPermissionHandler | undefined {
  switch (params.approvalMode) {
    case "deny":
      return denyCopilotPermissionRequest;
    case "auto-approve-safe":
      return autoApproveSafeCopilotPermissionRequest;
    case "interactive":
      if (params.providerHandler) {
        return params.providerHandler;
      }

      throw new AgentError({
        code: "unsupported_feature",
        provider: "copilot",
        message:
          "Copilot interactive approval mode requires providerOptions.copilot.sessionConfig.onPermissionRequest until claudex exposes a normalized approval response API.",
      });
    default:
      return params.providerHandler;
  }
}

export const denyCopilotPermissionRequest: CopilotPermissionHandler = () =>
  rejectPermission(DENY_FEEDBACK);

export const autoApproveSafeCopilotPermissionRequest: CopilotPermissionHandler = (
  request,
) =>
  isSafeAutoApprovedPermissionRequest(request)
    ? { kind: "approve-once" }
    : rejectPermission(AUTO_APPROVE_REJECT_FEEDBACK);

export function isSafeAutoApprovedPermissionRequest(
  request: CopilotPermissionRequest,
): boolean {
  switch (request.kind) {
    case "read":
      return true;
    case "mcp":
      return request.readOnly;
    case "shell":
      return (
        request.commands.length > 0 &&
        request.commands.every((command) => command.readOnly) &&
        !request.hasWriteFileRedirection &&
        request.possibleUrls.length === 0
      );
    default:
      return false;
  }
}

function rejectPermission(feedback: string): CopilotPermissionRequestResult {
  return {
    kind: "reject",
    feedback,
  };
}
