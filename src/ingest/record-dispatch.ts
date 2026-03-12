import type {
  ObservedAgentEvent,
  ObservedIngestRecord,
  ObservedSessionRecord,
} from "./events";
import type { SessionIngestServiceOptions } from "./service";

export async function dispatchObservedRecord(
  options: SessionIngestServiceOptions,
  record: ObservedIngestRecord,
): Promise<void> {
  await options.onRecord?.(record);

  if (record.kind === "event") {
    await dispatchObservedEvent(options, record);
    return;
  }

  await dispatchObservedSession(options, record);
}

async function dispatchObservedEvent(
  options: SessionIngestServiceOptions,
  record: ObservedAgentEvent,
): Promise<void> {
  await options.onObservedEvent?.(record);
}

async function dispatchObservedSession(
  options: SessionIngestServiceOptions,
  record: ObservedSessionRecord,
): Promise<void> {
  await options.onObservedSession?.(record);
}
