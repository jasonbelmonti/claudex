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
  await dispatchWarnings(options, record);

  if (record.kind === "event") {
    await dispatchObservedEvent(options, record);
  } else {
    await dispatchObservedSession(options, record);
  }

  await options.onRecord?.(record);
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

async function dispatchWarnings(
  options: SessionIngestServiceOptions,
  record: ObservedIngestRecord,
): Promise<void> {
  for (const warning of record.warnings ?? []) {
    await options.onWarning?.(warning);
  }
}
