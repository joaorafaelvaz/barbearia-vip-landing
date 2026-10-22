/**
 * Recuperação do voucher por WhatsApp + data de nascimento (/meu-voucher).
 * Resposta idêntica para "não encontrado" e "nascimento errado", para não revelar quem está cadastrado.
 */
import { prisma } from "@/lib/db";
import { normalizeBrMobile } from "@/lib/phone";
import { parseBirthDate } from "@/lib/date";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";

export type RecoveryResult =
  | { status: "found"; code: string }
  | { status: "pending" } // elegibilidade ainda UNKNOWN (cron vai re-verificar)
  | { status: "denied" }
  | { status: "not_found" }
  | { status: "invalid"; fieldErrors: Record<string, string> }
  | { status: "rate_limited" };

export async function recoverVoucher(input: { phone: string; birthDate: string }, ipHash: string | null): Promise<RecoveryResult> {
  const fieldErrors: Record<string, string> = {};
  const phone = normalizeBrMobile(input.phone ?? "");
  const birth = parseBirthDate(input.birthDate ?? "");
  if (!phone) fieldErrors.phone = "Informe um celular válido com DDD";
  if (!birth) fieldErrors.birthDate = "Informe uma data de nascimento válida";
  if (!phone || !birth) return { status: "invalid", fieldErrors };

  if (ipHash && !rateLimit(`recover:ip:${ipHash}`, RATE_LIMITS.recoverIp).ok) return { status: "rate_limited" };

  const lead = await prisma.lead.findUnique({ where: { phone }, include: { voucher: { select: { code: true } } } });
  if (!lead || !lead.birthDate || lead.birthDate.getTime() !== birth.getTime()) return { status: "not_found" };
  if (lead.voucher) return { status: "found", code: lead.voucher.code };
  if (lead.eligibility === "DENIED_HAS_SALES") return { status: "denied" };
  if (lead.eligibility === "UNKNOWN") return { status: "pending" };
  return { status: "not_found" }; // cadastro parcial sem voucher
}
