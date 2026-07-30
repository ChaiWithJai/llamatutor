import { describe, expect, it } from "vitest";
import { normalizeTutorMarkdown } from "./tutorMarkdown";

describe("normalizeTutorMarkdown", () => {
  it("rebuilds a streamed inline GFM table into rows", () => {
    expect(
      normalizeTutorMarkdown(
        "| Move | Effect | | --- | --- | | Predict | Guess | | Adjust | Learn |",
      ),
    ).toBe(
      [
        "| Move | Effect |",
        "| --- | --- |",
        "| Predict | Guess |",
        "| Adjust | Learn |",
      ].join("\n"),
    );
  });

  it("does not reinterpret ambiguous prose containing pipes", () => {
    const prose = "Use A | B when comparing two paths.";
    expect(normalizeTutorMarkdown(prose)).toBe(prose);
  });
});
