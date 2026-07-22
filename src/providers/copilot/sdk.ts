import { accessSync, constants, statSync } from "node:fs";
import { posix, win32 } from "node:path";
import {
  CopilotClient,
  type CopilotClientOptions,
} from "@github/copilot-sdk";

import type { CopilotClientFactory } from "./types.js";

export const createCopilotClient: CopilotClientFactory = (
  options: CopilotClientOptions = {},
) => new CopilotClient(resolveCopilotSdkOptions(options));

type CopilotPathResolutionDependencies = {
  env?: NodeJS.ProcessEnv;
  isExecutableFile?: (path: string) => boolean;
  platform?: NodeJS.Platform;
};

export function resolveCopilotSdkOptions(
  options: CopilotClientOptions = {},
  dependencies: CopilotPathResolutionDependencies = {},
): CopilotClientOptions {
  if (options.connection?.kind === "uri") {
    return options;
  }

  if (options.connection?.path?.trim()) {
    return options;
  }

  const env = dependencies.env ?? process.env;
  const configuredEnv = options.env ?? {};
  const platform = dependencies.platform ?? process.platform;
  const environmentPath =
    getEnvironmentValue(configuredEnv, "COPILOT_CLI_PATH", platform)?.trim() ||
    getEnvironmentValue(env, "COPILOT_CLI_PATH", platform)?.trim();

  if (environmentPath) {
    return withCopilotCliPath(options, environmentPath);
  }

  const executable = findCopilotOnPath({
    env: mergeEnvironments(env, configuredEnv, platform),
    isExecutableFile: dependencies.isExecutableFile ?? isExecutableFile,
    platform,
  });

  return executable ? withCopilotCliPath(options, executable) : options;
}

function withCopilotCliPath(
  options: CopilotClientOptions,
  path: string,
): CopilotClientOptions {
  const connection = options.connection;

  if (!connection) {
    return {
      ...options,
      connection: {
        kind: "stdio",
        path,
      },
    };
  }

  if (connection.kind === "uri") {
    return options;
  }

  return {
    ...options,
    connection: {
      ...connection,
      path,
    },
  };
}

function findCopilotOnPath(params: {
  env: NodeJS.ProcessEnv;
  isExecutableFile: (path: string) => boolean;
  platform: NodeJS.Platform;
}): string | undefined {
  const pathValue = getPathValue(params.env, params.platform);
  if (!pathValue) {
    return undefined;
  }

  const pathApi = params.platform === "win32" ? win32 : posix;
  const extensions = executableExtensions(params.env, params.platform);
  for (const directory of pathValue.split(pathApi.delimiter)) {
    if (!directory) {
      continue;
    }

    for (const extension of extensions) {
      const candidate = pathApi.join(directory, `copilot${extension}`);
      if (params.isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function getPathValue(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string | undefined {
  return getEnvironmentValue(env, "PATH", platform);
}

function executableExtensions(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  if (platform !== "win32") {
    return [""];
  }

  const configured =
    getEnvironmentValue(env, "PATHEXT", platform)
      ?.split(";")
      .filter(Boolean) ?? [".EXE", ".CMD", ".BAT", ".COM"];

  return configured.map((extension) => extension.toLowerCase());
}

function getEnvironmentValue(
  env: NodeJS.ProcessEnv,
  name: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform !== "win32") {
    return env[name];
  }

  const key = Object.keys(env).find(
    (candidate) => candidate.toLowerCase() === name.toLowerCase(),
  );
  return key === undefined ? undefined : env[key];
}

function mergeEnvironments(
  ambient: NodeJS.ProcessEnv,
  configured: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): NodeJS.ProcessEnv {
  if (platform !== "win32") {
    return { ...ambient, ...configured };
  }

  const merged = new Map<string, [string, string | undefined]>();
  for (const [key, value] of Object.entries(ambient)) {
    merged.set(key.toLowerCase(), [key, value]);
  }
  for (const [key, value] of Object.entries(configured)) {
    merged.set(key.toLowerCase(), [key, value]);
  }

  return Object.fromEntries(merged.values());
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
