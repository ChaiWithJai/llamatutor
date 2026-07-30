export default function NextRepCard({ text }: { text: string }) {
  return (
    <div className="next-rep-card">
      <p className="session-label">Next rep</p>
      <p>{text}</p>
    </div>
  );
}
