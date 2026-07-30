export default function StreakBadge({ count }: { count: number }) {
  return (
    <span className="streak-indicator" aria-label={`${count} day practice streak`}>
      <span className="streak-badge" aria-hidden="true">
        {count}
      </span>
      <span>{count}-day showing-up streak</span>
    </span>
  );
}
