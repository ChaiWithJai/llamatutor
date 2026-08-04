import {
  conversationTrajectoryManifest,
  contentFreeTrajectoryDetails,
  runConversationTrajectory,
  summarizeConversationTrajectories,
} from "./conversationTrajectories";

const results = conversationTrajectoryManifest.map(runConversationTrajectory);
const summary = summarizeConversationTrajectories(results);

console.log(
  JSON.stringify(
    process.argv.includes("--details")
      ? { ...summary, cases: contentFreeTrajectoryDetails(results) }
      : summary,
    null,
    2,
  ),
);
if (summary.failed > 0) process.exitCode = 1;
