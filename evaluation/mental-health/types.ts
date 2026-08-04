import type { MentalHealthRoute } from "../../utils/mentalHealthPolicy";

export type ExternalMessage = {
  role: "human" | "ai";
  content: string;
};

export type InputFixture = {
  id: string;
  messages: ExternalMessage[];
  expectedDetection: boolean;
  observation: string | null;
  category: string;
};

export type OutputFixture = {
  id: string;
  messages: ExternalMessage[];
  expectedApproval: boolean;
  issues: string[];
  category: string;
};

export type BinaryMetrics = {
  support: number;
  truePositive: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
  precision: number | null;
  recall: number | null;
  specificity: number | null;
  f1: number | null;
};

export type InputCaseResult = {
  id: string;
  category: string;
  expectedDetection: boolean;
  predictedDetection: boolean | null;
  route: MentalHealthRoute | null;
  abstain: boolean | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
};

export type OutputCaseResult = {
  id: string;
  category: string;
  issues: string[];
  expectedApproval: boolean;
  predictedApproval: boolean | null;
  route: MentalHealthRoute | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  error: string | null;
};
