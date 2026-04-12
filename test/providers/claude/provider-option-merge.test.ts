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
