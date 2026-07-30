import {
  citedSourceIds,
  parseLearningResponse,
} from "../../utils/learningBlocks";
import type {
  FixtureEvaluation,
  LearningBlockFixture,
  LearningBlockThresholds,
  LiveRunMetadata,
} from "./types";

export function evaluateFixture(
  fixture: LearningBlockFixture,
): FixtureEvaluation {
  const reasons: string[] = [];

  if (fixture.run.outcome !== "completed") {
    const truthfulFailure = fixture.run.fallbackShown;
    if (!truthfulFailure) {
      reasons.push("Provider failure or cancellation did not show a fallback");
    }
    return {
      fixtureId: fixture.id,
      passed: truthfulFailure === fixture.expectedPass,
      schemaValid: null,
      truthfulFailure,
      rawHtmlBlocks: 0,
      missingSourceIds: [],
      missingBlockTypes: [],
      reasons,
    };
  }

  const parsed = parseLearningResponse(fixture.run.response);
  if (!parsed.ok) reasons.push(...parsed.issues);
  const rawHtmlBlocks = parsed.ok
    ? 0
    : parsed.issues.filter((issue) => issue.includes("Raw HTML is not allowed"))
        .length;

  const response = parsed.ok ? parsed.response : null;
  const cited = response ? citedSourceIds(response) : [];
  const missingSourceIds = cited.filter(
    (id) => !fixture.allowedSourceIds.includes(id),
  );
  if (missingSourceIds.length > 0) {
    reasons.push(`Unknown source IDs: ${missingSourceIds.join(", ")}`);
  }

  const presentTypes = new Set(
    response?.blocks.map((block) => block.type) ?? [],
  );
  const missingBlockTypes = fixture.expectedBlockTypes.filter(
    (type) => !presentTypes.has(type),
  );
  if (missingBlockTypes.length > 0) {
    reasons.push(`Missing block types: ${missingBlockTypes.join(", ")}`);
  }

  if (fixture.run.toolArgumentsValid === false) {
    reasons.push("Tool arguments were invalid");
  }
  if (fixture.run.repairAttempts > 1) {
    reasons.push("More than one repair attempt was required");
  }

  const candidateValid =
    parsed.ok &&
    missingSourceIds.length === 0 &&
    missingBlockTypes.length === 0 &&
    fixture.run.toolArgumentsValid !== false &&
    fixture.run.repairAttempts <= 1;
  if (!candidateValid && !fixture.run.fallbackShown) {
    reasons.push("Rejected output did not show a plain-text fallback");
  }
  const matchedExpectation = fixture.expectedPass
    ? candidateValid
    : !candidateValid && fixture.run.fallbackShown;

  return {
    fixtureId: fixture.id,
    passed: matchedExpectation,
    schemaValid: parsed.ok,
    truthfulFailure: null,
    rawHtmlBlocks,
    missingSourceIds,
    missingBlockTypes,
    reasons,
  };
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? null;
}

export function evaluateSuite(
  fixtures: LearningBlockFixture[],
  thresholds: LearningBlockThresholds,
  liveRuns: LiveRunMetadata[] = [],
) {
  const fixtureResults = fixtures.map(evaluateFixture);
  const completed = fixtureResults.filter(
    (result) => result.schemaValid !== null,
  );
  const failures = fixtureResults.filter(
    (result) => result.truthfulFailure !== null,
  );
  const validTopLevelSchemaRate =
    completed.length === 0
      ? 0
      : completed.filter((result) => result.schemaValid).length /
        completed.length;
  const truthfulFailureRate =
    failures.length === 0
      ? 0
      : failures.filter((result) => result.truthfulFailure).length /
        failures.length;
  const missingSourceIds = fixtureResults.reduce(
    (count, result) => count + result.missingSourceIds.length,
    0,
  );
  const rawHtmlBlocks = fixtureResults.reduce(
    (count, result) => count + result.rawHtmlBlocks,
    0,
  );
  const maxRepairAttemptsObserved = fixtures.reduce(
    (maximum, fixture) => Math.max(maximum, fixture.run.repairAttempts),
    0,
  );
  const p95LatencyMs = percentile95(
    liveRuns.flatMap((run) =>
      run.totalLatencyMs === null ? [] : [run.totalLatencyMs],
    ),
  );
  const measuredCosts = liveRuns.flatMap((run) =>
    run.costUsd === null ? [] : [run.costUsd],
  );
  const maxMeasuredCostUsd =
    measuredCosts.length === 0 ? null : Math.max(...measuredCosts);
  const measuredFixtureIds = new Set(liveRuns.map((run) => run.fixtureId));
  const missingLiveFixtureIds = fixtures
    .map((fixture) => fixture.id)
    .filter((fixtureId) => !measuredFixtureIds.has(fixtureId));
  const endpointAvailabilityRate =
    liveRuns.length === 0
      ? 0
      : liveRuns.filter((run) => run.endpointAvailable).length /
        liveRuns.length;
  const usageCompleteRate =
    liveRuns.length === 0
      ? 0
      : liveRuns.filter(
          (run) =>
            run.timeToFirstTokenMs !== null &&
            run.totalLatencyMs !== null &&
            run.inputTokens !== null &&
            run.outputTokens !== null &&
            run.costUsd !== null,
        ).length / liveRuns.length;
  const decisionsNeeded = [
    ...(thresholds.p95LatencyMs === null ? ["p95LatencyMs"] : []),
    ...(thresholds.maxCostUsd === null ? ["maxCostUsd"] : []),
  ];

  const passed =
    fixtureResults.every((result) => result.passed) &&
    validTopLevelSchemaRate >= thresholds.validTopLevelSchemaRate &&
    rawHtmlBlocks <= thresholds.maxRawHtmlBlocks &&
    missingSourceIds <= thresholds.maxMissingSourceIds &&
    maxRepairAttemptsObserved <= thresholds.maxRepairAttempts &&
    truthfulFailureRate >= thresholds.truthfulFailureRate &&
    decisionsNeeded.length === 0 &&
    missingLiveFixtureIds.length === 0 &&
    endpointAvailabilityRate === 1 &&
    usageCompleteRate === 1 &&
    p95LatencyMs !== null &&
    p95LatencyMs <= (thresholds.p95LatencyMs ?? -1) &&
    maxMeasuredCostUsd !== null &&
    maxMeasuredCostUsd <= (thresholds.maxCostUsd ?? -1);

  return {
    passed,
    decisionsNeeded,
    fixtureResults,
    metrics: {
      validTopLevelSchemaRate,
      truthfulFailureRate,
      rawHtmlBlocks,
      missingSourceIds,
      maxRepairAttemptsObserved,
      p95LatencyMs,
      maxMeasuredCostUsd,
      missingLiveFixtureIds,
      endpointAvailabilityRate,
      usageCompleteRate,
    },
  };
}
