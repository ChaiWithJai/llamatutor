import { describe, expect, it } from "vitest";
import {
  calculateStreak,
  coachActionSchema,
  createFirstRep,
  createNextRep,
  formatCoachFeedbackPrompt,
  formatPracticeDate,
  selectRecentCompletedReps,
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

  it("selects the four newest completed reps for the active goal", () => {
    const reps = Array.from({ length: 6 }, (_, index) => ({
      id: `rep-${index}`,
      goalId: index === 5 ? "other-goal" : "active-goal",
      prompt: `Practice ${index}`,
      attempt: "Attempt",
      feedback: "Feedback",
      status: (index === 0 ? "pending" : "completed") as
        | "pending"
        | "completed",
      createdAt: `2026-07-${20 + index}T12:00:00.000Z`,
      completedAt:
        index === 0 ? null : `2026-07-${20 + index}T12:00:00.000Z`,
    }));

    expect(selectRecentCompletedReps(reps, "active-goal")).toHaveLength(4);
    expect(selectRecentCompletedReps(reps, "active-goal")[0]?.id).toBe("rep-4");
  });

  it("formats recent completion dates in plain language", () => {
    const now = new Date("2026-07-30T18:00:00.000Z");
    expect(formatPracticeDate("2026-07-30T01:00:00.000Z", now)).toBe("Today");
    expect(formatPracticeDate("2026-07-29T23:00:00.000Z", now)).toBe(
      "Yesterday",
    );
    expect(formatPracticeDate("2026-07-27T12:00:00.000Z", now)).toBe(
      "3 days ago",
    );
  });
});
