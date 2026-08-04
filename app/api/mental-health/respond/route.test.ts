import { describe, expect, it } from "vitest";
import { POST, responseRuleForRoute } from "./route";
import { edgeCaseManifest } from "../../../../utils/mentalHealthEdgeCases";
import { verifyReviewedSpeechGrant } from "../../../../utils/reviewedSpeechGrant";

function request(body: unknown) {
  return new Request("http://localhost/api/mental-health/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mental health demo endpoint", () => {
  it("fails closed when the independent kill switch is disabled", async () => {
    const previous = process.env.MENTAL_HEALTH_DEMO_ENABLED;
    process.env.MENTAL_HEALTH_DEMO_ENABLED = "false";
    try {
      const response = await POST(
        request({ mode: "guided", scenarioId: "voice-booking" }),
      );
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "The voice demonstration is temporarily unavailable.",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.MENTAL_HEALTH_DEMO_ENABLED;
      } else {
        process.env.MENTAL_HEALTH_DEMO_ENABLED = previous;
      }
    }
  });

  it("runs a guided scenario without provider configuration", async () => {
    const response = await POST(
      request({ mode: "guided", scenarioId: "urgent" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provider).toBe("guided");
    expect(body.route).toBe("urgent");
    expect(body.trace).toHaveLength(4);
  });

  it("runs the voice receptionist scenarios through the same typed contract", async () => {
    const response = await POST(
      request({ mode: "guided", scenarioId: "voice-booking" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.provider).toBe("guided");
    expect(body.route).toBe("routine");
    expect(body.reply).toContain("Tuesday");
  });

  it("requires explicit acknowledgement for live input", async () => {
    const response = await POST(
      request({
        mode: "live",
        message: "I feel stressed and want a smaller next step.",
        acknowledged: false,
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects unknown guided scenarios", async () => {
    const response = await POST(
      request({ mode: "guided", scenarioId: "not-real" }),
    );

    expect(response.status).toBe(404);
  });

  it("runs sampled edge cases through the same guided contract", async () => {
    const edgeCase = edgeCaseManifest.find(
      (candidate) => candidate.expectedRoute === "urgent",
    )!;
    const response = await POST(
      request({ mode: "guided", scenarioId: edgeCase.id }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.route).toBe("urgent");
    expect(body.trace).toHaveLength(4);
    expect(body.reply).toBe(edgeCase.reviewedClose);
  });

  it("requires acknowledgement and a non-empty turn from the live caller seat", async () => {
    await expect(
      POST(
        request({
          mode: "caller",
          scenarioId: "voice-booking",
          message: "Tuesday please",
          acknowledged: false,
        }),
      ).then((response) => response.status),
    ).resolves.toBe(400);

    await expect(
      POST(
        request({
          mode: "caller",
          scenarioId: "voice-booking",
          message: "   ",
          acknowledged: true,
        }),
      ).then((response) => response.status),
    ).resolves.toBe(400);
  });

  it("accepts a one-word live caller turn and fails closed without a provider", async () => {
    const previousKey = process.env.TOGETHER_API_KEY;
    const previousSecret = process.env.MENTAL_HEALTH_SPEECH_SECRET;
    delete process.env.TOGETHER_API_KEY;
    process.env.MENTAL_HEALTH_SPEECH_SECRET = "test-secret";
    try {
      const response = await POST(
        request({
          mode: "caller",
          scenarioId: "voice-booking",
          message: "Yes.",
          acknowledged: true,
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      // No classifier means abstention, and abstention is elevated—not routine.
      expect(body.route).toBe("elevated");
      expect(body.provider).toBe("fallback");
      expect(body.assessment.abstain).toBe(true);
      // Only text that survived review is signed for speech.
      expect(body.speechGrant.text).toBe(body.reply);
      expect(verifyReviewedSpeechGrant(body.speechGrant)).toBe(true);
    } finally {
      if (previousKey === undefined) delete process.env.TOGETHER_API_KEY;
      else process.env.TOGETHER_API_KEY = previousKey;
      if (previousSecret === undefined) {
        delete process.env.MENTAL_HEALTH_SPEECH_SECRET;
      } else {
        process.env.MENTAL_HEALTH_SPEECH_SECRET = previousSecret;
      }
    }
  });

  it("has an independent kill switch for the live caller seat", async () => {
    const previous = process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED;
    process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED = "false";
    try {
      const response = await POST(
        request({
          mode: "caller",
          scenarioId: "voice-booking",
          message: "Hello there",
          acknowledged: true,
        }),
      );
      expect(response.status).toBe(503);
    } finally {
      if (previous === undefined) {
        delete process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED;
      } else {
        process.env.MENTAL_HEALTH_LIVE_CALLER_ENABLED = previous;
      }
    }
  });
});

describe("response rules", () => {
  it("keeps the elevated rule identical for both personas", () => {
    expect(responseRuleForRoute("elevated")).toBe(
      responseRuleForRoute("elevated", "receptionist"),
    );
    expect(responseRuleForRoute("elevated")).toContain("exactly one direct");
  });

  it("gives the receptionist persona its own routine rule", () => {
    const rule = responseRuleForRoute("routine", "receptionist");
    expect(rule).toContain("Maya");
    expect(rule).toContain("nothing is booked or saved");
    expect(rule).not.toBe(responseRuleForRoute("routine"));
  });
});
