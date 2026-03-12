export type IngestWatchLoop = {
  stop(): Promise<void>;
};

export function createIngestWatchLoop(options: {
  intervalMs: number;
  onTick: () => Promise<void>;
}): IngestWatchLoop {
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const timer = setInterval(() => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = options.onTick()
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
