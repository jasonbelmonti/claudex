export function createDeterministicAuditEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const deterministicEnv: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      deterministicEnv[key] = value;
    }
  }

  deterministicEnv.CLAUDEX_AUDIT_LIVE = "0";
  return deterministicEnv;
}
