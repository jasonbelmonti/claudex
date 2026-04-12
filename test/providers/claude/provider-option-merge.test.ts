import { expect, test } from "bun:test";

import { mergeClaudeProviderOptions } from "../../../src/providers/claude/provider-option-merge";

test("mergeClaudeProviderOptions recursively merges sibling Claude namespaces", () => {
  const merged = mergeClaudeProviderOptions(
    {
      shared: {
        untouched: true,
      },
      claude: {
        pluginConfig: {
          alpha: true,
          nested: {
            a: 1,
            list: ["base"],
          },
        },
        mcp: {
          enabled: true,
        },
      },
    },
    {
      other: 42,
      claude: {
        pluginConfig: {
          beta: true,
          nested: {
            b: 2,
            list: ["override"],
          },
        },
        mcp: {
          server: "local",
        },
      },
    },
  );

  expect(merged).toEqual({
    shared: {
      untouched: true,
    },
    other: 42,
    claude: {
      pluginConfig: {
        alpha: true,
        beta: true,
        nested: {
          a: 1,
          b: 2,
          list: ["override"],
        },
      },
      mcp: {
        enabled: true,
        server: "local",
      },
    },
  });
});

test("mergeClaudeProviderOptions preserves object instances as leaf overrides", () => {
  const baseController = new AbortController();
  const overrideController = new AbortController();

  const merged = mergeClaudeProviderOptions(
    {
      claude: {
        options: {
          abortController: baseController,
          hooks: {
            pre: ["base"],
          },
        },
      },
    },
    {
      claude: {
        options: {
          abortController: overrideController,
          hooks: {
            post: ["override"],
          },
        },
      },
    },
  );

  expect(merged?.claude).toEqual({
    options: {
      abortController: overrideController,
      hooks: {
        pre: ["base"],
        post: ["override"],
      },
    },
  });
  expect(
    ((merged?.claude as Record<string, unknown>).options as Record<string, unknown>)
      .abortController,
  ).toBe(overrideController);
});

test("mergeClaudeProviderOptions preserves cycles when both Claude records recurse into themselves", () => {
  const basePluginConfig: Record<string, unknown> = {
    alpha: true,
  };
  basePluginConfig.self = basePluginConfig;

  const overridePluginConfig: Record<string, unknown> = {
    beta: true,
  };
  overridePluginConfig.self = overridePluginConfig;

  const merged = mergeClaudeProviderOptions(
    {
      claude: {
        pluginConfig: basePluginConfig,
      },
    },
    {
      claude: {
        pluginConfig: overridePluginConfig,
      },
    },
  );

  const pluginConfig = (merged?.claude as Record<string, unknown>)
    .pluginConfig as Record<string, unknown>;

  expect(pluginConfig.alpha).toBe(true);
  expect(pluginConfig.beta).toBe(true);
  expect(pluginConfig.self).toBe(pluginConfig);
});

test("mergeClaudeProviderOptions treats __proto__ as data instead of mutating prototypes", () => {
  const overridePluginConfig = JSON.parse(
    '{"safe":true,"__proto__":{"polluted":true}}',
  ) as Record<string, unknown>;

  const merged = mergeClaudeProviderOptions(
    {
      claude: {
        pluginConfig: {
          alpha: true,
        },
      },
    },
    {
      claude: {
        pluginConfig: overridePluginConfig,
      },
    },
  );

  const pluginConfig = (merged?.claude as Record<string, unknown>)
    .pluginConfig as Record<string, unknown>;

  expect(pluginConfig.alpha).toBe(true);
  expect(pluginConfig.safe).toBe(true);
  expect(Object.getPrototypeOf(pluginConfig)).toBe(Object.prototype);
  expect(
    Object.getOwnPropertyDescriptor(pluginConfig, "__proto__")?.value,
  ).toEqual({
    polluted: true,
  });
  expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
});
