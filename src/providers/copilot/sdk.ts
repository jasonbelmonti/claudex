import { accessSync, constants, statSync } from "node:fs";
import { delimiter, extname, join } from "node:path";
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
  const environmentPath =
    configuredEnv.COPILOT_CLI_PATH?.trim() ??
    env.COPILOT_CLI_PATH?.trim();

  if (environmentPath) {
    return withCopilotCliPath(options, environmentPath);
  }

  const executable = findCopilotOnPath({
    env: {
      ...env,
      ...configuredEnv,
    },
    isExecutableFile: dependencies.isExecutableFile ?? isExecutableFile,
    platform: dependencies.platform ?? process.platform,
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

  const extensions = executableExtensions(params.env, params.platform);
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) {
      continue;
    }

    for (const extension of extensions) {
      const candidate = join(directory, `copilot${extension}`);
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
  if (platform !== "win32") {
    return env.PATH;
  }

  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path");
  return pathKey ? env[pathKey] : undefined;
}

function executableExtensions(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
): string[] {
  if (platform !== "win32") {
    return [""];
  }

  const configured = env.PATHEXT?.split(";").filter(Boolean) ?? [
    ".EXE",
    ".CMD",
    ".BAT",
    ".COM",
  ];

  return extname("copilot")
    ? [""]
    : configured.map((extension) => extension.toLowerCase());
}

function isExecutableFile(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
}
