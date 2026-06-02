type QueuedEvent<T> =
  | {
      kind: "value";
      value: T;
    }
  | {
      kind: "done";
    };

export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly events: QueuedEvent<T>[] = [];
  private readonly waiters: Array<{
    reject: (error: unknown) => void;
    resolve: (event: QueuedEvent<T>) => void;
  }> = [];
  private closed = false;
  private error: unknown;

  enqueue(value: T): void {
    if (this.closed) {
      return;
    }

    this.resolveNext({
      kind: "value",
      value,
    });
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.resolveNext({
      kind: "done",
    });
  }

  fail(error: unknown): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.error = error;

    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(error);
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const event = await this.shift();

      if (event.kind === "done") {
        return;
      }

      yield event.value;
    }
  }

  private shift(): Promise<QueuedEvent<T>> {
    const event = this.events.shift();

    if (event) {
      return Promise.resolve(event);
    }

    if (this.error !== undefined) {
      return Promise.reject(this.error);
    }

    if (this.closed) {
      return Promise.resolve({
        kind: "done",
      });
    }

    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  private resolveNext(event: QueuedEvent<T>): void {
    const waiter = this.waiters.shift();

    if (waiter) {
      waiter.resolve(event);
      return;
    }

    this.events.push(event);
  }
}
