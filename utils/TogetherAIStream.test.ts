import { describe, expect, it } from "vitest";
import { selectChatModel } from "./TogetherAIStream";

describe("selectChatModel", () => {
  it("defaults to the text-only model for plain string content", () => {
    expect(
      selectChatModel([
        { role: "system", content: "You are a tutor." },
        { role: "user", content: "Explain photosynthesis." },
      ]),
    ).toBe("Qwen/Qwen2.5-7B-Instruct-Turbo");
  });

  it("defaults to the text-only model for text-block content with no image", () => {
    expect(
      selectChatModel([
        {
          role: "user",
          content: [{ type: "text", text: "Explain photosynthesis." }],
        },
      ]),
    ).toBe("Qwen/Qwen2.5-7B-Instruct-Turbo");
  });

  it("routes to the multimodal model when any message includes an image", () => {
    expect(
      selectChatModel([
        { role: "system", content: "You are a tutor." },
        {
          role: "user",
          content: [
            { type: "text", text: "What's wrong with my chord shape?" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/hand.jpg" },
            },
          ],
        },
      ]),
    ).toBe("meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8");
  });

  it("routes to the multimodal model even if the image is in an earlier message", () => {
    expect(
      selectChatModel([
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: "https://example.com/first.jpg" },
            },
          ],
        },
        { role: "user", content: "Follow-up question, no image this time." },
      ]),
    ).toBe("meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8");
  });
});
