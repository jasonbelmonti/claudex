import type { AgentEvent, FileChange } from "../../core/events.js";
import type { SessionReference } from "../../core/session.js";
import type { CopilotSessionEvent } from "./types.js";

type CopilotWorkspaceFileChangedEvent = Extract<
  CopilotSessionEvent,
  { type: "session.workspace_file_changed" }
>;

export function mapCopilotWorkspaceFileChangedEvent(
  event: CopilotWorkspaceFileChangedEvent,
  session: SessionReference | null,
): AgentEvent {
  return {
    type: "file.changed",
    provider: "copilot",
    session,
    timestamp: event.timestamp,
    changes: [
      {
        path: event.data.path,
        changeType: mapCopilotFileChangeType(event.data.operation),
      },
    ],
    outcome: "success",
    extensions: {
      source: "session.workspace",
      operation: event.data.operation,
    },
  };
}

function mapCopilotFileChangeType(
  operation: CopilotWorkspaceFileChangedEvent["data"]["operation"],
): FileChange["changeType"] {
  return operation === "create" ? "add" : "update";
}
