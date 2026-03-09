import type { AgentProviderAdapter } from "../../core/provider";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session";
import { AgentError } from "../../core/errors";
import { createCodexCapabilities } from "./capabilities";
import { mapSessionOptionsToThreadOptions } from "./provider-options";
import { checkCodexReadiness } from "./readiness";
import { CodexSession } from "./session";
import { createCodexClient } from "./sdk";
import type { CodexAdapterOptions, CodexClientLike } from "./types";
import { validateCodexSessionOptions } from "./validation";

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
