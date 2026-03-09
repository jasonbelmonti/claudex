import type { ThreadOptions } from "@openai/codex-sdk";

import type {
  ApprovalMode,
  SandboxProfile,
  SessionOptions,
} from "../../core/session";
import { applyPlanModeThreadOptions } from "./plan-mode";
import type { CodexThreadProviderOptions } from "./types";

export function mapSessionOptionsToThreadOptions(
  options: SessionOptions = {},
): ThreadOptions {
  const extensionOptions = getCodexThreadProviderOptions(options.providerOptions);
  const coreOptions: ThreadOptions = {
    model: options.model,
    workingDirectory: options.workingDirectory,
    additionalDirectories: mergeDirectories(
      options.additionalDirectories,
      extensionOptions.threadOptions?.additionalDirectories,
    ),
    sandboxMode: mapSandboxProfile(options.sandboxProfile),
    approvalPolicy: mapApprovalMode(options.approvalMode),
  };

  const mergedOptions: ThreadOptions = {
    ...coreOptions,
    ...extensionOptions.threadOptions,
    additionalDirectories: mergeDirectories(
      coreOptions.additionalDirectories,
      extensionOptions.threadOptions?.additionalDirectories,
    ),
  };

  if (options.executionMode === "plan") {
    return applyPlanModeThreadOptions(
      mergedOptions,
      options.approvalMode === "deny",
    );
  }

  return mergedOptions;
}

function getCodexThreadProviderOptions(
  providerOptions?: Record<string, unknown>,
): CodexThreadProviderOptions {
  const codexOptions = providerOptions?.codex;

  if (!isRecord(codexOptions)) {
    return {};
  }

  return codexOptions as CodexThreadProviderOptions;
}

function mergeDirectories(
  primary?: string[],
  secondary?: string[],
): string[] | undefined {
  const merged = [...(primary ?? []), ...(secondary ?? [])];

  if (merged.length === 0) {
    return undefined;
  }

  return [...new Set(merged)];
}

function mapSandboxProfile(profile?: SandboxProfile): ThreadOptions["sandboxMode"] {
  switch (profile) {
    case "read-only":
      return "read-only";
    case "workspace-write":
      return "workspace-write";
    case "full-access":
      return "danger-full-access";
    default:
      return undefined;
  }
}

function mapApprovalMode(mode?: ApprovalMode): ThreadOptions["approvalPolicy"] {
  switch (mode) {
    case "interactive":
      return "on-request";
    case "auto-approve-safe":
      return "untrusted";
    case "deny":
      return "never";
    default:
      return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
