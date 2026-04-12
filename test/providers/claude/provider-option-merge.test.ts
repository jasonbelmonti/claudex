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
