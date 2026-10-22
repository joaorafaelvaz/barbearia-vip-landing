/**
 * Contrato do cliente da API da Barbearia VIP (seções 5 e 5.1 do plano).
 *
 * Duas implementações: `MockBarbeariaVipClient` (desenvolvimento/testes, sem rede) e
 * `HttpBarbeariaVipClient` (API real em https://franquiabv.com.br). A escolha é feita
 * por `BARBEARIA_VIP_CLIENT` em `getBarbeariaVipClient()`.
 *
 * Este módulo não importa Prisma nem `next/*`: é seguro em qualquer runtime.
 */

/** Corpo exato aceito por `POST /api/clientes/novo`. */
export interface PreCadastroInput {
  nome: string;
  email: string;
  /** Só aceitamos celular brasileiro. */
  ddi: "55";
  /** Dígitos nacionais, sem o 55 e sem máscara, ex. "48999999999". */
  telefone: string;
  /** Formato dd-mm-aaaa, ex. "10-01-1990". */
  data_nascimento: string;
  /** `Unit.externalId` da unidade escolhida. */
  unidade_id: number;
}

export type PreCadastroResult =
  | { ok: true; externalId: number }
  | {
      ok: false;
      kind: "DUPLICATE" | "VALIDATION" | "UNAVAILABLE";
      mensagem?: string;
      httpStatus?: number;
    };

export interface ClienteResumo {
  id: number;
  nome: string;
}

export type BuscarClienteResult =
  | { ok: true; clientes: ClienteResumo[] }
  | { ok: false; kind: "UNAVAILABLE"; httpStatus?: number };

export type ConsumoResult =
  | { ok: true; historico: unknown[]; pontuacoes: unknown[] }
  | { ok: false; kind: "NOT_FOUND" | "UNAVAILABLE"; httpStatus?: number };

export interface BarbeariaVipClient {
  criarCliente(input: PreCadastroInput): Promise<PreCadastroResult>;
  /** `telefone` sem o 55. Nunca envia `versao`. */
  buscarClientePorTelefone(telefone: string, unidadeId?: number): Promise<BuscarClienteResult>;
  consumoCliente(id: number): Promise<ConsumoResult>;
}

export type BarbeariaVipClientKind = "mock" | "http";

let singleton: { kind: BarbeariaVipClientKind; client: BarbeariaVipClient } | null = null;

function resolveKind(): BarbeariaVipClientKind {
  const raw = (process.env.BARBEARIA_VIP_CLIENT ?? "mock").trim().toLowerCase();
  if (raw === "http") return "http";
  if (raw !== "mock" && raw !== "") {
    console.warn(`[barbearia-vip] BARBEARIA_VIP_CLIENT="${raw}" desconhecido; usando "mock"`);
  }
  return "mock";
}

/**
 * Lê `BARBEARIA_VIP_CLIENT` ("mock" | "http"; padrão mock). Singleton por processo.
 * Se a variável mudar em tempo de execução (só acontece em testes), a instância é recriada.
 */
export function getBarbeariaVipClient(): BarbeariaVipClient {
  const kind = resolveKind();
  if (singleton && singleton.kind === kind) return singleton.client;

  const client: BarbeariaVipClient =
    kind === "http" ? new HttpBarbeariaVipClient() : new MockBarbeariaVipClient();
  singleton = { kind, client };
  return client;
}

/** Descarta o singleton (uso em testes que precisam de um mock limpo). */
export function resetBarbeariaVipClient(): void {
  singleton = null;
}

// Imports no fim para evitar ciclo em tempo de carga: os módulos abaixo importam
// apenas tipos deste arquivo (`import type`), então a ordem é segura.
import { HttpBarbeariaVipClient } from "./http-client";
import { MockBarbeariaVipClient } from "./mock-client";
