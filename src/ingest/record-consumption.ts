import type { IngestCursor } from "./cursor";
import type { ObservedIngestRecord } from "./events";

export type RecordConsumptionResult = {
  latestCursor: IngestCursor | null;
  parseError: unknown | null;
  consumerError: unknown | null;
};

export async function consumeParsedRecords(options: {
  initialCursor: IngestCursor | null;
  records: AsyncIterable<ObservedIngestRecord>;
  onRecord: (record: ObservedIngestRecord) => Promise<void>;
}): Promise<RecordConsumptionResult> {
  const iterator = options.records[Symbol.asyncIterator]();
  let latestCursor = options.initialCursor;

  while (true) {
    let nextRecord: IteratorResult<ObservedIngestRecord>;

    try {
      nextRecord = await iterator.next();
    } catch (error) {
      return {
        latestCursor,
        parseError: error,
        consumerError: null,
      };
    }

    if (nextRecord.done) {
      return {
        latestCursor,
        parseError: null,
        consumerError: null,
      };
    }

    try {
      await options.onRecord(nextRecord.value);
    } catch (consumerError) {
      try {
        await iterator.return?.();
      } catch {
        // Preserve the original consumer failure and the last committed cursor
        // even when iterator cleanup also fails.
      }

      return {
        latestCursor,
        parseError: null,
        consumerError,
      };
    }

    latestCursor = nextRecord.value.cursor ?? latestCursor;
  }
}
