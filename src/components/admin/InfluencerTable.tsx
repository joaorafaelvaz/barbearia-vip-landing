import Link from "next/link";
import type { InfluencerRow } from "@/lib/admin-stats";
import { Card, Pill, numClass, tableClass, tdClass, thClass } from "./Card";
import { fmtDateTime, fmtInt, fmtPct } from "./format";

export type SortKey = keyof Omit<InfluencerRow, "slug" | "handle">;
export type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; title?: string; numeric: boolean }[] = [
  { key: "name", label: "Influencer", numeric: false },
  { key: "clicks", label: "Cliques", numeric: true },
  { key: "leads", label: "Leads", numeric: true },
  { key: "eligible", label: "Elegíveis", title: "ELIGIBLE_NEW + ELIGIBLE_NO_SALES", numeric: true },
  { key: "denied", label: "Já clientes", title: "DENIED_HAS_SALES: base existente, não remunera", numeric: true },
  { key: "unknown", label: "Pendentes", title: "UNKNOWN: aguardando re-verificação", numeric: true },
  { key: "clickToLeadRate", label: "Clique→Lead", numeric: true },
  { key: "vouchersActive", label: "Ativos", numeric: true },
  { key: "vouchersUsed", label: "Usados", numeric: true },
  { key: "vouchersExpired", label: "Expirados", numeric: true },
  { key: "vouchersCancelled", label: "Cancelados", numeric: true },
  { key: "leadToUseRate", label: "Lead→Uso", numeric: true },
  { key: "lastLeadAt", label: "Último lead", numeric: false },
];

const SORT_KEYS = new Set<string>(COLUMNS.map((c) => c.key));

export function parseSort(sort: string | undefined, dir: string | undefined): { sort: SortKey; dir: SortDir } {
  const s = sort && SORT_KEYS.has(sort) ? (sort as SortKey) : "leads";
  const d: SortDir = dir === "asc" || dir === "desc" ? dir : s === "name" ? "asc" : "desc";
  return { sort: s, dir: d };
}

function cmpValue(v: InfluencerRow[SortKey]): number | string {
  if (v === null) return Number.NEGATIVE_INFINITY;
  if (v instanceof Date) return v.getTime();
  return v;
}

export function sortInfluencerRows(rows: InfluencerRow[], sort: SortKey, dir: SortDir): InfluencerRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = cmpValue(a[sort]);
    const vb = cmpValue(b[sort]);
    let c: number;
    if (typeof va === "string" && typeof vb === "string") c = va.localeCompare(vb, "pt-BR");
    else c = Number(va) - Number(vb);
    if (Number.isNaN(c)) c = 0;
    return c * sign || a.name.localeCompare(b.name, "pt-BR");
  });
}

export function InfluencerTable({
  rows,
  sort,
  dir,
  query,
}: {
  rows: InfluencerRow[];
  sort: SortKey;
  dir: SortDir;
  query: Record<string, string | undefined>;
}) {
  const sorted = sortInfluencerRows(rows, sort, dir);
  const totals = sorted.reduce(
    (t, r) => ({
      clicks: t.clicks + r.clicks,
      leads: t.leads + r.leads,
      eligible: t.eligible + r.eligible,
      denied: t.denied + r.denied,
      unknown: t.unknown + r.unknown,
      vouchersActive: t.vouchersActive + r.vouchersActive,
      vouchersUsed: t.vouchersUsed + r.vouchersUsed,
      vouchersExpired: t.vouchersExpired + r.vouchersExpired,
      vouchersCancelled: t.vouchersCancelled + r.vouchersCancelled,
    }),
    { clicks: 0, leads: 0, eligible: 0, denied: 0, unknown: 0, vouchersActive: 0, vouchersUsed: 0, vouchersExpired: 0, vouchersCancelled: 0 },
  );

  const hrefFor = (key: SortKey) => {
    const nextDir: SortDir = key === sort ? (dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc";
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v) qs.set(k, v);
    qs.set("sort", key);
    qs.set("dir", nextDir);
    return `/admin?${qs.toString()}#influencers`;
  };

  return (
    <Card title="Por influencer" description="Cliques e leads por data de criação; vouchers por data de emissão. Clique no cabeçalho para ordenar.">
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className={tableClass} id="influencers">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`${thClass} ${c.numeric ? "text-right" : ""}`} title={c.title} aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                  <Link href={hrefFor(c.key)} className={`hover:text-fg ${sort === c.key ? "text-gold" : ""}`}>
                    {c.label}
                    {sort === c.key ? <span aria-hidden> {dir === "asc" ? "▲" : "▼"}</span> : null}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.slug ?? "__none__"} className={r.slug === null ? "text-muted" : ""}>
                <td className={tdClass}>
                  <div className="font-medium text-fg">{r.name}</div>
                  <div className="text-xs text-muted">{r.slug ? `/i/${r.slug}${r.handle ? ` · ${r.handle}` : ""}` : "tráfego direto"}</div>
                </td>
                <td className={`${tdClass} ${numClass}`}>{fmtInt(r.clicks)}</td>
                <td className={`${tdClass} ${numClass} font-semibold`}>{fmtInt(r.leads)}</td>
                <td className={`${tdClass} ${numClass}`}>{fmtInt(r.eligible)}</td>
                <td className={`${tdClass} ${numClass}`}>{r.denied > 0 ? <Pill tone="gold">{fmtInt(r.denied)}</Pill> : fmtInt(r.denied)}</td>
                <td className={`${tdClass} ${numClass}`}>{r.unknown > 0 ? <Pill tone="danger">{fmtInt(r.unknown)}</Pill> : fmtInt(r.unknown)}</td>
                <td className={`${tdClass} ${numClass}`}>{fmtPct(r.clickToLeadRate)}</td>
                <td className={`${tdClass} ${numClass}`}>{fmtInt(r.vouchersActive)}</td>
                <td className={`${tdClass} ${numClass} text-success`}>{fmtInt(r.vouchersUsed)}</td>
                <td className={`${tdClass} ${numClass}`}>{fmtInt(r.vouchersExpired)}</td>
                <td className={`${tdClass} ${numClass}`}>{fmtInt(r.vouchersCancelled)}</td>
                <td className={`${tdClass} ${numClass}`}>{fmtPct(r.leadToUseRate)}</td>
                <td className={`${tdClass} text-muted`}>{fmtDateTime(r.lastLeadAt)}</td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td className={`${tdClass} text-muted`} colSpan={COLUMNS.length}>
                  Nenhum influencer cadastrado.
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className={tdClass}>Total</td>
              <td className={`${tdClass} ${numClass}`}>{fmtInt(totals.clicks)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtInt(totals.leads)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtInt(totals.eligible)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtInt(totals.denied)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtInt(totals.unknown)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtPct(totals.clicks > 0 ? totals.leads / totals.clicks : null)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtInt(totals.vouchersActive)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtInt(totals.vouchersUsed)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtInt(totals.vouchersExpired)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtInt(totals.vouchersCancelled)}</td>
              <td className={`${tdClass} ${numClass}`}>{fmtPct(totals.leads > 0 ? totals.vouchersUsed / totals.leads : null)}</td>
              <td className={tdClass} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
