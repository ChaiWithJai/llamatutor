CREATE TABLE IF NOT EXISTS learner_profiles (
  identity_user_id TEXT PRIMARY KEY,
  email TEXT,
  default_level TEXT NOT NULL DEFAULT 'Middle School',
  streak_count INTEGER NOT NULL DEFAULT 0 CHECK (streak_count >= 0),
  last_completed_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coaching_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_user_id TEXT NOT NULL REFERENCES learner_profiles(identity_user_id) ON DELETE CASCADE,
  topic TEXT NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 240),
  level TEXT NOT NULL CHECK (char_length(level) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  next_rep_text TEXT CHECK (next_rep_text IS NULL OR char_length(next_rep_text) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS one_active_goal_per_learner
  ON coaching_goals(identity_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS coaching_goals_learner_created
  ON coaching_goals(identity_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS practice_reps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES coaching_goals(id) ON DELETE CASCADE,
  identity_user_id TEXT NOT NULL REFERENCES learner_profiles(identity_user_id) ON DELETE CASCADE,
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 1000),
  attempt TEXT CHECK (attempt IS NULL OR char_length(attempt) <= 8000),
  feedback TEXT CHECK (feedback IS NULL OR char_length(feedback) <= 12000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS one_pending_rep_per_goal
  ON practice_reps(goal_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS practice_reps_learner_created
  ON practice_reps(identity_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS coaching_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES coaching_goals(id) ON DELETE CASCADE,
  practice_rep_id UUID REFERENCES practice_reps(id) ON DELETE SET NULL,
  identity_user_id TEXT NOT NULL REFERENCES learner_profiles(identity_user_id) ON DELETE CASCADE,
  topic TEXT NOT NULL CHECK (char_length(topic) BETWEEN 1 AND 240),
  grounded BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coaching_sessions_learner_completed
  ON coaching_sessions(identity_user_id, completed_at DESC);
