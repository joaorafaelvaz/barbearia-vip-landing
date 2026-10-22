import { describe, expect, it, vi } from "vitest";
import { checkEligibility } from "@/lib/eligibility";
import type {
  BarbeariaVipClient,
  BuscarClienteResult,
  ConsumoResult,
  PreCadastroResult,
} from "@/lib/barbearia-vip/client";

const TELEFONE = "48999991234";
const NOME = "Fulano Sigiloso";
const EMAIL = "sigiloso@example.com";

interface FakeOptions {
  buscar: BuscarClienteResult;
  consumo?: Record<number, ConsumoResult>;
}

/** Client falso com respostas fixas e spies para contar chamadas. */
function fakeClient(opts: FakeOptions) {
  const criarCliente = vi.fn<BarbeariaVipClient["criarCliente"]>(
    async (): Promise<PreCadastroResult> => ({ ok: true, externalId: 1 }),
  );
  const buscarClientePorTelefone = vi.fn<BarbeariaVipClient["buscarClientePorTelefone"]>(async () => opts.buscar);
  const consumoCliente = vi.fn<BarbeariaVipClient["consumoCliente"]>(
    async (id) => opts.consumo?.[id] ?? { ok: false, kind: "NOT_FOUND" },
  );
  const client: BarbeariaVipClient = { criarCliente, buscarClientePorTelefone, consumoCliente };
  return { client, criarCliente, buscarClientePorTelefone, consumoCliente };
}

function parseDetail(detail: string): Record<string, unknown> {
  return JSON.parse(detail) as Record<string, unknown>;
}

describe("checkEligibility", () => {
  it("1. getCliente não encontra → ELIGIBLE_NEW, existingId null, apenas 1 chamada", async () => {
    const f = fakeClient({ buscar: { ok: true, clientes: [] } });
    const r = await checkEligibility(f.client, TELEFONE, 1);

    expect(r.status).toBe("ELIGIBLE_NEW");
    expect(r.existingId).toBeNull();
    expect(f.buscarClientePorTelefone).toHaveBeenCalledTimes(1);
    expect(f.buscarClientePorTelefone).toHaveBeenCalledWith(TELEFONE, 1);
    expect(f.consumoCliente).not.toHaveBeenCalled();
    expect(f.criarCliente).not.toHaveBeenCalled();
    expect(parseDetail(r.detail)).toEqual({
      clientesEncontrados: [],
      historicoPorId: {},
      pontuacoesPorId: {},
    });
  });

  it("2. 1 cliente sem historico e sem pontuacoes → ELIGIBLE_NO_SALES com existingId", async () => {
    const f = fakeClient({
      buscar: { ok: true, clientes: [{ id: 901, nome: NOME }] },
      consumo: { 901: { ok: true, historico: [], pontuacoes: [] } },
    });
    const r = await checkEligibility(f.client, TELEFONE, 1);

    expect(r.status).toBe("ELIGIBLE_NO_SALES");
    expect(r.existingId).toBe(901);
    expect(parseDetail(r.detail)).toEqual({
      clientesEncontrados: [901],
      historicoPorId: { 901: 0 },
      pontuacoesPorId: { 901: 0 },
    });
  });

  it("3. 1 cliente com 1 item em historico → DENIED_HAS_SALES", async () => {
    const f = fakeClient({
      buscar: { ok: true, clientes: [{ id: 902, nome: NOME }] },
      consumo: { 902: { ok: true, historico: [{ servico: "corte" }], pontuacoes: [] } },
    });
    const r = await checkEligibility(f.client, TELEFONE);

    expect(r.status).toBe("DENIED_HAS_SALES");
    expect(r.existingId).toBeNull();
    expect(parseDetail(r.detail).historicoPorId).toEqual({ 902: 1 });
  });

  it("4. 2 clientes, só o segundo tem consumo → DENIED_HAS_SALES (todos verificados, em paralelo)", async () => {
    const f = fakeClient({
      buscar: {
        ok: true,
        clientes: [
          { id: 903, nome: NOME },
          { id: 904, nome: NOME },
        ],
      },
      consumo: {
        903: { ok: true, historico: [], pontuacoes: [] },
        904: { ok: true, historico: [{ servico: "barba" }], pontuacoes: [] },
      },
    });
    const r = await checkEligibility(f.client, TELEFONE, 2);

    expect(r.status).toBe("DENIED_HAS_SALES");
    expect(f.consumoCliente).toHaveBeenCalledTimes(2);
    expect(f.consumoCliente).toHaveBeenCalledWith(903);
    expect(f.consumoCliente).toHaveBeenCalledWith(904);
    expect(parseDetail(r.detail)).toMatchObject({
      clientesEncontrados: [903, 904],
      historicoPorId: { 903: 0, 904: 1 },
    });
  });

  it("5. historico vazio mas pontuacoes com saldo > 0 → ELIGIBLE_NO_SALES (pontuação não desqualifica)", async () => {
    const f = fakeClient({
      buscar: { ok: true, clientes: [{ id: 905, nome: NOME }] },
      consumo: { 905: { ok: true, historico: [], pontuacoes: [{ pontos: 120 }, { pontos: 30 }] } },
    });
    const r = await checkEligibility(f.client, TELEFONE, 1);

    expect(r.status).toBe("ELIGIBLE_NO_SALES");
    expect(r.existingId).toBe(905);
    expect(parseDetail(r.detail).pontuacoesPorId).toEqual({ 905: 2 });
  });

  it("6. getCliente UNAVAILABLE → UNKNOWN sem consultar consumo", async () => {
    const f = fakeClient({ buscar: { ok: false, kind: "UNAVAILABLE", httpStatus: 503 } });
    const r = await checkEligibility(f.client, TELEFONE, 1);

    expect(r.status).toBe("UNKNOWN");
    expect(r.existingId).toBeNull();
    expect(f.consumoCliente).not.toHaveBeenCalled();
    const d = parseDetail(r.detail);
    expect(d.clientesEncontrados).toEqual([]);
    expect(String(d.erro)).toMatch(/UNAVAILABLE/);
  });

  it("7. getConsumoCliente UNAVAILABLE em um dos ids → UNKNOWN (mesmo que os outros estejam limpos)", async () => {
    const f = fakeClient({
      buscar: {
        ok: true,
        clientes: [
          { id: 903, nome: NOME },
          { id: 904, nome: NOME },
        ],
      },
      consumo: {
        903: { ok: true, historico: [], pontuacoes: [] },
        904: { ok: false, kind: "UNAVAILABLE", httpStatus: 500 },
      },
    });
    const r = await checkEligibility(f.client, TELEFONE, 1);

    expect(r.status).toBe("UNKNOWN");
    expect(r.existingId).toBeNull();
    const d = parseDetail(r.detail);
    expect(d.clientesEncontrados).toEqual([903, 904]);
    expect(String(d.erro)).toMatch(/UNAVAILABLE/);
    expect(String(d.erro)).toContain("904");
  });

  it("7b. um id com consumo e outro UNAVAILABLE → DENIED_HAS_SALES (a venda confirmada prevalece)", async () => {
    const f = fakeClient({
      buscar: {
        ok: true,
        clientes: [
          { id: 903, nome: NOME },
          { id: 904, nome: NOME },
        ],
      },
      consumo: {
        903: { ok: false, kind: "UNAVAILABLE" },
        904: { ok: true, historico: [{ servico: "corte" }], pontuacoes: [] },
      },
    });
    const r = await checkEligibility(f.client, TELEFONE, 1);
    expect(r.status).toBe("DENIED_HAS_SALES");
  });

  it("8. getConsumoCliente NOT_FOUND → tratado como sem consumo e registrado em notFound", async () => {
    const f = fakeClient({
      buscar: {
        ok: true,
        clientes: [
          { id: 906, nome: NOME },
          { id: 907, nome: NOME },
        ],
      },
      consumo: {
        906: { ok: true, historico: [], pontuacoes: [] },
        907: { ok: false, kind: "NOT_FOUND", httpStatus: 404 },
      },
    });
    const r = await checkEligibility(f.client, TELEFONE, 1);

    expect(r.status).toBe("ELIGIBLE_NO_SALES");
    expect(r.existingId).toBe(906);
    const d = parseDetail(r.detail);
    expect(d.notFound).toEqual([907]);
    expect(d.historicoPorId).toEqual({ 906: 0 });
  });

  it("9. detail nunca contém nome, email ou telefone", async () => {
    const cases: FakeOptions[] = [
      { buscar: { ok: true, clientes: [] } },
      { buscar: { ok: false, kind: "UNAVAILABLE" } },
      {
        buscar: { ok: true, clientes: [{ id: 1, nome: NOME }] },
        consumo: {
          1: {
            ok: true,
            historico: [{ cliente: NOME, email: EMAIL, telefone: TELEFONE }],
            pontuacoes: [{ cliente: NOME }],
          },
        },
      },
      {
        buscar: { ok: true, clientes: [{ id: 2, nome: NOME }] },
        consumo: { 2: { ok: false, kind: "UNAVAILABLE" } },
      },
      {
        buscar: { ok: true, clientes: [{ id: 3, nome: NOME }] },
        consumo: { 3: { ok: false, kind: "NOT_FOUND" } },
      },
    ];
    for (const c of cases) {
      const r = await checkEligibility(fakeClient(c).client, TELEFONE, 1);
      expect(r.detail).not.toContain(NOME);
      expect(r.detail).not.toContain("Sigiloso");
      expect(r.detail).not.toContain(EMAIL);
      expect(r.detail).not.toContain(TELEFONE);
      expect(r.detail.length).toBeLessThan(500);
      expect(() => JSON.parse(r.detail)).not.toThrow();
    }
  });

  it("mais de 5 clientes → verifica só os 5 primeiros e registra truncado: true", async () => {
    const clientes = Array.from({ length: 7 }, (_, i) => ({ id: 100 + i, nome: NOME }));
    const consumo: Record<number, ConsumoResult> = {};
    for (const c of clientes) consumo[c.id] = { ok: true, historico: [], pontuacoes: [] };
    const f = fakeClient({ buscar: { ok: true, clientes }, consumo });
    const r = await checkEligibility(f.client, TELEFONE, 1);

    expect(f.consumoCliente).toHaveBeenCalledTimes(5);
    expect(f.consumoCliente).not.toHaveBeenCalledWith(105);
    expect(f.consumoCliente).not.toHaveBeenCalledWith(106);
    expect(r.status).toBe("ELIGIBLE_NO_SALES");
    expect(r.existingId).toBe(100);
    const d = parseDetail(r.detail);
    expect(d.truncado).toBe(true);
    expect(d.clientesEncontrados).toEqual([100, 101, 102, 103, 104, 105, 106]);
  });

  it("exceção inesperada do client → UNKNOWN (fail-closed), com erro no detail", async () => {
    const client: BarbeariaVipClient = {
      criarCliente: async () => ({ ok: true, externalId: 1 }),
      buscarClientePorTelefone: async () => {
        throw new Error(`falha com ${NOME}`);
      },
      consumoCliente: async () => ({ ok: true, historico: [], pontuacoes: [] }),
    };
    const r = await checkEligibility(client, TELEFONE, 1);
    expect(r.status).toBe("UNKNOWN");
    expect(r.existingId).toBeNull();
    expect(parseDetail(r.detail).erro).toBeDefined();
    expect(r.detail).not.toContain(NOME);
  });
});
