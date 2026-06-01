import type {
  CopilotClientOptions,
  GetAuthStatusResponse,
  GetStatusResponse,
  MCPServerConfig,
  MessageOptions,
  ModelInfo,
  PermissionHandler,
  PermissionRequest,
  PermissionRequestResult,
  ResumeSessionConfig,
  SessionConfig,
  SessionEvent,
  SessionEventHandler,
  SessionEventPayload,
  SessionEventType,
  SessionListFilter,
  SessionMetadata,
  SystemMessageConfig,
  TypedSessionEventHandler,
} from "@github/copilot-sdk";

export type CopilotSdkOptions = CopilotClientOptions;
export type CopilotSessionConfig = SessionConfig;
export type CopilotResumeSessionConfig = ResumeSessionConfig;
export type CopilotMessageOptions = MessageOptions;
export type CopilotMcpServerConfig = MCPServerConfig;
export type CopilotPermissionHandler = PermissionHandler;
export type CopilotPermissionRequest = PermissionRequest;
export type CopilotPermissionRequestResult = PermissionRequestResult;
export type CopilotSystemMessageConfig = SystemMessageConfig;
export type CopilotSessionEvent = SessionEvent;
export type CopilotSessionEventType = SessionEventType;
export type CopilotSessionEventPayload<T extends CopilotSessionEventType> =
  SessionEventPayload<T>;
export type CopilotSessionEventHandler = SessionEventHandler;
export type CopilotTypedSessionEventHandler<T extends CopilotSessionEventType> =
  TypedSessionEventHandler<T>;
export type CopilotAssistantMessageEvent = Extract<
  CopilotSessionEvent,
  { type: "assistant.message" }
>;
export type CopilotStatus = GetStatusResponse;
export type CopilotAuthStatus = GetAuthStatusResponse;
export type CopilotModelInfo = ModelInfo;
export type CopilotSessionListFilter = SessionListFilter;
export type CopilotSessionMetadata = SessionMetadata;

export interface CopilotSessionLike {
  readonly sessionId: string;

  send(prompt: string): Promise<string>;
  send(options: CopilotMessageOptions): Promise<string>;
  sendAndWait(
    prompt: string,
    timeout?: number,
  ): Promise<CopilotAssistantMessageEvent | undefined>;
  sendAndWait(
    options: CopilotMessageOptions,
    timeout?: number,
  ): Promise<CopilotAssistantMessageEvent | undefined>;
  on<T extends CopilotSessionEventType>(
    eventType: T,
    handler: CopilotTypedSessionEventHandler<T>,
  ): () => void;
  on(handler: CopilotSessionEventHandler): () => void;
  getEvents(): Promise<CopilotSessionEvent[]>;
  abort(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface CopilotClientLike {
  start(): Promise<void>;
  stop(): Promise<Error[]>;
  forceStop(): Promise<void>;
  getStatus(): Promise<CopilotStatus>;
  getAuthStatus(): Promise<CopilotAuthStatus>;
  listModels(): Promise<CopilotModelInfo[]>;
  listSessions(
    filter?: CopilotSessionListFilter,
  ): Promise<CopilotSessionMetadata[]>;
  createSession(config: CopilotSessionConfig): Promise<CopilotSessionLike>;
  resumeSession(
    sessionId: string,
    config: CopilotResumeSessionConfig,
  ): Promise<CopilotSessionLike>;
}

export type CopilotClientFactory = (
  options?: CopilotSdkOptions,
) => CopilotClientLike;

export type CopilotAdapterOptions = {
  client?: CopilotClientLike;
  clientFactory?: CopilotClientFactory;
  ownsClient?: boolean;
  readinessTimeoutMs?: number;
  sdkOptions?: CopilotSdkOptions;
};

export type CopilotSessionProviderOptions = {
  sessionConfig?: Partial<CopilotSessionConfig>;
};
