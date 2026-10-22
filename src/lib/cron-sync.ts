/**
 * Reprocessamento periódico (Tarefa 11):
 *  A) leads com elegibilidade UNKNOWN: re-verifica; se elegível e o cadastro estava completo, emite o voucher
 *  B) leads com voucher e sync PENDING/FAILED: repete o cadastro na API
 */
import { prisma } from "@/lib/db";
import { getBarbeariaVipClient, type BarbeariaVipClient } from "@/lib/barbearia-vip/client";
import { checkEligibility } from "@/lib/eligibility";
import { splitForApi } from "@/lib/phone";
import { issueVoucher, syncLeadWithApi } from "@/lib/pre-cadastro";

export const MAX_ELIGIBILITY_ATTEMPTS = 12; // 3 h a cada 15 min
export const MAX_SYNC_ATTEMPTS = 5;
const BATCH = 50;

export interface CronSummary {
  eligibility: { checked: number; eligible: number; denied: number; stillUnknown: number; vouchersIssued: number };
  sync: { attempted: number; synced: number; duplicate: number; failed: number };
}

export async function runCronSync(client: BarbeariaVipClient = getBarbeariaVipClient()): Promise<CronSummary> {
  const summary: CronSummary = {
    eligibility: { checked: 0, eligible: 0, denied: 0, stillUnknown: 0, vouchersIssued: 0 },
    sync: { attempted: 0, synced: 0, duplicate: 0, failed: 0 },
  };

  // A) elegibilidade pendente
  const unknown = await prisma.lead.findMany({
    where: { eligibility: "UNKNOWN", eligibilityAttempts: { lt: MAX_ELIGIBILITY_ATTEMPTS }, voucher: null },
    include: { preferredUnit: { select: { externalId: true } } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  for (const lead of unknown) {
    summary.eligibility.checked++;
    const r = await checkEligibility(client, splitForApi(lead.phone).telefone, lead.preferredUnit?.externalId);
    const data = { eligibility: r.status, eligibilityCheckedAt: new Date(), eligibilityDetail: r.detail.slice(0, 2000), eligibilityAttempts: { increment: 1 } };
    if (r.status === "UNKNOWN") { summary.eligibility.stillUnknown++; await prisma.lead.update({ where: { id: lead.id }, data }); continue; }
    if (r.status === "DENIED_HAS_SALES") { summary.eligibility.denied++; await prisma.lead.update({ where: { id: lead.id }, data }); continue; }
    summary.eligibility.eligible++;
    const complete = Boolean(lead.consentAt && lead.email && lead.birthDate);
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({ where: { id: lead.id }, data });
      if (complete) await issueVoucher(tx, lead.id);
    });
    if (complete) { summary.eligibility.vouchersIssued++; await syncLeadWithApi(lead.id, client); }
  }

  // B) cadastro pendente na API (só leads que já têm voucher)
  const pending = await prisma.lead.findMany({
    where: { syncStatus: { in: ["PENDING", "FAILED"] }, syncAttempts: { lt: MAX_SYNC_ATTEMPTS }, voucher: { isNot: null } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: BATCH,
  });
  for (const { id } of pending) {
    summary.sync.attempted++;
    await syncLeadWithApi(id, client);
    const after = await prisma.lead.findUnique({ where: { id }, select: { syncStatus: true } });
    if (after?.syncStatus === "SYNCED") summary.sync.synced++;
    else if (after?.syncStatus === "DUPLICATE") summary.sync.duplicate++;
    else summary.sync.failed++;
  }
  return summary;
}
