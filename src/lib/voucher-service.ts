/**
 * Consulta e queima de vouchers (Tarefa 9).
 *
 * - `lookupVoucher`: só leitura; registra VoucherAudit VALIDATED (sem unidade).
 * - `burnVoucher`: transição atômica ACTIVE → USED via `updateMany` condicional,
 *   para que duas unidades não consigam queimar o mesmo voucher ao mesmo tempo.
 * - Bloqueio de PIN em memória (5 falhas em 15 min por unidade + IP).
 */
import { prisma } from "@/lib/db";
import { normalizeVoucherCode } from "@/lib/voucher-code";
import { getVoucherState, type VoucherState } from "@/lib/voucher";

export type UnitRef = { slug: string; name: string };

export interface VoucherLookup {
  code: string;
  state: VoucherState;
  discountPercent: number;
  issuedAt: Date;
  expiresAt: Date;
  customerFirstName: string;
  usedAt: Date | null;
  usedUnit: UnitRef | null;
}

export type BurnFailureReason = "NOT_FOUND" | "EXPIRED" | "ALREADY_USED" | "CANCELLED";

export type BurnResult =
  | { ok: true; code: string; discountPercent: number; usedAt: Date; unit: UnitRef; customerFirstName: string }
  | { ok: false; reason: BurnFailureReason; usedAt?: Date | null; usedUnit?: UnitRef | null };

/** Primeira palavra do nome, ignorando espaços extras. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

const voucherInclude = {
  lead: { select: { name: true } },
  usedUnit: { select: { slug: true, name: true } },
} as const;

// ---------------------------------------------------------------- lookup

export async function lookupVoucher(
  codeInput: string,
  opts: { ipHash?: string | null; audit?: boolean } = {},
): Promise<VoucherLookup | null> {
  const code = normalizeVoucherCode(codeInput);
  if (!code) return null;

  const v = await prisma.voucher.findUnique({ where: { code }, include: voucherInclude });
  if (!v) return null;

  if (opts.audit !== false) {
    await prisma.voucherAudit.create({
      data: { voucherId: v.id, code: v.code, action: "VALIDATED", ipHash: opts.ipHash ?? null },
    });
  }

  return {
    code: v.code,
    state: getVoucherState(v),
    discountPercent: v.discountPercent,
    issuedAt: v.issuedAt,
    expiresAt: v.expiresAt,
    customerFirstName: firstName(v.lead.name),
    usedAt: v.usedAt,
    usedUnit: v.usedUnit,
  };
}

// ---------------------------------------------------------------- burn

export async function burnVoucher(
  codeInput: string,
  unit: { id: string; slug: string; name: string },
  operator?: string | null,
  ipHash?: string | null,
  now: Date = new Date(),
): Promise<BurnResult> {
  const code = normalizeVoucherCode(codeInput);
  const usedBy = operator?.trim() || null;

  // Transição atômica: só uma das chamadas concorrentes vê count === 1.
  const { count } = await prisma.voucher.updateMany({
    where: { code, status: "ACTIVE", expiresAt: { gt: now } },
    data: { status: "USED", usedAt: now, usedUnitId: unit.id, usedBy },
  });

  if (count === 1) {
    const v = await prisma.voucher.findUniqueOrThrow({ where: { code }, include: { lead: { select: { name: true } } } });
    await prisma.voucherAudit.create({
      data: { voucherId: v.id, code, unitId: unit.id, action: "BURNED", ipHash: ipHash ?? null },
    });
    return {
      ok: true,
      code,
      discountPercent: v.discountPercent,
      usedAt: v.usedAt ?? now,
      unit: { slug: unit.slug, name: unit.name },
      customerFirstName: firstName(v.lead.name),
    };
  }

  // count === 0: reler para descobrir o motivo.
  const v = await prisma.voucher.findUnique({ where: { code }, include: voucherInclude });

  let result: BurnResult;
  if (!v) {
    result = { ok: false, reason: "NOT_FOUND" };
  } else {
    const state = getVoucherState(v, now);
    // Se ainda parece ACTIVE aqui, outra queima venceu a corrida entre o update e a releitura.
    const reason: BurnFailureReason =
      state === "EXPIRED" ? "EXPIRED" : state === "CANCELLED" ? "CANCELLED" : "ALREADY_USED";
    result = { ok: false, reason, usedAt: v.usedAt, usedUnit: v.usedUnit };
  }

  await prisma.voucherAudit.create({
    data: { voucherId: v?.id ?? null, code, unitId: unit.id, action: "REJECTED", reason: result.reason, ipHash: ipHash ?? null },
  });
  return result;
}

// ---------------------------------------------------------------- auditoria de tentativas rejeitadas antes da queima

/**
 * Registra uma tentativa de queima rejeitada ANTES de chegar ao `burnVoucher`
 * (PIN errado, unidade bloqueada). Resolve `unitId` e `voucherId` quando existirem,
 * sem falhar se a unidade ou o voucher não existirem.
 */
export async function recordRejectedAttempt(input: {
  codeInput: string;
  unitSlug: string;
  reason: "BAD_PIN" | "LOCKED";
  ipHash?: string | null;
}): Promise<void> {
  const code = normalizeVoucherCode(input.codeInput) || null;
  const [unit, voucher] = await Promise.all([
    prisma.unit.findUnique({ where: { slug: input.unitSlug }, select: { id: true } }),
    code ? prisma.voucher.findUnique({ where: { code }, select: { id: true } }) : Promise.resolve(null),
  ]);
  await prisma.voucherAudit.create({
    data: {
      voucherId: voucher?.id ?? null,
      code,
      unitId: unit?.id ?? null,
      action: "REJECTED",
      reason: input.reason,
      ipHash: input.ipHash ?? null,
    },
  });
}

// ---------------------------------------------------------------- bloqueio de PIN (em memória)

export const PIN_LOCK_MAX_FAILURES = 5;
export const PIN_LOCK_WINDOW_MS = 15 * 60_000;

/** Timestamps (ms) das falhas por `unidade:ipHash`, dentro da janela. */
const pinFailures = new Map<string, number[]>();

function lockKey(unitSlug: string, ipHash: string | null | undefined): string {
  return `${unitSlug}:${ipHash ?? "unknown"}`;
}

function recentFailures(key: string, now: number): number[] {
  const hits = (pinFailures.get(key) ?? []).filter((t) => now - t < PIN_LOCK_WINDOW_MS);
  if (hits.length === 0) pinFailures.delete(key);
  else pinFailures.set(key, hits);
  return hits;
}

export interface PinLockStatus {
  locked: boolean;
  failures: number;
  /** Segundos até a falha mais antiga sair da janela e o bloqueio cair (0 se não bloqueado). */
  retryAfterSeconds: number;
}

function status(hits: number[], now: number): PinLockStatus {
  const locked = hits.length >= PIN_LOCK_MAX_FAILURES;
  // Quando bloqueado, a janela abre de novo quando a falha que completa o limite expira.
  const anchor = locked ? hits[hits.length - PIN_LOCK_MAX_FAILURES] : 0;
  const retryAfterSeconds = locked ? Math.max(1, Math.ceil((anchor + PIN_LOCK_WINDOW_MS - now) / 1000)) : 0;
  return { locked, failures: hits.length, retryAfterSeconds };
}

/** Só consulta; não consome tentativa. */
export function isPinLocked(unitSlug: string, ipHash: string | null | undefined, now: number = Date.now()): PinLockStatus {
  return status(recentFailures(lockKey(unitSlug, ipHash), now), now);
}

/** Conta uma falha de PIN; devolve o estado já com ela contabilizada. */
export function recordPinFailure(unitSlug: string, ipHash: string | null | undefined, now: number = Date.now()): PinLockStatus {
  const key = lockKey(unitSlug, ipHash);
  const hits = recentFailures(key, now);
  hits.push(now);
  pinFailures.set(key, hits);
  if (pinFailures.size > 50_000) pinFailures.clear(); // proteção contra crescimento sem limite
  return status(hits, now);
}

/** PIN correto zera as falhas daquela unidade + IP. */
export function clearPinFailures(unitSlug: string, ipHash: string | null | undefined): void {
  pinFailures.delete(lockKey(unitSlug, ipHash));
}

export function resetPinLocks(): void {
  pinFailures.clear();
}
