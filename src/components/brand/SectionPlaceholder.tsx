import Link from "next/link";
import { Card, PageHeading } from "@/components/ui";

/**
 * An honest placeholder for a Brand Portal section whose data does not exist yet.
 *
 * It deliberately renders no tables, counts or charts. Showing empty or invented
 * figures would imply the feature works.
 */
export default function SectionPlaceholder({
  title,
  sub,
  phase,
  summary,
  arriving,
  dependsOn,
}: {
  title: string;
  sub: string;
  phase: string;
  summary: string;
  arriving: string[];
  dependsOn?: string;
}) {
  return (
    <>
      <PageHeading title={title} sub={sub} />

      <Card gradient className="px-6 py-10 sm:px-10">
        <span className="inline-flex rounded-full border border-badge/40 px-3 py-1 text-[11.5px] font-bold uppercase tracking-[0.1em] text-badge">
          {phase}
        </span>

        <p className="mt-5 max-w-[60ch] text-[14.5px] leading-relaxed text-muted">
          {summary}
        </p>

        <div className="mt-7 border-t border-line pt-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-faint">
            What will appear here
          </p>
          <ul className="mt-3 space-y-2">
            {arriving.map((item) => (
              <li key={item} className="flex gap-2.5 text-[13.5px] text-muted">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {dependsOn ? (
          <p className="mt-6 text-[12.5px] leading-relaxed text-faint">{dependsOn}</p>
        ) : null}

        <Link
          href="/brand"
          className="mt-7 inline-flex h-10 items-center rounded-xl border border-line px-4 text-[13.5px] font-semibold hover:bg-raised"
        >
          Back to campaigns
        </Link>
      </Card>
    </>
  );
}
