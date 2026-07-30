import {
  createParser,
  ParsedEvent,
  ReconnectInterval,
} from "eventsource-parser";

export type ChatGPTAgent = "user" | "system";

export type ChatGPTContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatGPTMessage {
  role: ChatGPTAgent;
  content: string | ChatGPTContentBlock[];
}

export interface TogetherAIStreamPayload {
  model: string;
  messages: ChatGPTMessage[];
  stream: boolean;
}

// Qwen2.5-7B-Instruct-Turbo is text-only and cheaper on output tokens
// ($0.30/1M in, $0.30/1M out vs Maverick's $0.27/1M in, $0.85/1M out on
// Together AI as of 2026-07-30) -- it stays the default for the free,
// high-volume, text-only explainer path. Llama 4 Maverick is natively
// multimodal, so any message carrying an image_url block must route there;
// Qwen has no way to see the image at all. See docs/adr/0003-dual-model-routing.md.
const TEXT_MODEL = "Qwen/Qwen2.5-7B-Instruct-Turbo";
const MULTIMODAL_MODEL = "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8";

export function selectChatModel(messages: ChatGPTMessage[]): string {
  const hasImage = messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((block) => block.type === "image_url"),
  );
  return hasImage ? MULTIMODAL_MODEL : TEXT_MODEL;
}

// const together = new Together({
//   apiKey: process.env["TOGETHER_API_KEY"],
//   baseURL: "https://together.helicone.ai/v1",
//   defaultHeaders: {
//     "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
//   },
// });

export async function TogetherAIStream(payload: TogetherAIStreamPayload) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const togetherApiKey = process.env.TOGETHER_API_KEY;

  if (!togetherApiKey) {
    throw new Error("TOGETHER_API_KEY is required");
  }

  const heliconeApiKey = process.env.HELICONE_API_KEY;
  const baseUrl = heliconeApiKey
    ? "https://together.helicone.ai/v1"
    : "https://api.together.ai/v1";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${togetherApiKey}`,
  };

  if (heliconeApiKey) {
    headers["Helicone-Auth"] = `Bearer ${heliconeApiKey}`;
    headers["Helicone-Property-AppName"] = "llamatutor";
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    headers: {
      ...headers,
    },
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Together API request failed with status ${res.status}`);
  }

  const readableStream = new ReadableStream({
    async start(controller) {
      // callback
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === "event") {
          const data = event.data;
          controller.enqueue(encoder.encode(data));
        }
      };

      // stream response (SSE) from OpenAI may be fragmented into multiple chunks
      // this ensures we properly read chunks and invoke an event for each SSE event stream
      const parser = createParser(onParse);
      // https://web.dev/streams/#asynchronous-iteration
      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  let counter = 0;
  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      const data = decoder.decode(chunk);
      // https://beta.openai.com/docs/api-reference/completions/create#completions/create-stream
      if (data === "[DONE]") {
        controller.terminate();
        return;
      }
      try {
        const json = JSON.parse(data);
        const text = json.choices[0].delta?.content || "";
        if (counter < 2 && (text.match(/\n/) || []).length) {
          // this is a prefix character (i.e., "\n\n"), do nothing
          return;
        }
        // stream transformed JSON resposne as SSE
        const payload = { text: text };
        // https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
        counter++;
      } catch (e) {
        // maybe parse error
        controller.error(e);
      }
    },
  });

  return readableStream.pipeThrough(transformStream);
}
