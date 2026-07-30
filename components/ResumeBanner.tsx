import type { CoachDashboard } from "@/utils/coaching";

export default function ResumeBanner({
  dashboard,
  onResume,
}: {
  dashboard: CoachDashboard;
  onResume: () => void;
}) {
  if (!dashboard.goal) return null;

  return (
    <section className="resume-banner" aria-labelledby="resume-title">
      <div>
        <p className="session-label">
          Welcome back
          {dashboard.profile?.streakCount
            ? ` · ${dashboard.profile.streakCount}-day streak`
            : ""}
        </p>
        <h2 id="resume-title">{dashboard.goal.topic}</h2>
        <p>
          {dashboard.pendingRep?.prompt ??
            dashboard.goal.nextRepText ??
            "Continue your saved learning goal."}
        </p>
      </div>
      <button className="primary-button" type="button" onClick={onResume}>
        Resume coaching
      </button>
    </section>
  );
}
