import { z } from "zod";

export const learningLevels = [
  "Elementary School",
  "Middle School",
  "High School",
  "College",
  "Undergraduate",
  "Graduate",
] as const;

export const startGoalSchema = z.object({
  action: z.literal("start_goal"),
  topic: z.string().trim().min(1).max(240),
  level: z.enum(learningLevels),
});

export const ensureRepSchema = z.object({
  action: z.literal("ensure_rep"),
  goalId: z.uuid(),
  prompt: z.string().trim().min(1).max(1000),
});

export const completeRepSchema = z.object({
  action: z.literal("complete_rep"),
  repId: z.uuid(),
  attempt: z.string().trim().min(1).max(8000),
  feedback: z.string().trim().min(1).max(12000),
  nextRep: z.string().trim().min(1).max(1000),
  grounded: z.boolean(),
});

export const coachActionSchema = z.discriminatedUnion("action", [
  startGoalSchema,
  ensureRepSchema,
  completeRepSchema,
]);

export type CoachAction = z.infer<typeof coachActionSchema>;

export type PracticeRep = {
  id: string;
  goalId: string;
  prompt: string;
  attempt: string | null;
  feedback: string | null;
  status: "pending" | "completed" | "skipped";
  createdAt: string;
  completedAt: string | null;
};

export type CoachingGoal = {
  id: string;
  topic: string;
  level: string;
  status: "active" | "archived";
  nextRepText: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CoachDashboard = {
  profile: {
    email: string | null;
    defaultLevel: string;
    streakCount: number;
    lastCompletedOn: string | null;
  } | null;
  goal: CoachingGoal | null;
  pendingRep: PracticeRep | null;
  recentReps: PracticeRep[];
  completedSessions: number;
};

export function createFirstRep(topic: string) {
  return `Explain ${topic} in your own words, then give one concrete example. Keep it short enough that the tutor can respond precisely.`;
}

export function createNextRep(topic: string) {
  return `Apply ${topic} to a new example. Explain what changed, what stayed the same, and one question you still have.`;
}

export function calculateStreak(
  currentCount: number,
  lastCompletedOn: string | null,
  today: string,
) {
  if (lastCompletedOn === today) return currentCount;

  const todayDate = new Date(`${today}T00:00:00Z`);
  const yesterday = new Date(todayDate);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayText = yesterday.toISOString().slice(0, 10);

  return lastCompletedOn === yesterdayText ? currentCount + 1 : 1;
}

export function formatCoachFeedbackPrompt(
  topic: string,
  rep: string,
  attempt: string,
  level: string,
) {
  return [
    {
      role: "system",
      content: `You are a warm, direct skill coach. Give concise feedback at a ${level} level. Identify one thing the learner did well, correct one important misunderstanding if present, and suggest one improvement. Do not shame, grade, or claim the learner has mastered the topic.`,
    },
    {
      role: "user",
      content: `Topic: ${topic}\nPractice rep: ${rep}\nLearner attempt: ${attempt}`,
    },
  ];
}
