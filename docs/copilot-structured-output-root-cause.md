# Copilot structured-output and cleanup root cause

## Incident boundary

Two authorized Recursive Frontier proposal attempts reached an authenticated Copilot CLI and failed with `structured_output_invalid`; cleanup then did not terminate. Neither attempt wrote a proposal, and frontier revision 1 remained unchanged.

The exact response bodies from those historical attempts are not recoverable. Claudex retained the body and AJV errors only on the in-memory `AgentError.raw`/`details`, Recursive Frontier replaced that error with a code-only `Error`, and the retained provider logs contain lifecycle and cleanup information but no assistant body. Consequently, classifying either historical body as non-JSON, fenced JSON, truncated JSON, or schema-invalid JSON would be unsupported. This evidence loss is itself the consumer-boundary defect fixed here.

## Conclusive findings

1. **The schema was post-hoc only.** Before this fix, `CopilotSession.runStreamed` passed only the original prompt and agent mode to `session.send`; `outputSchema` was held in `CopilotTurnState` and first used after an `assistant.message` event in `parseStructuredOutputText`. The installed `@github/copilot-sdk` 1.0.6 `MessageOptions` and `SessionConfig` APIs expose no native JSON-schema response-format field. Copilot therefore received no structured-output contract.
2. **The selected body was the last root `assistant.message` before `session.idle`.** Root assistant messages replace the current selection; subagent events are ignored. On idle, the selected text is parsed once with `JSON.parse`, then validated with AJV. Deterministic event fixtures prove an invalid intermediate message followed by a valid final message succeeds and report the selected message ID, assistant-message count, and event sequence on failure.
3. **Malformed output was not an adapter transformation.** Claudex validates the exact `event.data.content` string. Fixtures classify exact input as non-JSON, fenced JSON, prose-wrapped JSON, multiple JSON values, truncated JSON, or schema-invalid JSON without repair or retry. Schema-invalid fixtures retain exact AJV `instancePath` and `schemaPath` values.
4. **The hang was a runtime-ownership defect at cleanup.** Readiness started and stopped a transient probe client, but the client lazily created by `CopilotAdapter.createSession` was never exposed through adapter disposal and Recursive Frontier never disposed its selected Claudex runtime. The Copilot JSON-RPC child process could therefore retain active handles after the primary turn failure.

## Corrected request and event sequence

The corrected structured-output path is:

1. Recursive Frontier constructs the proposal JSON Schema and calls `session.run(..., { outputSchema })`.
2. Claudex canonicalizes that schema and appends an explicit JSON-only contract to the Copilot prompt because the installed SDK has no native structured-output field.
3. Copilot emits root session events. Claudex records their bounded type sequence and selects the final root `assistant.message` before `session.idle`.
4. Claudex validates the exact final text with `JSON.parse` and AJV. It neither strips fences nor extracts or repairs JSON.
5. A failure remains an `AgentError` across the Recursive Frontier boundary, preserving `code`, `provider`, `message`, `cause`, `details`, `extensions`, and in-memory `raw` data.
6. Optional diagnostics write only hashes, classification, exact validation paths, and a redacted/truncated structural excerpt. Primary and cleanup errors are separate.
7. Recursive Frontier disposes the selected runtime before removing its temporary workspace. Claudex bounds graceful stop and reserves part of the same total deadline for `forceStop`; cleanup failure is attached without replacing the primary failure.

## Reproducible evidence

Relevant implementation paths:

- `src/providers/copilot/input.ts`: prompt mapping and explicit JSON-only schema contract
- `src/providers/copilot/session.ts`, `events.ts`, and `results.ts`: SDK request, root-event selection, final-message capture, and idle termination
- `src/core/schema-validation.ts` and `structured-output-diagnostics.ts`: exact parsing, AJV validation, classification, hashing, and safe excerpt creation
- `src/providers/copilot/adapter.ts` and `cleanup.ts`: client ownership, bounded stop, and reserved force-stop phase
- `src/providers/copilot/sdk.ts` and `readiness.ts`: CLI resolution and normalized availability diagnostics
- `src/providers/claudex/resolution.ts`: construction/readiness exception isolation and fallback
- Recursive Frontier `src/provider.ts`, `provider-cleanup.ts`, and `provider-diagnostics.ts`: lifecycle boundary, error preservation, secure artifact, stderr report, and state-safe failure

- `test/providers/copilot/session.test.ts`
  - `Copilot run returns structured output from the completed assistant message`
  - `Copilot classifies rejected structured response as ...`
  - `Copilot reports schema-invalid JSON with exact AJV validation paths`
  - `Copilot validates only the final root assistant message selected before idle`
  - `Copilot abort signal calls session.abort and emits a normalized aborted failure`
- `test/providers/copilot/cleanup.test.ts`
  - owned-runtime disposal, primary cleanup errors, stop timeout, and bounded force-stop
- `test/providers/copilot/sdk-resolution.test.ts`
  - explicit connection path, `COPILOT_CLI_PATH`, `PATH`, and platform fallback order
- `test/providers/claudex/adapter.test.ts`
  - adapter-construction/readiness exception normalization and safe fallback
- Recursive Frontier `test/provider.test.ts`
  - complete `AgentError` preservation, secure diagnostic artifact, primary/cleanup separation, and consumer cleanup timeout
- Recursive Frontier `test/cli.test.ts`
  - failed proposal leaves no proposal and does not change frontier state

No live provider call was used to obtain this evidence.
