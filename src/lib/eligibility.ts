/**
 * Regra de elegibilidade "nunca consumiu" (seção 5.1 do plano). Pura: recebe o client
 * injetado, não toca em banco nem em `next/*`.
 *
 * Decisão (fail-closed):
 * 1. `getCliente` vazio → ELIGIBLE_NEW (uma única chamada).
 * 2. Encontrou clientes → `consumoCliente` de cada id em paralelo (até 5 ids).
 *    Qualquer `historico.length > 0` → DENIED_HAS_SALES.
 *    `pontuacoes` NÃO entra na decisão (só vai no detail como contagem).
 * 3. Qualquer UNAVAILABLE em qualquer chamada → UNKNOWN (nunca liberar sem conferir todos).
 *    Exceção: se uma venda já foi confirmada em outro id, negamos mesmo assim.
 * 4. NOT_FOUND em um id → tratado como sem consumo, registrado em `notFound`.
 *
 * `detail` é um JSON curto sem dados pessoais (só ids e contagens).
 */
import type { BarbeariaVipClient, ClienteResumo, ConsumoResult } from "@/lib/barbearia-vip/client";

/** Espelha o enum Prisma `Eligibility` (sem PENDING). */
export type EligibilityStatus = "ELIGIBLE_NEW" | "ELIGIBLE_NO_SALES" | "DENIED_HAS_SALES" | "UNKNOWN";

export interface EligibilityResult {
  status: EligibilityStatus;
  /** id do cliente existente quando ELIGIBLE_NO_SALES (primeiro da lista); senão null. */
  existingId: number | null;
  /**
   * JSON curto: { clientesEncontrados: number[], historicoPorId: Record<number, number>,
   * pontuacoesPorId: Record<number, number>, notFound?: number[], truncado?: true, erro?: string }
   * SEM nome/email/telefone.
   */
  detail: string;
}

/** Limite de ids consultados em paralelo quando a API devolve vários clientes. */
export const MAX_IDS_CHECKED = 5;

interface Detail {
  clientesEncontrados: number[];
  historicoPorId: Record<number, number>;
  pontuacoesPorId: Record<number, number>;
  notFound?: number[];
  truncado?: true;
  erro?: string;
}

function result(status: EligibilityStatus, existingId: number | null, detail: Detail): EligibilityResult {
  return { status, existingId, detail: JSON.stringify(detail) };
}

export async function checkEligibility(
  client: BarbeariaVipClient,
  telefoneNacional: string,
  unidadeExternalId?: number,
): Promise<EligibilityResult> {
  const detail: Detail = { clientesEncontrados: [], historicoPorId: {}, pontuacoesPorId: {} };

  try {
    const busca = await client.buscarClientePorTelefone(telefoneNacional, unidadeExternalId);
    if (!busca.ok) {
      detail.erro = `getCliente UNAVAILABLE${busca.httpStatus ? ` (http ${busca.httpStatus})` : ""}`;
      return result("UNKNOWN", null, detail);
    }

    detail.clientesEncontrados = busca.clientes.map((c) => c.id);
    if (busca.clientes.length === 0) {
      return result("ELIGIBLE_NEW", null, detail);
    }

    const checked: ClienteResumo[] = busca.clientes.slice(0, MAX_IDS_CHECKED);
    if (busca.clientes.length > MAX_IDS_CHECKED) detail.truncado = true;

    const consumos: ConsumoResult[] = await Promise.all(checked.map((c) => client.consumoCliente(c.id)));

    let hasSales = false;
    const unavailable: string[] = [];
    const notFound: number[] = [];

    checked.forEach((c, i) => {
      const r = consumos[i];
      if (r.ok) {
        detail.historicoPorId[c.id] = r.historico.length;
        detail.pontuacoesPorId[c.id] = r.pontuacoes.length;
        if (r.historico.length > 0) hasSales = true;
        return;
      }
      if (r.kind === "NOT_FOUND") {
        notFound.push(c.id);
        return;
      }
      unavailable.push(`${c.id}${r.httpStatus ? ` (http ${r.httpStatus})` : ""}`);
    });

    if (notFound.length > 0) detail.notFound = notFound;

    // Venda confirmada em qualquer id prevalece, mesmo com outro id indisponível.
    if (hasSales) return result("DENIED_HAS_SALES", null, detail);

    if (unavailable.length > 0) {
      detail.erro = `consumoCliente UNAVAILABLE para id ${unavailable.join(", ")}`;
      return result("UNKNOWN", null, detail);
    }

    return result("ELIGIBLE_NO_SALES", checked[0].id, detail);
  } catch (err) {
    // Exceção inesperada do client: não arriscar. Só registramos o nome/classe do erro,
    // nunca a mensagem (poderia carregar dados da requisição).
    const name = err instanceof Error ? err.name : typeof err;
    detail.erro = `excecao ${name}`;
    return result("UNKNOWN", null, detail);
  }
}
