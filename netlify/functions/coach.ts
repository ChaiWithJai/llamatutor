import { getDatabase } from "@netlify/database";
import { getUser } from "@netlify/identity";
import { coachActionSchema } from "../../utils/coaching";
import type { Config } from "@netlify/functions";

type GoalRow = {
  id: string;
  topic: string;
  level: string;
  status: "active" | "archived";
  next_rep_text: string | null;
  created_at: string;
  updated_at: string;
};

type RepRow = {
  id: string;
  goal_id: string;
  prompt: string;
  attempt: string | null;
  feedback: string | null;
  status: "pending" | "completed" | "skipped";
  created_at: string;
  completed_at: string | null;
};

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
};

async function requireUser(request: Request) {
  const contextualUser = await getUser().catch(() => null);
  if (contextualUser?.id) return contextualUser;

  const authorization = request.headers.get("authorization");
  const cookieToken = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("nf_jwt="))
    ?.slice("nf_jwt=".length);
  const rawToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : cookieToken;
  if (!rawToken) return null;

  let token = rawToken;
  try {
    token = decodeURIComponent(rawToken);
  } catch {
    // Identity will reject malformed tokens.
  }

  try {
    const response = await fetch(
      new URL("/.netlify/identity/user", request.url),
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      id?: unknown;
      email?: unknown;
    };
    if (typeof data.id !== "string" || !data.id) return null;
    return {
      id: data.id,
      email: typeof data.email === "string" ? data.email : null,
    };
  } catch {
    return null;
  }
}

function mapGoal(row: GoalRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    topic: row.topic,
    level: row.level,
    status: row.status,
    nextRepText: row.next_rep_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRep(row: RepRow | undefined) {
  if (!row) return null;
  return {
    id: row.id,
    goalId: row.goal_id,
    prompt: row.prompt,
    attempt: row.attempt,
    feedback: row.feedback,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function getDashboard(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return Response.json(
      { error: "Sign in to load coaching progress." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const db = getDatabase();
  const exportRequested =
    new URL(request.url).searchParams.get("export") === "1";

  if (exportRequested) {
    const [profiles, goals, reps, sessions] = await Promise.all([
      db.sql`SELECT email, default_level, streak_count, last_completed_on, created_at, updated_at
        FROM learner_profiles
        WHERE identity_user_id = ${user.id}`,
      db.sql`SELECT id, topic, level, status, next_rep_text, created_at, updated_at
        FROM coaching_goals
        WHERE identity_user_id = ${user.id}
        ORDER BY created_at DESC`,
      db.sql`SELECT id, goal_id, prompt, attempt, feedback, status, created_at, completed_at
        FROM practice_reps
        WHERE identity_user_id = ${user.id}
        ORDER BY created_at DESC`,
      db.sql`SELECT id, goal_id, practice_rep_id, topic, grounded, created_at, completed_at
        FROM coaching_sessions
        WHERE identity_user_id = ${user.id}
        ORDER BY completed_at DESC`,
    ]);

    return Response.json(
      {
        exportedAt: new Date().toISOString(),
        profile: profiles[0] ?? null,
        goals,
        practiceReps: reps,
        coachingSessions: sessions,
      },
      {
        headers: {
          ...noStoreHeaders,
          "Content-Disposition":
            'attachment; filename="dharmic-data-tutor-export.json"',
        },
      },
    );
  }

  const [profiles, goals, reps, sessionCounts] = await Promise.all([
    db.sql<{
      email: string | null;
      default_level: string;
      streak_count: number;
      last_completed_on: string | null;
    }>`SELECT email, default_level, streak_count, last_completed_on
       FROM learner_profiles
       WHERE identity_user_id = ${user.id}`,
    db.sql<GoalRow>`SELECT id, topic, level, status, next_rep_text, created_at, updated_at
       FROM coaching_goals
       WHERE identity_user_id = ${user.id} AND status = 'active'
       ORDER BY updated_at DESC
       LIMIT 1`,
    db.sql<RepRow>`SELECT id, goal_id, prompt, attempt, feedback, status, created_at, completed_at
       FROM practice_reps
       WHERE identity_user_id = ${user.id}
       ORDER BY created_at DESC
       LIMIT 12`,
    db.sql<{ count: number }>`SELECT COUNT(*)::int AS count
       FROM coaching_sessions
       WHERE identity_user_id = ${user.id}`,
  ]);

  const pending = reps.find((rep) => rep.status === "pending");
  const profile = profiles[0];

  return Response.json(
    {
      profile: profile
        ? {
            email: profile.email,
            defaultLevel: profile.default_level,
            streakCount: profile.streak_count,
            lastCompletedOn: profile.last_completed_on,
          }
        : null,
      goal: mapGoal(goals[0]),
      pendingRep: mapRep(pending),
      recentReps: reps.map((rep) => mapRep(rep)),
      completedSessions: sessionCounts[0]?.count ?? 0,
    },
    { headers: noStoreHeaders },
  );
}

async function updateCoaching(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return Response.json(
      { error: "Sign in to save coaching progress." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const parsed = coachActionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      { error: "The coaching update was not valid." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const db = getDatabase();

  if (parsed.data.action === "start_goal") {
    const { topic, level } = parsed.data;

    await db.sql`INSERT INTO learner_profiles
      (identity_user_id, email, default_level)
      VALUES (${user.id}, ${user.email ?? null}, ${level})
      ON CONFLICT (identity_user_id)
      DO UPDATE SET
        email = EXCLUDED.email,
        default_level = EXCLUDED.default_level,
        updated_at = NOW()`;

    const existing =
      await db.sql<GoalRow>`SELECT id, topic, level, status, next_rep_text, created_at, updated_at
      FROM coaching_goals
      WHERE identity_user_id = ${user.id}
        AND status = 'active'
        AND lower(topic) = lower(${topic})
      LIMIT 1`;

    let goal = existing[0];
    if (!goal) {
      await db.sql`UPDATE coaching_goals
        SET status = 'archived', updated_at = NOW()
        WHERE identity_user_id = ${user.id} AND status = 'active'`;

      const created = await db.sql<GoalRow>`INSERT INTO coaching_goals
        (identity_user_id, topic, level)
        VALUES (${user.id}, ${topic}, ${level})
        RETURNING id, topic, level, status, next_rep_text, created_at, updated_at`;
      goal = created[0];
    } else if (goal.level !== level) {
      const updated = await db.sql<GoalRow>`UPDATE coaching_goals
        SET level = ${level}, updated_at = NOW()
        WHERE id = ${goal.id} AND identity_user_id = ${user.id}
        RETURNING id, topic, level, status, next_rep_text, created_at, updated_at`;
      goal = updated[0];
    }

    return Response.json({ goal: mapGoal(goal) }, { headers: noStoreHeaders });
  }

  if (parsed.data.action === "ensure_rep") {
    const { goalId, prompt } = parsed.data;
    const goals = await db.sql<{ id: string }>`SELECT id FROM coaching_goals
        WHERE id = ${goalId}
          AND identity_user_id = ${user.id}
          AND status = 'active'`;

    if (!goals[0]) {
      return Response.json(
        { error: "That coaching goal was not found." },
        { status: 404, headers: noStoreHeaders },
      );
    }

    await db.sql`INSERT INTO practice_reps
      (goal_id, identity_user_id, prompt)
      VALUES (${goalId}, ${user.id}, ${prompt})
      ON CONFLICT DO NOTHING`;

    const reps =
      await db.sql<RepRow>`SELECT id, goal_id, prompt, attempt, feedback, status, created_at, completed_at
      FROM practice_reps
      WHERE goal_id = ${goalId}
        AND identity_user_id = ${user.id}
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1`;

    return Response.json({ rep: mapRep(reps[0]) }, { headers: noStoreHeaders });
  }

  const { repId, attempt, feedback, nextRep, grounded } = parsed.data;
  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    const completed = await client.query<{
      id: string;
      goal_id: string;
      topic: string;
    }>(
      `UPDATE practice_reps AS rep
       SET attempt = $1, feedback = $2, status = 'completed', completed_at = NOW()
       FROM coaching_goals AS goal
       WHERE rep.id = $3
         AND rep.goal_id = goal.id
         AND rep.identity_user_id = $4
         AND goal.identity_user_id = $4
         AND rep.status = 'pending'
       RETURNING rep.id, rep.goal_id, goal.topic`,
      [attempt, feedback, repId, user.id],
    );

    const row = completed.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return Response.json(
        { error: "That practice rep was already completed or was not found." },
        { status: 409, headers: noStoreHeaders },
      );
    }

    await client.query(
      `UPDATE coaching_goals
       SET next_rep_text = $1, updated_at = NOW()
       WHERE id = $2 AND identity_user_id = $3`,
      [nextRep, row.goal_id, user.id],
    );
    await client.query(
      `INSERT INTO practice_reps
       (goal_id, identity_user_id, prompt)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [row.goal_id, user.id, nextRep],
    );
    await client.query(
      `INSERT INTO coaching_sessions
       (goal_id, practice_rep_id, identity_user_id, topic, grounded)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.goal_id, row.id, user.id, row.topic, grounded],
    );
    const profile = await client.query<{
      streak_count: number;
      last_completed_on: string;
    }>(
      `UPDATE learner_profiles
       SET
         streak_count = CASE
           WHEN last_completed_on = CURRENT_DATE THEN streak_count
           WHEN last_completed_on = CURRENT_DATE - 1 THEN streak_count + 1
           ELSE 1
         END,
         last_completed_on = CURRENT_DATE,
         updated_at = NOW()
       WHERE identity_user_id = $1
       RETURNING streak_count, last_completed_on`,
      [user.id],
    );
    await client.query("COMMIT");

    return Response.json(
      {
        completed: true,
        streakCount: profile.rows[0]?.streak_count ?? 1,
        lastCompletedOn: profile.rows[0]?.last_completed_on ?? null,
        nextRep,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Coaching update failed", error);
    return Response.json(
      { error: "The coaching update could not be saved." },
      { status: 500, headers: noStoreHeaders },
    );
  } finally {
    client.release();
  }
}

async function deleteLearningData(request: Request) {
  const user = await requireUser(request);
  if (!user) {
    return Response.json(
      { error: "Sign in to delete learning data." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const db = getDatabase();
  await db.sql`DELETE FROM learner_profiles WHERE identity_user_id = ${user.id}`;
  return Response.json({ deleted: true }, { headers: noStoreHeaders });
}

export default async function coach(request: Request) {
  if (request.method === "GET") return getDashboard(request);
  if (request.method === "POST") return updateCoaching(request);
  if (request.method === "DELETE") return deleteLearningData(request);
  return Response.json(
    { error: "Method not allowed." },
    {
      status: 405,
      headers: { ...noStoreHeaders, Allow: "GET, POST, DELETE" },
    },
  );
}

export const config: Config = {
  path: "/api/coach",
};
