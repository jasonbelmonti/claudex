import type {
  AccountInfo,
  Options as ClaudeSdkOptions,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type {
  ClaudeQueryFactory,
  ClaudeQueryLike,
} from "../../../src/providers/claude/types";

const DEFAULT_ACCOUNT: AccountInfo = {
  email: "claude@example.com",
  organization: "Test Org",
  tokenSource: "none",
  apiKeySource: "/login managed key",
};

export class FakeClaudeQuery implements ClaudeQueryLike {
  closed = false;

  constructor(
    private readonly messages: SDKMessage[] = [],
    private readonly initialization: {
      account: AccountInfo;
      commands: unknown[];
      models: unknown[];
    } = {
      account: DEFAULT_ACCOUNT,
      commands: [],
      models: [],
    },
    private readonly account: AccountInfo = DEFAULT_ACCOUNT,
    private readonly initializationError?: unknown,
    private readonly accountError?: unknown,
    private readonly streamError?: unknown,
  ) {}

  async initializationResult() {
    if (this.initializationError) {
      throw this.initializationError;
    }

    return this.initialization;
  }

  async accountInfo() {
    if (this.accountError) {
      throw this.accountError;
    }

    return this.account;
  }

  close(): void {
    this.closed = true;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<SDKMessage> {
    for (const message of this.messages) {
      yield message;
    }

    if (this.streamError) {
      throw this.streamError;
    }
  }
}

export class FakeClaudeQueryFactory {
  readonly invocations: Array<{
    prompt: string;
    options: ClaudeSdkOptions;
  }> = [];

  constructor(private readonly queuedQueries: Array<ClaudeQueryLike | Error>) {}

  create: ClaudeQueryFactory = (params) => {
    this.invocations.push(params);
    const nextQuery = this.queuedQueries.shift();

    if (!nextQuery) {
      throw new Error("No fake Claude query configured.");
    }

    if (nextQuery instanceof Error) {
      throw nextQuery;
    }

    return nextQuery;
  };
}
