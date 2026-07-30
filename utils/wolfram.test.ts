import { describe, expect, it } from "vitest";
import { parseDrilldownText } from "./wolfram";

describe("parseDrilldownText", () => {
  it("extracts the interpretation, result, images, and website url", () => {
    const raw = [
      'Query:',
      '"population of france"',
      "",
      "Input interpretation:",
      "France | population",
      "",
      "Result:",
      "66.4 million people (world rank: 23rd) (2023 estimate)",
      "",
      "Recent population history:",
      "image: https://public6.wolframalpha.com/files/PNG_uc9pgssxs6.png",
      "",
      'Wolfram|Alpha website result for "population of france":',
      "https://www.wolframalpha.com/input?i=population+of+france",
    ].join("\n");

    const parsed = parseDrilldownText(raw);
    expect(parsed.interpretation).toBe("France | population");
    expect(parsed.result).toBe(
      "66.4 million people (world rank: 23rd) (2023 estimate)",
    );
    expect(parsed.images).toEqual([
      "https://public6.wolframalpha.com/files/PNG_uc9pgssxs6.png",
    ]);
    expect(parsed.websiteUrl).toBe(
      "https://www.wolframalpha.com/input?i=population+of+france",
    );
  });

  it("degrades gracefully when a section is missing", () => {
    const raw = "Query:\n\"asdf\"\n\nInput:\nasdf\n";
    const parsed = parseDrilldownText(raw);
    expect(parsed.interpretation).toBeNull();
    expect(parsed.result).toBeNull();
    expect(parsed.images).toEqual([]);
    expect(parsed.websiteUrl).toBeNull();
  });
});
