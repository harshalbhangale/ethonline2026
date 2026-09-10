export default function MiniMap({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  label: string;
}) {
  const roads = [
    "M0,58 L200,42",
    "M0,104 L200,118",
    "M62,0 L48,160",
    "M138,0 L152,160",
    "M0,140 L200,132",
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--raised)]">
      <svg viewBox="0 0 200 160" className="h-[168px] w-full">
        <rect width="200" height="160" fill="var(--raised)" />
        {roads.map((d, i) => (
          <path
            key={i}
            d={d}
            stroke="var(--line)"
            strokeWidth={i < 2 ? 7 : 5}
            fill="none"
            strokeLinecap="round"
          />
        ))}
        <circle cx="100" cy="80" r="26" fill="var(--amber-soft)" />
        <circle
          cx="100"
          cy="80"
          r="6"
          fill="var(--amber)"
          stroke="var(--bg)"
          strokeWidth="2.5"
        />
      </svg>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[14px] font-medium">{label}</p>
          <p className="mt-0.5 text-[12px] text-[var(--faint)]">
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </p>
        </div>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-xl border border-[var(--line)] px-3 py-2 text-[13px] font-medium"
        >
          Directions
        </a>
      </div>
    </div>
  );
}
