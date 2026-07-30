import type {
  LearningBlock,
  LearningResponse,
} from "../../utils/learningBlocks";

export type FixtureModality = "text" | "single-image" | "multi-image";
export type RunOutcome = "completed" | "cancelled" | "provider_error";

export type LearningBlockFixture = {
  id: string;
  modality: FixtureModality;
  prompt: string;
  imageIds: string[];
  allowedSourceIds: string[];
  expectedBlockTypes: LearningBlock["type"][];
  expectedPass: boolean;
  expectedOutcome?: RunOutcome;
  run: {
    outcome: RunOutcome;
    response?: unknown;
    fallbackShown: boolean;
    repairAttempts: number;
    toolArgumentsValid?: boolean;
  };
};

export type LearningBlockThresholds = {
  schemaVersion: 1;
  validTopLevelSchemaRate: number;
  maxRepairAttempts: number;
  maxRawHtmlBlocks: number;
  maxMissingSourceIds: number;
  truthfulFailureRate: number;
  p95LatencyMs: number | null;
  maxCostUsd: number | null;
};

export type LiveRunMetadata = {
  fixtureId: string;
  outcome: RunOutcome;
  provider: string;
  endpoint: string;
  model: string;
  schemaVersion: LearningResponse["schemaVersion"];
  startedAt: string;
  endpointAvailable: boolean;
  httpStatus: number | null;
  timeToFirstTokenMs: number | null;
  totalLatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  imageCount: number;
  costUsd: number | null;
};

export type FixtureEvaluation = {
  fixtureId: string;
  passed: boolean;
  outcomeMatched: boolean;
  schemaValid: boolean | null;
  truthfulFailure: boolean | null;
  rawHtmlBlocks: number;
  missingSourceIds: string[];
  missingBlockTypes: LearningBlock["type"][];
  reasons: string[];
};
