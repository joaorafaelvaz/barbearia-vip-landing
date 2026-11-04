import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../db";
import { hashPin } from "@/lib/unit-auth";
import { createManualVoucher, listManualVouchers, parseExpiresAt } from "@/lib/manual-voucher";
import { burnVoucher, lookupVoucher } from "@/lib/voucher-service";
import { formatDiscount, parseAmountToCents, VOUCHER_VALIDITY_DAYS } from "@/lib/voucher";

let centro: { id: string; slug: string; name: string };
let norte: { id: string; slug: string; name: string };

beforeEach(async () => {
  await resetDb();
  centro = await prisma.unit.create({ data: { slug: "centro", externalId: 1, name: "Centro", pinHash: hashPin("123456") } });
  norte = await prisma.unit.create({ data: { slug: "norte", externalId: 2, name: "Norte", pinHash: hashPin("654321") } });
  await prisma.unit.create({ data: { slug: "fechada", externalId: 3, name: "Fechada", active: false, pinHash: hashPin("000000") } });
});

describe("createManualVoucher", () => {
  it("percentual, sem titular, validade padrão de 7 dias, restrito à unidade", async () => {
    const r = await createManualVoucher({ discountType: "PERCENT", discountValue: "15", unitSlug: "centro" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.code).toMatch(/^VIP-[A-HJ-NP-Z2-9]{6}$/);
    expect(r.unit.slug).toBe("centro");
    const v = await prisma.voucher.findUniqueOrThrow({ where: { code: r.code } });
    expect(v.kind).toBe("MANUAL");
    expect(v.leadId).toBeNull();
    expect(v.discountType).toBe("PERCENT");
    expect(v.discountPercent).toBe(15);
    expect(v.restrictedUnitId).toBe(centro.id);
    expect(v.expiresAt.getTime() - v.issuedAt.getTime()).toBe(VOUCHER_VALIDITY_DAYS * 86_400_000);
    expect(await prisma.voucherAudit.count({ where: { voucherId: v.id, reason: "CREATED_BY_ADMIN" } })).toBe(1);
  });

  it("valor em reais com titular, telefone normalizado e validade escolhida (fim do dia em Brasília)", async () => {
    const r = await createManualVoucher({
      discountType: "AMOUNT", discountValue: "R$ 1.250,50", unitSlug: "norte", expiresAt: "2099-12-31",
      holderName: "Maria Souza", holderPhone: "(48) 99999-1234", note: "cortesia", createdBy: "Rafael",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formatDiscount(r.discount)).toBe("R$ 1.250,50");
    const v = await prisma.voucher.findUniqueOrThrow({ where: { code: r.code } });
    expect(v.discountAmountCents).toBe(125050);
    expect(v.holderPhone).toBe("+5548999991234");
    expect(v.createdBy).toBe("Rafael");
    expect(v.expiresAt.toISOString()).toBe("2100-01-01T02:59:59.000Z");
  });

  it("serviço específico: cortesia nomeada, exibida como 'Cortesia: <serviço>'", async () => {
    const r = await createManualVoucher({ discountType: "SERVICE", discountValue: "Corte de cabelo", unitSlug: "centro", holderName: "Léo Dias" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(formatDiscount(r.discount)).toBe("Corte de cabelo");
    const v = await prisma.voucher.findUniqueOrThrow({ where: { code: r.code } });
    expect(v.discountType).toBe("SERVICE");
    expect(v.serviceName).toBe("Corte de cabelo");
    expect(v.discountAmountCents).toBeNull();
    const look = await lookupVoucher(r.code, { audit: false });
    expect(look?.discountLabel).toBe("Cortesia: Corte de cabelo");
    const burn = await burnVoucher(r.code, centro);
    expect(burn).toMatchObject({ ok: true, discountLabel: "Cortesia: Corte de cabelo", customerFirstName: "Léo" });
    expect((await listManualVouchers())[0].discount.serviceName).toBe("Corte de cabelo");
  });

  it("valida percentual, valor, unidade inativa, telefone e data no passado", async () => {
    const bad = async (input: Parameters<typeof createManualVoucher>[0]) => {
      const r = await createManualVoucher(input);
      return r.ok ? {} : r.fieldErrors;
    };
    expect(await bad({ discountType: "PERCENT", discountValue: "150", unitSlug: "centro" })).toHaveProperty("discountValue");
    expect(await bad({ discountType: "PERCENT", discountValue: "12,5", unitSlug: "centro" })).toHaveProperty("discountValue");
    expect(await bad({ discountType: "AMOUNT", discountValue: "abc", unitSlug: "centro" })).toHaveProperty("discountValue");
    expect(await bad({ discountType: "SERVICE", discountValue: "x", unitSlug: "centro" })).toHaveProperty("discountValue");
    expect(await bad({ discountType: "PERCENT", discountValue: "10", unitSlug: "fechada" })).toHaveProperty("unitSlug");
    expect(await bad({ discountType: "PERCENT", discountValue: "10", unitSlug: "centro", holderPhone: "123" })).toHaveProperty("holderPhone");
    expect(await bad({ discountType: "PERCENT", discountValue: "10", unitSlug: "centro", expiresAt: "2020-01-01" })).toHaveProperty("expiresAt");
    expect(await prisma.voucher.count()).toBe(0);
  });
});

describe("voucher manual no balcão", () => {
  it("lookup mostra rótulo do desconto, titular e unidade restrita; queima só na unidade certa", async () => {
    const r = await createManualVoucher({ discountType: "AMOUNT", discountValue: "20", unitSlug: "centro", holderName: "Ana Lima" });
    if (!r.ok) throw new Error("falhou");
    const look = await lookupVoucher(r.code, { audit: false });
    expect(look).toMatchObject({ kind: "MANUAL", state: "ACTIVE", discountLabel: "R$ 20,00 de desconto", customerFirstName: "Ana", restrictedUnit: { slug: "centro" } });

    const wrong = await burnVoucher(r.code, norte);
    expect(wrong).toEqual({ ok: false, reason: "WRONG_UNIT", restrictedUnit: { slug: "centro", name: "Centro" } });
    expect((await prisma.voucher.findUniqueOrThrow({ where: { code: r.code } })).status).toBe("ACTIVE");
    expect(await prisma.voucherAudit.count({ where: { code: r.code, action: "REJECTED", reason: "WRONG_UNIT", unitId: norte.id } })).toBe(1);

    const right = await burnVoucher(r.code, centro, "Carlos");
    expect(right).toMatchObject({ ok: true, discountLabel: "R$ 20,00 de desconto", customerFirstName: "Ana", unit: { slug: "centro" } });
    const after = await prisma.voucher.findUniqueOrThrow({ where: { code: r.code } });
    expect(after.status).toBe("USED");
    expect(after.usedUnitId).toBe(centro.id);
    expect(after.usedBy).toBe("Carlos");
  });

  it("voucher da campanha (sem restrição) continua valendo em qualquer unidade", async () => {
    const lead = await prisma.lead.create({ data: { name: "Beto Reis", phone: "+5548999990001" } });
    await prisma.voucher.create({ data: { code: "VIP-ABCDEF", leadId: lead.id, expiresAt: new Date(Date.now() + 1e6) } });
    const look = await lookupVoucher("VIP-ABCDEF", { audit: false });
    expect(look).toMatchObject({ kind: "CAMPAIGN", discountLabel: "10% de desconto", restrictedUnit: null, customerFirstName: "Beto" });
    expect((await burnVoucher("VIP-ABCDEF", norte)).ok).toBe(true);
  });

  it("listManualVouchers lista só os manuais, mais recentes primeiro", async () => {
    const lead = await prisma.lead.create({ data: { name: "Beto Reis", phone: "+5548999990001" } });
    await prisma.voucher.create({ data: { code: "VIP-ABCDEF", leadId: lead.id, expiresAt: new Date(Date.now() + 1e6) } });
    const a = await createManualVoucher({ discountType: "PERCENT", discountValue: "10", unitSlug: "centro" }, new Date("2026-01-01T12:00:00Z"));
    const b = await createManualVoucher({ discountType: "PERCENT", discountValue: "20", unitSlug: "norte" }, new Date("2026-01-02T12:00:00Z"));
    if (!a.ok || !b.ok) throw new Error("falhou");
    const rows = await listManualVouchers();
    expect(rows.map((r) => r.code)).toEqual([b.code, a.code]);
    expect(rows[0].unit?.slug).toBe("norte");
  });
});

describe("helpers de desconto", () => {
  it("parseAmountToCents aceita formatos brasileiros", () => {
    expect(parseAmountToCents("20")).toBe(2000);
    expect(parseAmountToCents("20,5")).toBe(2050);
    expect(parseAmountToCents("R$ 1.250,50")).toBe(125050);
    expect(parseAmountToCents("0")).toBeNull();
    expect(parseAmountToCents("20,555")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
  });
  it("formatDiscount", () => {
    expect(formatDiscount({ discountType: "PERCENT", discountPercent: 10, discountAmountCents: null })).toBe("10%");
    expect(formatDiscount({ discountType: "AMOUNT", discountPercent: 0, discountAmountCents: 2000 })).toBe("R$ 20,00");
  });
  it("parseExpiresAt", () => {
    expect(parseExpiresAt("2026-03-10")?.toISOString()).toBe("2026-03-11T02:59:59.000Z");
    expect(parseExpiresAt("10/03/2026")).toBeNull();
  });
});
