import type {
  Input,
  ThreadEvent,
  ThreadOptions,
  TurnOptions as CodexTurnOptions,
} from "@openai/codex-sdk";

import type {
  CodexClientLike,
  CodexThreadLike,
} from "../../../src/providers/codex/types";

export class FakeCodexThread implements CodexThreadLike {
  id: string | null;
  lastInput?: Input;
  lastTurnOptions?: CodexTurnOptions;

  constructor(
    private readonly runs: ThreadEvent[][],
    initialId: string | null = null,
  ) {
    this.id = initialId;
  }

  async runStreamed(input: Input, turnOptions: CodexTurnOptions = {}) {
    this.lastInput = input;
    this.lastTurnOptions = turnOptions;

    const nextRun = this.runs.shift() ?? [];
    const thread = this;

    return {
      events: (async function* () {
        for (const event of nextRun) {
          if (event.type === "thread.started") {
            thread.id = event.thread_id;
          }

          yield event;
        }
      })(),
    };
  }
}

export class RejectingCodexThread implements CodexThreadLike {
  readonly id: string | null;

  constructor(
    private readonly error: unknown,
    initialId: string | null = null,
  ) {
    this.id = initialId;
  }

  async runStreamed(
    _input: Input,
    _turnOptions: CodexTurnOptions = {},
  ): Promise<never> {
    throw this.error;
  }
}

export class FakeCodexClient implements CodexClientLike {
  lastStartThreadOptions?: ThreadOptions;
  lastResumeThreadId?: string;
  lastResumeThreadOptions?: ThreadOptions;

  constructor(
    private readonly startThreads: CodexThreadLike[] = [],
    private readonly resumeThreads: Record<string, CodexThreadLike> = {},
  ) {}

  startThread(options: ThreadOptions = {}) {
    this.lastStartThreadOptions = options;
    const thread = this.startThreads.shift();

    if (!thread) {
      throw new Error("No fake start thread configured.");
    }

    return thread;
  }

  resumeThread(id: string, options: ThreadOptions = {}) {
    this.lastResumeThreadId = id;
    this.lastResumeThreadOptions = options;
    const thread = this.resumeThreads[id];

    if (!thread) {
      throw new Error(`No fake resume thread configured for ${id}.`);
    }

    return thread;
  }
}
