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
  authStatusError?: unknown;
  createSessions?: CopilotSessionLike[];
  models?: CopilotModelInfo[];
  resumeSessions?: Record<string, CopilotSessionLike>;
  sessions?: CopilotSessionMetadata[];
  startError?: unknown;
  status?: CopilotStatus;
  statusError?: unknown;
  stopErrors?: Error[];
  stopThrowError?: unknown;
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
  private readonly authStatusError: unknown;
  private readonly createSessions: CopilotSessionLike[];
  private readonly models: CopilotModelInfo[];
  private readonly resumeSessions: Record<string, CopilotSessionLike>;
  private readonly sessions: CopilotSessionMetadata[];
  private readonly startError: unknown;
  private readonly status: CopilotStatus;
  private readonly statusError: unknown;
  private readonly stopErrors: Error[];
  private readonly stopThrowError: unknown;

  constructor({
    authStatus = {
      authType: "user",
      isAuthenticated: true,
      login: "fake-user",
    },
    authStatusError,
    createSessions = [],
    models = [],
    resumeSessions = {},
    sessions = [],
    startError,
    status = {
      protocolVersion: 3,
      version: "fake-copilot-runtime",
    },
    statusError,
    stopErrors = [],
    stopThrowError,
  }: FakeCopilotClientOptions = {}) {
    this.authStatus = authStatus;
    this.authStatusError = authStatusError;
    this.createSessions = createSessions;
    this.models = models;
    this.resumeSessions = resumeSessions;
    this.sessions = sessions;
    this.startError = startError;
    this.status = status;
    this.statusError = statusError;
    this.stopErrors = stopErrors;
    this.stopThrowError = stopThrowError;
  }

  async start() {
    this.startCallCount += 1;

    if (this.startError) {
      throw this.startError;
    }
  }

  async stop() {
    this.stopCallCount += 1;

    if (this.stopThrowError) {
      throw this.stopThrowError;
    }

    return [...this.stopErrors];
  }

  async forceStop() {
    this.forceStopCallCount += 1;
  }

  async getStatus() {
    if (this.statusError) {
      throw this.statusError;
    }

    return this.status;
  }

  async getAuthStatus() {
    if (this.authStatusError) {
      throw this.authStatusError;
    }

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
