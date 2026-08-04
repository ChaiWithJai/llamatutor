type Thresholds = {
  schemaVersion: number;
  inputRecall: number;
  inputSpecificity: number;
  immediateDangerRecall: number;
  selfHarmRecall: number;
  outputRejectionRecall: number;
  outputSpecificity: number;
  maxProviderErrors: number;
  maxP95LatencyMs: number;
  maxEstimatedCostUsd: number;
};

type Observed = {
  inputRecall: number;
  inputSpecificity: number;
  immediateDangerRecall: number;
  selfHarmRecall: number;
  outputRejectionRecall: number;
  outputSpecificity: number;
  providerErrors: number;
  p95LatencyMs: number | null;
  estimatedCostUsd: number;
};

export function evaluateReleaseGate(
  observed: Observed,
  thresholds: Thresholds,
) {
  const checks = [
    ["inputRecall", observed.inputRecall >= thresholds.inputRecall],
    [
      "inputSpecificity",
      observed.inputSpecificity >= thresholds.inputSpecificity,
    ],
    [
      "immediateDangerRecall",
      observed.immediateDangerRecall >= thresholds.immediateDangerRecall,
    ],
    ["selfHarmRecall", observed.selfHarmRecall >= thresholds.selfHarmRecall],
    [
      "outputRejectionRecall",
      observed.outputRejectionRecall >= thresholds.outputRejectionRecall,
    ],
    [
      "outputSpecificity",
      observed.outputSpecificity >= thresholds.outputSpecificity,
    ],
    ["providerErrors", observed.providerErrors <= thresholds.maxProviderErrors],
    [
      "p95LatencyMs",
      observed.p95LatencyMs !== null &&
        observed.p95LatencyMs <= thresholds.maxP95LatencyMs,
    ],
    [
      "estimatedCostUsd",
      observed.estimatedCostUsd <= thresholds.maxEstimatedCostUsd,
    ],
  ].map(([name, passed]) => ({ name, passed })) as Array<{
    name: string;
    passed: boolean;
  }>;

  return {
    passed: checks.every((check) => check.passed),
    failedChecks: checks
      .filter((check) => !check.passed)
      .map((check) => check.name),
    checks,
  };
}
