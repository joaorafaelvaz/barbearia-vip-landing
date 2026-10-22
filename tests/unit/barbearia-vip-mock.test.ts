import { beforeEach, describe, expect, it } from "vitest";
import { MockBarbeariaVipClient } from "@/lib/barbearia-vip/mock-client";
import type { PreCadastroInput } from "@/lib/barbearia-vip/client";

function input(overrides: Partial<PreCadastroInput> = {}): PreCadastroInput {
  return {
    nome: "Fulano de Tal",
    email: "fulano@example.com",
    ddi: "55",
    telefone: "48999991234",
    data_nascimento: "10-01-1990",
    unidade_id: 1,
    ...overrides,
  };
}

describe("MockBarbeariaVipClient", () => {
  let client: MockBarbeariaVipClient;

  beforeEach(() => {
    // latência zero nos testes para não atrasar a suíte
    client = new MockBarbeariaVipClient({ latencyMs: 0 });
  });

  describe("criarCliente", () => {
    it("devolve externalId incremental a partir de 1000", async () => {
      const a = await client.criarCliente(input());
      const b = await client.criarCliente(input({ email: "outro@example.com" }));
      expect(a).toEqual({ ok: true, externalId: 1000 });
      expect(b).toEqual({ ok: true, externalId: 1001 });
    });

    it("email terminando em @dup.test → DUPLICATE com mensagem", async () => {
      const r = await client.criarCliente(input({ email: "x@dup.test" }));
      expect(r).toEqual({ ok: false, kind: "DUPLICATE", mensagem: "E-mail já cadastrado" });
    });

    it("telefone terminando em 0000 → UNAVAILABLE", async () => {
      const r = await client.criarCliente(input({ telefone: "48999990000" }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe("UNAVAILABLE");
    });

    it("aplica a latência configurada (padrão ~50 ms)", async () => {
      const slow = new MockBarbeariaVipClient();
      const start = Date.now();
      await slow.criarCliente(input());
      expect(Date.now() - start).toBeGreaterThanOrEqual(40);
    });
  });

  describe("buscarClientePorTelefone", () => {
    it("sufixo 1111 → cliente 901 (sem consumo)", async () => {
      const r = await client.buscarClientePorTelefone("48999991111", 1);
      expect(r).toEqual({ ok: true, clientes: [{ id: 901, nome: "Cliente Sem Consumo" }] });
    });

    it("sufixo 2222 → cliente 902 (com consumo)", async () => {
      const r = await client.buscarClientePorTelefone("48999992222");
      expect(r).toEqual({ ok: true, clientes: [{ id: 902, nome: "Cliente Com Consumo" }] });
    });

    it("sufixo 3333 → dois clientes (903 e 904)", async () => {
      const r = await client.buscarClientePorTelefone("48999993333");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.clientes.map((c) => c.id)).toEqual([903, 904]);
    });

    it("sufixo 9999 → UNAVAILABLE", async () => {
      const r = await client.buscarClientePorTelefone("48999999999");
      expect(r).toEqual({ ok: false, kind: "UNAVAILABLE" });
    });

    it("qualquer outro telefone → lista vazia", async () => {
      const r = await client.buscarClientePorTelefone("48999995555");
      expect(r).toEqual({ ok: true, clientes: [] });
    });
  });

  describe("consumoCliente", () => {
    it("902 e 904 → historico com 1 item", async () => {
      for (const id of [902, 904]) {
        const r = await client.consumoCliente(id);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.historico).toHaveLength(1);
      }
    });

    it("901 e 903 → arrays vazios", async () => {
      for (const id of [901, 903]) {
        const r = await client.consumoCliente(id);
        expect(r).toEqual({ ok: true, historico: [], pontuacoes: [] });
      }
    });

    it("id desconhecido → NOT_FOUND", async () => {
      const r = await client.consumoCliente(1);
      expect(r).toEqual({ ok: false, kind: "NOT_FOUND" });
    });
  });

  describe("instrumentação", () => {
    it("registra cada chamada em calls e reset() limpa tudo", async () => {
      await client.buscarClientePorTelefone("48999991111", 7);
      await client.consumoCliente(901);
      await client.criarCliente(input());
      expect(client.calls.map((c) => c.method)).toEqual([
        "buscarClientePorTelefone",
        "consumoCliente",
        "criarCliente",
      ]);
      expect(client.calls[0].args).toEqual(["48999991111", 7]);

      client.reset();
      expect(client.calls).toEqual([]);
      // contador de ids também reinicia
      const r = await client.criarCliente(input());
      expect(r).toEqual({ ok: true, externalId: 1000 });
    });
  });
});
