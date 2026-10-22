/**
 * Cliente HTTP REAL da API da Barbearia VIP (https://franquiabv.com.br).
 * Usado quando `BARBEARIA_VIP_CLIENT=http`. Só roda no servidor.
 *
 * Variáveis de ambiente:
 * - `BARBEARIA_VIP_API_URL`     base da API (padrão https://franquiabv.com.br)
 * - `BARBEARIA_VIP_AUTH_SCHEME` none (padrão, API aberta) | bearer | api-key
 * - `BARBEARIA_VIP_API_KEY`     credencial usada por bearer/api-key
 *
 * Regras de robustez:
 * - `AbortController` com timeout de 8 s no POST e 5 s nos GETs.
 * - 1 retry imediato APENAS no POST e APENAS para erro de transporte (rede/timeout)
 *   ocorrido antes de qualquer resposta chegar. Consultas não repetem (quem decide é a
 *   server action / o cron).
 * - 401/403 = a autenticação da API entrou no ar e não estamos configurados: classificado
 *   como UNAVAILABLE (o cron segura os leads) com alerta destacado no console.
 * - Nunca logamos nome, email ou telefone do cliente; só status HTTP e `mensagem`.
 */
import type {
  BarbeariaVipClient,
  BuscarClienteResult,
  ClienteResumo,
  ConsumoResult,
  PreCadastroInput,
  PreCadastroResult,
} from "./client";

export const DEFAULT_BASE_URL = "https://franquiabv.com.br";
export const POST_TIMEOUT_MS = 8_000;
export const GET_TIMEOUT_MS = 5_000;

export type AuthScheme = "none" | "bearer" | "api-key";

export interface HttpBarbeariaVipClientOptions {
  /** Sobrescreve `BARBEARIA_VIP_API_URL`. */
  baseUrl?: string;
  postTimeoutMs?: number;
  getTimeoutMs?: number;
}

/**
 * Ponto único de autenticação. Lê `BARBEARIA_VIP_AUTH_SCHEME` + `BARBEARIA_VIP_API_KEY`
 * a cada chamada, para a troca futura ser só de ambiente. Esquema desconhecido ou chave
 * vazia → nenhum header (nunca enviamos credencial vazia).
 */
export function authHeaders(): Record<string, string> {
  const scheme = (process.env.BARBEARIA_VIP_AUTH_SCHEME ?? "none").trim().toLowerCase();
  const key = (process.env.BARBEARIA_VIP_API_KEY ?? "").trim();
  if (!key) return {};
  switch (scheme as AuthScheme) {
    case "bearer":
      return { Authorization: `Bearer ${key}` };
    case "api-key":
      return { "X-Api-Key": key };
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

interface RawResponse {
  status: number;
  /** Corpo já parseado, ou `undefined` se não era JSON válido. */
  json: unknown;
  jsonValid: boolean;
}

/** Erro de transporte: rede, DNS, timeout (abort). Nenhuma resposta chegou. */
class TransportError extends Error {
  constructor(
    readonly cause: unknown,
    readonly timedOut: boolean,
  ) {
    super(timedOut ? "timeout" : "erro de rede");
    this.name = "TransportError";
  }
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    ((err as { name?: unknown }).name === "AbortError" || (err as { name?: unknown }).name === "TimeoutError")
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Heurística para a mensagem de e-mail duplicado (a confirmar com a mensagem real). */
export function isDuplicateEmailMessage(mensagem: string | undefined): boolean {
  if (!mensagem) return false;
  const m = stripAccents(mensagem).toLowerCase();
  const mentionsEmail = /e-?mail/.test(m);
  const mentionsExisting = /(^|[^a-z])ja([^a-z]|$)|existe|cadastrad/.test(m);
  return mentionsEmail && mentionsExisting;
}

function mensagemOf(json: unknown): string | undefined {
  if (!isRecord(json)) return undefined;
  const m = json.mensagem;
  return typeof m === "string" && m.length > 0 ? m : undefined;
}

function sucessoOf(json: unknown): boolean | undefined {
  if (!isRecord(json)) return undefined;
  return typeof json.sucesso === "boolean" ? json.sucesso : undefined;
}

function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}

function logAuthAlert(endpoint: string, status: number): void {
  console.error(
    `[barbearia-vip] ALERTA: ${endpoint} respondeu ${status}. A autenticação da API parece ter entrado no ar ` +
      `e BARBEARIA_VIP_AUTH_SCHEME/BARBEARIA_VIP_API_KEY não estão configurados (ou estão inválidos). ` +
      `Chamadas classificadas como UNAVAILABLE até a correção.`,
  );
}

export class HttpBarbeariaVipClient implements BarbeariaVipClient {
  private readonly baseUrl: string;
  private readonly postTimeoutMs: number;
  private readonly getTimeoutMs: number;

  constructor(options: HttpBarbeariaVipClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? process.env.BARBEARIA_VIP_API_URL?.trim() ?? DEFAULT_BASE_URL;
    if (!this.baseUrl) this.baseUrl = DEFAULT_BASE_URL;
    this.postTimeoutMs = options.postTimeoutMs ?? POST_TIMEOUT_MS;
    this.getTimeoutMs = options.getTimeoutMs ?? GET_TIMEOUT_MS;
  }

  // -------------------------------------------------------------------------
  // POST /api/clientes/novo
  // -------------------------------------------------------------------------

  async criarCliente(input: PreCadastroInput): Promise<PreCadastroResult> {
    const endpoint = "POST /api/clientes/novo";
    const url = joinUrl(this.baseUrl, "/api/clientes/novo");
    // Corpo exatamente com os 6 campos da documentação, nesta ordem.
    const body = JSON.stringify({
      nome: input.nome,
      email: input.email,
      ddi: input.ddi,
      telefone: input.telefone,
      data_nascimento: input.data_nascimento,
      unidade_id: input.unidade_id,
    });

    let raw: RawResponse;
    try {
      raw = await this.requestWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...authHeaders() },
        body,
      });
    } catch (err) {
      const t = err as TransportError;
      console.warn(`[barbearia-vip] ${endpoint} falhou após retry: ${t.message}`);
      return { ok: false, kind: "UNAVAILABLE" };
    }

    const { status, json, jsonValid } = raw;

    if (isAuthStatus(status)) {
      logAuthAlert(endpoint, status);
      return { ok: false, kind: "UNAVAILABLE", httpStatus: status };
    }
    if (status >= 500) {
      console.warn(`[barbearia-vip] ${endpoint} respondeu ${status}`);
      return { ok: false, kind: "UNAVAILABLE", httpStatus: status };
    }

    const mensagem = mensagemOf(json);
    const sucesso = sucessoOf(json);
    const is2xx = status >= 200 && status < 300;

    if (is2xx && sucesso === true) {
      const id = isRecord(json) ? json.id : undefined;
      if (typeof id === "number" && Number.isFinite(id)) {
        return { ok: true, externalId: id };
      }
      // Sucesso sem id: não dá para vincular o cadastro. Tratamos como indisponível para o
      // cron repetir; a repetição devolverá DUPLICATE, que é um estado estável e verdadeiro.
      console.warn(`[barbearia-vip] ${endpoint} respondeu sucesso sem id numérico`);
      return { ok: false, kind: "UNAVAILABLE", mensagem, httpStatus: status };
    }

    if (isDuplicateEmailMessage(mensagem)) {
      return { ok: false, kind: "DUPLICATE", mensagem, httpStatus: status };
    }

    if (is2xx && !jsonValid) {
      console.warn(`[barbearia-vip] ${endpoint} respondeu ${status} com corpo que não é JSON`);
      return { ok: false, kind: "UNAVAILABLE", httpStatus: status };
    }

    // `sucesso:false` com outra mensagem, ou 4xx genérico: repetir não adianta.
    console.warn(`[barbearia-vip] ${endpoint} recusou (${status}): ${mensagem ?? "sem mensagem"}`);
    return { ok: false, kind: "VALIDATION", mensagem, httpStatus: status };
  }

  // -------------------------------------------------------------------------
  // GET /api/agendas/getCliente
  // -------------------------------------------------------------------------

  async buscarClientePorTelefone(telefone: string, unidadeId?: number): Promise<BuscarClienteResult> {
    const endpoint = "GET /api/agendas/getCliente";
    const params = new URLSearchParams({ telefone });
    if (unidadeId !== undefined) params.set("unidade_id", String(unidadeId));
    // Nunca enviar `versao` (confirmado: desnecessário sem código do país).
    const url = `${joinUrl(this.baseUrl, "/api/agendas/getCliente")}?${params.toString()}`;

    let raw: RawResponse;
    try {
      raw = await this.request(url, this.getInit(), this.getTimeoutMs);
    } catch (err) {
      console.warn(`[barbearia-vip] ${endpoint} falhou: ${(err as Error).message}`);
      return { ok: false, kind: "UNAVAILABLE" };
    }

    const { status, json, jsonValid } = raw;
    if (isAuthStatus(status)) {
      logAuthAlert(endpoint, status);
      return { ok: false, kind: "UNAVAILABLE", httpStatus: status };
    }
    // Qualquer status fora de 2xx é "não conseguimos confirmar" (fail-closed).
    if (status < 200 || status >= 300 || !jsonValid) {
      console.warn(`[barbearia-vip] ${endpoint} respondeu ${status}${jsonValid ? "" : " (corpo não é JSON)"}`);
      return { ok: false, kind: "UNAVAILABLE", httpStatus: status };
    }

    // `sucesso:false` ou `clientes` ausente/vazio significa "nenhum cliente", não erro.
    if (sucessoOf(json) === false || !isRecord(json) || !Array.isArray(json.clientes)) {
      return { ok: true, clientes: [] };
    }
    const clientes: ClienteResumo[] = [];
    for (const item of json.clientes) {
      if (!isRecord(item)) continue;
      const id = item.id;
      if (typeof id !== "number" || !Number.isFinite(id)) continue;
      clientes.push({ id, nome: typeof item.nome === "string" ? item.nome : "" });
    }
    return { ok: true, clientes };
  }

  // -------------------------------------------------------------------------
  // GET /api/agendas/getConsumoCliente
  // -------------------------------------------------------------------------

  async consumoCliente(id: number): Promise<ConsumoResult> {
    const endpoint = "GET /api/agendas/getConsumoCliente";
    const params = new URLSearchParams({ id: String(id) });
    const url = `${joinUrl(this.baseUrl, "/api/agendas/getConsumoCliente")}?${params.toString()}`;

    let raw: RawResponse;
    try {
      raw = await this.request(url, this.getInit(), this.getTimeoutMs);
    } catch (err) {
      console.warn(`[barbearia-vip] ${endpoint} falhou: ${(err as Error).message}`);
      return { ok: false, kind: "UNAVAILABLE" };
    }

    const { status, json, jsonValid } = raw;
    if (isAuthStatus(status)) {
      logAuthAlert(endpoint, status);
      return { ok: false, kind: "UNAVAILABLE", httpStatus: status };
    }
    if (status === 404) {
      return { ok: false, kind: "NOT_FOUND", httpStatus: status };
    }
    if (status < 200 || status >= 300 || !jsonValid) {
      console.warn(`[barbearia-vip] ${endpoint} respondeu ${status}${jsonValid ? "" : " (corpo não é JSON)"}`);
      return { ok: false, kind: "UNAVAILABLE", httpStatus: status };
    }
    if (sucessoOf(json) === false) {
      return { ok: false, kind: "NOT_FOUND", httpStatus: status };
    }

    const historico = isRecord(json) && Array.isArray(json.historico) ? json.historico : [];
    const pontuacoes = isRecord(json) && Array.isArray(json.pontuacoes) ? json.pontuacoes : [];
    return { ok: true, historico, pontuacoes };
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  private getInit(): RequestInit {
    return { method: "GET", headers: { Accept: "application/json", ...authHeaders() } };
  }

  /** POST: até 2 tentativas, e só repete erro de transporte (nenhuma resposta recebida). */
  private async requestWithRetry(url: string, init: RequestInit): Promise<RawResponse> {
    try {
      return await this.request(url, init, this.postTimeoutMs);
    } catch (err) {
      if (!(err instanceof TransportError)) throw err;
      console.warn(`[barbearia-vip] ${init.method ?? "GET"} falhou (${err.message}); repetindo uma vez`);
      return await this.request(url, init, this.postTimeoutMs);
    }
  }

  /**
   * Executa o fetch com timeout. Lança `TransportError` quando nenhuma resposta chegou
   * (rede/timeout). Falha ao ler o corpo depois de receber status vira JSON inválido,
   * nunca retry (um POST já pode ter sido processado).
   */
  private async request(url: string, init: RequestInit, timeoutMs: number): Promise<RawResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    } catch (err) {
      clearTimeout(timer);
      throw new TransportError(err, isAbortError(err) || controller.signal.aborted);
    }

    let text = "";
    let bodyOk = true;
    try {
      text = await response.text();
    } catch {
      bodyOk = false;
    } finally {
      clearTimeout(timer);
    }

    if (!bodyOk) return { status: response.status, json: undefined, jsonValid: false };
    try {
      return { status: response.status, json: JSON.parse(text) as unknown, jsonValid: true };
    } catch {
      return { status: response.status, json: undefined, jsonValid: false };
    }
  }
}
