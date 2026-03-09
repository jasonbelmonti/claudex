import type { ProviderCapabilities } from "./capabilities";
import type { ProviderId } from "./provider";

export type ProviderReadinessStatus =
  | "ready"
  | "missing_cli"
  | "needs_auth"
  | "degraded"
  | "error";

export type ReadinessCheckKind = "cli" | "auth" | "runtime" | "filesystem";

export type ReadinessCheckStatus = "pass" | "warn" | "fail" | "unknown";

export type ReadinessCheck = {
  kind: ReadinessCheckKind;
  status: ReadinessCheckStatus;
  summary: string;
  detail?: string;
};

export type ProviderReadiness = {
  provider: ProviderId;
  status: ProviderReadinessStatus;
  checks: ReadinessCheck[];
  capabilities: ProviderCapabilities;
  raw?: unknown;
  extensions?: Record<string, unknown>;
};

export function isProviderReady(readiness: ProviderReadiness): boolean {
  return readiness.status === "ready";
}
