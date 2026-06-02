import { expect, test } from "#test-support";

import { AsyncEventQueue } from "../../../src/providers/copilot/event-queue.js";

test("AsyncEventQueue close resolves every pending iterator", async () => {
  const queue = new AsyncEventQueue<string>();
  const firstIterator = queue[Symbol.asyncIterator]();
  const secondIterator = queue[Symbol.asyncIterator]();

  const firstResult = firstIterator.next();
  const secondResult = secondIterator.next();

  queue.close();

  await expect(firstResult).resolves.toEqual({
    done: true,
    value: undefined,
  });
  await expect(secondResult).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test("AsyncEventQueue preserves undefined as a failure payload", async () => {
  const queue = new AsyncEventQueue<string>();

  queue.fail(undefined);

  await expect(queue[Symbol.asyncIterator]().next()).rejects.toBeUndefined();
});
