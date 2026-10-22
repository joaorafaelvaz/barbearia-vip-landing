import type { ReactNode } from "react";

export function Card({
  title,
  description,
  actions,
  tone = "default",
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: "default" | "warning";
  children: ReactNode;
}) {
  const border = tone === "warning" ? "border-gold/50" : "border-line";
  return (
    <section className={`rounded-card border ${border} bg-surface p-4 sm:p-5`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl tracking-wide text-fg">{title}</h2>
          {description ? <p className="text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "gold" | "danger" | "success" }) {
  const cls = {
    muted: "bg-surface-2 text-muted",
    gold: "bg-gold-soft text-gold",
    danger: "bg-danger-bg text-danger",
    success: "bg-success/10 text-success",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

export const tableClass = "w-full min-w-max border-collapse text-sm";
export const thClass = "sticky top-0 whitespace-nowrap border-b border-line bg-surface px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted";
export const tdClass = "whitespace-nowrap border-b border-line/60 px-2 py-1.5 align-top";
export const numClass = "text-right tabular-nums";
