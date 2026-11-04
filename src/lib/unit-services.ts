/** Serviços de uma unidade, vindos da API da Barbearia VIP, com cache em memória de 10 min. */
import { prisma } from "@/lib/db";
import { getBarbeariaVipClient, type BarbeariaVipClient, type ServicoResumo } from "@/lib/barbearia-vip/client";

const TTL_MS = 10 * 60_000;
const cache = new Map<number, { at: number; servicos: ServicoResumo[] }>();

export type UnitServicesResult =
  | { ok: true; servicos: ServicoResumo[]; cached: boolean }
  | { ok: false; reason: "UNIT_NOT_FOUND" | "UNAVAILABLE" };

export async function getUnitServices(unitSlug: string, client: BarbeariaVipClient = getBarbeariaVipClient(), now = Date.now()): Promise<UnitServicesResult> {
  const unit = await prisma.unit.findUnique({ where: { slug: unitSlug }, select: { externalId: true } });
  if (!unit) return { ok: false, reason: "UNIT_NOT_FOUND" };
  const hit = cache.get(unit.externalId);
  if (hit && now - hit.at < TTL_MS) return { ok: true, servicos: hit.servicos, cached: true };
  const r = await client.listarServicos(unit.externalId);
  if (!r.ok) return hit ? { ok: true, servicos: hit.servicos, cached: true } : { ok: false, reason: "UNAVAILABLE" };
  const servicos = [...r.servicos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  cache.set(unit.externalId, { at: now, servicos });
  return { ok: true, servicos, cached: false };
}

export function resetUnitServicesCache(): void {
  cache.clear();
}
