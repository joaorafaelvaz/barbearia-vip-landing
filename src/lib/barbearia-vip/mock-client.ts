/**
 * Cliente SIMULADO da API da Barbearia VIP. Usado quando `BARBEARIA_VIP_CLIENT=mock`
 * (padrão em dev e testes). Não faz rede.
 *
 * Cenários controlados pelo SUFIXO do telefone nacional (4 últimos dígitos) e pelo email:
 *
 * | Entrada                         | criarCliente                                  |
 * |---------------------------------|-----------------------------------------------|
 * | email termina em `@dup.test`    | `DUPLICATE` ("E-mail já cadastrado")          |
 * | telefone termina em `0000`      | `UNAVAILABLE` (API fora do ar)                |
 * | qualquer outro                  | `ok`, `externalId` incremental a partir de 1000 |
 *
 * | Sufixo do telefone | buscarClientePorTelefone                                  | consumoCliente        |
 * |--------------------|-----------------------------------------------------------|-----------------------|
 * | `1111`             | `[{ id: 901, nome: "Cliente Sem Consumo" }]`              | 901 → sem histórico   |
 * | `2222`             | `[{ id: 902, nome: "Cliente Com Consumo" }]`              | 902 → 1 item          |
 * | `3333`             | `[{ id: 903 }, { id: 904 }]` (903 sem, 904 com consumo)   | 903 vazio, 904 1 item |
 * | `9999`             | `UNAVAILABLE`                                             | —                     |
 * | outro              | `{ ok: true, clientes: [] }` (cliente novo)               | —                     |
 *
 * `consumoCliente` com id fora de {901, 902, 903, 904} → `NOT_FOUND`.
 *
 * Exemplos para testar a landing no mock:
 *   48999995555 → cliente novo (elegível, cadastro criado)
 *   48999991111 → já cadastrado, nunca consumiu (elegível, sem novo cadastro)
 *   48999992222 → já consumiu (negado)
 *   48999999999 → API indisponível (UNKNOWN, fail-closed)
 *   48999990000 → elegível, mas o POST de cadastro falha (voucher emitido, sync PENDING)
 */
import type {
  BarbeariaVipClient,
  BuscarClienteResult,
  ClienteResumo,
  ConsumoResult,
  PreCadastroInput,
  PreCadastroResult,
  ListarServicosResult,
} from "./client";

export interface MockCall {
  method: "criarCliente" | "buscarClientePorTelefone" | "consumoCliente" | "listarServicos";
  args: unknown[];
}

export interface MockBarbeariaVipClientOptions {
  /** Latência simulada por chamada, em ms. Padrão 50. */
  latencyMs?: number;
}

const FIRST_EXTERNAL_ID = 1000;
const DEFAULT_LATENCY_MS = 50;

const CLIENTES_POR_SUFIXO: Record<string, ClienteResumo[]> = {
  "1111": [{ id: 901, nome: "Cliente Sem Consumo" }],
  "2222": [{ id: 902, nome: "Cliente Com Consumo" }],
  "3333": [
    { id: 903, nome: "Cliente Duplicado Sem Consumo" },
    { id: 904, nome: "Cliente Duplicado Com Consumo" },
  ],
};

const IDS_SEM_CONSUMO = new Set([901, 903]);
const IDS_COM_CONSUMO = new Set([902, 904]);

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function suffix(telefone: string): string {
  return telefone.replace(/\D/g, "").slice(-4);
}

export class MockBarbeariaVipClient implements BarbeariaVipClient {
  /** Histórico de chamadas, para testes verificarem o que foi (ou não) invocado. */
  readonly calls: MockCall[] = [];

  private nextExternalId = FIRST_EXTERNAL_ID;
  private readonly latencyMs: number;

  constructor(options: MockBarbeariaVipClientOptions = {}) {
    this.latencyMs = options.latencyMs ?? DEFAULT_LATENCY_MS;
  }

  /** Limpa `calls` e reinicia o contador de ids. */
  reset(): void {
    this.calls.length = 0;
    this.nextExternalId = FIRST_EXTERNAL_ID;
  }

  async criarCliente(input: PreCadastroInput): Promise<PreCadastroResult> {
    this.calls.push({ method: "criarCliente", args: [input] });
    await sleep(this.latencyMs);

    if (suffix(input.telefone) === "0000") {
      return { ok: false, kind: "UNAVAILABLE" };
    }
    if (input.email.trim().toLowerCase().endsWith("@dup.test")) {
      return { ok: false, kind: "DUPLICATE", mensagem: "E-mail já cadastrado" };
    }
    const externalId = this.nextExternalId;
    this.nextExternalId += 1;
    return { ok: true, externalId };
  }

  async buscarClientePorTelefone(telefone: string, unidadeId?: number): Promise<BuscarClienteResult> {
    const args: unknown[] = unidadeId === undefined ? [telefone] : [telefone, unidadeId];
    this.calls.push({ method: "buscarClientePorTelefone", args });
    await sleep(this.latencyMs);

    const s = suffix(telefone);
    if (s === "9999") return { ok: false, kind: "UNAVAILABLE" };
    const clientes = CLIENTES_POR_SUFIXO[s];
    // cópia para o chamador não alterar a tabela interna
    return { ok: true, clientes: clientes ? clientes.map((c) => ({ ...c })) : [] };
  }

  /** Serviços de exemplo iguais para toda unidade; unidade 999 simula API indisponível. */
  async listarServicos(unidadeId: number): Promise<ListarServicosResult> {
    this.calls.push({ method: "listarServicos", args: [unidadeId] });
    await sleep(this.latencyMs);
    if (unidadeId === 999) return { ok: false, kind: "UNAVAILABLE" };
    return {
      ok: true,
      servicos: [
        { id: 10, nome: "Corte" },
        { id: 11, nome: "Barba" },
        { id: 12, nome: "Corte + Barba" },
        { id: 13, nome: "Sobrancelha" },
      ],
    };
  }

  async consumoCliente(id: number): Promise<ConsumoResult> {
    this.calls.push({ method: "consumoCliente", args: [id] });
    await sleep(this.latencyMs);

    if (IDS_COM_CONSUMO.has(id)) {
      return {
        ok: true,
        historico: [{ id: id * 10, servico: "Corte", data: "2026-09-15", valor: 60 }],
        pontuacoes: [{ pontos: 10, data: "2026-09-15" }],
      };
    }
    if (IDS_SEM_CONSUMO.has(id)) {
      return { ok: true, historico: [], pontuacoes: [] };
    }
    return { ok: false, kind: "NOT_FOUND" };
  }
}
