import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assessMentalHealthInput } from "../../app/api/mental-health/respond/route";
import { deriveMentalHealthRoute } from "../../utils/mentalHealthPolicy";
import {
  perturbTranscript,
  type TranscriptPerturbation,
} from "../../utils/voiceTurn";
import sourceManifest from "./sondermind-source.json";
import { loadSondermindCorpus, transcript } from "./sondermind";

const perturbations: TranscriptPerturbation[] = [
  "punctuation_loss",
  "homophone",
  "deletion",
];

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function main() {
  const sourceRoot = argument("--source");
  if (!sourceRoot || !process.env.TOGETHER_API_KEY) {
    throw new Error("--source and TOGETHER_API_KEY are required");
  }
  const reportPath =
    argument("--report") ??
    path.join(
      process.cwd(),
      "evaluation/mental-health/reports/voice-perturbations-current.json",
    );
  const corpus = await loadSondermindCorpus(sourceRoot);
  const byCategory = new Map(
    corpus.input
      .filter((fixture) => fixture.messages.length > 1)
      .map((fixture) => [fixture.category, fixture]),
  );
  const selected = [...byCategory.values()].slice(0, 12);

  const cases = [];
  for (const fixture of selected) {
    const cleanText = transcript(fixture.messages);
    const cleanAssessment = await assessMentalHealthInput(cleanText);
    const cleanRoute = deriveMentalHealthRoute(cleanAssessment.assessment);
    const variants = [];
    for (const perturbation of perturbations) {
      const assessed = await assessMentalHealthInput(
        perturbTranscript(cleanText, perturbation),
      );
      const route = deriveMentalHealthRoute(assessed.assessment);
      variants.push({
        perturbation,
        route,
        detection: route !== "routine" || assessed.assessment.abstain,
        routeMatchedClean: route === cleanRoute,
        latencyMs: assessed.durationMs,
      });
    }
    cases.push({
      id: fixture.id,
      category: fixture.category,
      clean: {
        route: cleanRoute,
        detection:
          cleanRoute !== "routine" || cleanAssessment.assessment.abstain,
        latencyMs: cleanAssessment.durationMs,
      },
      variants,
    });
    process.stdout.write(`Completed ${cases.length}/${selected.length}\n`);
  }

  const variants = cases.flatMap((fixture) => fixture.variants);
  const report = {
    schemaVersion: 1,
    publicSafe: true,
    rawContentIncluded: false,
    completedAt: new Date().toISOString(),
    source: {
      repository: sourceManifest.source,
      commit: sourceManifest.commit,
    },
    selection: "first multi-turn fixture per category, maximum 12 categories",
    summary: {
      fixtures: cases.length,
      variants: variants.length,
      routeStability:
        variants.length === 0
          ? null
          : variants.filter((variant) => variant.routeMatchedClean).length /
            variants.length,
      changedRouteIds: cases
        .filter((fixture) =>
          fixture.variants.some((variant) => !variant.routeMatchedClean),
        )
        .map((fixture) => fixture.id),
    },
    cases,
    limitations: [
      "Synthetic text perturbations are not a substitute for recorded accents, noise, codec loss, or live STT evaluation.",
      "Route stability against the clean model result does not establish correctness of either result.",
    ],
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  process.stdout.write(`Wrote content-free report to ${reportPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
