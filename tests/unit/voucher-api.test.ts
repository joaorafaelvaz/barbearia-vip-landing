import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetDb } from "../db";
import { hashPin } from "@/lib/unit-auth";
import { resetRateLimits } from "@/lib/rate-limit";
import { computeExpiresAt } from "@/lib/voucher";
import { resetPinLocks } from "@/lib/voucher-service";
import { GET } from "@/app/api/vouchers/[code]/route";
import { POST } from "@/app/api/vouchers/[code]/burn/route";

const CODE = "VIP-7KQ4M2";
const IP = "1.2.3.4";

type UnitRef = { id: string; slug: string; name: string };
let unitA: UnitRef;
let unitB: UnitRef;

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });

function get(code: string, ip = IP) {
  return GET(new NextRequest(`http://localhost/api/vouchers/${encodeURIComponent(code)}`, { headers: { "x-forwarded-for": ip } }), ctx(code));
}

function post(code: string, body: unknown, ip = IP) {
  return POST(
    new NextRequest(`http://localhost/api/vouchers/${encodeURIComponent(code)}/burn`, {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
    }),
    ctx(code),
  );
}

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  resetPinLocks();
  unitA = await prisma.unit.create({
    data: { slug: "centro", externalId: 45, name: "Barbearia VIP - Centro", pinHash: hashPin("123456") },
    select: { id: true, slug: true, name: true },
  });
  unitB = await prisma.unit.create({
    data: { slug: "shopping", externalId: 46, name: "Barbearia VIP - Shopping", pinHash: hashPin("654321") },
    select: { id: true, slug: true, name: true },
  });
  await prisma.unit.create({ data: { slug: "fechada", externalId: 47, name: "Fechada", pinHash: hashPin("111111"), active: false } });
  const lead = await prisma.lead.create({ data: { name: "João da Silva", phone: "+5548999991111" } });
  const issuedAt = new Date();
  await prisma.voucher.create({ data: { code: CODE, leadId: lead.id, issuedAt, expiresAt: computeExpiresAt(issuedAt) } });
});

describe("GET /api/vouchers/[code]", () => {
  it("200 com o estado do voucher (datas ISO), no-store e audit VALIDATED sem unidade; não altera status", async () => {
    const res = await get("vip 7kq4m2");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ code: CODE, state: "ACTIVE", discountPercent: 10, customerFirstName: "João", usedAt: null, usedUnit: null });
    expect(typeof body.issuedAt).toBe("string");
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const v = await prisma.voucher.findUnique({ where: { code: CODE } });
    expect(v?.status).toBe("ACTIVE");
    const audits = await prisma.voucherAudit.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "VALIDATED", unitId: null, voucherId: v!.id });
    expect(audits[0].ipHash).toHaveLength(64);
  });

  it("404 NOT_FOUND para código inexistente ou malformado", async () => {
    const res = await get("VIP-NAOTEM");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "NOT_FOUND" });
    expect(res.headers.get("cache-control")).toBe("no-store");

    const bad = await get("'; drop table--");
    expect(bad.status).toBe(404);
    expect(await prisma.voucherAudit.count()).toBe(0);
  });

  it("429 após 60 consultas por minuto do mesmo IP; outro IP segue normal", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await get(CODE)).status).toBe(200);
    }
    const res = await get(CODE);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "RATE_LIMITED" });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await get(CODE, "9.9.9.9")).status).toBe(200);
  });
});

describe("POST /api/vouchers/[code]/burn", () => {
  it("PIN errado → 401 BAD_PIN, voucher intacto, audit REJECTED/BAD_PIN com unidade e código", async () => {
    const res = await post(CODE, { unit: "centro", pin: "999999" });
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "BAD_PIN" });

    const v = await prisma.voucher.findUnique({ where: { code: CODE } });
    expect(v?.status).toBe("ACTIVE");
    const audit = await prisma.voucherAudit.findFirst();
    expect(audit).toMatchObject({ action: "REJECTED", reason: "BAD_PIN", unitId: unitA.id, code: CODE, voucherId: v!.id });
  });

  it("unidade inativa ou inexistente → 401 BAD_PIN (mesma resposta, sem revelar)", async () => {
    const inactive = await post(CODE, { unit: "fechada", pin: "111111" });
    expect(inactive.status).toBe(401);
    expect(await inactive.json()).toEqual({ error: "BAD_PIN" });
    const missing = await post(CODE, { unit: "nao-existe", pin: "123456" });
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "BAD_PIN" });
    expect((await prisma.voucher.findUnique({ where: { code: CODE } }))?.status).toBe("ACTIVE");

    const audits = await prisma.voucherAudit.findMany({ orderBy: { createdAt: "asc" } });
    expect(audits).toHaveLength(2);
    expect(audits[0].unitId).not.toBeNull();
    expect(audits[1]).toMatchObject({ action: "REJECTED", reason: "BAD_PIN", unitId: null, code: CODE });
  });

  it("body inválido → 400 (JSON quebrado, PIN fora do formato, operador longo)", async () => {
    expect((await post(CODE, "{nope")).status).toBe(400);
    expect((await post(CODE, { unit: "centro", pin: "12" })).status).toBe(400);
    expect((await post(CODE, { unit: "centro", pin: "123456", operator: "x".repeat(61) })).status).toBe(400);
    expect((await post(CODE, { unit: "Centro!", pin: "123456" })).status).toBe(400);
    expect((await prisma.voucher.findUnique({ where: { code: CODE } }))?.status).toBe("ACTIVE");
  });

  it("5 PINs errados → 6ª com PIN certo recebe 429 LOCKED (audit REJECTED/LOCKED); unidade B continua funcionando", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await post(CODE, { unit: "centro", pin: "000000" })).status).toBe(401);
    }
    const locked = await post(CODE, { unit: "centro", pin: "123456" });
    expect(locked.status).toBe(429);
    const body = await locked.json();
    expect(body.error).toBe("LOCKED");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
    expect((await prisma.voucher.findUnique({ where: { code: CODE } }))?.status).toBe("ACTIVE");

    const lockAudit = await prisma.voucherAudit.findFirst({ where: { reason: "LOCKED" } });
    expect(lockAudit).toMatchObject({ action: "REJECTED", unitId: unitA.id, code: CODE });

    // Outro IP na mesma unidade não está bloqueado.
    const otherIp = await post(CODE, { unit: "centro", pin: "000000" }, "5.6.7.8");
    expect(otherIp.status).toBe(401);

    const okB = await post(CODE, { unit: "shopping", pin: "654321", operator: "Ana" });
    expect(okB.status).toBe(200);
    expect(await okB.json()).toMatchObject({ ok: true, unit: { slug: "shopping" } });
    expect(await prisma.voucherAudit.findFirst({ where: { action: "BURNED" } })).toMatchObject({ unitId: unitB.id, code: CODE });
    expect((await prisma.voucher.findUnique({ where: { code: CODE } }))?.usedUnitId).toBe(unitB.id);
  });

  it("queima ok → 200 e o GET passa a mostrar USED; POST de novo → 409 ALREADY_USED", async () => {
    const before = Date.now();
    const res = await post(CODE, { unit: "centro", pin: "123456", operator: "Carlos" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, code: CODE, discountPercent: 10, unit: { slug: "centro", name: "Barbearia VIP - Centro" }, customerFirstName: "João" });
    expect(new Date(body.usedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);

    const v = await prisma.voucher.findUnique({ where: { code: CODE } });
    expect(v).toMatchObject({ status: "USED", usedUnitId: unitA.id, usedBy: "Carlos" });
    expect(await prisma.voucherAudit.findFirst({ where: { action: "BURNED" } })).toMatchObject({ unitId: unitA.id, voucherId: v!.id });

    const lookup = await (await get(CODE)).json();
    expect(lookup).toMatchObject({ state: "USED", usedUnit: { slug: "centro", name: "Barbearia VIP - Centro" } });
    expect(lookup.usedAt).toBe(body.usedAt);

    const again = await post(CODE, { unit: "shopping", pin: "654321" });
    expect(again.status).toBe(409);
    const conflict = await again.json();
    expect(conflict).toMatchObject({ ok: false, reason: "ALREADY_USED", usedUnit: { slug: "centro", name: "Barbearia VIP - Centro" } });
    expect(conflict.usedAt).toBe(body.usedAt);
    expect((await prisma.voucher.findUnique({ where: { code: CODE } }))?.usedUnitId).toBe(unitA.id);
  });

  it("expirado → 409 EXPIRED; cancelado → 409 CANCELLED", async () => {
    const l1 = await prisma.lead.create({ data: { name: "Maria", phone: "+5548999992222" } });
    await prisma.voucher.create({ data: { code: "VIP-EXPIRD", leadId: l1.id, expiresAt: new Date(Date.now() - 1000) } });
    const l2 = await prisma.lead.create({ data: { name: "Pedro", phone: "+5548999993333" } });
    await prisma.voucher.create({ data: { code: "VIP-CANCEL", leadId: l2.id, expiresAt: computeExpiresAt(new Date()), status: "CANCELLED" } });

    const exp = await post("VIP-EXPIRD", { unit: "centro", pin: "123456" });
    expect(exp.status).toBe(409);
    expect(await exp.json()).toMatchObject({ ok: false, reason: "EXPIRED" });
    const can = await post("VIP-CANCEL", { unit: "centro", pin: "123456" });
    expect(can.status).toBe(409);
    expect(await can.json()).toMatchObject({ ok: false, reason: "CANCELLED" });
  });

  it("código inexistente com PIN válido → 404 NOT_FOUND com audit REJECTED e code", async () => {
    const res = await post("VIP-NAOTEM", { unit: "centro", pin: "123456" });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ ok: false, reason: "NOT_FOUND" });
    const audit = await prisma.voucherAudit.findFirst();
    expect(audit).toMatchObject({ action: "REJECTED", reason: "NOT_FOUND", code: "VIP-NAOTEM", voucherId: null, unitId: unitA.id });
  });
});
