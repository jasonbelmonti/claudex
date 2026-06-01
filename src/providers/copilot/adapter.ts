import { AgentError } from "../../core/errors.js";
import type { AgentProviderAdapter } from "../../core/provider.js";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session.js";
import { createCopilotCapabilities } from "./capabilities.js";
import { checkCopilotReadiness } from "./readiness.js";
import type { CopilotAdapterOptions } from "./types.js";

export class CopilotAdapter implements AgentProviderAdapter {
  readonly provider = "copilot" as const;
  readonly capabilities = createCopilotCapabilities();

  constructor(private readonly options: CopilotAdapterOptions = {}) {}

  checkReadiness() {
    return checkCopilotReadiness(this.options);
  }

  async createSession(_options: SessionOptions = {}): Promise<AgentSession> {
    throw createCopilotSessionsDeferredError("createSession");
  }

  async resumeSession(
    _reference: SessionReference,
    _options: SessionOptions = {},
  ): Promise<AgentSession> {
    throw createCopilotSessionsDeferredError("resumeSession");
  }
}

function createCopilotSessionsDeferredError(operation: string): AgentError {
  return new AgentError({
    code: "unsupported_feature",
    provider: "copilot",
    message: `CopilotAdapter ${operation} is deferred until Copilot session support is implemented.`,
    details: {
      operation,
      followUp: "Copilot session creation, resume, turns, and event normalization are out of scope for BEL-1256.",
    },
  });
}
