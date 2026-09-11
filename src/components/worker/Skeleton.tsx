/** Card-shaped placeholders, so a slow network keeps the layout still. */
export default function JobCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="h-4 w-[58%] animate-pulse rounded-full bg-[var(--raised)]" />
              <div className="mt-2.5 h-3 w-[76%] animate-pulse rounded-full bg-[var(--raised)]" />
            </div>
            <div className="h-5 w-14 animate-pulse rounded-full bg-[var(--raised)]" />
          </div>
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-24 animate-pulse rounded-full bg-[var(--raised)]" />
            <div className="h-6 w-28 animate-pulse rounded-full bg-[var(--raised)]" />
          </div>
        </div>
      ))}
    </>
  );
}
