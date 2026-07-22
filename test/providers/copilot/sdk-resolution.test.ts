import { expect, test } from "#test-support";

import { resolveCopilotSdkOptions } from "../../../src/providers/copilot/sdk.js";

test("Copilot CLI resolution preserves an explicit connection path", () => {
  const options = resolveCopilotSdkOptions(
    {
      connection: {
        kind: "stdio",
        path: "/explicit/copilot",
      },
    },
    {
      env: {
        COPILOT_CLI_PATH: "/environment/copilot",
        PATH: "/path-bin",
      },
      isExecutableFile: () => true,
    },
  );

  expect(options.connection).toMatchObject({
    kind: "stdio",
    path: "/explicit/copilot",
  });
});

test("Copilot CLI resolution uses COPILOT_CLI_PATH before PATH", () => {
  const options = resolveCopilotSdkOptions(
    {},
    {
      env: {
        COPILOT_CLI_PATH: "/environment/copilot",
        PATH: "/path-bin",
      },
      isExecutableFile: () => true,
    },
  );

  expect(options.connection).toMatchObject({
    kind: "stdio",
    path: "/environment/copilot",
  });
});

test("Copilot CLI resolution discovers an executable on PATH", () => {
  const options = resolveCopilotSdkOptions(
    {},
    {
      env: {
        PATH: "/first:/second",
      },
      isExecutableFile: (path) => path === "/second/copilot",
      platform: "darwin",
    },
  );

  expect(options.connection).toMatchObject({
    kind: "stdio",
    path: "/second/copilot",
  });
});

test("Copilot CLI resolution uses injected Windows path semantics", () => {
  const options = resolveCopilotSdkOptions(
    {},
    {
      env: {
        Path: "C:\\first;D:\\two",
        PATHEXT: ".EXE;.CMD",
      },
      isExecutableFile: (path) => path === "D:\\two\\copilot.exe",
      platform: "win32",
    },
  );

  expect(options.connection).toMatchObject({
    kind: "stdio",
    path: "D:\\two\\copilot.exe",
  });
});

test("Copilot CLI resolution leaves fallback to the SDK platform package when no CLI is found", () => {
  const options = { logLevel: "error" as const };

  expect(
    resolveCopilotSdkOptions(options, {
      env: { PATH: "/missing" },
      isExecutableFile: () => false,
    }),
  ).toBe(options);
});
