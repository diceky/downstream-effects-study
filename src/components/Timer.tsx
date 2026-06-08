import { useEffect, useState } from "react";

interface Props {
  startedAt: number | null;
  durationSeconds: number;
  label?: string;
  onExpire?: () => void;
}

function format(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Timer({ startedAt, durationSeconds, label = "残り時間", onExpire }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const remaining = startedAt ? Math.max(0, durationSeconds - elapsed) : durationSeconds;
  const expired = !!startedAt && remaining === 0;

  useEffect(() => {
    if (expired && onExpire) onExpire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  if (!startedAt) return null;

  return (
    <div
      style={{
        padding: "12px 16px",
        background: "#f3f3f3",
        display: "inline-block",
        borderRadius: 6,
        fontSize: 24,
      }}
    >
      <strong>{label}:</strong> {format(remaining)}
    </div>
  );
}
