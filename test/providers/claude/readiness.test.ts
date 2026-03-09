import { expect, test } from "bun:test";

import { ClaudeAdapter } from "../../../src/providers/claude/adapter";
import { FakeClaudeQuery, FakeClaudeQueryFactory } from "./fakes";

test("checkReadiness reports ready when initialization and account probes succeed", async () => {
  const factory = new FakeClaudeQueryFactory([new FakeClaudeQuery()]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("ready");
  expect(readiness.checks.map((check) => check.status)).toEqual(["pass", "pass"]);
  expect(factory.invocations[0]?.options.permissionMode).toBe("plan");
  expect(factory.invocations[0]?.options.persistSession).toBe(false);
  expect(factory.invocations[0]?.options.settingSources).toEqual([]);
});

test("checkReadiness strips session-affecting sdkOptions but preserves runtime defaults", async () => {
  const factory = new FakeClaudeQueryFactory([new FakeClaudeQuery()]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
    sdkOptions: {
      pathToClaudeCodeExecutable: "/tmp/claude",
      resume: "session-123",
      sessionId: "session-456",
      forkSession: true,
      resumeSessionAt: "message-789",
      continue: true,
    },
  });

  await adapter.checkReadiness();

  expect(factory.invocations[0]?.options.pathToClaudeCodeExecutable).toBe("/tmp/claude");
  expect(factory.invocations[0]?.options.resume).toBeUndefined();
  expect(factory.invocations[0]?.options.sessionId).toBeUndefined();
  expect(factory.invocations[0]?.options.forkSession).toBeUndefined();
  expect(factory.invocations[0]?.options.resumeSessionAt).toBeUndefined();
  expect(factory.invocations[0]?.options.continue).toBeUndefined();
});

test("checkReadiness reports missing_cli when query creation fails with ENOENT", async () => {
  const adapter = new ClaudeAdapter({
    queryFactory: () => {
      throw new Error("spawn claude ENOENT");
    },
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("missing_cli");
  expect(readiness.checks[0]?.kind).toBe("cli");
});

test("checkReadiness reports needs_auth when account lookup fails with auth guidance", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([], undefined, undefined, undefined, new Error("Authentication required. Run /login.")),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("needs_auth");
  expect(readiness.checks[0]?.kind).toBe("auth");
});

test("checkReadiness reports error on unexpected initialization failures", async () => {
  const factory = new FakeClaudeQueryFactory([
    new FakeClaudeQuery([], undefined, undefined, new Error("Unexpected runtime failure")),
  ]);
  const adapter = new ClaudeAdapter({
    queryFactory: factory.create,
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("error");
  expect(readiness.checks[0]?.summary).toBe("Claude readiness probe failed");
});
