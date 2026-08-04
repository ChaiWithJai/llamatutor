import { describe, expect, it } from "vitest";
import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/mental-health/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("mental health demo endpoint", () => {
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
});
