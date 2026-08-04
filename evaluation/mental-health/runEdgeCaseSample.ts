/**
 * Prints the reproducibility evidence issue #67 asks for: the seed, the case
 * IDs a run selects, and the route/category distribution.
 *
 * IDs and counts only. Case text never leaves the manifest, so this output is
 * safe to paste into a pull request or a webinar runbook.
 *
 *   pnpm eval:mental-health:edge-cases -- --seed webinar-2026 --count 7
 */
import {
  buildEdgeCaseRun,
  edgeCaseCategoryLabels,
  EDGE_CASE_MANIFEST_VERSION,
  edgeCaseManifest,
} from "../../utils/mentalHealthEdgeCases";

function argumentValue(name: string, fallback: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const seed = argumentValue("seed", "webinar-2026");
const count = Number(argumentValue("count", String(edgeCaseManifest.length)));
const run = buildEdgeCaseRun(seed).slice(0, Math.max(1, count));

const byCategory = new Map<string, number>();
const byRoute = new Map<string, number>();
for (const edgeCase of run) {
  byCategory.set(
    edgeCase.category,
    (byCategory.get(edgeCase.category) ?? 0) + 1,
  );
  byRoute.set(
    edgeCase.expectedRoute,
    (byRoute.get(edgeCase.expectedRoute) ?? 0) + 1,
  );
}

console.log(`manifest: ${EDGE_CASE_MANIFEST_VERSION}`);
console.log(`seed: ${seed}`);
console.log(`selected: ${run.length} of ${edgeCaseManifest.length}`);
console.log("");
console.log("order:");
run.forEach((edgeCase, index) => {
  console.log(
    `  ${String(index + 1).padStart(2, "0")}  ${edgeCase.id}  [${edgeCase.category} · ${edgeCase.expectedRoute} · cta=${edgeCase.ctaAllowed}]`,
  );
});
console.log("");
console.log("category distribution:");
for (const [category, total] of byCategory) {
  console.log(
    `  ${edgeCaseCategoryLabels[category as keyof typeof edgeCaseCategoryLabels]}: ${total}`,
  );
}
console.log("");
console.log("route distribution:");
for (const [route, total] of byRoute) {
  console.log(`  ${route}: ${total}`);
}
