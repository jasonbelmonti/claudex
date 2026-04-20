import type { AgentProviderAdapter } from "../../core/provider.js";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session.js";
import { AgentError } from "../../core/errors.js";
import { createClaudeCapabilities } from "./capabilities.js";
import { buildClaudeBaseQueryOptions } from "./provider-options.js";
import { checkClaudeReadiness } from "./readiness.js";
import { createClaudeSessionReference } from "./references.js";
import { ClaudeSession } from "./session.js";
import {
  createClaudeQuery,
  createClaudeSessionMessagesLoader,
} from "./sdk.js";
import type {
  ClaudeAdapterOptions,
  ClaudeSessionState,
} from "./types.js";
import { validateClaudeSessionOptions } from "./validation.js";
import { DEFAULT_CLAUDE_TRANSCRIPT_POLL_INTERVAL_MS } from "./transcript-fallback.js";

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
      this.createSessionState({
        currentReference: null,
        nextResumeSessionId: null,
        forkOnNextRun: false,
        sessionOptions: options,
      }),
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
      this.createSessionState({
        currentReference: shouldFork
          ? null
          : createClaudeSessionReference(reference.sessionId),
        nextResumeSessionId: reference.sessionId,
        forkOnNextRun: shouldFork,
        sessionOptions: options,
      }),
      this.capabilities,
    );
  }

  private createSessionState(params: {
    currentReference: ClaudeSessionState["currentReference"];
    nextResumeSessionId: ClaudeSessionState["nextResumeSessionId"];
    forkOnNextRun: ClaudeSessionState["forkOnNextRun"];
    sessionOptions: SessionOptions;
  }): ClaudeSessionState {
    return {
      currentReference: params.currentReference,
      nextResumeSessionId: params.nextResumeSessionId,
      forkOnNextRun: params.forkOnNextRun,
      baseSessionOptions: params.sessionOptions,
      adapterSdkOptions: this.options.sdkOptions,
      baseQueryOptions: buildClaudeBaseQueryOptions({
        sessionOptions: params.sessionOptions,
        sdkOptions: this.options.sdkOptions,
      }),
      sessionMessagesLoader:
        this.options.sessionMessagesLoader ?? createClaudeSessionMessagesLoader,
      transcriptPollIntervalMs:
        this.options.transcriptPollIntervalMs ??
        DEFAULT_CLAUDE_TRANSCRIPT_POLL_INTERVAL_MS,
    };
  }
}
