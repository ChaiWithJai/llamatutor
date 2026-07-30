import type { CoachDashboard } from "@/utils/coaching";
import NextRepCard from "@/components/NextRepCard";
import StreakBadge from "@/components/StreakBadge";

export default function ResumeBanner({
  dashboard,
  onResume,
}: {
  dashboard: CoachDashboard;
  onResume: () => void;
}) {
  if (!dashboard.goal) return null;

  const nextRep =
    dashboard.pendingRep?.prompt ??
    dashboard.goal.nextRepText ??
    "Continue your saved learning goal.";

  return (
    <section className="resume-banner" aria-labelledby="resume-title">
      <div className="resume-banner-copy">
        <div className="resume-banner-heading">
          <div>
            <p className="session-label">Welcome back</p>
            <h2 id="resume-title">{dashboard.goal.topic}</h2>
          </div>
          {(dashboard.profile?.streakCount ?? 0) > 0 && (
            <StreakBadge count={dashboard.profile?.streakCount ?? 0} />
          )}
        </div>
        <NextRepCard text={nextRep} />
      </div>
      <button className="primary-button" type="button" onClick={onResume}>
        Resume coaching
      </button>
    </section>
  );
}
