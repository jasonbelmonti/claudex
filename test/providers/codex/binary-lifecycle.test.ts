import { expect, test } from "#test-support";

import { CodexAdapter } from "../../../src/providers/codex/adapter.js";
import type {
  CodexClientLike,
  CodexCommandRunner,
} from "../../../src/providers/codex/types.js";
import { FakeCodexClient, FakeCodexThread } from "./fakes.js";

test.each([
  {
    name: "default PATH resolution",
    resolvedBinary: "/resolved/default/codex",
    sdkOptions: undefined,
  },
  {
    name: "explicit override",
    resolvedBinary: "/resolved/override/codex",
    sdkOptions: { codexPathOverride: "workspace-codex" },
  },
])(
  "readiness and lazy SDK construction share the exact binary for $name",
  async ({ resolvedBinary, sdkOptions }) => {
    const commands: string[] = [];
    const factoryOptions: Array<Record<string, unknown>> = [];
    let factoryCalls = 0;
    const runner: CodexCommandRunner = async (command, args) => {
      commands.push(command);
      return args[0] === "--version"
        ? {
            exitCode: 0,
            stdout: "codex-cli 0.103.0",
            stderr: "",
          }
        : {
            exitCode: 0,
            stdout: "Logged in using ChatGPT",
            stderr: "",
          };
    };
    const clientFactory = (options: Record<string, unknown>): CodexClientLike => {
      factoryCalls += 1;
      factoryOptions.push(options);
      return new FakeCodexClient([new FakeCodexThread([])]);
    };
    const adapter = new CodexAdapter({
      binaryResolver: async () => resolvedBinary,
      clientFactory,
      commandRunner: runner,
      ...(sdkOptions ? { sdkOptions } : {}),
    });

    expect(factoryCalls).toBe(0);
    await expect(adapter.checkReadiness()).resolves.toMatchObject({
      status: "ready",
    });
    await adapter.createSession();

    expect(commands).toEqual([resolvedBinary, resolvedBinary]);
    expect(factoryCalls).toBe(1);
    expect(factoryOptions).toEqual([
      {
        ...(sdkOptions ?? {}),
        codexPathOverride: resolvedBinary,
      },
    ]);
  },
);

test("an injected Codex client bypasses binary discovery deterministically", async () => {
  let binaryResolutionCalls = 0;
  const client = new FakeCodexClient([new FakeCodexThread([])]);
  const adapter = new CodexAdapter({
    client,
    binaryResolver: async () => {
      binaryResolutionCalls += 1;
      throw new Error("Injected clients must not resolve a binary.");
    },
  });

  await expect(adapter.checkReadiness()).resolves.toMatchObject({
    provider: "codex",
    status: "ready",
  });
  await expect(adapter.createSession()).resolves.toMatchObject({
    provider: "codex",
  });
  expect(binaryResolutionCalls).toBe(0);
});

test("readiness stays pinned to the executable used by a cached client", async () => {
  const resolvedBinaries: [string, string] = [
    "/resolved/first/codex",
    "/resolved/second/codex",
  ];
  const commands: string[] = [];
  const factoryOptions: Array<Record<string, unknown>> = [];
  let binaryResolutionCalls = 0;
  const adapter = new CodexAdapter({
    binaryResolver: async () => {
      const binary =
        resolvedBinaries[
          Math.min(binaryResolutionCalls, resolvedBinaries.length - 1)
        ] ?? resolvedBinaries[0];
      binaryResolutionCalls += 1;
      return binary;
    },
    clientFactory(options) {
      factoryOptions.push(options);
      return new FakeCodexClient([
        new FakeCodexThread([]),
        new FakeCodexThread([]),
      ]);
    },
    commandRunner: async (command, args) => {
      commands.push(command);
      return args[0] === "--version"
        ? {
            exitCode: 0,
            stdout: "codex-cli 0.103.0",
            stderr: "",
          }
        : {
            exitCode: 0,
            stdout: "Logged in using ChatGPT",
            stderr: "",
          };
    },
  });

  await adapter.checkReadiness();
  await adapter.createSession();
  await adapter.checkReadiness();
  await adapter.createSession();

  expect(binaryResolutionCalls).toBe(1);
  expect(commands).toEqual([
    resolvedBinaries[0],
    resolvedBinaries[0],
    resolvedBinaries[0],
    resolvedBinaries[0],
  ]);
  expect(factoryOptions).toEqual([
    { codexPathOverride: resolvedBinaries[0] },
  ]);
});

test("concurrent readiness and client construction share one binary lifecycle", async () => {
  const binaries = [
    "/resolved/readiness-a/codex",
    "/resolved/readiness-b/codex",
    "/resolved/execution/codex",
  ] as const;
  const resolutions = [
    createDeferred<string | null>(),
    createDeferred<string | null>(),
    createDeferred<string | null>(),
  ] as const;
  const commands: string[] = [];
  const factoryOptions: Array<Record<string, unknown>> = [];
  let binaryResolutionCalls = 0;
  const adapter = new CodexAdapter({
    binaryResolver: () => {
      const resolution =
        resolutions[
          Math.min(binaryResolutionCalls, resolutions.length - 1)
        ] ?? resolutions[0];
      binaryResolutionCalls += 1;
      return resolution.promise;
    },
    clientFactory(options) {
      factoryOptions.push(options);
      return new FakeCodexClient([new FakeCodexThread([])]);
    },
    commandRunner: async (command, args) => {
      commands.push(command);
      return args[0] === "--version"
        ? {
            exitCode: 0,
            stdout: "codex-cli 0.103.0",
            stderr: "",
          }
        : {
            exitCode: 0,
            stdout: "Logged in using ChatGPT",
            stderr: "",
          };
    },
  });

  const firstReadiness = adapter.checkReadiness();
  const secondReadiness = adapter.checkReadiness();
  const session = adapter.createSession();

  for (const [index, resolution] of resolutions.entries()) {
    resolution.resolve(binaries[index] ?? binaries[0]);
  }

  await expect(firstReadiness).resolves.toMatchObject({ status: "ready" });
  await expect(secondReadiness).resolves.toMatchObject({ status: "ready" });
  await expect(session).resolves.toMatchObject({ provider: "codex" });

  expect(binaryResolutionCalls).toBe(1);
  expect(commands).toEqual([binaries[0], binaries[0]]);
  expect(factoryOptions).toEqual([
    { codexPathOverride: binaries[0] },
  ]);
});

test("client construction waits for readiness that joins its binary candidate", async () => {
  const binaries = [
    "/resolved/failing-create-first/codex",
    "/resolved/recovered/codex",
  ] as const;
  const firstResolution = createDeferred<string | null>();
  const commands: string[] = [];
  const factoryOptions: Array<Record<string, unknown>> = [];
  let binaryResolutionCalls = 0;
  const adapter = new CodexAdapter({
    binaryResolver: async () => {
      binaryResolutionCalls += 1;
      return binaryResolutionCalls === 1
        ? await firstResolution.promise
        : binaries[1];
    },
    clientFactory(options) {
      factoryOptions.push(options);
      return new FakeCodexClient([new FakeCodexThread([])]);
    },
    commandRunner: async (command, args) => {
      commands.push(command);
      if (command === binaries[0]) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "broken executable",
        };
      }
      return args[0] === "--version"
        ? {
            exitCode: 0,
            stdout: "codex-cli 0.103.0",
            stderr: "",
          }
        : {
            exitCode: 0,
            stdout: "Logged in using ChatGPT",
            stderr: "",
          };
    },
  });

  const firstSession = adapter.createSession();
  const firstReadiness = adapter.checkReadiness();
  firstResolution.resolve(binaries[0]);

  await expect(firstSession).rejects.toMatchObject({
    code: "provider_failure",
    provider: "codex",
  });
  await expect(firstReadiness).resolves.toMatchObject({ status: "error" });
  await expect(adapter.checkReadiness()).resolves.toMatchObject({
    status: "ready",
  });
  await expect(adapter.createSession()).resolves.toMatchObject({
    provider: "codex",
  });

  expect(binaryResolutionCalls).toBe(2);
  expect(commands).toEqual([binaries[0], binaries[1], binaries[1]]);
  expect(factoryOptions).toEqual([
    { codexPathOverride: binaries[1] },
  ]);
});

test("a failed readiness candidate does not become the execution binary", async () => {
  const binaries = [
    "/resolved/failing/codex",
    "/resolved/working/codex",
  ] as const;
  const commands: string[] = [];
  const factoryOptions: Array<Record<string, unknown>> = [];
  let binaryResolutionCalls = 0;
  const adapter = new CodexAdapter({
    binaryResolver: async () => {
      const binary =
        binaries[
          Math.min(binaryResolutionCalls, binaries.length - 1)
        ] ?? binaries[0];
      binaryResolutionCalls += 1;
      return binary;
    },
    clientFactory(options) {
      factoryOptions.push(options);
      return new FakeCodexClient([new FakeCodexThread([])]);
    },
    commandRunner: async (command, args) => {
      commands.push(command);
      if (command === binaries[0]) {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "broken executable",
        };
      }
      return args[0] === "--version"
        ? {
            exitCode: 0,
            stdout: "codex-cli 0.103.0",
            stderr: "",
          }
        : {
            exitCode: 0,
            stdout: "Logged in using ChatGPT",
            stderr: "",
          };
    },
  });

  await expect(adapter.checkReadiness()).resolves.toMatchObject({
    status: "error",
  });
  await expect(adapter.checkReadiness()).resolves.toMatchObject({
    status: "ready",
  });
  await expect(adapter.createSession()).resolves.toMatchObject({
    provider: "codex",
  });

  expect(binaryResolutionCalls).toBe(2);
  expect(commands).toEqual([binaries[0], binaries[1], binaries[1]]);
  expect(factoryOptions).toEqual([
    { codexPathOverride: binaries[1] },
  ]);
});

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve: (value: T) => void = () => {
    throw new Error("Deferred promise resolved before initialization.");
  };
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
