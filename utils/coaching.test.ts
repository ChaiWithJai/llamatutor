import { describe, expect, it } from "vitest";
import {
  calculateStreak,
  coachActionSchema,
  createFirstRep,
  createNextRep,
  formatCoachFeedbackPrompt,
} from "./coaching";

describe("coaching data flow", () => {
  it("keeps a same-day completion idempotent", () => {
    expect(calculateStreak(4, "2026-07-30", "2026-07-30")).toBe(4);
  });

  it("increments a consecutive-day streak", () => {
    expect(calculateStreak(4, "2026-07-29", "2026-07-30")).toBe(5);
  });

  it("resets a streak after a missed day", () => {
    expect(calculateStreak(8, "2026-07-25", "2026-07-30")).toBe(1);
  });

  it("validates bounded goal input", () => {
    expect(
      coachActionSchema.safeParse({
        action: "start_goal",
        topic: "Neural networks",
        level: "Middle School",
      }).success,
    ).toBe(true);
    expect(
      coachActionSchema.safeParse({
        action: "start_goal",
        topic: "",
        level: "Middle School",
      }).success,
    ).toBe(false);
  });

  it("rejects client-supplied user identifiers", () => {
    const parsed = coachActionSchema.parse({
      action: "start_goal",
      topic: "Neural networks",
      level: "Middle School",
      userId: "attacker-controlled",
    });
    expect(parsed).not.toHaveProperty("userId");
  });

  it("creates useful first and next reps", () => {
    expect(createFirstRep("photosynthesis")).toContain("photosynthesis");
    expect(createNextRep("photosynthesis")).toContain("new example");
  });

  it("builds non-shaming feedback instructions", () => {
    const messages = formatCoachFeedbackPrompt(
      "photosynthesis",
      "Explain it",
      "Plants eat sunlight",
      "Middle School",
    );
    expect(messages[0]?.content).toContain("Do not shame");
    expect(messages[1]?.content).toContain("Plants eat sunlight");
  });
});
