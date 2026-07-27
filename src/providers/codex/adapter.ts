import type { AgentProviderAdapter } from "../../core/provider.js";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session.js";
import { AgentError } from "../../core/errors.js";
import type { ProviderReadiness } from "../../core/readiness.js";
import { CodexBinaryLifecycle } from "./binary-lifecycle.js";
import { createCodexCapabilities } from "./capabilities.js";
import { mapSessionOptionsToThreadOptions } from "./provider-options.js";
import { CodexSession } from "./session.js";
import { createCodexClient } from "./sdk.js";
import type { CodexAdapterOptions, CodexClientLike } from "./types.js";
import { validateCodexSessionOptions } from "./validation.js";

export class CodexAdapter implements AgentProviderAdapter {
  readonly provider = "codex" as const;
  readonly capabilities = createCodexCapabilities();

  private clientPromise: Promise<CodexClientLike> | undefined;
  private readonly binaryLifecycle: CodexBinaryLifecycle;

  constructor(private readonly options: CodexAdapterOptions = {}) {
    this.binaryLifecycle = new CodexBinaryLifecycle(options);
    if (options.client) {
      this.clientPromise = Promise.resolve(options.client);
    }
  }

  checkReadiness(): Promise<ProviderReadiness> {
    if (this.options.client) {
      return Promise.resolve({
        provider: "codex" as const,
        status: "ready" as const,
        checks: [
          {
            kind: "runtime" as const,
            status: "pass" as const,
            summary: "Injected Codex SDK client is available",
          },
        ],
        capabilities: this.capabilities,
      });
    }

    return this.binaryLifecycle.checkReadiness();
  }

  async createSession(options: SessionOptions = {}): Promise<AgentSession> {
    validateCodexSessionOptions(options, "create");
    const client = await this.getClient();

    const thread = client.startThread(
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

    const client = await this.getClient();
    const thread = client.resumeThread(
      reference.sessionId,
      mapSessionOptionsToThreadOptions(options),
    );

    return new CodexSession(thread, this.capabilities);
  }

  private getClient(): Promise<CodexClientLike> {
    if (this.clientPromise) {
      return this.clientPromise;
    }

    const clientPromise = this.createClient();
    this.clientPromise = clientPromise;
    void clientPromise.then(undefined, () => {
      if (this.clientPromise === clientPromise) {
        this.clientPromise = undefined;
      }
    });
    return clientPromise;
  }

  private async createClient(): Promise<CodexClientLike> {
    const clientFactory = this.options.clientFactory ?? createCodexClient;
    const executionBinary =
      await this.binaryLifecycle.resolveClientBinary();

    return clientFactory({
      ...(this.options.sdkOptions ?? {}),
      codexPathOverride: executionBinary,
    });
  }
}
