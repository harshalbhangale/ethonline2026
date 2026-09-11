"use client";

/**
 * Why the submit button is not lit yet.
 *
 * The button alone going grey leaves a worker standing in the street guessing
 * which of the three requirements they still owe.
 */
export default function ProofChecklist({
  onSite,
  hasCode,
  hasPhoto,
}: {
  onSite: boolean;
  hasCode: boolean;
  hasPhoto: boolean;
}) {
  const items = [
    { done: onSite, label: "Be at the spot" },
    { done: hasCode, label: "Scan the poster code" },
    { done: hasPhoto, label: "Take the photo" },
  ];

  if (items.every((item) => item.done)) return null;

  return (
    <ul className="mt-4 flex flex-col gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2.5 text-[13px]">
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
              item.done
                ? "border-[var(--good)] bg-[var(--good)]"
                : "border-[var(--line)]"
            }`}
          >
            {item.done && (
              <svg viewBox="0 0 24 24" fill="none" className="h-2.5 w-2.5 text-[var(--bg)]">
                <path
                  d="m5 12.5 4.5 4.5L19 7"
                  stroke="currentColor"
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </span>
          <span className={item.done ? "text-[var(--faint)] line-through" : "text-[var(--muted)]"}>
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
