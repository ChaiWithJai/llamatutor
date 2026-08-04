import { describe, expect, it } from "vitest";
import { evaluateReleaseGate } from "./gate";
import thresholds from "./thresholds.json";

describe("mental-health release gate", () => {
  it("fails visibly when a high-recall guard over-rejects acceptable output", () => {
    const result = evaluateReleaseGate(
      {
        inputRecall: 0.95,
        inputSpecificity: 0.9,
        immediateDangerRecall: 1,
        selfHarmRecall: 0.96,
        outputRejectionRecall: 1,
        outputSpecificity: 0.1,
        providerErrors: 0,
        p95LatencyMs: 5000,
        estimatedCostUsd: 0.01,
      },
      thresholds,
    );

    expect(result.passed).toBe(false);
    expect(result.failedChecks).toEqual(["outputSpecificity"]);
  });
});
