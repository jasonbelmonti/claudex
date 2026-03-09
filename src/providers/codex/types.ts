import type {
  CodexOptions,
  Input,
  ThreadEvent,
  ThreadOptions,
  TurnOptions as CodexTurnOptions,
} from "@openai/codex-sdk";

export interface CodexThreadLike {
  readonly id: string | null;
  runStreamed(
    input: Input,
    turnOptions?: CodexTurnOptions,
  ): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
}

export interface CodexClientLike {
  startThread(options?: ThreadOptions): CodexThreadLike;
  resumeThread(id: string, options?: ThreadOptions): CodexThreadLike;
}

export type CodexClientFactory = (options: CodexOptions) => CodexClientLike;

export type CodexCommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type CodexCommandRunner = (
  command: string,
  args: string[],
) => Promise<CodexCommandResult>;

export type CodexBinaryResolver = (
  options?: CodexOptions,
) => Promise<string | null>;

export type CodexThreadProviderOptions = {
  threadOptions?: Partial<ThreadOptions>;
};

export type CodexTurnProviderOptions = {
  turnOptions?: Partial<CodexTurnOptions>;
};

export type CodexAdapterOptions = {
  client?: CodexClientLike;
  clientFactory?: CodexClientFactory;
  sdkOptions?: CodexOptions;
  commandRunner?: CodexCommandRunner;
  binaryResolver?: CodexBinaryResolver;
};
