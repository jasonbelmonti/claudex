import type { CodexOptions } from "@openai/codex-sdk";

import type { ProviderReadiness } from "../../core/readiness.js";
import { resolveCodexBinary } from "./binary-resolution.js";
import { createCodexCapabilities } from "./capabilities.js";
import { runCodexCommand } from "./command-runner.js";
import type {
  CodexBinaryResolver,
  CodexCommandRunner,
  CodexCommandResult,
} from "./types.js";
export { isCodexPathOverride, resolveCodexBinary } from "./binary-resolution.js";

export async function checkCodexReadiness(options: {
  sdkOptions?: CodexOptions;
  commandRunner?: CodexCommandRunner;
  binaryResolver?: CodexBinaryResolver;
  onBinaryResolved?: (binary: string) => void;
} = {}): Promise<ProviderReadiness> {
  const commandRunner = options.commandRunner ?? runCodexCommand;
  const binaryResolver = options.binaryResolver ?? resolveCodexBinary;
  const baseCapabilities = createCodexCapabilities();
  let binary: string | null;

  try {
    binary = await binaryResolver(options.sdkOptions);
  } catch (error) {
    return createCodexReadinessError({
      summary: "Codex CLI detection failed",
      detail: toErrorDetail(error),
      capabilities: baseCapabilities,
      raw: error,
    });
  }

  if (!binary) {
    return {
      provider: "codex",
      status: "missing_cli",
      checks: [
        {
          kind: "cli",
          status: "fail",
          summary: "Codex CLI is not available",
          detail: "Install `codex` or provide a valid `codexPathOverride`.",
        },
      ],
      capabilities: baseCapabilities,
    };
  }

  let versionResult: CodexCommandResult;

  try {
    versionResult = await commandRunner(binary, ["--version"]);
  } catch (error) {
    return createCodexReadinessError({
      summary: "Codex CLI failed version probe",
      detail: toErrorDetail(error),
      capabilities: baseCapabilities,
      raw: error,
    });
  }

  if (versionResult.exitCode !== 0) {
    return {
      provider: "codex",
      status: "error",
      checks: [
        {
          kind: "cli",
          status: "fail",
          summary: "Codex CLI failed version probe",
          detail: versionResult.stderr || versionResult.stdout,
        },
      ],
      capabilities: baseCapabilities,
      raw: versionResult,
    };
  }

  options.onBinaryResolved?.(binary);

  const versionOutput = versionResult.stdout || versionResult.stderr;
  const cliDetectedCheck = {
    kind: "cli" as const,
    status: "pass" as const,
    summary: "Codex CLI detected",
    detail: versionResult.stdout,
  };
  const providerVersion = parseCodexVersion(versionOutput);
  const capabilities = createCodexCapabilities({
    providerVersion,
  });
  let authResult: CodexCommandResult;

  try {
    authResult = await commandRunner(binary, ["login", "status"]);
  } catch (error) {
    return createCodexReadinessResult({
      checks: [
        cliDetectedCheck,
        {
          kind: "auth",
          status: "fail",
          summary: "Codex CLI auth probe failed",
          detail: toErrorDetail(error),
        },
      ],
      capabilities,
      raw: {
        version: versionResult,
        auth: error,
      },
    });
  }

  const authOutput = `${authResult.stdout}\n${authResult.stderr}`.trim();
  const needsAuth = looksLikeNeedsAuth(authOutput);

  if (needsAuth) {
    return {
      provider: "codex",
      status: "needs_auth",
      checks: [
        cliDetectedCheck,
        {
          kind: "auth",
          status: "fail",
          summary: "Codex CLI needs login",
          detail: authOutput,
        },
      ],
      capabilities,
      raw: {
        version: versionResult,
        auth: authResult,
      },
    };
  }

  if (authResult.exitCode === 0 && /logged in/i.test(authOutput)) {
    return {
      provider: "codex",
      status: "ready",
      checks: [
        {
          kind: "cli",
          status: "pass",
          summary: "Codex CLI detected",
          detail: versionResult.stdout,
        },
        {
          kind: "auth",
          status: "pass",
          summary: "Codex CLI authentication is available",
          detail: authOutput,
        },
      ],
      capabilities,
      raw: {
        version: versionResult,
        auth: authResult,
      },
    };
  }

  return {
    provider: "codex",
    status: authResult.exitCode === 0 ? "degraded" : "error",
    checks: [
      cliDetectedCheck,
      {
        kind: "auth",
        status: authResult.exitCode === 0 ? "warn" : "fail",
        summary: "Codex CLI auth status was inconclusive",
        detail: authOutput,
      },
    ],
    capabilities,
    raw: {
      version: versionResult,
      auth: authResult,
    },
  };
}

function parseCodexVersion(output: string): string | undefined {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match?.[1];
}

function looksLikeNeedsAuth(output: string): boolean {
  return /not logged in|sign in|login required|authenticate/i.test(output);
}

function createCodexReadinessError(params: {
  summary: string;
  detail: string;
  capabilities: ProviderReadiness["capabilities"];
  raw: unknown;
}): ProviderReadiness {
  return createCodexReadinessResult({
    checks: [
      {
        kind: "cli",
        status: "fail",
        summary: params.summary,
        detail: params.detail,
      },
    ],
    capabilities: params.capabilities,
    raw: params.raw,
  });
}

function toErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createCodexReadinessResult(params: {
  checks: ProviderReadiness["checks"];
  capabilities: ProviderReadiness["capabilities"];
  raw: unknown;
}): ProviderReadiness {
  return {
    provider: "codex",
    status: "error",
    checks: params.checks,
    capabilities: params.capabilities,
    raw: params.raw,
  };
}
