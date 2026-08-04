import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assessMentalHealthInput,
  reviewMentalHealthOutput,
} from "../../app/api/mental-health/respond/route";
import {
  deriveMentalHealthRoute,
  MENTAL_HEALTH_POLICY_VERSION,
} from "../../utils/mentalHealthPolicy";
import { binaryMetrics, percentile } from "./metrics";
import modelPricing from "./model-pricing.json";
import { evaluateReleaseGate } from "./gate";
import sourceManifest from "./sondermind-source.json";
import thresholds from "./thresholds.json";
import { loadSondermindCorpus, transcript } from "./sondermind";
import {
  planExternalTrajectoryTurns,
  selectSondermindTrajectoryFixtures,
} from "./sondermindTrajectories";
import type {
  ExternalMessage,
  InputCaseResult,
  OutputCaseResult,
} from "./types";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function numberArgument(name: string, fallback: number) {
  const value = argument(name);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function withRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch {
    return operation();
  }
}

async function runPool<T, R>(
  rows: T[],
  concurrency: number,
  operation: (row: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(rows.length);
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < rows.length) {
      const index = nextIndex++;
      results[index] = await operation(rows[index], index);
      completed += 1;
      if (completed % 10 === 0 || completed === rows.length) {
        process.stdout.write(`\rCompleted ${completed}/${rows.length}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, worker),
  );
  process.stdout.write("\n");
  return results;
}

function errorLabel(error: unknown) {
  if (!(error instanceof Error)) return "unknown_error";
  if (error.name === "TimeoutError") return "timeout";
  if (error.message.includes("schema")) return "schema_error";
  if (error.message.includes("429")) return "rate_limited";
  return "provider_error";
}

function inputSummary(rows: InputCaseResult[]) {
  const completed = rows.filter(
    (row): row is InputCaseResult & { predictedDetection: boolean } =>
      row.predictedDetection !== null,
  );
  return {
    metrics: binaryMetrics(
      completed.map((row) => ({
        expected: row.expectedDetection,
        predicted: row.predictedDetection,
      })),
    ),
    detectionFalseNegatives: completed.filter(
      (row) => row.expectedDetection && !row.predictedDetection,
    ).length,
    benignFalsePositives: completed.filter(
      (row) => !row.expectedDetection && row.predictedDetection,
    ).length,
    abstentions: completed.filter((row) => row.abstain).length,
    errors: rows.filter((row) => row.error !== null).length,
    byCategory: Object.fromEntries(
      [...new Set(completed.map((row) => row.category))]
        .sort()
        .map((category) => {
          const categoryRows = completed.filter(
            (row) => row.category === category,
          );
          return [
            category,
            binaryMetrics(
              categoryRows.map((row) => ({
                expected: row.expectedDetection,
                predicted: row.predictedDetection,
              })),
            ),
          ];
        }),
    ),
  };
}

function outputSummary(rows: OutputCaseResult[]) {
  const completed = rows.filter(
    (row): row is OutputCaseResult & { predictedApproval: boolean } =>
      row.predictedApproval !== null,
  );
  return {
    metrics: binaryMetrics(
      completed.map((row) => ({
        expected: !row.expectedApproval,
        predicted: !row.predictedApproval,
      })),
    ),
    errors: rows.filter((row) => row.error !== null).length,
    byIssue: Object.fromEntries(
      [...new Set(completed.flatMap((row) => row.issues))]
        .sort()
        .map((issue) => {
          const issueRows = completed.filter((row) =>
            row.issues.includes(issue),
          );
          return [
            issue,
            binaryMetrics(
              issueRows.map((row) => ({
                expected: !row.expectedApproval,
                predicted: !row.predictedApproval,
              })),
            ),
          ];
        }),
    ),
  };
}

async function main() {
  const sourceRoot = argument("--source");
  if (!sourceRoot) {
    throw new Error(
      "Pass --source /path/to/the/pinned external checkout. The corpus is intentionally not downloaded or vendored by this runner.",
    );
  }
  if (!process.env.TOGETHER_API_KEY) {
    throw new Error("TOGETHER_API_KEY is required");
  }

  const concurrency = numberArgument("--concurrency", 3);
  const limit = numberArgument("--limit", Number.MAX_SAFE_INTEGER);
  const reportPath =
    argument("--report") ??
    path.join(
      process.cwd(),
      "evaluation/mental-health/reports/sondermind-current.json",
    );
  const corpus = await loadSondermindCorpus(sourceRoot);
  if (hasFlag("--trajectory")) {
    const selected = selectSondermindTrajectoryFixtures(
      corpus,
      numberArgument("--trajectory-count", 107),
    );
    const startedAt = new Date().toISOString();
    process.stdout.write(
      `Running ${selected.length} pinned external trajectories without logging raw content.\n`,
    );
    const cases = await runPool(selected, concurrency, async (fixture) => {
      const prior: ExternalMessage[] = [];
      const turns = [];
      for (const plan of planExternalTrajectoryTurns(fixture)) {
        const human = fixture.messages[plan.humanMessageIndex];
        const candidate =
          plan.candidateMessageIndex === null
            ? null
            : fixture.messages[plan.candidateMessageIndex];
        const turnStartedAt = Date.now();
        try {
          const assessed = await withRetry(() =>
            assessMentalHealthInput(
              transcript([
                ...prior.filter((message) => message.role === "human"),
                human,
              ]),
            ),
          );
          const route = deriveMentalHealthRoute(assessed.assessment);
          const reviewed =
            candidate?.role === "ai"
              ? await withRetry(() =>
                  reviewMentalHealthOutput({
                    message: transcript([...prior, human]),
                    candidate: candidate.content,
                    route,
                  }),
                )
              : null;
          turns.push({
            turn: plan.turn,
            route,
            abstain: assessed.assessment.abstain,
            candidatePresent: candidate?.role === "ai",
            candidateApproved: reviewed?.approved ?? null,
            latencyMs: Date.now() - turnStartedAt,
            error: null,
          });
        } catch (error) {
          turns.push({
            turn: plan.turn,
            route: null,
            abstain: null,
            candidatePresent: candidate?.role === "ai",
            candidateApproved: null,
            latencyMs: Date.now() - turnStartedAt,
            error: errorLabel(error),
          });
        }
        prior.push(human);
        if (candidate?.role === "ai") prior.push(candidate);
      }
      return {
        id: fixture.id,
        kind: fixture.kind,
        category: fixture.category,
        turns,
      };
    });
    const trajectoryReportPath =
      argument("--report") ??
      path.join(
        process.cwd(),
        "evaluation/mental-health/reports/sondermind-trajectories-current.json",
      );
    const report = {
      schemaVersion: 1,
      publicSafe: true,
      rawContentIncluded: false,
      startedAt,
      completedAt: new Date().toISOString(),
      source: {
        repository: sourceManifest.source,
        commit: sourceManifest.commit,
        inputSha256: sourceManifest.files.input.sha256,
        outputSha256: sourceManifest.files.output.sha256,
      },
      system: {
        policyVersion: MENTAL_HEALTH_POLICY_VERSION,
        safetyModel: process.env.TOGETHER_SAFETY_MODEL ?? "Qwen/Qwen3.5-9B",
        mode: "per-human-turn",
      },
      summary: {
        trajectories: cases.length,
        turns: cases.reduce(
          (total, fixture) => total + fixture.turns.length,
          0,
        ),
        providerErrors: cases.reduce(
          (total, fixture) =>
            total + fixture.turns.filter((turn) => turn.error !== null).length,
          0,
        ),
        prematureClose: null,
        correctionUptake: null,
        contradiction: null,
      },
      limitations: [
        "The external corpus supplies safety-route and candidate-review calibration, not receptionist goals or state-transition labels.",
        "Premature close, correction uptake, contradiction, and resolution remain explicitly unmapped here and are gated by the application-owned 128-case suite.",
        "No external prompt or response text is written to this report.",
      ],
      cases,
    };
    await mkdir(path.dirname(trajectoryReportPath), { recursive: true });
    await writeFile(
      trajectoryReportPath,
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
    process.stdout.write(
      `Wrote content-free trajectory report to ${trajectoryReportPath}\n`,
    );
    return;
  }
  const inputFixtures = corpus.input.slice(0, limit);
  const outputFixtures = corpus.output.slice(0, limit);
  const startedAt = new Date().toISOString();

  process.stdout.write(
    `Running ${inputFixtures.length} input cases without logging raw content.\n`,
  );
  const input = await runPool(
    inputFixtures,
    concurrency,
    async (fixture): Promise<InputCaseResult> => {
      try {
        const result = await withRetry(() =>
          assessMentalHealthInput(transcript(fixture.messages)),
        );
        const route = deriveMentalHealthRoute(result.assessment);
        return {
          id: fixture.id,
          category: fixture.category,
          expectedDetection: fixture.expectedDetection,
          predictedDetection: route !== "routine" || result.assessment.abstain,
          route,
          abstain: result.assessment.abstain,
          latencyMs: result.durationMs,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          error: null,
        };
      } catch (error) {
        return {
          id: fixture.id,
          category: fixture.category,
          expectedDetection: fixture.expectedDetection,
          predictedDetection: null,
          route: null,
          abstain: null,
          latencyMs: null,
          inputTokens: null,
          outputTokens: null,
          error: errorLabel(error),
        };
      }
    },
  );

  process.stdout.write(
    `Running ${outputFixtures.length} output cases without logging raw content.\n`,
  );
  const output = await runPool(
    outputFixtures,
    concurrency,
    async (fixture): Promise<OutputCaseResult> => {
      const candidateIndex = fixture.messages.findLastIndex(
        (message) => message.role === "ai",
      );
      const candidate = fixture.messages[candidateIndex];
      const prior = fixture.messages.slice(0, candidateIndex);
      try {
        if (!candidate || candidate.role !== "ai") {
          throw new Error("schema candidate missing");
        }
        const assessed = await withRetry(() =>
          assessMentalHealthInput(
            transcript(prior.filter((message) => message.role === "human")),
          ),
        );
        const route = deriveMentalHealthRoute(assessed.assessment);
        const reviewed = await withRetry(() =>
          reviewMentalHealthOutput({
            message: transcript(prior),
            candidate: candidate.content,
            route,
          }),
        );
        return {
          id: fixture.id,
          category: fixture.category,
          issues: fixture.issues,
          expectedApproval: fixture.expectedApproval,
          predictedApproval: reviewed.approved,
          route,
          latencyMs: assessed.durationMs + reviewed.durationMs,
          inputTokens:
            assessed.usage.inputTokens === null ||
            reviewed.usage.inputTokens === null
              ? null
              : assessed.usage.inputTokens + reviewed.usage.inputTokens,
          outputTokens:
            assessed.usage.outputTokens === null ||
            reviewed.usage.outputTokens === null
              ? null
              : assessed.usage.outputTokens + reviewed.usage.outputTokens,
          error: null,
        };
      } catch (error) {
        return {
          id: fixture.id,
          category: fixture.category,
          issues: fixture.issues,
          expectedApproval: fixture.expectedApproval,
          predictedApproval: null,
          route: null,
          latencyMs: null,
          inputTokens: null,
          outputTokens: null,
          error: errorLabel(error),
        };
      }
    },
  );

  const latencies = [...input, ...output].flatMap((row) =>
    row.latencyMs === null ? [] : [row.latencyMs],
  );
  const inputTokens = [...input, ...output].reduce(
    (total, row) => total + (row.inputTokens ?? 0),
    0,
  );
  const outputTokens = [...input, ...output].reduce(
    (total, row) => total + (row.outputTokens ?? 0),
    0,
  );
  const estimatedCostUsd =
    (inputTokens * modelPricing.inputUsdPerMillionTokens +
      outputTokens * modelPricing.outputUsdPerMillionTokens) /
    1_000_000;
  const inputAggregate = inputSummary(input);
  const outputAggregate = outputSummary(output);
  const p95LatencyMs = percentile(latencies, 0.95);
  const immediateDanger =
    inputAggregate.byCategory["Crisis - Immediate Danger Escalation"];
  const selfHarm = inputAggregate.byCategory["Self Harm"];
  const releaseGate = evaluateReleaseGate(
    {
      inputRecall: inputAggregate.metrics.recall ?? 0,
      inputSpecificity: inputAggregate.metrics.specificity ?? 0,
      immediateDangerRecall: immediateDanger?.recall ?? 0,
      selfHarmRecall: selfHarm?.recall ?? 0,
      outputRejectionRecall: outputAggregate.metrics.recall ?? 0,
      outputSpecificity: outputAggregate.metrics.specificity ?? 0,
      providerErrors: inputAggregate.errors + outputAggregate.errors,
      p95LatencyMs,
      estimatedCostUsd,
    },
    thresholds,
  );
  const report = {
    schemaVersion: 1,
    publicSafe: true,
    rawContentIncluded: false,
    startedAt,
    completedAt: new Date().toISOString(),
    source: {
      repository: sourceManifest.source,
      commit: sourceManifest.commit,
      inputSha256: sourceManifest.files.input.sha256,
      outputSha256: sourceManifest.files.output.sha256,
      licenseStatus: sourceManifest.licenseStatus,
    },
    system: {
      policyVersion: MENTAL_HEALTH_POLICY_VERSION,
      safetyModel: process.env.TOGETHER_SAFETY_MODEL ?? "Qwen/Qwen3.5-9B",
      benchmarkMode:
        limit === Number.MAX_SAFE_INTEGER ? "full" : `bounded-${limit}`,
    },
    summary: {
      releaseGate,
      thresholds,
      input: inputAggregate,
      output: outputAggregate,
      latencyMs: {
        p50: percentile(latencies, 0.5),
        p95: p95LatencyMs,
      },
      tokens: { input: inputTokens, output: outputTokens },
      estimatedCostUsd,
      pricing: modelPricing,
    },
    limitations: [
      "External labels calibrate detection and approval, not clinical safety or our application route.",
      "No independently reviewed route overlay is included in this run.",
      "Cost is an estimate from a versioned public list price; billing discounts, caching, and price changes may differ.",
      "Voice transcript perturbation is a separate acceptance slice owned by Issue #57.",
    ],
    cases: { input, output },
  };

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`Wrote content-free report to ${reportPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
