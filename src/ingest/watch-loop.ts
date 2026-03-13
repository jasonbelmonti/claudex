export type IngestWatchLoop = {
  stop(): Promise<void>;
};

export function createIngestWatchLoop(options: {
  intervalMs: number;
  onTick: () => Promise<void>;
  onTickError?: (error: unknown) => Promise<void> | void;
}): IngestWatchLoop {
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const timer = setInterval(() => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = options.onTick()
      .catch(async (error) => {
        stopped = true;
        clearInterval(timer);
        await options.onTickError?.(error);
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = null;
      });
  }, options.intervalMs);

  timer.unref?.();

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
