import type { ProviderCapabilities } from "./capabilities";
import type { AgentEvent } from "./events";
import type { TurnInput, TurnOptions } from "./input";
import type { ProviderId } from "./provider";
import type { TurnResult } from "./results";

export type SessionReference = {
  provider: ProviderId;
  sessionId: string;
};

export type ExecutionMode = "plan" | "act";

export type ApprovalMode = "interactive" | "auto-approve-safe" | "deny";

export type SandboxProfile = "read-only" | "workspace-write" | "full-access";

export type ResumeStrategy = "continue" | "fork";

export type SessionOptions = {
  model?: string;
  instructions?: string;
  workingDirectory?: string;
  additionalDirectories?: string[];
  executionMode?: ExecutionMode;
  approvalMode?: ApprovalMode;
  sandboxProfile?: SandboxProfile;
  resumeStrategy?: ResumeStrategy;
  metadata?: Record<string, unknown>;
  providerOptions?: Record<string, unknown>;
};

export interface AgentSession {
  readonly provider: ProviderId;
  readonly capabilities: ProviderCapabilities;
  readonly reference: SessionReference | null;

  run(input: TurnInput, options?: TurnOptions): Promise<TurnResult>;
  runStreamed(input: TurnInput, options?: TurnOptions): AsyncGenerator<AgentEvent>;
  fork(options?: SessionOptions): Promise<AgentSession>;
}
