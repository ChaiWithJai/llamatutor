import pg from "pg";

const connectionString = process.env.NETLIFY_DB_URL;

if (!connectionString) {
  console.error("NETLIFY_DB_URL is required for the database integration test.");
  process.exit(1);
}

const { Client } = pg;
const client = new Client({ connectionString });
const identityUserId = `integration-${crypto.randomUUID()}`;

try {
  await client.connect();
  await client.query("BEGIN");

  await client.query(
    `INSERT INTO learner_profiles (identity_user_id, email)
     VALUES ($1, $2)`,
    [identityUserId, `${identityUserId}@example.invalid`],
  );

  const goalResult = await client.query(
    `INSERT INTO coaching_goals (identity_user_id, topic, level, next_rep_text)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [identityUserId, "Integration test topic", "Middle School", "Try one example."],
  );
  const goalId = goalResult.rows[0].id;

  const repResult = await client.query(
    `INSERT INTO practice_reps
       (goal_id, identity_user_id, prompt, attempt, feedback, status, completed_at)
     VALUES ($1, $2, $3, $4, $5, 'completed', NOW())
     RETURNING id`,
    [
      goalId,
      identityUserId,
      "Explain the example.",
      "A test attempt.",
      "A test response.",
    ],
  );

  await client.query(
    `INSERT INTO coaching_sessions
       (goal_id, practice_rep_id, identity_user_id, topic, grounded)
     VALUES ($1, $2, $3, $4, TRUE)`,
    [goalId, repResult.rows[0].id, identityUserId, "Integration test topic"],
  );

  const result = await client.query(
    `SELECT
       (SELECT count(*)::int FROM learner_profiles WHERE identity_user_id = $1) AS profiles,
       (SELECT count(*)::int FROM coaching_goals WHERE identity_user_id = $1) AS goals,
       (SELECT count(*)::int FROM practice_reps WHERE identity_user_id = $1) AS reps,
       (SELECT count(*)::int FROM coaching_sessions WHERE identity_user_id = $1) AS sessions`,
    [identityUserId],
  );

  const counts = result.rows[0];
  if (
    counts.profiles !== 1 ||
    counts.goals !== 1 ||
    counts.reps !== 1 ||
    counts.sessions !== 1
  ) {
    throw new Error(`Unexpected integration row counts: ${JSON.stringify(counts)}`);
  }

  await client.query("ROLLBACK");
  console.log("Database integration test passed (transaction rolled back).");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
