import { Card } from "@/components/ui";
import {
  days,
  heat,
  heatMax,
  hourBands,
  placements,
  scanTrend,
  trendDays,
} from "@/lib/mock";

export function StatRow() {
  const stats = [
    { label: "Scans this week", value: "502", note: "up 41% on last week" },
    { label: "Verified placements", value: "9", note: "across 2 campaigns" },
    { label: "Live now", value: "3", note: "removal funded" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label} className="px-5 py-5">
          <p className="text-[13px] text-muted">{stat.label}</p>
          <p className="mt-2 text-[32px] font-extrabold leading-none tracking-[-0.03em]">
            {stat.value}
          </p>
          <p className="mt-2 text-[12.5px] text-faint">{stat.note}</p>
        </Card>
      ))}
    </div>
  );
}

export function ScansByTime() {
  return (
    <Card className="px-6 py-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-[16px] font-bold tracking-[-0.01em]">
          Scans by time
        </h2>
        <span className="text-[12.5px] text-faint">Last 7 days</span>
      </div>

      <div className="flex gap-3">
        <div className="flex flex-col justify-between pb-6 pt-[3px] text-[11.5px] text-faint">
          {hourBands.map((band) => (
            <span key={band} className="leading-none">
              {band}
            </span>
          ))}
        </div>

        <div className="flex-1">
          <div className="grid grid-rows-6 gap-1.5">
            {heat.map((row, r) => (
              <div key={r} className="grid grid-cols-7 gap-1.5">
                {row.map((value, c) => {
                  const t = value / heatMax;
                  return (
                    <div
                      key={c}
                      title={`${days[c]} ${hourBands[r]} · ${value} scans`}
                      className="h-8 rounded-[5px] border border-line"
                      style={{
                        background: `color-mix(in srgb, var(--scan) ${Math.round(
                          t * 100
                        )}%, transparent)`,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1.5 text-center text-[11.5px] text-faint">
            {days.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ScanTrend() {
  const w = 620;
  const h = 200;
  const max = Math.max(...scanTrend) * 1.15;
  const step = w / (scanTrend.length - 1);

  const points = scanTrend.map((v, i) => [i * step, h - (v / max) * h]);
  const line = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;

  return (
    <Card className="px-6 py-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-[16px] font-bold tracking-[-0.01em]">
          Scans over time
        </h2>
        <span className="text-[12.5px] text-faint">All placements</span>
      </div>

      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="h-[190px] w-full"
      >
        <defs>
          <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--scan)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--scan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1="0"
            x2={w}
            y1={h * g}
            y2={h * g}
            stroke="var(--line)"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="url(#fade)" />
        <path
          d={line}
          fill="none"
          stroke="var(--scan)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="mt-3 flex justify-between text-[11.5px] text-faint">
        {trendDays.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
    </Card>
  );
}

const stateStyle: Record<string, string> = {
  verified: "text-paid",
  awaiting: "text-badge",
  removed: "text-faint",
};

const stateLabel: Record<string, string> = {
  verified: "Verified",
  awaiting: "Awaiting check",
  removed: "Removed",
};

export function ScansByPlace() {
  const top = Math.max(...placements.map((p) => p.scans));

  return (
    <Card className="overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-line px-6 py-5">
        <h2 className="text-[16px] font-bold tracking-[-0.01em]">
          Scans by placement
        </h2>
        <span className="text-[12.5px] text-faint">
          Engagement only. Payouts follow verification.
        </span>
      </div>

      <ul>
        {placements.map((p) => (
          <li
            key={p.id}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-2 border-b border-line px-6 py-4 last:border-0 sm:grid-cols-[70px_1fr_120px_92px]"
          >
            <span className="text-[13px] font-semibold text-muted">{p.id}</span>

            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-semibold">
                {p.spot}
              </span>
              <span className="block text-[12.5px] text-faint">
                {p.campaign}
              </span>
            </span>

            <span className="col-span-3 sm:col-span-1">
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-raised">
                <span
                  className="block h-full rounded-full bg-scan"
                  style={{ width: `${(p.scans / top) * 100}%` }}
                />
              </span>
            </span>

            <span className="flex flex-col items-end">
              <span className="text-[15px] font-bold">{p.scans}</span>
              <span className={`text-[12px] font-medium ${stateStyle[p.state]}`}>
                {stateLabel[p.state]}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
