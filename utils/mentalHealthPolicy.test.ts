import { describe, expect, it } from "vitest";
import {
  buildFallbackResult,
  buildGuidedDemoResult,
  demoScenarios,
  deriveMentalHealthRoute,
  getVoiceConversation,
  getVoiceConversationTurn,
  MENTAL_HEALTH_POLICY_VERSION,
  voiceBookingChoices,
  voiceConversations,
  voiceScenarios,
} from "./mentalHealthPolicy";

describe("mental health demo policy", () => {
  it.each(demoScenarios)("routes $id to $expectedRoute", (scenario) => {
    const result = buildGuidedDemoResult(scenario);

    expect(result.route).toBe(scenario.expectedRoute);
    expect(result.assessment.policyVersion).toBe(MENTAL_HEALTH_POLICY_VERSION);
    expect(result.trace.map((stage) => stage.id)).toEqual([
      "input",
      "route",
      "response",
      "output",
    ]);
    expect(result.reply.length).toBeGreaterThan(20);
  });

  it.each(voiceScenarios)(
    "routes voice scenario $id to $expectedRoute with receptionist copy",
    (scenario) => {
      const result = buildGuidedDemoResult(scenario);
      expect(result.route).toBe(scenario.expectedRoute);
      if (scenario.reviewedReply) {
        expect(result.reply).toBe(scenario.reviewedReply);
      } else {
        expect(result.reply).toContain("safety");
      }
    },
  );

  it.each(voiceBookingChoices)(
    "keeps booking choice $id honest and ephemeral",
    (choice) => {
      expect(choice.callerReply.length).toBeGreaterThan(10);
      expect(choice.receptionistReply).toMatch(
        /(practice to confirm|nothing was booked)/,
      );
      expect(choice.receptionistReply).not.toMatch(/appointment is confirmed/i);
    },
  );

  it.each(voiceConversations)(
    "runs $scenarioId from greeting through a bounded close",
    (conversation) => {
      expect(conversation.turns.length).toBeGreaterThanOrEqual(5);
      expect(conversation.turns[0]).toMatchObject({
        id: "greeting",
        speaker: "receptionist",
      });
      expect(conversation.turns.at(-1)?.speaker).toBe("receptionist");
      conversation.turns.forEach((turn, index) => {
        if (index > 0) {
          expect(turn.speaker).not.toBe(conversation.turns[index - 1].speaker);
        }
        expect(turn.text.length).toBeGreaterThan(12);
      });
    },
  );

  it("only resolves application-owned voice turns", () => {
    expect(getVoiceConversation("voice-booking")?.turns).toHaveLength(9);
    expect(getVoiceConversationTurn("voice-booking", 0)?.id).toBe("greeting");
    expect(getVoiceConversationTurn("unknown", 0)).toBeUndefined();
    expect(getVoiceConversationTurn("voice-booking", 99)).toBeUndefined();
  });

  it("promotes low-confidence and abstained results to elevated", () => {
    expect(
      deriveMentalHealthRoute({
        policyVersion: MENTAL_HEALTH_POLICY_VERSION,
        route: "routine",
        confidence: 0.4,
        abstain: false,
        signals: [],
      }),
    ).toBe("elevated");

    expect(
      deriveMentalHealthRoute({
        policyVersion: MENTAL_HEALTH_POLICY_VERSION,
        route: "routine",
        confidence: 0.99,
        abstain: true,
        signals: [],
      }),
    ).toBe("elevated");
  });

  it("never demotes an urgent assessment", () => {
    expect(
      deriveMentalHealthRoute({
        policyVersion: MENTAL_HEALTH_POLICY_VERSION,
        route: "urgent",
        confidence: 0.2,
        abstain: true,
        signals: [],
      }),
    ).toBe("urgent");
  });

  it("uses reviewed copy when the provider fails", () => {
    const result = buildFallbackResult("Classifier timed out");
    expect(result.provider).toBe("fallback");
    expect(result.route).toBe("elevated");
    expect(result.assessment.abstain).toBe(true);
    expect(result.trace.some((stage) => stage.status === "replaced")).toBe(
      true,
    );
  });
});
