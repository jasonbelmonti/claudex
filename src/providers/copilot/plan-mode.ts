import type { ExecutionMode } from "../../core/session.js";
import type {
  CopilotAutoModeSwitchHandler,
  CopilotExitPlanModeHandler,
  CopilotMessageOptions,
} from "./types.js";

const PLAN_EXIT_FEEDBACK =
  'claudex executionMode "plan" does not permit Copilot to enter an implementation mode.';

export function mapCopilotAgentMode(
  executionMode?: ExecutionMode,
): CopilotMessageOptions["agentMode"] | undefined {
  return executionMode === "plan" ? "plan" : undefined;
}

export function deriveCopilotExitPlanModeHandler(params: {
  executionMode?: ExecutionMode;
  providerHandler?: CopilotExitPlanModeHandler;
}): CopilotExitPlanModeHandler | undefined {
  return params.executionMode === "plan"
    ? denyCopilotExitPlanMode
    : params.providerHandler;
}

export function deriveCopilotAutoModeSwitchHandler(params: {
  executionMode?: ExecutionMode;
  providerHandler?: CopilotAutoModeSwitchHandler;
}): CopilotAutoModeSwitchHandler | undefined {
  return params.executionMode === "plan"
    ? denyCopilotAutoModeSwitch
    : params.providerHandler;
}

export const denyCopilotAutoModeSwitch: CopilotAutoModeSwitchHandler = () =>
  "no";

export const denyCopilotExitPlanMode: CopilotExitPlanModeHandler = () => ({
  approved: false,
  feedback: PLAN_EXIT_FEEDBACK,
});
