import Link from "next/link";
import { lastDaysPeriod } from "@/lib/admin-stats";

export function PeriodFilter({ from, to, extra }: { from: string; to: string; extra?: Record<string, string | undefined> }) {
  const keep = Object.entries(extra ?? {}).filter((e): e is [string, string] => Boolean(e[1]));
  const shortcut = (days: number) => {
    const p = lastDaysPeriod(days);
    const qs = new URLSearchParams([...keep, ["from", p.from], ["to", p.to]]);
    const active = p.from === from && p.to === to;
    return (
      <Link
        key={days}
        href={`/admin?${qs.toString()}`}
        className={`rounded-full border px-3 py-1 text-sm ${active ? "border-gold bg-gold-soft text-gold" : "border-line text-muted hover:text-fg"}`}
      >
        {days} dias
      </Link>
    );
  };

  return (
    <form method="get" action="/admin" className="flex flex-wrap items-end gap-3">
      {keep.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="text-sm text-muted">
        De
        <input type="date" name="from" defaultValue={from} className="ml-2 rounded-lg border border-line bg-bg px-2 py-1 text-fg" />
      </label>
      <label className="text-sm text-muted">
        Até
        <input type="date" name="to" defaultValue={to} className="ml-2 rounded-lg border border-line bg-bg px-2 py-1 text-fg" />
      </label>
      <button type="submit" className="rounded-full bg-gold px-4 py-1.5 text-sm font-semibold text-ink hover:bg-gold-strong">
        Aplicar
      </button>
      <div className="flex items-center gap-2">{[7, 30, 90].map(shortcut)}</div>
    </form>
  );
}
