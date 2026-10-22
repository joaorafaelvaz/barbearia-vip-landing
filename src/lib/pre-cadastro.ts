/**
 * Núcleo do pré-cadastro (sem dependência de request/cookies, para ser testável):
 * - etapa 1: verificação de elegibilidade por telefone
 * - etapa 2: cadastro completo, emissão do voucher e sincronização com a API
 * Regras: seção 2, 5.1 e Tarefas 5b/6 do plano.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { getBarbeariaVipClient, type BarbeariaVipClient } from "@/lib/barbearia-vip/client";
import { checkEligibility, type EligibilityResult } from "@/lib/eligibility";
import { normalizeBrMobile, splitForApi } from "@/lib/phone";
import { formatBirthDateForApi, parseBirthDate } from "@/lib/date";
import { generateVoucherCode } from "@/lib/voucher-code";
import { DISCOUNT_PERCENT, computeExpiresAt, getVoucherState } from "@/lib/voucher";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import type { Utm } from "@/lib/attribution";
import type { EligibilityCheckState, PreCadastroState } from "@/actions/types";

export interface LeadContext {
  ref: string | null;
  utm: Utm;
  ipHash: string | null;
}

export type FieldErrors = Record<string, string>;

const nameSchema = z
  .string()
  .trim()
  .min(2, "Informe seu nome completo")
  .max(80, "Nome muito longo")
  .refine((v) => v.split(/\s+/).length >= 2, "Informe nome e sobrenome");

const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const e164 = normalizeBrMobile(v);
    if (!e164) ctx.addIssue({ code: "custom", message: "Informe um celular válido com DDD" });
    return e164 ?? "";
  });

const unitSlugSchema = z.string().trim().min(1, "Escolha uma unidade").max(64);

export const step1Schema = z.object({ name: nameSchema, phone: phoneSchema, unitSlug: unitSlugSchema });

export const fullSchema = step1Schema.extend({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido").max(120),
  birthDate: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const d = parseBirthDate(v);
      if (!d) ctx.addIssue({ code: "custom", message: "Informe uma data de nascimento válida" });
      return d ?? new Date(0);
    }),
  consent: z.literal(true, { error: "É preciso aceitar a política de privacidade" }),
});

export type Step1Input = z.input<typeof step1Schema>;
export type FullInput = z.input<typeof fullSchema>;

function fieldErrorsFrom(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

async function findActiveUnit(slug: string) {
  return prisma.unit.findFirst({ where: { slug, active: true }, select: { id: true, externalId: true } });
}

async function findInfluencerId(ref: string | null) {
  if (!ref) return null;
  const inf = await prisma.influencer.findFirst({ where: { slug: ref, active: true }, select: { id: true } });
  return inf?.id ?? null;
}

function eligibilityData(r: EligibilityResult) {
  return {
    eligibility: r.status,
    eligibilityCheckedAt: new Date(),
    eligibilityDetail: r.detail.slice(0, 2000),
    eligibilityAttempts: { increment: 1 },
  } satisfies Prisma.LeadUpdateInput;
}

// ---------------------------------------------------------------- etapa 1

export async function runEligibilityStep(
  raw: Step1Input,
  ctx: LeadContext,
  client: BarbeariaVipClient = getBarbeariaVipClient(),
): Promise<EligibilityCheckState> {
  const parsed = step1Schema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { name, phone, unitSlug } = parsed.data;

  const unit = await findActiveUnit(unitSlug);
  if (!unit) return { status: "error", fieldErrors: { unitSlug: "Escolha uma unidade válida" } };

  if (ctx.ipHash && !rateLimit(`elig:ip:${ctx.ipHash}`, RATE_LIMITS.eligibilityIp).ok)
    return { status: "error", fieldErrors: {}, formError: "Muitas tentativas. Aguarde alguns minutos." };
  if (!rateLimit(`elig:phone:${phone}`, RATE_LIMITS.eligibilityPhone).ok)
    return { status: "error", fieldErrors: {}, formError: "Muitas tentativas com este telefone. Aguarde alguns minutos." };

  const result = await checkEligibility(client, splitForApi(phone).telefone, unit.externalId);
  const influencerId = await findInfluencerId(ctx.ref);

  // Lead parcial (funil): nome, telefone, unidade, atribuição e resultado da verificação.
  const base = {
    name, preferredUnitId: unit.id, influencerId,
    utmSource: ctx.utm.utmSource ?? null, utmMedium: ctx.utm.utmMedium ?? null,
    utmCampaign: ctx.utm.utmCampaign ?? null, utmContent: ctx.utm.utmContent ?? null,
    ipHash: ctx.ipHash,
  };
  await prisma.lead.upsert({
    where: { phone },
    create: { phone, ...base, ...eligibilityData(result), eligibilityAttempts: 1 },
    update: { ...base, ...eligibilityData(result) },
  });

  if (result.status === "DENIED_HAS_SALES") return { status: "denied" };
  if (result.status === "UNKNOWN") {
    const lead = await prisma.lead.findUnique({ where: { phone }, select: { eligibilityAttempts: true } });
    return { status: "unknown", attempts: lead?.eligibilityAttempts ?? 1 };
  }
  return { status: "eligible" };
}

// ---------------------------------------------------------------- voucher

/** Cria o voucher do lead dentro de uma transação, tentando até 3 códigos em caso de colisão. */
export async function issueVoucher(tx: Prisma.TransactionClient, leadId: string, now = new Date()) {
  let lastError: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await tx.voucher.create({
        data: { code: generateVoucherCode(), leadId, discountPercent: DISCOUNT_PERCENT, issuedAt: now, expiresAt: computeExpiresAt(now) },
      });
    } catch (e) {
      lastError = e;
      const code = (e as { code?: string }).code;
      if (code !== "P2002") throw e; // só repete em violação de unicidade do código
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------- sync com a API

/** Cria o cliente na API (ELIGIBLE_NEW) ou vincula o id existente (ELIGIBLE_NO_SALES). Não lança. */
export async function syncLeadWithApi(leadId: string, client: BarbeariaVipClient = getBarbeariaVipClient()) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { preferredUnit: { select: { externalId: true } } } });
  if (!lead) return;

  if (lead.eligibility === "ELIGIBLE_NO_SALES") {
    const existingId = existingIdFromDetail(lead.eligibilityDetail);
    await prisma.lead.update({ where: { id: leadId }, data: { externalId: existingId, syncStatus: "SYNCED_EXISTING", syncError: null } });
    return;
  }
  if (!lead.email || !lead.birthDate || !lead.preferredUnit) {
    await prisma.lead.update({ where: { id: leadId }, data: { syncStatus: "FAILED", syncAttempts: 5, syncError: "lead incompleto para cadastro" } });
    return;
  }
  const r = await client.criarCliente({
    nome: lead.name,
    email: lead.email,
    ...splitForApi(lead.phone),
    data_nascimento: formatBirthDateForApi(lead.birthDate),
    unidade_id: lead.preferredUnit.externalId,
  });
  if (r.ok) {
    await prisma.lead.update({ where: { id: leadId }, data: { externalId: r.externalId, syncStatus: "SYNCED", syncError: null, syncAttempts: { increment: 1 } } });
    return;
  }
  const data: Prisma.LeadUpdateInput = { syncAttempts: { increment: 1 }, syncError: `${r.kind}${r.httpStatus ? ` ${r.httpStatus}` : ""}${r.mensagem ? `: ${r.mensagem}` : ""}`.slice(0, 500) };
  if (r.kind === "DUPLICATE") data.syncStatus = "DUPLICATE";
  else if (r.kind === "VALIDATION") { data.syncStatus = "FAILED"; data.syncAttempts = 5; }
  else data.syncStatus = "FAILED";
  await prisma.lead.update({ where: { id: leadId }, data });
}

function existingIdFromDetail(detail: string | null): number | null {
  if (!detail) return null;
  try {
    const d = JSON.parse(detail) as { clientesEncontrados?: number[] };
    const id = d.clientesEncontrados?.[0];
    return typeof id === "number" ? id : null;
  } catch { return null; }
}

// ---------------------------------------------------------------- etapa 2

export type PreCadastroOutcome = { status: "redirect"; code: string } | PreCadastroState;

export async function runPreCadastro(
  raw: FullInput & { honeypot?: string },
  ctx: LeadContext,
  client: BarbeariaVipClient = getBarbeariaVipClient(),
): Promise<PreCadastroOutcome> {
  // Honeypot: bot preencheu o campo oculto. Fingimos sucesso sem gravar nada.
  if (raw.honeypot) return { status: "redirect", code: generateVoucherCode() };

  const parsed = fullSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { name, phone, email, birthDate, unitSlug } = parsed.data;

  const unit = await findActiveUnit(unitSlug);
  if (!unit) return { status: "error", fieldErrors: { unitSlug: "Escolha uma unidade válida" } };

  if (ctx.ipHash && !rateLimit(`submit:ip:${ctx.ipHash}`, RATE_LIMITS.submitIp).ok)
    return { status: "error", fieldErrors: {}, formError: "Muitas tentativas. Aguarde alguns minutos." };

  // Já existe voucher para este telefone?
  const existing = await prisma.lead.findUnique({ where: { phone }, include: { voucher: true } });
  if (existing?.voucher) {
    const state = getVoucherState(existing.voucher);
    if (state === "EXPIRED") return { status: "expired" };
    return { status: "redirect", code: existing.voucher.code }; // ACTIVE, USED ou CANCELLED: mostra a página do voucher
  }
  // E-mail usado por outro telefone?
  const emailOwner = await prisma.lead.findUnique({ where: { email }, select: { phone: true } });
  if (emailOwner && emailOwner.phone !== phone)
    return { status: "error", fieldErrors: { email: "Este e-mail já está cadastrado com outro telefone" } };

  // Decisão final de elegibilidade, sempre no servidor.
  const result = await checkEligibility(client, splitForApi(phone).telefone, unit.externalId);
  const influencerId = await findInfluencerId(ctx.ref);
  const full = {
    name, email, birthDate, preferredUnitId: unit.id, influencerId, consentAt: new Date(),
    utmSource: ctx.utm.utmSource ?? null, utmMedium: ctx.utm.utmMedium ?? null,
    utmCampaign: ctx.utm.utmCampaign ?? null, utmContent: ctx.utm.utmContent ?? null,
    ipHash: ctx.ipHash,
  };

  if (result.status === "DENIED_HAS_SALES" || result.status === "UNKNOWN") {
    await prisma.lead.upsert({
      where: { phone },
      create: { phone, ...full, ...eligibilityData(result), eligibilityAttempts: 1 },
      update: { ...full, ...eligibilityData(result) },
    });
    return result.status === "DENIED_HAS_SALES" ? { status: "denied" } : { status: "unavailable" };
  }

  const voucher = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.upsert({
      where: { phone },
      create: { phone, ...full, ...eligibilityData(result), eligibilityAttempts: 1 },
      update: { ...full, ...eligibilityData(result) },
    });
    return issueVoucher(tx, lead.id);
  });

  await syncLeadWithApi(voucher.leadId, client);
  return { status: "redirect", code: voucher.code };
}
