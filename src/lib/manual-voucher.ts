/**
 * Vouchers criados manualmente no painel admin:
 * desconto percentual ou em reais, válido só na unidade escolhida, com validade e titular opcionais.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { generateVoucherCode } from "@/lib/voucher-code";
import { VOUCHER_VALIDITY_DAYS, computeExpiresAt, parseAmountToCents, type DiscountInfo } from "@/lib/voucher";
import { normalizeBrMobile } from "@/lib/phone";

export const manualVoucherSchema = z
  .object({
    discountType: z.enum(["PERCENT", "AMOUNT", "SERVICE"]),
    /** Percentual, valor em reais ou nome do serviço, conforme o tipo. */
    discountValue: z.string().trim().min(1, "Informe o valor do desconto"),
    unitSlug: z.string().trim().min(1, "Escolha a unidade"),
    expiresAt: z.string().trim().optional(), // "aaaa-mm-dd" (input type=date); vazio = +7 dias
    holderName: z.string().trim().max(80).optional(),
    holderPhone: z.string().trim().optional(),
    note: z.string().trim().max(200).optional(),
    createdBy: z.string().trim().max(60).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.discountType === "PERCENT") {
      const n = Number(v.discountValue.replace("%", "").replace(",", "."));
      if (!Number.isInteger(n) || n < 1 || n > 100) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Percentual deve ser inteiro entre 1 e 100" });
    } else if (v.discountType === "AMOUNT") {
      if (parseAmountToCents(v.discountValue) == null) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Valor inválido (ex.: 20,00)" });
    } else if (v.discountValue.length < 2 || v.discountValue.length > 60) {
      ctx.addIssue({ code: "custom", path: ["discountValue"], message: "Informe o nome do serviço (2 a 60 caracteres)" });
    }
    if (v.holderPhone && !normalizeBrMobile(v.holderPhone)) ctx.addIssue({ code: "custom", path: ["holderPhone"], message: "Celular inválido" });
    if (v.expiresAt) {
      const d = parseExpiresAt(v.expiresAt);
      if (!d) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "Data inválida" });
      else if (d.getTime() <= Date.now()) ctx.addIssue({ code: "custom", path: ["expiresAt"], message: "A validade precisa ser no futuro" });
    }
  });

export type ManualVoucherInput = z.input<typeof manualVoucherSchema>;

/** "aaaa-mm-dd" → fim daquele dia em Brasília (23:59:59, UTC-3). */
export function parseExpiresAt(input: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T23:59:59-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type CreateManualVoucherResult =
  | { ok: true; code: string; expiresAt: Date; unit: { slug: string; name: string }; discount: DiscountInfo }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

export async function createManualVoucher(raw: ManualVoucherInput, now = new Date()): Promise<CreateManualVoucherResult> {
  const parsed = manualVoucherSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) {
      const k = String(i.path[0] ?? "form");
      if (!fieldErrors[k]) fieldErrors[k] = i.message;
    }
    return { ok: false, fieldErrors };
  }
  const v = parsed.data;
  const unit = await prisma.unit.findFirst({ where: { slug: v.unitSlug, active: true }, select: { id: true, slug: true, name: true } });
  if (!unit) return { ok: false, fieldErrors: { unitSlug: "Unidade inexistente ou inativa" } };

  const discount: DiscountInfo =
    v.discountType === "PERCENT"
      ? { discountType: "PERCENT", discountPercent: Number(v.discountValue.replace("%", "")), discountAmountCents: null, serviceName: null }
      : v.discountType === "AMOUNT"
        ? { discountType: "AMOUNT", discountPercent: 0, discountAmountCents: parseAmountToCents(v.discountValue)!, serviceName: null }
        : { discountType: "SERVICE", discountPercent: 0, discountAmountCents: null, serviceName: v.discountValue };
  const expiresAt = v.expiresAt ? parseExpiresAt(v.expiresAt)! : computeExpiresAt(now);

  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const created = await prisma.voucher.create({
        data: {
          code: generateVoucherCode(),
          kind: "MANUAL",
          ...discount,
          restrictedUnitId: unit.id,
          holderName: v.holderName || null,
          holderPhone: v.holderPhone ? normalizeBrMobile(v.holderPhone) : null,
          note: v.note || null,
          createdBy: v.createdBy || "admin",
          issuedAt: now,
          expiresAt,
        },
      });
      await prisma.voucherAudit.create({ data: { voucherId: created.id, code: created.code, unitId: unit.id, action: "VALIDATED", reason: "CREATED_BY_ADMIN" } });
      return { ok: true, code: created.code, expiresAt, unit: { slug: unit.slug, name: unit.name }, discount };
    } catch (e) {
      lastError = e;
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  throw lastError;
}

export interface ManualVoucherRow {
  code: string;
  discount: DiscountInfo;
  unit: { slug: string; name: string } | null;
  holderName: string | null;
  note: string | null;
  createdBy: string | null;
  issuedAt: Date;
  expiresAt: Date;
  status: "ACTIVE" | "USED" | "CANCELLED";
  usedAt: Date | null;
}

export async function listManualVouchers(limit = 30): Promise<ManualVoucherRow[]> {
  const rows = await prisma.voucher.findMany({
    where: { kind: "MANUAL" },
    orderBy: { issuedAt: "desc" },
    take: limit,
    select: {
      code: true, discountType: true, discountPercent: true, discountAmountCents: true, serviceName: true,
      restrictedUnit: { select: { slug: true, name: true } },
      holderName: true, note: true, createdBy: true, issuedAt: true, expiresAt: true, status: true, usedAt: true,
    },
  });
  return rows.map((r) => ({
    code: r.code,
    discount: { discountType: r.discountType, discountPercent: r.discountPercent, discountAmountCents: r.discountAmountCents, serviceName: r.serviceName },
    unit: r.restrictedUnit,
    holderName: r.holderName, note: r.note, createdBy: r.createdBy,
    issuedAt: r.issuedAt, expiresAt: r.expiresAt, status: r.status, usedAt: r.usedAt,
  }));
}

export { VOUCHER_VALIDITY_DAYS };
