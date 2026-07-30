import { describe, expect, it } from "vitest";
import {
  computableDrilldownQuery,
  isRetryableDrilldownStatus,
} from "./drilldownEligibility";

describe("computableDrilldownQuery", () => {
  it("rejects conceptual prose that would dead-end at Wolfram", () => {
    expect(
      computableDrilldownQuery(
        "How does a neural network learn from examples?",
        "Weights adjust when the prediction differs from the example.",
      ),
    ).toBeNull();
  });

  it("accepts an explicitly quantitative learning job", () => {
    expect(
      computableDrilldownQuery(
        "Calculate compound interest over five years",
        "Use a yearly contribution.",
      ),
    ).toBe("Calculate compound interest over five years");
  });

  it("accepts a card containing an evaluable expression", () => {
    expect(
      computableDrilldownQuery(
        "Work the next step",
        "Start with the relationship y = 3 * x + 2.",
      ),
    ).toBe("Work the next step: y = 3 * x + 2.");
  });

  it("reserves retry for rate limits and transient provider failures", () => {
    expect(isRetryableDrilldownStatus(429)).toBe(true);
    expect(isRetryableDrilldownStatus(503)).toBe(true);
    expect(isRetryableDrilldownStatus(501)).toBe(false);
    expect(isRetryableDrilldownStatus(400)).toBe(false);
  });
});
