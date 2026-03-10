import type { AgentProviderAdapter, ProviderId } from "../../src/core/provider";
import type { ProviderReadinessStatus } from "../../src/core/readiness";
import type { AgentErrorCode } from "../../src/core/errors";
import type { TurnInput, TurnOptions } from "../../src/core/input";
import type { TurnResult } from "../../src/core/results";
import type { SessionOptions, SessionReference } from "../../src/core/session";

export type ContractTurnScenario = {
  createAdapter: () => AgentProviderAdapter;
  sessionOptions?: SessionOptions;
  input: TurnInput;
  turnOptions?: TurnOptions;
  expectedSession: SessionReference;
  expectedResult: {
    text: string;
    structuredOutput?: unknown;
    usage?: TurnResult["usage"];
  };
};

export type ContractResumeScenario = ContractTurnScenario & {
  reference: SessionReference;
  resumeOptions?: SessionOptions;
  expectedInitialReference?: SessionReference | null;
};

export type ContractFailureScenario = {
  createAdapter: () => AgentProviderAdapter;
  sessionOptions?: SessionOptions;
  input: TurnInput;
  turnOptions?: TurnOptions;
  expectedSession?: SessionReference;
  expectedError: {
    code: AgentErrorCode;
    messageIncludes?: string;
    rawRequired?: boolean;
  };
};

export type ContractForkScenario = {
  createAdapter: () => AgentProviderAdapter;
  sessionOptions?: SessionOptions;
  initialInput: TurnInput;
  forkOptions?: SessionOptions;
  forkInput: TurnInput;
  expectedSourceSession: SessionReference;
  expectedForkSession: SessionReference;
  expectedForkText: string;
};

export type ContractProviderDriver = {
  provider: ProviderId;
  capabilityExpectations: {
    supportsFork: boolean;
    supportsMessageDelta: boolean;
  };
  readiness: Partial<Record<
    ProviderReadinessStatus,
    {
      createAdapter: () => AgentProviderAdapter;
      expectedStatus: ProviderReadinessStatus;
    }
  >>;
  sessions: {
    create: () => ContractTurnScenario;
    structuredOutputFailure: () => ContractFailureScenario;
    resume: () => ContractResumeScenario;
    resumeFork?: () => ContractResumeScenario;
    providerFailure: () => ContractFailureScenario;
    fork?: () => ContractForkScenario;
  };
  createSmokeAdapter: () => AgentProviderAdapter;
  smokeSessionOptions?: SessionOptions;
};
