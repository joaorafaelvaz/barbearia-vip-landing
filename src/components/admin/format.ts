import { formatDateTimeBr } from "@/lib/date";

const INT = new Intl.NumberFormat("pt-BR");

export function fmtInt(n: number): string {
  return INT.format(n);
}

/** Fração 0..1 → "12,5%"; null → "–". */
export function fmtPct(rate: number | null): string {
  if (rate === null) return "–";
  return `${(rate * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function fmtDateTime(d: Date | null): string {
  return d ? formatDateTimeBr(d) : "–";
}

/** "aaaa-mm-dd" → "dd/mm". */
export function fmtDayShort(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}/${m}`;
}
