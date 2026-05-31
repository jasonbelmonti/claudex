import * as rootApi from "@jasonbelmonti/claudex";
import { describe, expect, it } from "vitest";

import {
  createCopilotClient,
  type CopilotClientFactory,
} from "../../../src/providers/copilot/index.js";
import { createCopilotClient as createCopilotClientFromProviders } from "../../../src/providers/index.js";

describe("Copilot SDK factory", () => {
  it("constructs a client-compatible facade without starting the runtime", () => {
    const factory: CopilotClientFactory = createCopilotClient;
    const client = factory({ useLoggedInUser: false });

    expect(typeof client.start).toBe("function");
    expect(typeof client.stop).toBe("function");
    expect(typeof client.forceStop).toBe("function");
    expect(typeof client.createSession).toBe("function");
    expect(typeof client.resumeSession).toBe("function");
  });

  it("is exported from the provider-local surface but not the package root", () => {
    expect(createCopilotClientFromProviders).toBe(createCopilotClient);
    expect("createCopilotClient" in rootApi).toBe(false);
  });
});
