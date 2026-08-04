import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import sourceManifest from "./sondermind-source.json";
import type { InputFixture, OutputFixture } from "./types";

const messageSchema = z.object({
  role: z.enum(["human", "ai"]),
  content: z.string().min(1),
});

const inputScenarioSchema = z.object({
  inputs: z.array(messageSchema).min(1),
  output: z.object({
    expected_result: z.boolean(),
    expected_observation: z.string().nullish(),
  }),
  metadata: z.object({ category: z.string().nullish() }).nullish(),
});

const outputScenarioSchema = z.object({
  inputs: z.array(messageSchema).min(2),
  output: z.object({
    expected_result: z.boolean(),
    issues: z.array(z.string()).nullish(),
  }),
  metadata: z.object({ category: z.string().nullish() }).nullish(),
});

const inputFileSchema = z.object({ scenarios: z.array(inputScenarioSchema) });
const outputFileSchema = z.object({ scenarios: z.array(outputScenarioSchema) });

async function readPinnedFile(root: string, key: "input" | "output") {
  const descriptor = sourceManifest.files[key];
  const file = path.join(root, descriptor.path);
  const bytes = await readFile(file);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== descriptor.sha256) {
    throw new Error(`${key} corpus hash does not match the pinned manifest`);
  }
  return bytes.toString("utf8");
}

export async function loadSondermindCorpus(root: string): Promise<{
  input: InputFixture[];
  output: OutputFixture[];
}> {
  const inputParsed = inputFileSchema.parse(
    parse(await readPinnedFile(root, "input")),
  );
  const outputParsed = outputFileSchema.parse(
    parse(await readPinnedFile(root, "output")),
  );

  if (
    inputParsed.scenarios.length !== sourceManifest.files.input.expectedCount
  ) {
    throw new Error("Input corpus count does not match the pinned manifest");
  }
  if (
    outputParsed.scenarios.length !== sourceManifest.files.output.expectedCount
  ) {
    throw new Error("Output corpus count does not match the pinned manifest");
  }

  return {
    input: inputParsed.scenarios.map((scenario, index) => ({
      id: `input-${String(index + 1).padStart(3, "0")}`,
      messages: scenario.inputs,
      expectedDetection: scenario.output.expected_result,
      observation: scenario.output.expected_observation ?? null,
      category:
        scenario.metadata?.category ??
        scenario.output.expected_observation ??
        "Uncategorized",
    })),
    output: outputParsed.scenarios.map((scenario, index) => ({
      id: `output-${String(index + 1).padStart(3, "0")}`,
      messages: scenario.inputs,
      expectedApproval: scenario.output.expected_result,
      issues: scenario.output.issues ?? [],
      category: scenario.metadata?.category ?? "Uncategorized",
    })),
  };
}

export function transcript(messages: Array<{ role: string; content: string }>) {
  return messages
    .map(
      (message) =>
        `${message.role === "ai" ? "Assistant" : "Caller"}: ${message.content}`,
    )
    .join("\n");
}
