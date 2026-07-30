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

  it("requires an explicitly configured model when a message includes an image", () => {
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
    ).toBeNull();
  });

  it("routes image history to the configured multimodal model", () => {
    expect(
      selectChatModel(
        [
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
        ],
        "dedicated-endpoint-model",
      ),
    ).toBe("dedicated-endpoint-model");
  });
});
