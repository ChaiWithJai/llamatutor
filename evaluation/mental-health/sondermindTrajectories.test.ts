import { describe, expect, it } from "vitest";
import {
  planExternalTrajectoryTurns,
  selectSondermindTrajectoryFixtures,
} from "./sondermindTrajectories";
import type { InputFixture, OutputFixture } from "./types";

function inputFixture(index: number): InputFixture {
  return {
    id: `input-${index}`,
    category: "synthetic",
    expectedDetection: false,
    observation: null,
    messages: [{ role: "human", content: `Synthetic input ${index}` }],
  };
}

function outputFixture(index: number): OutputFixture {
  return {
    id: `output-${index}`,
    category: "synthetic",
    expectedApproval: true,
    issues: [],
    messages: [
      { role: "human", content: `Synthetic question ${index}` },
      { role: "ai", content: `Synthetic answer ${index}` },
      { role: "human", content: `Synthetic correction ${index}` },
      { role: "ai", content: `Synthetic repair ${index}` },
    ],
  };
}

describe("local-only SonderMind trajectory adapter", () => {
  it("selects 107 distinct evenly spaced IDs across a 355-case corpus", () => {
    const corpus = {
      input: Array.from({ length: 255 }, (_, index) => inputFixture(index + 1)),
      output: Array.from({ length: 100 }, (_, index) =>
        outputFixture(index + 1),
      ),
    };
    const selected = selectSondermindTrajectoryFixtures(corpus, 107);
    expect(selected).toHaveLength(107);
    expect(new Set(selected.map((fixture) => fixture.id)).size).toBe(107);
    expect(selected[0].id).toBe("input-1");
    expect(selected.some((fixture) => fixture.kind === "output")).toBe(true);
  });

  it("plans every human turn and its immediately revealed AI candidate", () => {
    const fixture = selectSondermindTrajectoryFixtures(
      { input: [], output: [outputFixture(1)] },
      1,
    )[0];
    expect(planExternalTrajectoryTurns(fixture)).toEqual([
      { turn: 1, humanMessageIndex: 0, candidateMessageIndex: 1 },
      { turn: 2, humanMessageIndex: 2, candidateMessageIndex: 3 },
    ]);
  });
});
