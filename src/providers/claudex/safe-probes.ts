import type { ProviderId } from "../../core/provider.js";
import type { ProviderReadiness } from "../../core/readiness.js";
import type { SafeProviderProbe, SafeProviderProbeCheck } from "./resolved-provider-types.js";

const SENSITIVE_SUMMARY_LABEL =
  /\b(?:authorization|proxy[-_ ]?authorization|api[-_ ]?key|access[-_ ]?(?:key|token)|client[-_ ]?secret|private[-_ ]?key|session[-_ ]?cookie|set[-_ ]?cookie|cookie|bearer|token|password|passphrase|secret|credential|prompt|response)\b/i;
const CREDENTIAL_SHAPE =
  /\b(?:(?:AKIA|ASIA)[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9_-]{16,}|glpat-[A-Za-z0-9_-]{16,}|sk-(?:proj-)?[A-Za-z0-9_-]{16,})\b/i;

export function toSafeProviderProbe(
  readiness: ProviderReadiness,
): SafeProviderProbe {
  return snapshotSafeProviderProbe({
    provider: readiness.provider,
    status: readiness.status,
    checks: readiness.checks.map((check) => ({
      kind: check.kind,
      status: check.status,
      summary: safeProbeText(check.summary, 256),
    })),
  });
}

export function createSafeFailureProbe(
  provider: ProviderId,
  stage: "adapter_construction" | "readiness",
): SafeProviderProbe {
  return snapshotSafeProviderProbe({
    provider,
    status: "error",
    checks: [
      {
        kind: "runtime",
        status: "fail",
        summary:
          stage === "adapter_construction"
            ? `${provider} adapter construction failed`
            : `${provider} readiness check failed`,
      },
    ],
  });
}

export function snapshotSafeProviderProbe(probe: {
  readonly provider: ProviderId;
  readonly status: ProviderReadiness["status"];
  readonly checks: readonly SafeProviderProbeCheck[];
}): SafeProviderProbe {
  const checks = probe.checks.map((check) => Object.freeze({ kind: check.kind, status: check.status, summary: check.summary }));

  return Object.freeze({
    provider: probe.provider,
    status: probe.status,
    checks: Object.freeze(checks),
  });
}

function safeProbeText(value: unknown, maximumLength: number): string {
  const text = String(value);
  if (SENSITIVE_SUMMARY_LABEL.test(text) || CREDENTIAL_SHAPE.test(text)) {
    return "<redacted-sensitive-summary>";
  }

  return redactSensitiveText(text).slice(0, maximumLength);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer <redacted>")
    .replace(
      /\b(token|password|secret|credential|prompt|response)\s*[=:]\s*[^\s,;]+/gi,
      "$1=<redacted>",
    )
    .replace(
      /\b(?:gh[pousr]_|github_pat_|npm_|glpat-|sk-(?:proj-)?)[A-Za-z0-9_-]{16,}\b/gi,
      "<redacted-sensitive>",
    )
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, "<redacted>");
}
