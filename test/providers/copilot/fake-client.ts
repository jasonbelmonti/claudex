import type {
  CopilotAuthStatus,
  CopilotClientLike,
  CopilotModelInfo,
  CopilotResumeSessionConfig,
  CopilotSessionConfig,
  CopilotSessionLike,
  CopilotSessionListFilter,
  CopilotSessionMetadata,
  CopilotStatus,
} from "../../../src/providers/copilot/types.js";

export type FakeCopilotClientOptions = {
  authStatus?: CopilotAuthStatus;
  createSessions?: CopilotSessionLike[];
  models?: CopilotModelInfo[];
  resumeSessions?: Record<string, CopilotSessionLike>;
  sessions?: CopilotSessionMetadata[];
  status?: CopilotStatus;
  stopErrors?: Error[];
};

export class FakeCopilotClient implements CopilotClientLike {
  startCallCount = 0;
  stopCallCount = 0;
  forceStopCallCount = 0;
  lastCreateSessionConfig?: CopilotSessionConfig;
  lastResumeSessionId?: string;
  lastResumeSessionConfig?: CopilotResumeSessionConfig;
  lastListSessionsFilter?: CopilotSessionListFilter;

  private readonly authStatus: CopilotAuthStatus;
  private readonly createSessions: CopilotSessionLike[];
  private readonly models: CopilotModelInfo[];
  private readonly resumeSessions: Record<string, CopilotSessionLike>;
  private readonly sessions: CopilotSessionMetadata[];
  private readonly status: CopilotStatus;
  private readonly stopErrors: Error[];

  constructor({
    authStatus = {
      authType: "user",
      isAuthenticated: true,
      login: "fake-user",
    },
    createSessions = [],
    models = [],
    resumeSessions = {},
    sessions = [],
    status = {
      protocolVersion: 3,
      version: "fake-copilot-runtime",
    },
    stopErrors = [],
  }: FakeCopilotClientOptions = {}) {
    this.authStatus = authStatus;
    this.createSessions = createSessions;
    this.models = models;
    this.resumeSessions = resumeSessions;
    this.sessions = sessions;
    this.status = status;
    this.stopErrors = stopErrors;
  }

  async start() {
    this.startCallCount += 1;
  }

  async stop() {
    this.stopCallCount += 1;
    return [...this.stopErrors];
  }

  async forceStop() {
    this.forceStopCallCount += 1;
  }

  async getStatus() {
    return this.status;
  }

  async getAuthStatus() {
    return this.authStatus;
  }

  async listModels() {
    return [...this.models];
  }

  async listSessions(filter: CopilotSessionListFilter = {}) {
    this.lastListSessionsFilter = filter;
    return [...this.sessions];
  }

  async createSession(config: CopilotSessionConfig) {
    this.lastCreateSessionConfig = config;
    const session = this.createSessions.shift();

    if (!session) {
      throw new Error("No fake Copilot create session configured.");
    }

    return session;
  }

  async resumeSession(
    sessionId: string,
    config: CopilotResumeSessionConfig,
  ) {
    this.lastResumeSessionId = sessionId;
    this.lastResumeSessionConfig = config;
    const session = this.resumeSessions[sessionId];

    if (!session) {
      throw new Error(
        `No fake Copilot resume session configured for ${sessionId}.`,
      );
    }

    return session;
  }
}
