import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../db";
import { hashPin } from "@/lib/unit-auth";
import { computeExpiresAt } from "@/lib/voucher";
import {
  burnVoucher,
  isPinLocked,
  lookupVoucher,
  recordPinFailure,
  resetPinLocks,
} from "@/lib/voucher-service";

type UnitRef = { id: string; slug: string; name: string };

let unitA: UnitRef;
let unitB: UnitRef;
const CODE = "VIP-7KQ4M2";

async function createVoucher(code: string, overrides: Partial<{ status: "ACTIVE" | "USED" | "CANCELLED"; expiresAt: Date; phone: string; name: string }> = {}) {
  const lead = await prisma.lead.create({
    data: { name: overrides.name ?? "João da Silva", phone: overrides.phone ?? `+55489999${Math.floor(Math.random() * 90000 + 10000)}` },
  });
  const issuedAt = new Date();
  return prisma.voucher.create({
    data: {
      code,
      leadId: lead.id,
      issuedAt,
      expiresAt: overrides.expiresAt ?? computeExpiresAt(issuedAt),
      status: overrides.status ?? "ACTIVE",
    },
  });
}

beforeEach(async () => {
  await resetDb();
  resetPinLocks();
  unitA = await prisma.unit.create({
    data: { slug: "centro", externalId: 45, name: "Barbearia VIP - Centro", pinHash: hashPin("123456") },
    select: { id: true, slug: true, name: true },
  });
  unitB = await prisma.unit.create({
    data: { slug: "shopping", externalId: 46, name: "Barbearia VIP - Shopping", pinHash: hashPin("654321") },
    select: { id: true, slug: true, name: true },
  });
  await createVoucher(CODE, { phone: "+5548999991111" });
});

describe("burnVoucher", () => {
  it("voucher ativo → USED com usedAt ≈ now, usedUnitId = A, usedBy e audit BURNED", async () => {
    const before = Date.now();
    const r = await burnVoucher(CODE, unitA, "Carlos", "iphash");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toBe(CODE);
    expect(r.discountPercent).toBe(10);
    expect(r.unit).toEqual({ slug: "centro", name: "Barbearia VIP - Centro" });
    expect(r.customerFirstName).toBe("João");
    expect(r.usedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(r.usedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const v = await prisma.voucher.findUnique({ where: { code: CODE } });
    expect(v?.status).toBe("USED");
    expect(v?.usedUnitId).toBe(unitA.id);
    expect(v?.usedBy).toBe("Carlos");
    expect(v?.usedAt?.getTime()).toBe(r.usedAt.getTime());

    const audits = await prisma.voucherAudit.findMany({ where: { voucherId: v!.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "BURNED", unitId: unitA.id, code: CODE, ipHash: "iphash", reason: null });
  });

  it("segunda queima (A ou B) → ALREADY_USED com usedUnit A; banco intacto", async () => {
    const first = await burnVoucher(CODE, unitA);
    expect(first.ok).toBe(true);

    for (const unit of [unitA, unitB]) {
      const r = await burnVoucher(CODE, unit);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.reason).toBe("ALREADY_USED");
      expect(r.usedUnit).toEqual({ slug: "centro", name: "Barbearia VIP - Centro" });
      expect(r.usedAt).toBeInstanceOf(Date);
    }

    const v = await prisma.voucher.findUnique({ where: { code: CODE } });
    expect(v?.status).toBe("USED");
    expect(v?.usedUnitId).toBe(unitA.id);

    const rejected = await prisma.voucherAudit.findMany({ where: { action: "REJECTED" }, orderBy: { createdAt: "asc" } });
    expect(rejected).toHaveLength(2);
    expect(rejected.map((a) => a.unitId)).toEqual([unitA.id, unitB.id]);
    expect(rejected.every((a) => a.reason === "ALREADY_USED")).toBe(true);
  });

  it("voucher expirado → EXPIRED e continua ACTIVE no banco", async () => {
    await createVoucher("VIP-EXPIRD", { expiresAt: new Date(Date.now() - 60_000), phone: "+5548999992222" });
    const r = await burnVoucher("VIP-EXPIRD", unitA);
    expect(r).toMatchObject({ ok: false, reason: "EXPIRED" });
    const v = await prisma.voucher.findUnique({ where: { code: "VIP-EXPIRD" } });
    expect(v?.status).toBe("ACTIVE");
    expect(v?.usedAt).toBeNull();
    const audit = await prisma.voucherAudit.findFirst({ where: { voucherId: v!.id } });
    expect(audit).toMatchObject({ action: "REJECTED", reason: "EXPIRED", unitId: unitA.id });
  });

  it("voucher cancelado → CANCELLED", async () => {
    await createVoucher("VIP-CANCEL", { status: "CANCELLED", phone: "+5548999993333" });
    const r = await burnVoucher("VIP-CANCEL", unitB);
    expect(r).toMatchObject({ ok: false, reason: "CANCELLED" });
    const v = await prisma.voucher.findUnique({ where: { code: "VIP-CANCEL" } });
    expect(v?.status).toBe("CANCELLED");
    const audit = await prisma.voucherAudit.findFirst({ where: { voucherId: v!.id } });
    expect(audit).toMatchObject({ action: "REJECTED", reason: "CANCELLED", unitId: unitB.id });
  });

  it("código inexistente → NOT_FOUND com audit REJECTED trazendo o code e voucherId null", async () => {
    const r = await burnVoucher("vip-zzzzzz", unitA, null, "iphash");
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
    const audit = await prisma.voucherAudit.findFirst();
    expect(audit).toMatchObject({ action: "REJECTED", reason: "NOT_FOUND", code: "VIP-ZZZZZZ", voucherId: null, unitId: unitA.id, ipHash: "iphash" });
  });

  it("concorrência: duas queimas simultâneas → exatamente uma ok", async () => {
    const results = await Promise.all([burnVoucher(CODE, unitA, "A"), burnVoucher(CODE, unitB, "B")]);
    const oks = results.filter((r) => r.ok);
    const fails = results.filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toHaveLength(1);
    expect(fails[0]).toMatchObject({ ok: false, reason: "ALREADY_USED" });

    const v = await prisma.voucher.findUnique({ where: { code: CODE } });
    expect(v?.status).toBe("USED");
    const winner = oks[0];
    if (winner.ok) expect(v?.usedUnitId).toBe(winner.unit.slug === "centro" ? unitA.id : unitB.id);

    const audits = await prisma.voucherAudit.findMany({ where: { voucherId: v!.id } });
    expect(audits.map((a) => a.action).sort()).toEqual(["BURNED", "REJECTED"]);
  });

  it("normaliza o código e aceita sem operador", async () => {
    const r = await burnVoucher("vip 7kq4m2", unitA);
    expect(r.ok).toBe(true);
    const v = await prisma.voucher.findUnique({ where: { code: CODE } });
    expect(v?.status).toBe("USED");
    expect(v?.usedBy).toBeNull();
  });
});

describe("lookupVoucher", () => {
  it("devolve estado e dados sem alterar status; normaliza 'vip 7kq4m2'; grava audit VALIDATED sem unidade", async () => {
    const r = await lookupVoucher("vip 7kq4m2", { ipHash: "iphash" });
    expect(r).not.toBeNull();
    expect(r).toMatchObject({
      code: CODE,
      state: "ACTIVE",
      discountPercent: 10,
      customerFirstName: "João",
      usedAt: null,
      usedUnit: null,
    });
    expect(r?.issuedAt).toBeInstanceOf(Date);
    expect(r?.expiresAt).toBeInstanceOf(Date);

    const v = await prisma.voucher.findUnique({ where: { code: CODE } });
    expect(v?.status).toBe("ACTIVE");
    expect(v?.usedAt).toBeNull();

    const audits = await prisma.voucherAudit.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "VALIDATED", unitId: null, voucherId: v!.id, code: CODE, ipHash: "iphash" });
  });

  it("inexistente → null, sem audit; audit:false não grava", async () => {
    expect(await lookupVoucher("VIP-NAOTEM")).toBeNull();
    expect(await lookupVoucher(CODE, { audit: false })).not.toBeNull();
    expect(await prisma.voucherAudit.count()).toBe(0);
  });

  it("depois da queima mostra USED com usedAt e usedUnit; expirado mostra EXPIRED", async () => {
    await burnVoucher(CODE, unitB, "Ana");
    const used = await lookupVoucher(CODE);
    expect(used).toMatchObject({ state: "USED", usedUnit: { slug: "shopping", name: "Barbearia VIP - Shopping" } });
    expect(used?.usedAt).toBeInstanceOf(Date);

    await createVoucher("VIP-EXPIRD", { expiresAt: new Date(Date.now() - 1000), phone: "+5548999994444", name: "Maria Clara Souza" });
    const expired = await lookupVoucher("VIP-EXPIRD");
    expect(expired).toMatchObject({ state: "EXPIRED", customerFirstName: "Maria", usedAt: null, usedUnit: null });
  });

  it("customerFirstName é a primeira palavra do nome do lead (com espaços extras)", async () => {
    await createVoucher("VIP-NOMEAB", { phone: "+5548999995555", name: "  ana   beatriz lima " });
    const r = await lookupVoucher("VIP-NOMEAB");
    expect(r?.customerFirstName).toBe("ana");
  });
});

describe("bloqueio de PIN em memória", () => {
  it("bloqueia a unidade+IP na 5ª falha em 15 min e não afeta outra unidade nem outro IP", () => {
    const t0 = Date.parse("2026-10-22T12:00:00Z");
    for (let i = 0; i < 4; i++) {
      expect(recordPinFailure("centro", "ip1", t0 + i * 1000).locked).toBe(false);
      expect(isPinLocked("centro", "ip1", t0 + i * 1000).locked).toBe(false);
    }
    expect(recordPinFailure("centro", "ip1", t0 + 4000).locked).toBe(true);
    const lock = isPinLocked("centro", "ip1", t0 + 5000);
    expect(lock.locked).toBe(true);
    expect(lock.retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect(lock.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);

    expect(isPinLocked("shopping", "ip1", t0 + 5000).locked).toBe(false);
    expect(isPinLocked("centro", "ip2", t0 + 5000).locked).toBe(false);

    // Janela deslizante: 15 min depois da primeira falha, sobram 4 falhas → desbloqueia.
    expect(isPinLocked("centro", "ip1", t0 + 15 * 60_000 + 1).locked).toBe(false);
    expect(isPinLocked("centro", "ip1", t0 + 4000 + 15 * 60_000 + 1).locked).toBe(false);
  });

  it("resetPinLocks limpa tudo e IP nulo também é contabilizado", () => {
    for (let i = 0; i < 5; i++) recordPinFailure("centro", null);
    expect(isPinLocked("centro", null).locked).toBe(true);
    resetPinLocks();
    expect(isPinLocked("centro", null).locked).toBe(false);
  });
});
