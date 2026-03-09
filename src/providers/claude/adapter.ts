import type { AgentProviderAdapter } from "../../core/provider";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session";
import { AgentError } from "../../core/errors";
import { createClaudeCapabilities } from "./capabilities";
import { buildClaudeBaseQueryOptions } from "./provider-options";
import { checkClaudeReadiness } from "./readiness";
import { createClaudeSessionReference } from "./references";
import { ClaudeSession } from "./session";
import { createClaudeQuery } from "./sdk";
import type { ClaudeAdapterOptions } from "./types";
import { validateClaudeSessionOptions } from "./validation";

export class ClaudeAdapter implements AgentProviderAdapter {
  readonly provider = "claude" as const;
  readonly capabilities = createClaudeCapabilities();

  private readonly queryFactory;

  constructor(private readonly options: ClaudeAdapterOptions = {}) {
    this.queryFactory = options.queryFactory ?? createClaudeQuery;
  }

  checkReadiness() {
    return checkClaudeReadiness({
      queryFactory: this.queryFactory,
      sdkOptions: this.options.sdkOptions,
    });
  }

  async createSession(options: SessionOptions = {}): Promise<AgentSession> {
    validateClaudeSessionOptions(options);

    return new ClaudeSession(
      this.queryFactory,
      {
        currentReference: null,
        nextResumeSessionId: null,
        forkOnNextRun: false,
        baseSessionOptions: options,
        baseQueryOptions: buildClaudeBaseQueryOptions({
          sessionOptions: options,
          sdkOptions: this.options.sdkOptions,
        }),
      },
      this.capabilities,
    );
  }

  async resumeSession(
    reference: SessionReference,
    options: SessionOptions = {},
  ): Promise<AgentSession> {
    if (reference.provider !== "claude") {
      throw new AgentError({
        code: "unsupported_feature",
        provider: "claude",
        message: `ClaudeAdapter cannot resume a ${reference.provider} session.`,
      });
    }

    validateClaudeSessionOptions(options);

    const shouldFork = options.resumeStrategy === "fork";

    return new ClaudeSession(
      this.queryFactory,
      {
        currentReference: shouldFork
          ? null
          : createClaudeSessionReference(reference.sessionId),
        nextResumeSessionId: reference.sessionId,
        forkOnNextRun: shouldFork,
        baseSessionOptions: options,
        baseQueryOptions: buildClaudeBaseQueryOptions({
          sessionOptions: options,
          sdkOptions: this.options.sdkOptions,
        }),
      },
      this.capabilities,
    );
  }
}
