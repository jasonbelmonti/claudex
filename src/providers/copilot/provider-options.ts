import { AgentError } from "../../core/errors.js";
import type { SessionOptions } from "../../core/session.js";
import {
  mapAgentConfigMcpServers,
  mergeMcpServers,
} from "./mcp-options.js";
import { deriveCopilotPermissionHandler } from "./permissions.js";
import {
  deriveCopilotAutoModeSwitchHandler,
  deriveCopilotExitPlanModeHandler,
} from "./plan-mode.js";
import { applyCopilotSandboxProfile } from "./sandbox.js";
import type {
  CopilotSessionConfig,
  CopilotSessionProviderOptions,
  CopilotSystemMessageConfig,
} from "./types.js";
import { validateCopilotSessionOptions } from "./validation.js";

const RESERVED_SESSION_CONFIG_KEYS = new Set<keyof CopilotSessionConfig>([
  "model",
  "workingDirectory",
  "systemMessage",
  "mcpServers",
  "onPermissionRequest",
  "onExitPlanModeRequest",
  "onAutoModeSwitchRequest",
]);

export function buildCopilotSessionConfig(
  sessionOptions: SessionOptions = {},
): CopilotSessionConfig {
  validateCopilotSessionOptions(sessionOptions);

  const providerOptions = getCopilotSessionProviderOptions(
    sessionOptions.providerOptions,
  );
  const providerSessionConfig = providerOptions.sessionConfig ?? {};
  const reservedProviderConfig = pickReservedOptions(
    providerSessionConfig,
    RESERVED_SESSION_CONFIG_KEYS,
  );
  const mergedConfig = omitReservedOptions(
    providerSessionConfig,
    RESERVED_SESSION_CONFIG_KEYS,
  );
  const model = sessionOptions.model ?? reservedProviderConfig.model;
  const workingDirectory =
    sessionOptions.workingDirectory ?? reservedProviderConfig.workingDirectory;
  const systemMessage =
    mapInstructionsToSystemMessage(sessionOptions.instructions) ??
    reservedProviderConfig.systemMessage;
  const mcpServers = mergeMcpServers(
    reservedProviderConfig.mcpServers,
    mapAgentConfigMcpServers(sessionOptions.agentConfig),
  );
  const onPermissionRequest = deriveCopilotPermissionHandler({
    approvalMode: sessionOptions.approvalMode,
    providerHandler: reservedProviderConfig.onPermissionRequest,
  });
  const onExitPlanModeRequest = deriveCopilotExitPlanModeHandler({
    executionMode: sessionOptions.executionMode,
    providerHandler: reservedProviderConfig.onExitPlanModeRequest,
  });
  const onAutoModeSwitchRequest = deriveCopilotAutoModeSwitchHandler({
    executionMode: sessionOptions.executionMode,
    providerHandler: reservedProviderConfig.onAutoModeSwitchRequest,
  });

  return applyCopilotSandboxProfile(
    {
      ...mergedConfig,
      ...(model !== undefined ? { model } : {}),
      ...(workingDirectory !== undefined ? { workingDirectory } : {}),
      ...(systemMessage ? { systemMessage } : {}),
      ...(mcpServers ? { mcpServers } : {}),
      ...(onPermissionRequest ? { onPermissionRequest } : {}),
      ...(onExitPlanModeRequest ? { onExitPlanModeRequest } : {}),
      ...(onAutoModeSwitchRequest ? { onAutoModeSwitchRequest } : {}),
    },
    sessionOptions.sandboxProfile,
  );
}

function mapInstructionsToSystemMessage(
  instructions?: string,
): CopilotSystemMessageConfig | undefined {
  if (!instructions?.trim()) {
    return undefined;
  }

  return {
    mode: "append",
    content: instructions,
  };
}

function getCopilotSessionProviderOptions(
  providerOptions?: Record<string, unknown>,
): CopilotSessionProviderOptions {
  const copilotOptions = providerOptions?.copilot;

  if (copilotOptions === undefined) {
    return {};
  }

  if (!isRecord(copilotOptions)) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "copilot",
      message: "providerOptions.copilot must be an object when provided.",
      details: {
        option: "providerOptions.copilot",
      },
      raw: copilotOptions,
    });
  }

  const sessionConfig = copilotOptions.sessionConfig;

  if (sessionConfig !== undefined && !isRecord(sessionConfig)) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "copilot",
      message:
        "providerOptions.copilot.sessionConfig must be an object when provided.",
      details: {
        option: "providerOptions.copilot.sessionConfig",
      },
      raw: sessionConfig,
    });
  }

  if (sessionConfig) {
    validateReservedProviderSessionConfig(sessionConfig);
  }

  return {
    ...copilotOptions,
    ...(sessionConfig ? { sessionConfig } : {}),
  } as CopilotSessionProviderOptions;
}

function validateReservedProviderSessionConfig(
  sessionConfig: Record<string, unknown>,
): void {
  validateProviderSessionField(sessionConfig, {
    key: "model",
    message: "providerOptions.copilot.sessionConfig.model must be a string.",
    isValid: isString,
  });
  validateProviderSessionField(sessionConfig, {
    key: "onAutoModeSwitchRequest",
    message:
      "providerOptions.copilot.sessionConfig.onAutoModeSwitchRequest must be a function.",
    isValid: isFunction,
  });
  validateProviderSessionField(sessionConfig, {
    key: "onExitPlanModeRequest",
    message:
      "providerOptions.copilot.sessionConfig.onExitPlanModeRequest must be a function.",
    isValid: isFunction,
  });
  validateProviderSessionField(sessionConfig, {
    key: "workingDirectory",
    message:
      "providerOptions.copilot.sessionConfig.workingDirectory must be a string.",
    isValid: isString,
  });
  validateProviderSessionField(sessionConfig, {
    key: "systemMessage",
    message:
      "providerOptions.copilot.sessionConfig.systemMessage must be a Copilot system message object.",
    isValid: isSystemMessageConfig,
  });
  validateProviderSessionField(sessionConfig, {
    key: "mcpServers",
    message:
      "providerOptions.copilot.sessionConfig.mcpServers must be a Copilot MCP server map.",
    isValid: isMcpServerConfigMap,
  });
  validateProviderSessionField(sessionConfig, {
    key: "onPermissionRequest",
    message:
      "providerOptions.copilot.sessionConfig.onPermissionRequest must be a function.",
    isValid: isFunction,
  });
}

function validateProviderSessionField(
  sessionConfig: Record<string, unknown>,
  params: {
    isValid: (value: unknown) => boolean;
    key: keyof CopilotSessionConfig;
    message: string;
  },
): void {
  if (!Object.hasOwn(sessionConfig, params.key)) {
    return;
  }

  const value = sessionConfig[params.key];
  if (value === undefined || params.isValid(value)) {
    return;
  }

  throw new AgentError({
    code: "unsupported_feature",
    provider: "copilot",
    message: params.message,
    details: {
      option: `providerOptions.copilot.sessionConfig.${params.key}`,
    },
    raw: value,
  });
}

function isSystemMessageConfig(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.mode !== undefined &&
    value.mode !== "append" &&
    value.mode !== "replace" &&
    value.mode !== "customize"
  ) {
    return false;
  }

  if (value.content !== undefined && !isString(value.content)) {
    return false;
  }

  if (value.mode === "replace" && !isString(value.content)) {
    return false;
  }

  if (value.sections === undefined) {
    return true;
  }

  return (
    value.mode === "customize" &&
    isRecord(value.sections) &&
    Object.values(value.sections).every(isSectionOverride)
  );
}

function isSectionOverride(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.action !== "replace" &&
    value.action !== "remove" &&
    value.action !== "append" &&
    value.action !== "prepend" &&
    !isFunction(value.action)
  ) {
    return false;
  }

  return value.content === undefined || isString(value.content);
}

function isMcpServerConfigMap(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isMcpServerConfig);
}

function isMcpServerConfig(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.type !== undefined &&
    value.type !== "local" &&
    value.type !== "stdio" &&
    value.type !== "http" &&
    value.type !== "sse"
  ) {
    return false;
  }

  if (value.tools !== undefined && !isStringArray(value.tools)) {
    return false;
  }

  if (value.timeout !== undefined && typeof value.timeout !== "number") {
    return false;
  }

  if (value.type === "http" || value.type === "sse") {
    return (
      isString(value.url) &&
      (value.headers === undefined || isStringRecord(value.headers))
    );
  }

  return (
    isString(value.command) &&
    (value.args === undefined || isStringArray(value.args)) &&
    (value.env === undefined || isStringRecord(value.env)) &&
    (value.workingDirectory === undefined ||
      isString(value.workingDirectory))
  );
}

function omitReservedOptions(
  options: Partial<CopilotSessionConfig>,
  reservedKeys: Set<keyof CopilotSessionConfig>,
): Partial<CopilotSessionConfig> {
  return Object.fromEntries(
    Object.entries(options).filter(
      ([key]) => !reservedKeys.has(key as keyof CopilotSessionConfig),
    ),
  ) as Partial<CopilotSessionConfig>;
}

function pickReservedOptions(
  options: Partial<CopilotSessionConfig>,
  reservedKeys: Set<keyof CopilotSessionConfig>,
): Partial<CopilotSessionConfig> {
  return Object.fromEntries(
    Object.entries(options).filter(([key]) =>
      reservedKeys.has(key as keyof CopilotSessionConfig),
    ),
  ) as Partial<CopilotSessionConfig>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === "function";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(isString);
}
