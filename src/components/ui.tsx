import type { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-badge/45 px-3 py-1 text-[12.5px] font-semibold text-badge">
      {children}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-raised px-3 py-1 text-[12.5px] font-medium text-muted">
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  gradient = false,
}: {
  children: ReactNode;
  className?: string;
  gradient?: boolean;
}) {
  return (
    <div
      className={`rounded-[20px] border border-line ${
        gradient ? "panel" : "bg-surface"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeading({
  title,
  sub,
  action,
}: {
  title: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-9 flex items-end justify-between gap-6">
      <div>
        <h1 className="text-[38px] font-extrabold leading-[1.05] tracking-[-0.03em]">
          {title}
        </h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-muted">
          {sub}
        </p>
      </div>
      {action}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[13px] font-medium text-muted">{children}</span>
  );
}
