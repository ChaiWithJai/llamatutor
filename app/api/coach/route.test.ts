import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("coach route", () => {
  it("shares the Netlify contract in the local Next runtime", async () => {
    const response = await GET(new Request("http://localhost/api/coach"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Sign in to load coaching progress.",
    });
  });
});
