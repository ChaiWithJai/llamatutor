import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    ".next/**",
    ".netlify/**",
    "node_modules/**",
    "output/**",
    "todos/**",
    "voice-worker/.venv/**",
    "next-env.d.ts",
  ]),
]);
