export default function SpotPhoto({ hint }: { hint: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
      <svg viewBox="0 0 320 180" className="h-[180px] w-full">
        <rect width="320" height="180" fill="var(--raised)" />
        <rect x="0" y="120" width="320" height="60" fill="var(--line)" opacity="0.5" />
        <rect x="34" y="30" width="120" height="90" rx="4" fill="var(--line)" opacity="0.7" />
        <rect x="176" y="52" width="112" height="68" rx="4" fill="var(--line)" opacity="0.45" />
        <rect
          x="196"
          y="66"
          width="30"
          height="40"
          rx="2"
          fill="var(--amber)"
          opacity="0.85"
        />
        <circle cx="211" cy="86" r="9" fill="var(--bg)" opacity="0.55" />
      </svg>
      <p className="border-t border-[var(--line)] px-4 py-3 text-[13px] text-[var(--muted)]">
        {hint}
      </p>
    </div>
  );
}
