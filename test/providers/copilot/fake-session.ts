import type {
  CopilotAssistantMessageEvent,
  CopilotMessageOptions,
  CopilotSessionEvent,
  CopilotSessionEventHandler,
  CopilotSessionEventType,
  CopilotSessionLike,
  CopilotTypedSessionEventHandler,
} from "../../../src/providers/copilot/types.js";

type CopilotMessageInput = string | CopilotMessageOptions;

export class FakeCopilotSession implements CopilotSessionLike {
  readonly sentMessages: CopilotMessageInput[] = [];
  readonly history: CopilotSessionEvent[] = [];

  lastSendAndWaitTimeout?: number;
  abortCallCount = 0;
  disconnectCallCount = 0;
  sendError?: unknown;
  sendNeverResolves = false;

  private readonly allEventHandlers = new Set<CopilotSessionEventHandler>();
  private readonly typedEventHandlers = new Map<
    CopilotSessionEventType,
    Set<CopilotSessionEventHandler>
  >();
  private lastAssistantMessage: CopilotAssistantMessageEvent | undefined;

  constructor(
    public readonly sessionId = "fake-copilot-session",
    private readonly runs: CopilotSessionEvent[][] = [],
    private readonly messageIds: string[] = [],
  ) {}

  enqueueRun(events: CopilotSessionEvent[]) {
    this.runs.push(events);
  }

  get handlerCount() {
    return (
      this.allEventHandlers.size +
      Array.from(this.typedEventHandlers.values()).reduce(
        (count, handlers) => count + handlers.size,
        0,
      )
    );
  }

  async send(input: CopilotMessageInput) {
    this.sentMessages.push(input);
    this.lastAssistantMessage = undefined;

    const messageId =
      this.messageIds.shift() ?? `fake-message-${this.sentMessages.length}`;

    for (const event of this.runs.shift() ?? []) {
      if (event.type === "assistant.message") {
        this.lastAssistantMessage = event;
      }

      this.emit(event);
    }

    if (this.sendError) {
      throw this.sendError;
    }

    if (this.sendNeverResolves) {
      return new Promise<string>(() => {});
    }

    return messageId;
  }

  async sendAndWait(input: CopilotMessageInput, timeout?: number) {
    this.lastSendAndWaitTimeout = timeout;
    await this.send(input);
    return this.lastAssistantMessage;
  }

  on<T extends CopilotSessionEventType>(
    eventType: T,
    handler: CopilotTypedSessionEventHandler<T>,
  ): () => void;
  on(handler: CopilotSessionEventHandler): () => void;
  on(
    eventTypeOrHandler: CopilotSessionEventType | CopilotSessionEventHandler,
    handler?: CopilotTypedSessionEventHandler<CopilotSessionEventType>,
  ) {
    if (typeof eventTypeOrHandler === "function") {
      this.allEventHandlers.add(eventTypeOrHandler);
      return () => {
        this.allEventHandlers.delete(eventTypeOrHandler);
      };
    }

    const handlers =
      this.typedEventHandlers.get(eventTypeOrHandler) ?? new Set();
    const eventHandler = handler as CopilotSessionEventHandler;
    handlers.add(eventHandler);
    this.typedEventHandlers.set(eventTypeOrHandler, handlers);

    return () => {
      handlers.delete(eventHandler);
    };
  }

  async getEvents() {
    return [...this.history];
  }

  async abort() {
    this.abortCallCount += 1;
  }

  async disconnect() {
    this.disconnectCallCount += 1;
  }

  emit(event: CopilotSessionEvent) {
    this.history.push(event);

    for (const handler of this.allEventHandlers) {
      handler(event);
    }

    for (const handler of this.typedEventHandlers.get(event.type) ?? []) {
      handler(event);
    }
  }
}
