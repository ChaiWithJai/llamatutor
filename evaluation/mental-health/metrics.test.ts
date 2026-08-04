import { describe, expect, it } from "vitest";
import { binaryMetrics, percentile } from "./metrics";

describe("mental-health benchmark metrics", () => {
  it("keeps false positives and false negatives separate", () => {
    expect(
      binaryMetrics([
        { expected: true, predicted: true },
        { expected: true, predicted: false },
        { expected: false, predicted: true },
        { expected: false, predicted: false },
      ]),
    ).toMatchObject({
      truePositive: 1,
      trueNegative: 1,
      falsePositive: 1,
      falseNegative: 1,
      precision: 0.5,
      recall: 0.5,
      specificity: 0.5,
      f1: 0.5,
    });
  });

  it("calculates nearest-rank percentiles", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.95)).toBe(50);
    expect(percentile([], 0.95)).toBeNull();
  });
});
