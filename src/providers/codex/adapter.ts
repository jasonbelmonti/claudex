import type { AgentProviderAdapter } from "../../core/provider.js";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session.js";
import { AgentError } from "../../core/errors.js";
import { createCodexCapabilities } from "./capabilities.js";
import { mapSessionOptionsToThreadOptions } from "./provider-options.js";
import { checkCodexReadiness } from "./readiness.js";
import { CodexSession } from "./session.js";
import { createCodexClient } from "./sdk.js";
import type { CodexAdapterOptions, CodexClientLike } from "./types.js";
import { validateCodexSessionOptions } from "./validation.js";

export class CodexAdapter implements AgentProviderAdapter {
  readonly provider = "codex" as const;
  readonly capabilities = createCodexCapabilities();

  private readonly client: CodexClientLike;

  constructor(private readonly options: CodexAdapterOptions = {}) {
    const clientFactory = options.clientFactory ?? createCodexClient;
    this.client = options.client ?? clientFactory(options.sdkOptions ?? {});
  }

  checkReadiness() {
    return checkCodexReadiness({
      sdkOptions: this.options.sdkOptions,
      commandRunner: this.options.commandRunner,
      binaryResolver: this.options.binaryResolver,
    });
  }

  async createSession(options: SessionOptions = {}): Promise<AgentSession> {
    validateCodexSessionOptions(options, "create");

    const thread = this.client.startThread(
      mapSessionOptionsToThreadOptions(options),
    );

    return new CodexSession(thread, this.capabilities);
  }

  async resumeSession(
    reference: SessionReference,
    options: SessionOptions = {},
  ): Promise<AgentSession> {
    validateCodexSessionOptions(options, "resume");

    if (reference.provider !== "codex") {
      throw new AgentError({
        code: "unsupported_feature",
        provider: "codex",
        message: `CodexAdapter cannot resume a ${reference.provider} session.`,
      });
    }

    const thread = this.client.resumeThread(
      reference.sessionId,
      mapSessionOptionsToThreadOptions(options),
    );

    return new CodexSession(thread, this.capabilities);
  }
}
