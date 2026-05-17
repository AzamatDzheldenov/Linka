import type { ReactNode } from "react";

type GroupedSectionProps = {
  children: ReactNode;
  className?: string;
  title?: string;
};

export function GroupedSection({
  children,
  className = "",
  title,
}: GroupedSectionProps) {
  return (
    <section className={className}>
      {title ? (
        <h2 className="mb-2 px-4 text-xs font-semibold uppercase tracking-normal text-[var(--text-muted)]">
          {title}
        </h2>
      ) : null}
      <div className="ios-grouped">{children}</div>
    </section>
  );
}

type RowProps = {
  children: ReactNode;
  className?: string;
};

export function IosRow({ children, className = "" }: RowProps) {
  return (
    <div className={`border-b border-[var(--border-soft)] px-4 py-3 last:border-b-0 ${className}`}>
      {children}
    </div>
  );
}
