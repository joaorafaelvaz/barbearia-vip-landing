import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpBarbeariaVipClient, authHeaders } from "@/lib/barbearia-vip/http-client";
import type { PreCadastroInput } from "@/lib/barbearia-vip/client";

const BASE = "https://api.test.local";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html" } });
}

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): FetchMock {
  const mock = vi.fn<typeof fetch>(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

function urlOf(call: unknown[]): URL {
  const input = call[0] as RequestInfo | URL;
  return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

function initOf(call: unknown[]): RequestInit {
  return (call[1] ?? {}) as RequestInit;
}

function headersOf(call: unknown[]): Record<string, string> {
  const h = new Headers(initOf(call).headers);
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

/** fetch que só termina quando o AbortController dispara (simula servidor mudo). */
function hangingFetch(): FetchMock {
  return stubFetch(
    (_input, init) =>
      new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (!signal) return;
        if (signal.aborted) {
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        });
      }),
  );
}

const input: PreCadastroInput = {
  nome: "Fulano de Tal",
  email: "fulano@example.com",
  ddi: "55",
  telefone: "48999999999",
  data_nascimento: "10-01-1990",
  unidade_id: 1,
};

let client: HttpBarbeariaVipClient;

beforeEach(() => {
  vi.stubEnv("BARBEARIA_VIP_AUTH_SCHEME", "none");
  vi.stubEnv("BARBEARIA_VIP_API_KEY", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  client = new HttpBarbeariaVipClient({ baseUrl: BASE });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("authHeaders()", () => {
  it("esquema none (padrão) → nenhum header", () => {
    vi.stubEnv("BARBEARIA_VIP_AUTH_SCHEME", "");
    vi.stubEnv("BARBEARIA_VIP_API_KEY", "segredo");
    expect(authHeaders()).toEqual({});
  });

  it("esquema bearer → Authorization: Bearer <key>", () => {
    vi.stubEnv("BARBEARIA_VIP_AUTH_SCHEME", "bearer");
    vi.stubEnv("BARBEARIA_VIP_API_KEY", "segredo");
    expect(authHeaders()).toEqual({ Authorization: "Bearer segredo" });
  });

  it("esquema api-key → X-Api-Key: <key>", () => {
    vi.stubEnv("BARBEARIA_VIP_AUTH_SCHEME", "api-key");
    vi.stubEnv("BARBEARIA_VIP_API_KEY", "segredo");
    expect(authHeaders()).toEqual({ "X-Api-Key": "segredo" });
  });

  it("esquema desconhecido ou chave vazia → nenhum header (não vaza credencial vazia)", () => {
    vi.stubEnv("BARBEARIA_VIP_AUTH_SCHEME", "bearer");
    vi.stubEnv("BARBEARIA_VIP_API_KEY", "");
    expect(authHeaders()).toEqual({});
    vi.stubEnv("BARBEARIA_VIP_AUTH_SCHEME", "oauth");
    vi.stubEnv("BARBEARIA_VIP_API_KEY", "x");
    expect(authHeaders()).toEqual({});
  });
});

describe("criarCliente (POST /api/clientes/novo)", () => {
  it("envia URL, método, Content-Type e corpo exatamente como a documentação", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ sucesso: true, id: 123 }));

    const r = await client.criarCliente(input);

    expect(r).toEqual({ ok: true, externalId: 123 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(urlOf(call).href).toBe(`${BASE}/api/clientes/novo`);
    const init = initOf(call);
    expect(init.method).toBe("POST");
    expect(headersOf(call)["content-type"]).toBe("application/json");
    expect(headersOf(call).authorization).toBeUndefined();
    expect(headersOf(call)["x-api-key"]).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual({
      nome: "Fulano de Tal",
      email: "fulano@example.com",
      ddi: "55",
      telefone: "48999999999",
      data_nascimento: "10-01-1990",
      unidade_id: 1,
    });
  });

  it("envia o header do esquema bearer", async () => {
    vi.stubEnv("BARBEARIA_VIP_AUTH_SCHEME", "bearer");
    vi.stubEnv("BARBEARIA_VIP_API_KEY", "tok");
    const fetchMock = stubFetch(async () => jsonResponse({ sucesso: true, id: 1 }));
    await client.criarCliente(input);
    expect(headersOf(fetchMock.mock.calls[0]).authorization).toBe("Bearer tok");
  });

  it("envia o header do esquema api-key", async () => {
    vi.stubEnv("BARBEARIA_VIP_AUTH_SCHEME", "api-key");
    vi.stubEnv("BARBEARIA_VIP_API_KEY", "tok");
    const fetchMock = stubFetch(async () => jsonResponse({ sucesso: true, id: 1 }));
    await client.criarCliente(input);
    expect(headersOf(fetchMock.mock.calls[0])["x-api-key"]).toBe("tok");
  });

  it("usa BARBEARIA_VIP_API_URL (padrão https://franquiabv.com.br) quando não recebe baseUrl", async () => {
    vi.stubEnv("BARBEARIA_VIP_API_URL", "https://homolog.test.local/");
    const fetchMock = stubFetch(async () => jsonResponse({ sucesso: true, id: 1 }));
    await new HttpBarbeariaVipClient().criarCliente(input);
    expect(urlOf(fetchMock.mock.calls[0]).href).toBe("https://homolog.test.local/api/clientes/novo");
  });

  it.each([
    "E-mail já cadastrado",
    "email ja existe",
    "Já existe um cliente com este e-mail",
    "EMAIL CADASTRADO ANTERIORMENTE",
  ])("sucesso:false com mensagem %j → DUPLICATE", async (mensagem) => {
    stubFetch(async () => jsonResponse({ sucesso: false, mensagem }));
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: false, kind: "DUPLICATE", mensagem, httpStatus: 200 });
  });

  it("sucesso:false com outra mensagem → VALIDATION (sem retry)", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ sucesso: false, mensagem: "Telefone inválido" }));
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: false, kind: "VALIDATION", mensagem: "Telefone inválido", httpStatus: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("4xx genérico → VALIDATION com httpStatus", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ sucesso: false, mensagem: "Campos obrigatórios" }, 422));
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: false, kind: "VALIDATION", mensagem: "Campos obrigatórios", httpStatus: 422 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("4xx com mensagem de e-mail duplicado → DUPLICATE", async () => {
    stubFetch(async () => jsonResponse({ sucesso: false, mensagem: "E-mail já cadastrado" }, 409));
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: false, kind: "DUPLICATE", mensagem: "E-mail já cadastrado", httpStatus: 409 });
  });

  it.each([401, 403])("%i → UNAVAILABLE com alerta destacado no console.error", async (status) => {
    const fetchMock = stubFetch(async () => textResponse("Unauthorized", status));
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: false, kind: "UNAVAILABLE", httpStatus: status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toMatch(/autentica/i);
    expect(logged).not.toContain("fulano@example.com");
    expect(logged).not.toContain("48999999999");
  });

  it("5xx → UNAVAILABLE sem retry (resposta recebida)", async () => {
    const fetchMock = stubFetch(async () => textResponse("Internal Server Error", 500));
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: false, kind: "UNAVAILABLE", httpStatus: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("2xx com JSON inválido → UNAVAILABLE", async () => {
    stubFetch(async () => textResponse("<html>oops</html>", 200));
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: false, kind: "UNAVAILABLE", httpStatus: 200 });
  });

  it("2xx sucesso:true sem id numérico → UNAVAILABLE (o cron repete e a API responderá duplicado)", async () => {
    stubFetch(async () => jsonResponse({ sucesso: true }));
    const r = await client.criarCliente(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.kind).toBe("UNAVAILABLE");
  });

  it("erro de rede → 1 retry imediato; se o retry funciona, devolve ok", async () => {
    let n = 0;
    const fetchMock = stubFetch(async () => {
      n += 1;
      if (n === 1) throw new TypeError("fetch failed");
      return jsonResponse({ sucesso: true, id: 77 });
    });
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: true, externalId: 77 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("erro de rede duas vezes → UNAVAILABLE, no máximo 2 tentativas", async () => {
    const fetchMock = stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: false, kind: "UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fetch rejeitado com AbortError → retry e depois UNAVAILABLE", async () => {
    const fetchMock = stubFetch(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    });
    const r = await client.criarCliente(input);
    expect(r).toEqual({ ok: false, kind: "UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("timeout de 8 s via AbortController, com 1 retry", async () => {
    vi.useFakeTimers();
    const fetchMock = hangingFetch();

    let settled = false;
    const p = client.criarCliente(input).then((r) => {
      settled = true;
      return r;
    });

    await vi.advanceTimersByTimeAsync(7_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1); // 1ª tentativa aborta → retry imediato
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(settled).toBe(false);
    expect(initOf(fetchMock.mock.calls[0]).signal?.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(8_000); // 2ª tentativa aborta
    expect(await p).toEqual({ ok: false, kind: "UNAVAILABLE" });
  });
});

describe("buscarClientePorTelefone (GET /api/agendas/getCliente)", () => {
  it("monta a URL com telefone (sem 55) e unidade_id, sem versao, e sem corpo", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({ sucesso: true, clientes: [{ id: 10, nome: "Alguém", extra: "x" }] }),
    );
    const r = await client.buscarClientePorTelefone("48999999999", 3);

    expect(r).toEqual({ ok: true, clientes: [{ id: 10, nome: "Alguém" }] });
    const call = fetchMock.mock.calls[0];
    const url = urlOf(call);
    expect(url.origin + url.pathname).toBe(`${BASE}/api/agendas/getCliente`);
    expect(url.searchParams.get("telefone")).toBe("48999999999");
    expect(url.searchParams.get("unidade_id")).toBe("3");
    expect(url.searchParams.has("versao")).toBe(false);
    expect(Array.from(url.searchParams.keys()).sort()).toEqual(["telefone", "unidade_id"]);
    expect((initOf(call).method ?? "GET").toUpperCase()).toBe("GET");
    expect(initOf(call).body).toBeUndefined();
  });

  it("sem unidadeId → só telefone na query", async () => {
    const fetchMock = stubFetch(async () => jsonResponse({ sucesso: true, clientes: [] }));
    await client.buscarClientePorTelefone("48999999999");
    const url = urlOf(fetchMock.mock.calls[0]);
    expect(Array.from(url.searchParams.keys())).toEqual(["telefone"]);
  });

  it("envia os headers de autenticação também nas consultas", async () => {
    vi.stubEnv("BARBEARIA_VIP_AUTH_SCHEME", "bearer");
    vi.stubEnv("BARBEARIA_VIP_API_KEY", "tok");
    const fetchMock = stubFetch(async () => jsonResponse({ sucesso: true, clientes: [] }));
    await client.buscarClientePorTelefone("48999999999");
    expect(headersOf(fetchMock.mock.calls[0]).authorization).toBe("Bearer tok");
  });

  it("sucesso:false → lista vazia (não é erro)", async () => {
    stubFetch(async () => jsonResponse({ sucesso: false, mensagem: "Nenhum cliente" }));
    expect(await client.buscarClientePorTelefone("48999999999")).toEqual({ ok: true, clientes: [] });
  });

  it("clientes ausente → lista vazia", async () => {
    stubFetch(async () => jsonResponse({ sucesso: true }));
    expect(await client.buscarClientePorTelefone("48999999999")).toEqual({ ok: true, clientes: [] });
  });

  it("ignora entradas sem id numérico e normaliza nome ausente", async () => {
    stubFetch(async () =>
      jsonResponse({ sucesso: true, clientes: [{ id: "abc" }, { id: 5 }, null, { id: 6, nome: "B" }] }),
    );
    expect(await client.buscarClientePorTelefone("48999999999")).toEqual({
      ok: true,
      clientes: [
        { id: 5, nome: "" },
        { id: 6, nome: "B" },
      ],
    });
  });

  it.each([401, 403, 500, 503])("%i → UNAVAILABLE sem retry", async (status) => {
    const fetchMock = stubFetch(async () => textResponse("erro", status));
    expect(await client.buscarClientePorTelefone("48999999999")).toEqual({
      ok: false,
      kind: "UNAVAILABLE",
      httpStatus: status,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("JSON inválido → UNAVAILABLE", async () => {
    stubFetch(async () => textResponse("<html>", 200));
    expect(await client.buscarClientePorTelefone("48999999999")).toEqual({
      ok: false,
      kind: "UNAVAILABLE",
      httpStatus: 200,
    });
  });

  it("erro de rede → UNAVAILABLE sem retry", async () => {
    const fetchMock = stubFetch(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await client.buscarClientePorTelefone("48999999999")).toEqual({ ok: false, kind: "UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("timeout de 5 s → UNAVAILABLE, sem retry", async () => {
    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    let settled = false;
    const p = client.buscarClientePorTelefone("48999999999").then((r) => {
      settled = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ ok: false, kind: "UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("consumoCliente (GET /api/agendas/getConsumoCliente)", () => {
  it("monta a URL com id e devolve historico e pontuacoes", async () => {
    const fetchMock = stubFetch(async () =>
      jsonResponse({
        sucesso: true,
        cliente: { id: 123, nome: "Alguém" },
        historico: [{ data: "2026-01-01" }],
        pontuacoes: [{ pontos: 10 }, { pontos: 5 }],
      }),
    );
    const r = await client.consumoCliente(123);
    expect(r).toEqual({ ok: true, historico: [{ data: "2026-01-01" }], pontuacoes: [{ pontos: 10 }, { pontos: 5 }] });
    const url = urlOf(fetchMock.mock.calls[0]);
    expect(url.origin + url.pathname).toBe(`${BASE}/api/agendas/getConsumoCliente`);
    expect(Array.from(url.searchParams.entries())).toEqual([["id", "123"]]);
  });

  it("historico/pontuacoes ausentes → []", async () => {
    stubFetch(async () => jsonResponse({ sucesso: true, cliente: { id: 1 } }));
    expect(await client.consumoCliente(1)).toEqual({ ok: true, historico: [], pontuacoes: [] });
  });

  it("sucesso:false → NOT_FOUND", async () => {
    stubFetch(async () => jsonResponse({ sucesso: false, mensagem: "Cliente não encontrado" }));
    expect(await client.consumoCliente(1)).toEqual({ ok: false, kind: "NOT_FOUND", httpStatus: 200 });
  });

  it("404 → NOT_FOUND", async () => {
    stubFetch(async () => textResponse("Not Found", 404));
    expect(await client.consumoCliente(1)).toEqual({ ok: false, kind: "NOT_FOUND", httpStatus: 404 });
  });

  it.each([401, 403, 500, 502])("%i → UNAVAILABLE sem retry", async (status) => {
    const fetchMock = stubFetch(async () => textResponse("erro", status));
    expect(await client.consumoCliente(1)).toEqual({ ok: false, kind: "UNAVAILABLE", httpStatus: status });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("timeout de 5 s → UNAVAILABLE, sem retry", async () => {
    vi.useFakeTimers();
    const fetchMock = hangingFetch();
    const p = client.consumoCliente(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await p).toEqual({ ok: false, kind: "UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
