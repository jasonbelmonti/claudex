import type {
  AccountInfo,
  Options as ClaudeSdkOptions,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { SessionReference, SessionOptions } from "../../core/session";

export type ClaudeQueryLike = AsyncIterable<SDKMessage> & {
  close(): void;
  initializationResult(): Promise<{
    account: AccountInfo;
    commands: unknown[];
    models: unknown[];
  }>;
  accountInfo(): Promise<AccountInfo>;
};

export type ClaudeQueryFactory = (params: {
  prompt: string;
  options: ClaudeSdkOptions;
}) => ClaudeQueryLike;

export type ClaudeSessionProviderOptions = {
  options?: Partial<ClaudeSdkOptions>;
};

export type ClaudeTurnProviderOptions = {
  options?: Partial<ClaudeSdkOptions>;
};

export type ClaudeAdapterOptions = {
  queryFactory?: ClaudeQueryFactory;
  sdkOptions?: Partial<ClaudeSdkOptions>;
};

export type ClaudeSessionState = {
  currentReference: SessionReference | null;
  nextResumeSessionId: string | null;
  forkOnNextRun: boolean;
  baseSessionOptions: SessionOptions;
  adapterSdkOptions?: Partial<ClaudeSdkOptions>;
  baseQueryOptions: Partial<ClaudeSdkOptions>;
};
