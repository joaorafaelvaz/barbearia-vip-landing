import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPin } from "@/lib/unit-auth";
import type { Eligibility, SyncStatus } from "@/generated/prisma/client";
import { resetDb } from "../db";
import {
  UNATTRIBUTED_LABEL,
  alerts,
  influencerStats,
  lastDaysPeriod,
  parsePeriod,
  toDateInput,
  unitStats,
  type Period,
} from "@/lib/admin-stats";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date();
const ago = (ms: number) => new Date(now.getTime() - ms);
const period: Period = { from: ago(10 * DAY), to: new Date(now.getTime() + DAY) };

let seq = 0;
async function lead(opts: {
  influencerId?: string | null;
  eligibility: Eligibility;
  createdAt?: Date;
  syncStatus?: SyncStatus;
  unitId?: string;
}) {
  seq += 1;
  const n = String(seq).padStart(4, "0");
  return prisma.lead.create({
    data: {
      name: `Lead ${n}`,
      phone: `+554899990${n}`,
      email: `lead${n}@example.com`,
      birthDate: new Date(Date.UTC(1990, 0, 10)),
      influencerId: opts.influencerId ?? null,
      preferredUnitId: opts.unitId,
      eligibility: opts.eligibility,
      syncStatus: opts.syncStatus ?? "SYNCED",
      createdAt: opts.createdAt ?? ago(HOUR),
    },
  });
}

async function voucher(opts: {
  leadId: string;
  status?: "ACTIVE" | "USED" | "CANCELLED";
  issuedAt?: Date;
  expiresAt?: Date;
  usedAt?: Date;
  usedUnitId?: string;
}) {
  seq += 1;
  const issuedAt = opts.issuedAt ?? ago(HOUR);
  return prisma.voucher.create({
    data: {
      code: `VIP-T${String(seq).padStart(5, "0")}`,
      leadId: opts.leadId,
      status: opts.status ?? "ACTIVE",
      issuedAt,
      expiresAt: opts.expiresAt ?? new Date(issuedAt.getTime() + 7 * DAY),
      usedAt: opts.usedAt,
      usedUnitId: opts.usedUnitId,
    },
  });
}

let ana: { id: string };
let bruno: { id: string };
let centro: { id: string };
let norte: { id: string };

beforeEach(async () => {
  await resetDb();
  seq = 0;
  ana = await prisma.influencer.create({ data: { slug: "ana", name: "Ana", handle: "@ana" } });
  bruno = await prisma.influencer.create({ data: { slug: "bruno", name: "Bruno" } });
  centro = await prisma.unit.create({ data: { slug: "centro", externalId: 1, name: "Centro", city: "Florianópolis", state: "SC", pinHash: hashPin("111111") } });
  norte = await prisma.unit.create({ data: { slug: "norte", externalId: 2, name: "Norte", city: "Florianópolis", state: "SC", pinHash: hashPin("222222") } });
  await prisma.unit.create({ data: { slug: "antiga", externalId: 3, name: "Antiga", active: false, pinHash: hashPin("333333") } });

  // Cliques: Ana 3 no período + 1 fora; Bruno 1.
  await prisma.click.createMany({
    data: [
      { influencerId: ana.id, createdAt: ago(2 * DAY) },
      { influencerId: ana.id, createdAt: ago(DAY) },
      { influencerId: ana.id, createdAt: ago(HOUR) },
      { influencerId: ana.id, createdAt: ago(40 * DAY) },
      { influencerId: bruno.id, createdAt: ago(HOUR) },
    ],
  });

  // Ana: 5 leads no período (cada eligibility) + 1 antigo fora do período.
  const a1 = await lead({ influencerId: ana.id, eligibility: "ELIGIBLE_NEW", createdAt: ago(3 * DAY) });
  const a2 = await lead({ influencerId: ana.id, eligibility: "ELIGIBLE_NO_SALES", createdAt: ago(2 * DAY) });
  await lead({ influencerId: ana.id, eligibility: "DENIED_HAS_SALES", createdAt: ago(DAY) });
  await lead({ influencerId: ana.id, eligibility: "UNKNOWN", createdAt: ago(2 * HOUR) });
  await lead({ influencerId: ana.id, eligibility: "PENDING", createdAt: ago(30 * 60 * 1000) });
  const a0 = await lead({ influencerId: ana.id, eligibility: "ELIGIBLE_NEW", createdAt: ago(40 * DAY) });

  // Bruno: 4 leads; um UNKNOWN recente (10 min) com FAILED.
  const b1 = await lead({ influencerId: bruno.id, eligibility: "ELIGIBLE_NEW", createdAt: ago(4 * DAY) });
  const b2 = await lead({ influencerId: bruno.id, eligibility: "ELIGIBLE_NEW", createdAt: ago(4 * DAY) });
  await lead({ influencerId: bruno.id, eligibility: "UNKNOWN", createdAt: ago(10 * 60 * 1000), syncStatus: "FAILED" });
  const b3 = await lead({ influencerId: bruno.id, eligibility: "ELIGIBLE_NEW", createdAt: ago(5 * DAY) });

  // Sem atribuição: 2 leads.
  const n1 = await lead({ influencerId: null, eligibility: "ELIGIBLE_NEW", createdAt: ago(3 * DAY) });
  await lead({ influencerId: null, eligibility: "DENIED_HAS_SALES", createdAt: ago(3 * DAY) });

  // Vouchers no período: ativo, usado, expirado, cancelado.
  await voucher({ leadId: a1.id, status: "ACTIVE" });
  await voucher({ leadId: a2.id, status: "USED", usedAt: ago(DAY), usedUnitId: centro.id });
  await voucher({ leadId: b1.id, status: "ACTIVE", expiresAt: ago(HOUR) }); // expirado (derivado)
  await voucher({ leadId: b2.id, status: "CANCELLED" });
  await voucher({ leadId: b3.id, status: "USED", usedAt: ago(3 * DAY), usedUnitId: norte.id });
  await voucher({ leadId: n1.id, status: "USED", usedAt: ago(2 * DAY), usedUnitId: centro.id });
  // Fora do período: emitido e usado há 35 dias na unidade Norte.
  await voucher({ leadId: a0.id, status: "USED", issuedAt: ago(40 * DAY), usedAt: ago(35 * DAY), usedUnitId: norte.id });

  // Auditoria: rejeitadas no período (2 EXPIRED/Centro, 1 BAD_PIN/Norte, 1 NOT_FOUND sem unidade), 1 rejeitada antiga, 1 BURNED.
  await prisma.voucherAudit.createMany({
    data: [
      { action: "REJECTED", reason: "EXPIRED", unitId: centro.id, code: "VIP-X1" },
      { action: "REJECTED", reason: "EXPIRED", unitId: centro.id, code: "VIP-X2" },
      { action: "REJECTED", reason: "BAD_PIN", unitId: norte.id, code: "VIP-X3" },
      { action: "REJECTED", reason: "NOT_FOUND", code: "VIP-X4" },
      { action: "REJECTED", reason: "EXPIRED", unitId: norte.id, code: "VIP-X5", createdAt: ago(20 * DAY) },
      { action: "BURNED", unitId: centro.id, code: "VIP-X6" },
    ],
  });
});

describe("influencerStats", () => {
  it("conta cliques, leads por elegibilidade, vouchers por estado e taxas; ordena por leads desc", async () => {
    const rows = await influencerStats(period);
    expect(rows.map((r) => r.slug)).toEqual(["ana", "bruno", null]);

    const [anaRow, brunoRow, none] = rows;
    expect(anaRow).toMatchObject({
      name: "Ana",
      handle: "@ana",
      clicks: 3,
      leads: 5,
      eligible: 2,
      denied: 1,
      unknown: 1,
      vouchersActive: 1,
      vouchersUsed: 1,
      vouchersExpired: 0,
      vouchersCancelled: 0,
    });
    expect(anaRow.clickToLeadRate).toBeCloseTo(5 / 3);
    expect(anaRow.leadToUseRate).toBeCloseTo(0.2);
    expect(anaRow.lastLeadAt?.getTime()).toBe(ago(30 * 60 * 1000).getTime());

    expect(brunoRow).toMatchObject({
      name: "Bruno",
      handle: null,
      clicks: 1,
      leads: 4,
      eligible: 3,
      denied: 0,
      unknown: 1,
      vouchersActive: 0,
      vouchersUsed: 1,
      vouchersExpired: 1,
      vouchersCancelled: 1,
    });
    expect(brunoRow.clickToLeadRate).toBe(4);
    expect(brunoRow.leadToUseRate).toBeCloseTo(0.25);

    expect(none).toMatchObject({
      slug: null,
      name: UNATTRIBUTED_LABEL,
      clicks: 0,
      leads: 2,
      eligible: 1,
      denied: 1,
      unknown: 0,
      vouchersUsed: 1,
      clickToLeadRate: null,
    });
    expect(none.leadToUseRate).toBeCloseTo(0.5);
  });

  it("respeita o período: nada dentro de uma janela antiga, exceto o lead/voucher de 40 dias atrás", async () => {
    const old = { from: ago(45 * DAY), to: ago(38 * DAY) };
    const rows = await influencerStats(old);
    const anaRow = rows.find((r) => r.slug === "ana")!;
    expect(anaRow).toMatchObject({ clicks: 1, leads: 1, eligible: 1, vouchersUsed: 1, vouchersActive: 0 });
    const brunoRow = rows.find((r) => r.slug === "bruno")!;
    expect(brunoRow).toMatchObject({ clicks: 0, leads: 0, vouchersUsed: 0, clickToLeadRate: null, leadToUseRate: null });
    // Último lead é global, não do período.
    expect(brunoRow.lastLeadAt).not.toBeNull();
  });

  it("influencer sem nenhum dado aparece zerado", async () => {
    await prisma.influencer.create({ data: { slug: "zeca", name: "Zeca" } });
    const rows = await influencerStats(period);
    const zeca = rows.find((r) => r.slug === "zeca")!;
    expect(zeca).toMatchObject({ clicks: 0, leads: 0, clickToLeadRate: null, leadToUseRate: null, lastLeadAt: null });
    expect(rows.at(-1)?.slug).toBe("zeca"); // 0 leads, depois de "Sem atribuição" por nome
  });
});

describe("unitStats", () => {
  it("lista todas as unidades (inclusive inativas) com queimas por dia e por influencer, ordenadas por uso", async () => {
    const rows = await unitStats(period);
    expect(rows.map((r) => r.slug)).toEqual(["centro", "norte", "antiga"]);

    const [c, n, a] = rows;
    expect(c).toMatchObject({ name: "Centro", city: "Florianópolis", state: "SC", active: true, used: 2 });
    expect(c.usedByDay.reduce((s, d) => s + d.count, 0)).toBe(2);
    expect(c.usedByDay.map((d) => d.day)).toEqual([...c.usedByDay.map((d) => d.day)].sort());
    expect(c.usedByDay.map((d) => d.day)).toContain(toDateInput(ago(DAY)));
    expect(c.byInfluencer).toEqual([
      { slug: "ana", name: "Ana", count: 1 },
      { slug: null, name: UNATTRIBUTED_LABEL, count: 1 },
    ]);
    expect(c.lastUsedAt?.getTime()).toBe(ago(DAY).getTime());

    expect(n).toMatchObject({ used: 1, active: true });
    expect(n.byInfluencer).toEqual([{ slug: "bruno", name: "Bruno", count: 1 }]);
    expect(n.usedByDay).toEqual([{ day: toDateInput(ago(3 * DAY)), count: 1 }]);
    // Última queima é global (3 dias atrás, não 35).
    expect(n.lastUsedAt?.getTime()).toBe(ago(3 * DAY).getTime());

    expect(a).toMatchObject({ slug: "antiga", active: false, used: 0, usedByDay: [], byInfluencer: [], lastUsedAt: null });
  });

  it("período antigo pega só a queima de 35 dias atrás na unidade Norte", async () => {
    const rows = await unitStats({ from: ago(45 * DAY), to: ago(30 * DAY) });
    expect(rows[0]).toMatchObject({ slug: "norte", used: 1 });
    expect(rows[0].byInfluencer).toEqual([{ slug: "ana", name: "Ana", count: 1 }]);
    expect(rows.find((r) => r.slug === "centro")?.used).toBe(0);
  });
});

describe("alerts", () => {
  it("conta UNKNOWN com mais de 1 h, FAILED e agrupa rejeições por motivo e unidade", async () => {
    const a = await alerts(period);
    expect(a.unknownOlderThan1h).toBe(1);
    expect(a.failedValidation).toBe(1);
    expect(a.rejectedByReason).toEqual([
      { reason: "EXPIRED", unitName: "Centro", count: 2 },
      { reason: "BAD_PIN", unitName: "Norte", count: 1 },
      { reason: "NOT_FOUND", unitName: null, count: 1 },
    ]);
  });

  it("rejeições respeitam o período; `now` controla a janela de 1 h", async () => {
    const a = await alerts({ from: ago(25 * DAY), to: ago(15 * DAY) });
    expect(a.rejectedByReason).toEqual([{ reason: "EXPIRED", unitName: "Norte", count: 1 }]);
    const later = await alerts(period, new Date(now.getTime() + 2 * HOUR));
    expect(later.unknownOlderThan1h).toBe(2);
  });
});

describe("parsePeriod", () => {
  const fixedNow = new Date("2026-10-22T15:00:00.000Z"); // 12:00 em Brasília

  it("padrão: últimos 30 dias até o fim de hoje (Brasília)", () => {
    const p = parsePeriod({}, fixedNow);
    expect(p.to.toISOString()).toBe("2026-10-23T02:59:59.999Z");
    expect(p.from.toISOString()).toBe("2026-09-22T03:00:00.000Z");
  });

  it("aceita aaaa-mm-dd com `to` inclusivo", () => {
    const p = parsePeriod({ from: "2026-10-01", to: "2026-10-05" }, fixedNow);
    expect(p.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-06T02:59:59.999Z");
  });

  it("valores inválidos caem no padrão; from > to é invertido", () => {
    const def = parsePeriod({}, fixedNow);
    expect(parsePeriod({ from: "01/10/2026", to: "2026-02-30" }, fixedNow)).toEqual(def);
    expect(parsePeriod({ from: "hoje" }, fixedNow)).toEqual(def);
    const swapped = parsePeriod({ from: "2026-10-05", to: "2026-10-01" }, fixedNow);
    expect(swapped.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(swapped.to.toISOString()).toBe("2026-10-06T02:59:59.999Z");
  });

  it("só `from` informado: `to` é hoje; só `to`: from = to - 30 dias", () => {
    expect(parsePeriod({ from: "2026-10-20" }, fixedNow).to.toISOString()).toBe("2026-10-23T02:59:59.999Z");
    expect(parsePeriod({ to: "2026-10-10" }, fixedNow).from.toISOString()).toBe("2026-09-10T03:00:00.000Z");
  });

  it("atalhos e formatação de data em Brasília", () => {
    expect(lastDaysPeriod(7, fixedNow)).toEqual({ from: "2026-10-16", to: "2026-10-22" });
    expect(lastDaysPeriod(1, fixedNow)).toEqual({ from: "2026-10-22", to: "2026-10-22" });
    // 01:00Z ainda é o dia anterior em Brasília.
    expect(toDateInput(new Date("2026-10-23T01:00:00.000Z"))).toBe("2026-10-22");
  });
});
