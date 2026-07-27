import { AgentError } from "../../core/errors.js";
import type { ProviderReadiness } from "../../core/readiness.js";
import { resolveCodexBinary } from "./binary-resolution.js";
import { checkCodexReadiness } from "./readiness.js";
import type { CodexAdapterOptions } from "./types.js";

type CodexBinaryLifecycleOptions = Pick<
  CodexAdapterOptions,
  "binaryResolver" | "commandRunner" | "sdkOptions"
>;

export class CodexBinaryLifecycle {
  private resolvedBinary: string | undefined;
  private binaryCandidatePromise: Promise<string | null> | undefined;
  private readinessPromise: Promise<ProviderReadiness> | undefined;

  constructor(private readonly options: CodexBinaryLifecycleOptions) {}

  checkReadiness(): Promise<ProviderReadiness> {
    if (this.readinessPromise) {
      return this.readinessPromise;
    }

    const binaryCandidate = this.getBinaryCandidate();
    const readinessPromise = this.runReadiness(binaryCandidate);
    this.readinessPromise = readinessPromise;

    const clearReadiness = () => {
      if (this.readinessPromise === readinessPromise) {
        this.readinessPromise = undefined;
      }
    };
    void readinessPromise.then(clearReadiness, clearReadiness);

    return readinessPromise;
  }

  async resolveClientBinary(): Promise<string> {
    const pendingReadiness = this.readinessPromise;

    if (pendingReadiness) {
      return this.requireReadinessBinary(pendingReadiness);
    }

    const binaryCandidate = this.getBinaryCandidate();

    try {
      const binary = await this.resolveCandidate(binaryCandidate);
      const joinedReadiness = this.readinessPromise;

      if (joinedReadiness) {
        return await this.requireReadinessBinary(joinedReadiness);
      }
      if (!binary) {
        throw new AgentError({
          code: "missing_cli",
          provider: "codex",
          message: "Codex CLI is unavailable for SDK construction.",
          details: { stage: "adapter_construction" },
        });
      }

      return this.bindBinary(binary);
    } finally {
      this.clearBinaryCandidate(binaryCandidate);
    }
  }

  private async runReadiness(
    binaryCandidate: Promise<string | null>,
  ): Promise<ProviderReadiness> {
    try {
      return await checkCodexReadiness({
        sdkOptions: this.options.sdkOptions,
        commandRunner: this.options.commandRunner,
        binaryResolver: async () => await binaryCandidate,
        onBinaryResolved: (binary) => {
          this.bindBinary(binary);
        },
      });
    } finally {
      this.clearBinaryCandidate(binaryCandidate);
    }
  }

  private getBinaryCandidate(): Promise<string | null> {
    if (this.resolvedBinary) {
      return Promise.resolve(this.resolvedBinary);
    }

    this.binaryCandidatePromise ??= Promise.resolve().then(() =>
      (this.options.binaryResolver ?? resolveCodexBinary)(
        this.options.sdkOptions,
      ),
    );

    return this.binaryCandidatePromise;
  }

  private async resolveCandidate(
    binaryCandidate: Promise<string | null>,
  ): Promise<string | null> {
    try {
      return await binaryCandidate;
    } catch (error) {
      throw new AgentError({
        code: "provider_failure",
        provider: "codex",
        message: "Codex CLI detection failed before SDK construction.",
        cause: error,
        details: { stage: "adapter_construction" },
        raw: error,
      });
    }
  }

  private clearBinaryCandidate(candidate: Promise<string | null>): void {
    if (this.binaryCandidatePromise === candidate) {
      this.binaryCandidatePromise = undefined;
    }
  }

  private bindBinary(binary: string): string {
    this.resolvedBinary ??= binary;
    return this.resolvedBinary;
  }

  private async requireReadinessBinary(
    readinessPromise: Promise<ProviderReadiness>,
  ): Promise<string> {
    const readiness = await readinessPromise;

    if (this.resolvedBinary) {
      return this.resolvedBinary;
    }

    throw new AgentError({
      code:
        readiness.status === "missing_cli"
          ? "missing_cli"
          : "provider_failure",
      provider: "codex",
      message:
        "Codex CLI readiness did not establish an executable before SDK construction.",
      details: {
        readinessStatus: readiness.status,
        stage: "adapter_construction",
      },
      raw: readiness,
    });
  }
}
