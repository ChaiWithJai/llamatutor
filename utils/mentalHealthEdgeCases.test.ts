import { describe, expect, it } from "vitest";
import {
  buildEdgeCaseRun,
  edgeCaseCategories,
  edgeCaseManifest,
  getReviewedTurn,
  sampleEdgeCase,
  seedFromString,
} from "./mentalHealthEdgeCases";

describe("synthetic edge-case manifest", () => {
  it("holds between 10 and 30 reviewed cases with unique ids", () => {
    expect(edgeCaseManifest.length).toBeGreaterThanOrEqual(10);
    expect(edgeCaseManifest.length).toBeLessThanOrEqual(30);
    const ids = new Set(edgeCaseManifest.map((edgeCase) => edgeCase.id));
    expect(ids.size).toBe(edgeCaseManifest.length);
  });

  it("covers every required category", () => {
    for (const category of edgeCaseCategories) {
      const inCategory = edgeCaseManifest.filter(
        (edgeCase) => edgeCase.category === category,
      );
      expect(inCategory.length, category).toBeGreaterThan(0);
    }
  });

  it("declares reviewed behaviour and a two-player script for every case", () => {
    for (const edgeCase of edgeCaseManifest) {
      expect(edgeCase.label.length, edgeCase.id).toBeGreaterThan(0);
      expect(edgeCase.learningGoal.length, edgeCase.id).toBeGreaterThan(0);
      expect(edgeCase.requiredBehavior.length, edgeCase.id).toBeGreaterThan(0);
      expect(edgeCase.forbiddenBehavior.length, edgeCase.id).toBeGreaterThan(0);
      expect(edgeCase.reviewedClose.length, edgeCase.id).toBeGreaterThan(0);
      expect(edgeCase.turns[0].speaker, edgeCase.id).toBe("receptionist");
      expect(edgeCase.turns.length, edgeCase.id).toBeGreaterThanOrEqual(4);
      expect(
        edgeCase.turns.some((turn) => turn.speaker === "caller"),
        edgeCase.id,
      ).toBe(true);
      expect(
        edgeCase.turns[edgeCase.turns.length - 1].speaker,
        edgeCase.id,
      ).toBe("receptionist");
    }
  });

  it("suppresses the commercial call to action on every urgent case", () => {
    for (const edgeCase of edgeCaseManifest) {
      if (edgeCase.expectedRoute === "urgent") {
        expect(edgeCase.ctaAllowed, edgeCase.id).toBe(false);
      }
    }
  });

  it("keeps reviewed resource language on urgent cases", () => {
    const urgent = edgeCaseManifest.filter(
      (edgeCase) => edgeCase.expectedRoute === "urgent",
    );
    expect(urgent.length).toBeGreaterThan(0);
    for (const edgeCase of urgent) {
      const spoken = edgeCase.turns
        .filter((turn) => turn.speaker === "receptionist")
        .map((turn) => turn.text)
        .join(" ");
      expect(spoken, edgeCase.id).toMatch(/nine eight eight|nine one one/);
      expect(spoken, edgeCase.id).toMatch(/cannot (monitor|send|contact)/);
    }
  });

  it("covers the provider failure families", () => {
    const failures = edgeCaseManifest
      .filter((edgeCase) => edgeCase.injectedFailure)
      .map((edgeCase) => edgeCase.injectedFailure);
    expect(failures).toContain("provider-timeout");
    expect(failures).toContain("malformed-result");
    expect(failures).toContain("audio-failure");
  });
});

describe("seeded sampler", () => {
  it("is deterministic for a seed and different across seeds", () => {
    const first = buildEdgeCaseRun("webinar-2026").map((item) => item.id);
    const again = buildEdgeCaseRun("webinar-2026").map((item) => item.id);
    const other = buildEdgeCaseRun("webinar-2027").map((item) => item.id);

    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
    expect([...other].sort()).toEqual([...first].sort());
  });

  it("never uses runtime randomness", () => {
    const before = buildEdgeCaseRun(7).map((item) => item.id);
    Math.random();
    expect(buildEdgeCaseRun(7).map((item) => item.id)).toEqual(before);
  });

  it("balances the first round across every category", () => {
    const run = buildEdgeCaseRun("balance-check");
    const firstRound = run.slice(0, edgeCaseCategories.length);
    const categories = new Set(firstRound.map((item) => item.category));
    expect(categories.size).toBe(edgeCaseCategories.length);
  });

  it("returns every case exactly once per run", () => {
    const run = buildEdgeCaseRun("coverage");
    expect(run).toHaveLength(edgeCaseManifest.length);
    expect(new Set(run.map((item) => item.id)).size).toBe(
      edgeCaseManifest.length,
    );
  });

  it("wraps so sampling another case never dead-ends", () => {
    const total = edgeCaseManifest.length;
    const first = sampleEdgeCase("wrap", 0);
    const wrapped = sampleEdgeCase("wrap", total);
    expect(wrapped.edgeCase.id).toBe(first.edgeCase.id);
    expect(wrapped.position).toBe(0);
    expect(wrapped.total).toBe(total);
  });

  it("hashes seed strings stably", () => {
    expect(seedFromString("webinar")).toBe(seedFromString("webinar"));
    expect(seedFromString("webinar")).not.toBe(seedFromString("webinar-2"));
  });
});

describe("reviewed turn allowlist", () => {
  it("resolves both headline scenarios and manifest cases", () => {
    expect(getReviewedTurn("voice-booking", 0)?.speaker).toBe("receptionist");
    expect(getReviewedTurn(edgeCaseManifest[0].id, 0)?.text).toBe(
      edgeCaseManifest[0].turns[0].text,
    );
  });

  it("resolves nothing for unknown scenarios or positions", () => {
    expect(getReviewedTurn("not-a-scenario", 0)).toBeUndefined();
    expect(getReviewedTurn("voice-booking", 99)).toBeUndefined();
  });
});
