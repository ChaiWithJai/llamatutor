import type { ExternalMessage, InputFixture, OutputFixture } from "./types";

export type ExternalTrajectoryFixture = {
  id: string;
  kind: "input" | "output";
  category: string;
  messages: ExternalMessage[];
};

export type ExternalTrajectoryTurnPlan = {
  turn: number;
  humanMessageIndex: number;
  candidateMessageIndex: number | null;
};

export function selectSondermindTrajectoryFixtures(
  corpus: { input: InputFixture[]; output: OutputFixture[] },
  count = 107,
) {
  const all: ExternalTrajectoryFixture[] = [
    ...corpus.input.map((fixture) => ({
      id: fixture.id,
      kind: "input" as const,
      category: fixture.category,
      messages: fixture.messages,
    })),
    ...corpus.output.map((fixture) => ({
      id: fixture.id,
      kind: "output" as const,
      category: fixture.category,
      messages: fixture.messages,
    })),
  ];
  const boundedCount = Math.min(count, all.length);
  return Array.from(
    { length: boundedCount },
    (_, index) => all[Math.floor((index * all.length) / boundedCount)],
  );
}

export function planExternalTrajectoryTurns(
  fixture: ExternalTrajectoryFixture,
) {
  const turns: ExternalTrajectoryTurnPlan[] = [];
  fixture.messages.forEach((message, index) => {
    if (message.role !== "human") return;
    turns.push({
      turn: turns.length + 1,
      humanMessageIndex: index,
      candidateMessageIndex:
        fixture.messages[index + 1]?.role === "ai" ? index + 1 : null,
    });
  });
  return turns;
}
