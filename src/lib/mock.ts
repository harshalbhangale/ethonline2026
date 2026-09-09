export const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const hourBands = [
  "12a",
  "4a",
  "8a",
  "12p",
  "4p",
  "8p",
];

function wave(day: number, band: number) {
  const evening = Math.max(0, 3 - Math.abs(band - 4)) * 9;
  const lunch = Math.max(0, 2 - Math.abs(band - 3)) * 6;
  const weekend = day === 0 || day === 6 ? 8 : 0;
  const drift = ((day * 7 + band * 13) % 11) - 4;
  return Math.max(0, evening + lunch + weekend + drift + 3);
}

export const heat = hourBands.map((band, bandIndex) =>
  days.map((_, dayIndex) => wave(dayIndex, bandIndex))
);

export const heatMax = Math.max(...heat.flat());

export const scanTrend = [
  8, 14, 11, 26, 31, 22, 40, 52, 47, 61, 58, 74, 69, 88,
];

export const trendDays = [
  "26 Aug",
  "28 Aug",
  "30 Aug",
  "1 Sep",
  "3 Sep",
  "5 Sep",
  "7 Sep",
  "9 Sep",
];

export type Placement = {
  id: string;
  spot: string;
  campaign: string;
  scans: number;
  state: "verified" | "awaiting" | "removed";
};

export const placements: Placement[] = [
  {
    id: "SB-014",
    spot: "Cafe Terra, north window",
    campaign: "Waitlist drop",
    scans: 148,
    state: "verified",
  },
  {
    id: "SB-015",
    spot: "Hostel Nine, stair landing",
    campaign: "Waitlist drop",
    scans: 96,
    state: "verified",
  },
  {
    id: "SB-016",
    spot: "Print Lab, entry board",
    campaign: "Waitlist drop",
    scans: 71,
    state: "awaiting",
  },
  {
    id: "SB-011",
    spot: "Fold Studio, lift lobby",
    campaign: "Launch week",
    scans: 54,
    state: "removed",
  },
  {
    id: "SB-012",
    spot: "Kade Books, side wall",
    campaign: "Launch week",
    scans: 33,
    state: "removed",
  },
];

export const totals = {
  scans: 502,
  verified: 9,
  live: 3,
};
