import { AgentError } from "../../core/errors.js";
import type { AgentProviderAdapter } from "../../core/provider.js";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session.js";
import { createCopilotCapabilities } from "./capabilities.js";
import {
  assertCopilotSessionReference,
  createCopilotSessionReference,
} from "./references.js";
import { checkCopilotReadiness } from "./readiness.js";
import { CopilotSession } from "./session.js";
import { createCopilotClient } from "./sdk.js";
import { buildCopilotSessionConfig } from "./provider-options.js";
import type {
  CopilotAdapterOptions,
  CopilotClientLike,
  CopilotResumeSessionConfig,
  CopilotSessionConfig,
  CopilotSessionEvent,
} from "./types.js";

export class CopilotAdapter implements AgentProviderAdapter {
  readonly provider = "copilot" as const;
  readonly capabilities = createCopilotCapabilities();

  private readonly client: CopilotClientLike;

  constructor(private readonly options: CopilotAdapterOptions = {}) {
    const clientFactory = options.clientFactory ?? createCopilotClient;
    this.client = options.client ?? clientFactory(options.sdkOptions ?? {});
  }

  checkReadiness() {
    return checkCopilotReadiness(this.options);
  }

  async createSession(options: SessionOptions = {}): Promise<AgentSession> {
    const earlyEvents: CopilotSessionEvent[] = [];
    let captureEarlyEvents = true;
    const config = createRuntimeSessionConfig({
      sessionOptions: options,
      onEarlyEvent: (event) => {
        if (captureEarlyEvents) {
          earlyEvents.push(event);
        }
      },
    });
    const session = await this.client.createSession(config);
    const agentSession = new CopilotSession({
      capabilities: this.capabilities,
      initialReference: null,
      initialEvents: earlyEvents,
      session,
    });
    captureEarlyEvents = false;

    return agentSession;
  }

  async resumeSession(
    reference: SessionReference,
    options: SessionOptions = {},
  ): Promise<AgentSession> {
    assertCopilotSessionReference(reference);

    if (options.resumeStrategy === "fork") {
      throw new AgentError({
        code: "unsupported_feature",
        provider: "copilot",
        message: "Copilot sessions do not support normalized fork semantics.",
      });
    }

    const session = await this.client.resumeSession(
      reference.sessionId,
      createRuntimeResumeConfig(options),
    );

    return new CopilotSession({
      capabilities: this.capabilities,
      initialReference: createCopilotSessionReference(reference.sessionId),
      session,
    });
  }
}

function createRuntimeSessionConfig(params: {
  onEarlyEvent: (event: CopilotSessionEvent) => void;
  sessionOptions: SessionOptions;
}): CopilotSessionConfig {
  const config = buildCopilotSessionConfig(params.sessionOptions);
  const providerOnEvent = config.onEvent;

  return {
    ...config,
    streaming: config.streaming ?? true,
    onEvent: (event) => {
      params.onEarlyEvent(event);
      providerOnEvent?.(event);
    },
  };
}

function createRuntimeResumeConfig(
  options: SessionOptions,
): CopilotResumeSessionConfig {
  const config = buildCopilotSessionConfig(options);

  return {
    ...config,
    streaming: config.streaming ?? true,
    suppressResumeEvent: true,
  };
}
