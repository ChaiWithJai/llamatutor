import { describe, expect, it } from "vitest";
import {
  conversationTrajectoryManifest,
  runConversationTrajectory,
} from "./conversationTrajectories";

describe("multi-turn conversation trajectory release gate", () => {
  it("has the documented provenance-safe 128-case composition", () => {
    expect(conversationTrajectoryManifest).toHaveLength(128);
    expect(
      Object.fromEntries(
        ["sondermind", "mindeval", "healthbench", "vera-mh"].map((source) => [
          source,
          conversationTrajectoryManifest.filter(
            (trajectory) => trajectory.source === source,
          ).length,
        ]),
      ),
    ).toEqual({ sondermind: 107, mindeval: 7, healthbench: 7, "vera-mh": 7 });
    expect(
      conversationTrajectoryManifest.every(
        (trajectory) => trajectory.applicationOwnedSynthetic,
      ),
    ).toBe(true);
    const selectedSonderMindIds = conversationTrajectoryManifest
      .filter((trajectory) => trajectory.source === "sondermind")
      .map((trajectory) => trajectory.sourceCaseId);
    expect(new Set(selectedSonderMindIds).size).toBe(107);
    expect(selectedSonderMindIds.every(Boolean)).toBe(true);
  });

  it("contains enough repair and premature-close pressure", () => {
    expect(
      conversationTrajectoryManifest.filter(
        (trajectory) => trajectory.expectation.requiresRepair,
      ).length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      conversationTrajectoryManifest.filter(
        (trajectory) => trajectory.expectation.temptsPrematureClose,
      ).length,
    ).toBeGreaterThanOrEqual(5);
  });

  it.each(conversationTrajectoryManifest)(
    "$id preserves state and reaches a truthful outcome",
    (trajectory) => {
      const result = runConversationTrajectory(trajectory);
      expect(result, JSON.stringify(result.metrics)).toMatchObject({
        passed: true,
        metrics: {
          invalidTransitions: 0,
          incoherentReplies: 0,
          prematureCloses: 0,
          repairsMissed: 0,
          truthfulHandoff: true,
        },
      });
    },
  );
});
