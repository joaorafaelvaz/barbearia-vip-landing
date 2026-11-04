import { prisma } from "@/lib/db";
import { getVoucherState } from "@/lib/voucher";

/*
 * Consultas do painel interno. Volume pequeno (campanha): poucas queries e agregação em memória.
 *
 * Convenções de período:
 * - cliques e leads: `createdAt`
 * - vouchers (ativos/usados/expirados/cancelados por influencer): `issuedAt`
 * - queimas por unidade: `usedAt`
 * - tentativas rejeitadas: `VoucherAudit.createdAt`
 * "Expirado" é derivado (ACTIVE com expiresAt no passado), via getVoucherState.
 */

export interface Period {
  from: Date;
  to: Date;
}

export interface InfluencerRow {
  slug: string | null;
  name: string;
  handle: string | null;
  clicks: number;
  leads: number;
  eligible: number;
  denied: number;
  unknown: number;
  /** leads / clicks (fração 0..1); null sem cliques. */
  clickToLeadRate: number | null;
  vouchersActive: number;
  vouchersUsed: number;
  vouchersExpired: number;
  vouchersCancelled: number;
  /** vouchersUsed / leads (fração 0..1); null sem leads. */
  leadToUseRate: number | null;
  /** Último lead do influencer em qualquer data (não limitado ao período). */
  lastLeadAt: Date | null;
}

export interface UnitRow {
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
  active: boolean;
  used: number;
  usedByDay: { day: string; count: number }[];
  byInfluencer: { slug: string | null; name: string; count: number }[];
  /** Última queima em qualquer data (não limitada ao período). */
  lastUsedAt: Date | null;
}

export interface Alerts {
  /** Leads ainda UNKNOWN criados há mais de 1 h (backlog, independe do período). */
  unknownOlderThan1h: number;
  /** Leads com syncStatus FAILED (backlog, independe do período). */
  failedValidation: number;
  /** Tentativas REJECTED no período, por motivo e unidade. */
  rejectedByReason: { reason: string; unitName: string | null; count: number }[];
}

export const UNATTRIBUTED_LABEL = "Sem atribuição";
export const SAO_PAULO_TZ = "America/Sao_Paulo";
/** Brasil não tem horário de verão desde 2019: offset fixo. */
const SAO_PAULO_OFFSET = "-03:00";
const DAY_MS = 24 * 60 * 60 * 1000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const YMD_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAO_PAULO_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "aaaa-mm-dd" da data no fuso de Brasília (para inputs type=date e nomes de arquivo). */
export function toDateInput(d: Date): string {
  return YMD_FORMATTER.format(d);
}

function parseYmd(s: string | undefined): string | null {
  if (!s) return null;
  const m = YMD.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function startOfDaySp(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000${SAO_PAULO_OFFSET}`);
}

function endOfDaySp(ymd: string): Date {
  return new Date(`${ymd}T23:59:59.999${SAO_PAULO_OFFSET}`);
}

/**
 * Período a partir da query string. Padrão: últimos 30 dias (início do dia de hoje-30 até o fim de hoje,
 * em Brasília). Aceita `aaaa-mm-dd`; valores inválidos caem no padrão; `to` é inclusivo (fim do dia).
 */
export function parsePeriod(searchParams: { from?: string; to?: string }, now: Date = new Date()): Period {
  const todayYmd = toDateInput(now);
  const toYmd = parseYmd(searchParams.to) ?? todayYmd;
  const fromYmd = parseYmd(searchParams.from) ?? toDateInput(new Date(startOfDaySp(toYmd).getTime() - 30 * DAY_MS));
  let from = startOfDaySp(fromYmd);
  let to = endOfDaySp(toYmd);
  if (from > to) [from, to] = [startOfDaySp(toYmd), endOfDaySp(fromYmd)];
  return { from, to };
}

/** Período dos últimos N dias (inclui hoje), para os atalhos 7/30/90. */
export function lastDaysPeriod(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = toDateInput(now);
  const from = toDateInput(new Date(startOfDaySp(to).getTime() - (days - 1) * DAY_MS));
  return { from, to };
}

function between(period: Period) {
  return { gte: period.from, lte: period.to };
}

function rate(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

const UNATTRIBUTED_KEY = "__none__";

export async function influencerStats(period: Period, now: Date = new Date()): Promise<InfluencerRow[]> {
  const [influencers, clicks, leads, vouchers, lastLeads] = await Promise.all([
    prisma.influencer.findMany({
      select: { id: true, slug: true, name: true, handle: true },
      orderBy: { name: "asc" },
    }),
    prisma.click.groupBy({
      by: ["influencerId"],
      where: { createdAt: between(period) },
      _count: { _all: true },
    }),
    prisma.lead.findMany({
      where: { createdAt: between(period) },
      select: { influencerId: true, eligibility: true },
    }),
    prisma.voucher.findMany({
      where: { issuedAt: between(period), kind: "CAMPAIGN" },
      select: { status: true, expiresAt: true, lead: { select: { influencerId: true } } },
    }),
    prisma.lead.groupBy({
      by: ["influencerId"],
      _max: { createdAt: true },
    }),
  ]);

  const rows = new Map<string, InfluencerRow>();
  const blank = (slug: string | null, name: string, handle: string | null): InfluencerRow => ({
    slug,
    name,
    handle,
    clicks: 0,
    leads: 0,
    eligible: 0,
    denied: 0,
    unknown: 0,
    clickToLeadRate: null,
    vouchersActive: 0,
    vouchersUsed: 0,
    vouchersExpired: 0,
    vouchersCancelled: 0,
    leadToUseRate: null,
    lastLeadAt: null,
  });
  for (const inf of influencers) rows.set(inf.id, blank(inf.slug, inf.name, inf.handle));
  rows.set(UNATTRIBUTED_KEY, blank(null, UNATTRIBUTED_LABEL, null));

  const rowFor = (influencerId: string | null) => rows.get(influencerId ?? UNATTRIBUTED_KEY);

  for (const c of clicks) {
    const row = rowFor(c.influencerId);
    if (row) row.clicks += c._count._all;
  }
  for (const l of leads) {
    const row = rowFor(l.influencerId);
    if (!row) continue;
    row.leads += 1;
    if (l.eligibility === "ELIGIBLE_NEW" || l.eligibility === "ELIGIBLE_NO_SALES") row.eligible += 1;
    else if (l.eligibility === "DENIED_HAS_SALES") row.denied += 1;
    else if (l.eligibility === "UNKNOWN") row.unknown += 1;
  }
  for (const v of vouchers) {
    const row = rowFor(v.lead?.influencerId ?? null);
    if (!row) continue;
    switch (getVoucherState(v, now)) {
      case "ACTIVE":
        row.vouchersActive += 1;
        break;
      case "USED":
        row.vouchersUsed += 1;
        break;
      case "EXPIRED":
        row.vouchersExpired += 1;
        break;
      case "CANCELLED":
        row.vouchersCancelled += 1;
        break;
    }
  }
  for (const g of lastLeads) {
    const row = rowFor(g.influencerId);
    if (row) row.lastLeadAt = g._max.createdAt;
  }
  for (const row of rows.values()) {
    row.clickToLeadRate = rate(row.leads, row.clicks);
    row.leadToUseRate = rate(row.vouchersUsed, row.leads);
  }

  return [...rows.values()].sort((a, b) => b.leads - a.leads || a.name.localeCompare(b.name, "pt-BR"));
}

export async function unitStats(period: Period): Promise<UnitRow[]> {
  const [units, used, lastUsed] = await Promise.all([
    prisma.unit.findMany({
      select: { id: true, slug: true, name: true, city: true, state: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.voucher.findMany({
      where: { status: "USED", usedAt: between(period), usedUnitId: { not: null } },
      select: {
        usedUnitId: true,
        usedAt: true,
        kind: true,
        lead: { select: { influencer: { select: { slug: true, name: true } } } },
      },
    }),
    prisma.voucher.groupBy({
      by: ["usedUnitId"],
      where: { status: "USED", usedUnitId: { not: null } },
      _max: { usedAt: true },
    }),
  ]);

  type Acc = { row: UnitRow; byDay: Map<string, number>; byInf: Map<string, { slug: string | null; name: string; count: number }> };
  const acc = new Map<string, Acc>();
  for (const u of units) {
    acc.set(u.id, {
      row: { slug: u.slug, name: u.name, city: u.city, state: u.state, active: u.active, used: 0, usedByDay: [], byInfluencer: [], lastUsedAt: null },
      byDay: new Map(),
      byInf: new Map(),
    });
  }

  for (const v of used) {
    if (!v.usedUnitId || !v.usedAt) continue;
    const a = acc.get(v.usedUnitId);
    if (!a) continue;
    a.row.used += 1;
    const day = toDateInput(v.usedAt);
    a.byDay.set(day, (a.byDay.get(day) ?? 0) + 1);
    const inf = v.lead?.influencer ?? null;
    const key = v.kind === "MANUAL" ? "__manual__" : (inf?.slug ?? UNATTRIBUTED_KEY);
    const entry = a.byInf.get(key) ?? { slug: inf?.slug ?? null, name: v.kind === "MANUAL" ? "Voucher manual" : (inf?.name ?? UNATTRIBUTED_LABEL), count: 0 };
    entry.count += 1;
    a.byInf.set(key, entry);
  }
  for (const g of lastUsed) {
    if (!g.usedUnitId) continue;
    const a = acc.get(g.usedUnitId);
    if (a) a.row.lastUsedAt = g._max.usedAt;
  }

  const rows = [...acc.values()].map(({ row, byDay, byInf }) => {
    row.usedByDay = [...byDay.entries()].map(([day, count]) => ({ day, count })).sort((x, y) => x.day.localeCompare(y.day));
    row.byInfluencer = [...byInf.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name, "pt-BR"));
    return row;
  });
  return rows.sort((a, b) => b.used - a.used || a.name.localeCompare(b.name, "pt-BR"));
}

export const NO_REASON_LABEL = "SEM_MOTIVO";

export async function alerts(period: Period, now: Date = new Date()): Promise<Alerts> {
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const [unknownOlderThan1h, failedValidation, rejected] = await Promise.all([
    prisma.lead.count({ where: { eligibility: "UNKNOWN", createdAt: { lt: oneHourAgo } } }),
    prisma.lead.count({ where: { syncStatus: "FAILED" } }),
    prisma.voucherAudit.findMany({
      where: { action: "REJECTED", createdAt: between(period) },
      select: { reason: true, unitId: true, unit: { select: { name: true } } },
    }),
  ]);

  const grouped = new Map<string, Alerts["rejectedByReason"][number]>();
  for (const r of rejected) {
    const reason = r.reason?.trim() || NO_REASON_LABEL;
    const key = `${reason}\u0000${r.unitId ?? ""}`;
    const entry = grouped.get(key) ?? { reason, unitName: r.unit?.name ?? null, count: 0 };
    entry.count += 1;
    grouped.set(key, entry);
  }
  const rejectedByReason = [...grouped.values()].sort(
    (a, b) => b.count - a.count || a.reason.localeCompare(b.reason) || (a.unitName ?? "").localeCompare(b.unitName ?? "", "pt-BR"),
  );

  return { unknownOlderThan1h, failedValidation, rejectedByReason };
}
