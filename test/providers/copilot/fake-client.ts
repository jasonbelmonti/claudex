import type {
  CopilotAuthStatus,
  CopilotClientLike,
  CopilotModelInfo,
  CopilotResumeSessionConfig,
  CopilotSessionConfig,
  CopilotSessionEvent,
  CopilotSessionLike,
  CopilotSessionListFilter,
  CopilotSessionMetadata,
  CopilotStatus,
} from "../../../src/providers/copilot/types.js";

export type FakeCopilotClientOptions = {
  authStatus?: CopilotAuthStatus;
  authStatusError?: unknown;
  authStatusNeverResolves?: boolean;
  createSessionEvents?: CopilotSessionEvent[];
  createSessions?: CopilotSessionLike[];
  forceStopNeverResolves?: boolean;
  models?: CopilotModelInfo[];
  resumeSessionEvents?: Record<string, CopilotSessionEvent[]>;
  resumeSessions?: Record<string, CopilotSessionLike>;
  sessions?: CopilotSessionMetadata[];
  startError?: unknown;
  startNeverResolves?: boolean;
  status?: CopilotStatus;
  statusError?: unknown;
  statusNeverResolves?: boolean;
  stopErrors?: Error[];
  stopNeverResolves?: boolean;
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
  private readonly authStatusNeverResolves: boolean;
  private readonly createSessionEvents: CopilotSessionEvent[];
  private readonly createSessions: CopilotSessionLike[];
  private readonly forceStopNeverResolves: boolean;
  private readonly models: CopilotModelInfo[];
  private readonly resumeSessionEvents: Record<string, CopilotSessionEvent[]>;
  private readonly resumeSessions: Record<string, CopilotSessionLike>;
  private readonly sessions: CopilotSessionMetadata[];
  private readonly startError: unknown;
  private readonly startNeverResolves: boolean;
  private readonly status: CopilotStatus;
  private readonly statusError: unknown;
  private readonly statusNeverResolves: boolean;
  private readonly stopErrors: Error[];
  private readonly stopNeverResolves: boolean;
  private readonly stopThrowError: unknown;

  constructor({
    authStatus = {
      authType: "user",
      isAuthenticated: true,
      login: "fake-user",
    },
    authStatusError,
    authStatusNeverResolves = false,
    createSessionEvents = [],
    createSessions = [],
    forceStopNeverResolves = false,
    models = [],
    resumeSessionEvents = {},
    resumeSessions = {},
    sessions = [],
    startError,
    startNeverResolves = false,
    status = {
      protocolVersion: 3,
      version: "fake-copilot-runtime",
    },
    statusError,
    statusNeverResolves = false,
    stopErrors = [],
    stopNeverResolves = false,
    stopThrowError,
  }: FakeCopilotClientOptions = {}) {
    this.authStatus = authStatus;
    this.authStatusError = authStatusError;
    this.authStatusNeverResolves = authStatusNeverResolves;
    this.createSessionEvents = createSessionEvents;
    this.createSessions = createSessions;
    this.forceStopNeverResolves = forceStopNeverResolves;
    this.models = models;
    this.resumeSessionEvents = resumeSessionEvents;
    this.resumeSessions = resumeSessions;
    this.sessions = sessions;
    this.startError = startError;
    this.startNeverResolves = startNeverResolves;
    this.status = status;
    this.statusError = statusError;
    this.statusNeverResolves = statusNeverResolves;
    this.stopErrors = stopErrors;
    this.stopNeverResolves = stopNeverResolves;
    this.stopThrowError = stopThrowError;
  }

  async start() {
    this.startCallCount += 1;

    if (this.startError) {
      throw this.startError;
    }

    if (this.startNeverResolves) {
      return new Promise<void>(() => {});
    }
  }

  async stop() {
    this.stopCallCount += 1;

    if (this.stopThrowError) {
      throw this.stopThrowError;
    }

    if (this.stopNeverResolves) {
      return new Promise<Error[]>(() => {});
    }

    return [...this.stopErrors];
  }

  async forceStop() {
    this.forceStopCallCount += 1;

    if (this.forceStopNeverResolves) {
      return new Promise<void>(() => {});
    }
  }

  async getStatus() {
    if (this.statusError) {
      throw this.statusError;
    }

    if (this.statusNeverResolves) {
      return new Promise<CopilotStatus>(() => {});
    }

    return this.status;
  }

  async getAuthStatus() {
    if (this.authStatusError) {
      throw this.authStatusError;
    }

    if (this.authStatusNeverResolves) {
      return new Promise<CopilotAuthStatus>(() => {});
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

    for (const event of this.createSessionEvents) {
      config.onEvent?.(event);
    }

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

    for (const event of this.resumeSessionEvents[sessionId] ?? []) {
      config.onEvent?.(event);
    }

    const session = this.resumeSessions[sessionId];

    if (!session) {
      throw new Error(
        `No fake Copilot resume session configured for ${sessionId}.`,
      );
    }

    return session;
  }
}
