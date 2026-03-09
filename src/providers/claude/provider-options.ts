import type {
  Options as ClaudeSdkOptions,
  PermissionMode,
} from "@anthropic-ai/claude-agent-sdk";

import type { TurnOptions } from "../../core/input";
import type { SessionOptions } from "../../core/session";
import type {
  ClaudeSessionProviderOptions,
  ClaudeTurnProviderOptions,
} from "./types";

const RESERVED_SESSION_OPTION_KEYS = new Set<keyof ClaudeSdkOptions>([
  "abortController",
  "continue",
  "cwd",
  "forkSession",
  "includePartialMessages",
  "model",
  "outputFormat",
  "permissionMode",
  "resume",
  "resumeSessionAt",
  "sessionId",
  "systemPrompt",
  "additionalDirectories",
]);

const RESERVED_TURN_OPTION_KEYS = new Set<keyof ClaudeSdkOptions>([
  "abortController",
  "forkSession",
  "includePartialMessages",
  "outputFormat",
  "permissionMode",
  "resume",
  "resumeSessionAt",
  "sessionId",
]);

export function buildClaudeBaseQueryOptions(params: {
  sessionOptions?: SessionOptions;
  sdkOptions?: Partial<ClaudeSdkOptions>;
}): Partial<ClaudeSdkOptions> {
  const sessionOptions = params.sessionOptions ?? {};
  const providerOptions = getClaudeSessionProviderOptions(
    sessionOptions.providerOptions,
  );
  const reservedSdkOptions = pickReservedOptions(
    params.sdkOptions,
    RESERVED_SESSION_OPTION_KEYS,
  );
  const reservedProviderOptions = pickReservedOptions(
    providerOptions.options,
    RESERVED_SESSION_OPTION_KEYS,
  );
  const mergedOptions = {
    ...omitReservedOptions(params.sdkOptions, RESERVED_SESSION_OPTION_KEYS),
    ...omitReservedOptions(providerOptions.options, RESERVED_SESSION_OPTION_KEYS),
  };
  const permissionMode = derivePermissionMode(
    sessionOptions,
    reservedProviderOptions.permissionMode ?? reservedSdkOptions.permissionMode,
  );

  return {
    ...mergedOptions,
    cwd:
      sessionOptions.workingDirectory ??
      reservedProviderOptions.cwd ??
      reservedSdkOptions.cwd,
    model:
      sessionOptions.model ??
      reservedProviderOptions.model ??
      reservedSdkOptions.model,
    additionalDirectories: mergeDirectories(
      reservedSdkOptions.additionalDirectories,
      reservedProviderOptions.additionalDirectories,
      sessionOptions.additionalDirectories,
    ),
    permissionMode,
    systemPrompt:
      mapInstructionsToSystemPrompt(sessionOptions.instructions) ??
      reservedProviderOptions.systemPrompt ??
      reservedSdkOptions.systemPrompt,
  };
}

export function buildClaudeTurnQueryOptions(params: {
  baseOptions: Partial<ClaudeSdkOptions>;
  turnOptions?: TurnOptions;
  resumeSessionId?: string | null;
  forkSession?: boolean;
}): ClaudeSdkOptions {
  const turnOptions = params.turnOptions ?? {};
  const providerOptions = getClaudeTurnProviderOptions(turnOptions.providerOptions);
  const mergedOptions = {
    ...params.baseOptions,
    ...omitReservedOptions(providerOptions.options, RESERVED_TURN_OPTION_KEYS),
  };
  const abortController = createAbortController(turnOptions.signal);

  return {
    ...mergedOptions,
    abortController,
    includePartialMessages: true,
    outputFormat: turnOptions.outputSchema
      ? {
          type: "json_schema",
          schema: turnOptions.outputSchema,
        }
      : undefined,
    resume: params.resumeSessionId ?? undefined,
    forkSession: params.forkSession || undefined,
  };
}

function derivePermissionMode(
  sessionOptions: SessionOptions,
  fallback?: PermissionMode,
): PermissionMode | undefined {
  if (sessionOptions.executionMode === "plan") {
    return "plan";
  }

  switch (sessionOptions.approvalMode) {
    case "interactive":
      return "default";
    case "auto-approve-safe":
      return "acceptEdits";
    case "deny":
      return "dontAsk";
    default:
      return fallback;
  }
}

function mapInstructionsToSystemPrompt(
  instructions?: string,
): ClaudeSdkOptions["systemPrompt"] | undefined {
  if (!instructions?.trim()) {
    return undefined;
  }

  return {
    type: "preset",
    preset: "claude_code",
    append: instructions,
  };
}

function getClaudeSessionProviderOptions(
  providerOptions?: Record<string, unknown>,
): ClaudeSessionProviderOptions {
  const claudeOptions = providerOptions?.claude;

  if (!isRecord(claudeOptions)) {
    return {};
  }

  return claudeOptions as ClaudeSessionProviderOptions;
}

function getClaudeTurnProviderOptions(
  providerOptions?: Record<string, unknown>,
): ClaudeTurnProviderOptions {
  const claudeOptions = providerOptions?.claude;

  if (!isRecord(claudeOptions)) {
    return {};
  }

  return claudeOptions as ClaudeTurnProviderOptions;
}

function omitReservedOptions(
  options: Partial<ClaudeSdkOptions> | undefined,
  reservedKeys: Set<keyof ClaudeSdkOptions>,
): Partial<ClaudeSdkOptions> {
  if (!options) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(options).filter(([key]) => !reservedKeys.has(key as keyof ClaudeSdkOptions)),
  ) as Partial<ClaudeSdkOptions>;
}

function pickReservedOptions(
  options: Partial<ClaudeSdkOptions> | undefined,
  reservedKeys: Set<keyof ClaudeSdkOptions>,
): Partial<ClaudeSdkOptions> {
  if (!options) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(options).filter(([key]) => reservedKeys.has(key as keyof ClaudeSdkOptions)),
  ) as Partial<ClaudeSdkOptions>;
}

function createAbortController(signal?: AbortSignal): AbortController | undefined {
  if (!signal) {
    return undefined;
  }

  const abortController = new AbortController();

  if (signal.aborted) {
    abortController.abort();
    return abortController;
  }

  signal.addEventListener(
    "abort",
    () => {
      abortController.abort();
    },
    {
      once: true,
    },
  );

  return abortController;
}

function mergeDirectories(
  ...groups: Array<string[] | undefined>
): string[] | undefined {
  const merged = groups.flatMap((group) => group ?? []);

  if (merged.length === 0) {
    return undefined;
  }

  return [...new Set(merged)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
