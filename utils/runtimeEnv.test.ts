import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runtimeEnvManifest } from "./runtimeEnv";

describe("runtime environment contract", () => {
  it("keeps every supported variable in the example environment", () => {
    const example = readFileSync(".example.env", "utf8");
    for (const name of Object.keys(runtimeEnvManifest)) {
      expect(example, name).toMatch(new RegExp(`^${name}=`, "m"));
    }
  });
});
