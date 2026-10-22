/**
 * Helpers do balcão (lado do cliente): chamadas à API, armazenamento local e textos.
 * Sem dependências externas; importado pelos client components desta pasta.
 */
import { useSyncExternalStore } from "react";
import { formatDateTimeBr } from "@/lib/date";
import type { VoucherState } from "@/lib/voucher";

export type UnitRef = { slug: string; name: string };

/** Espelho de `VoucherLookup` (src/lib/voucher-service.ts) com datas em ISO, como vem do JSON. */
export interface VoucherLookupJson {
  code: string;
  state: VoucherState;
  discountPercent: number;
  issuedAt: string;
  expiresAt: string;
  customerFirstName: string;
  usedAt: string | null;
  usedUnit: UnitRef | null;
}

export type LookupOutcome =
  | { kind: "ok"; voucher: VoucherLookupJson }
  | { kind: "not_found" }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "error" };

export type BurnOutcome =
  | { kind: "ok"; code: string; usedAt: string; unit: UnitRef; customerFirstName: string; discountPercent: number }
  | { kind: "bad_pin" }
  | { kind: "locked"; retryAfterSeconds: number }
  | { kind: "not_found" }
  | { kind: "conflict"; reason: "EXPIRED" | "ALREADY_USED" | "CANCELLED"; usedAt: string | null; usedUnit: UnitRef | null }
  | { kind: "error" };

/** Mesma regra de src/lib/voucher-code.ts (duplicada para não puxar node:crypto no bundle do cliente). */
export function normalizeCodeInput(input: string): string {
  const compact = input.toUpperCase().replace(/[\s\-_]+/g, "");
  if (!compact) return "";
  const body = compact.startsWith("VIP") ? compact.slice(3) : compact;
  return `VIP-${body}`;
}

export const CODE_INPUT_REGEX = /^VIP-[A-HJ-NP-Z2-9]{6}$/;

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function retryAfter(body: Record<string, unknown>): number {
  const n = Number(body.retryAfterSeconds);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

export async function fetchLookup(code: string): Promise<LookupOutcome> {
  try {
    const res = await fetch(`/api/vouchers/${encodeURIComponent(code)}`, { cache: "no-store" });
    if (res.status === 200) return { kind: "ok", voucher: (await res.json()) as VoucherLookupJson };
    if (res.status === 404) return { kind: "not_found" };
    if (res.status === 429) return { kind: "rate_limited", retryAfterSeconds: retryAfter(await readJson(res)) };
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

export async function fetchBurn(code: string, body: { unit: string; pin: string; operator?: string }): Promise<BurnOutcome> {
  try {
    const res = await fetch(`/api/vouchers/${encodeURIComponent(code)}/burn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await readJson(res);
    if (res.status === 200) {
      return {
        kind: "ok",
        code: String(data.code ?? code),
        usedAt: String(data.usedAt ?? new Date().toISOString()),
        unit: (data.unit as UnitRef) ?? { slug: body.unit, name: body.unit },
        customerFirstName: String(data.customerFirstName ?? ""),
        discountPercent: Number(data.discountPercent ?? 10),
      };
    }
    if (res.status === 401) return { kind: "bad_pin" };
    if (res.status === 429) return { kind: "locked", retryAfterSeconds: retryAfter(data) };
    if (res.status === 404) return { kind: "not_found" };
    if (res.status === 409) {
      const reason = data.reason;
      if (reason === "EXPIRED" || reason === "ALREADY_USED" || reason === "CANCELLED") {
        return {
          kind: "conflict",
          reason,
          usedAt: typeof data.usedAt === "string" ? data.usedAt : null,
          usedUnit: (data.usedUnit as UnitRef | null) ?? null,
        };
      }
    }
    return { kind: "error" };
  } catch {
    return { kind: "error" };
  }
}

// ---------------------------------------------------------------- armazenamento
//
// Mini-store sobre sessionStorage/localStorage, lida via `useSyncExternalStore` (sem
// setState em effect). Toda leitura/escrita é protegida: em modo privado ou com storage
// bloqueado, o valor vive só em memória durante a sessão da página.

type Area = "session" | "local";
type Listener = () => void;

const PIN_KEY = (slug: string) => `balcao:pin:${slug}`;
const OPERATOR_KEY = "balcao:operator";
const LAST_UNIT_KEY = "balcao:last-unit";

const listeners = new Set<Listener>();
const memory = new Map<string, string | null>();

function storageFor(area: Area): Storage {
  return area === "session" ? window.sessionStorage : window.localStorage;
}

function emit(): void {
  for (const l of listeners) l();
}

function subscribeStorage(listener: Listener): () => void {
  listeners.add(listener);
  // Mudança vinda de outra aba (só localStorage dispara): invalida o cache em memória.
  const onStorage = () => {
    memory.clear();
    emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readStored(area: Area, key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  let value: string | null = null;
  try {
    value = storageFor(area).getItem(key);
  } catch {
    /* storage indisponível */
  }
  memory.set(key, value);
  return value;
}

function writeStored(area: Area, key: string, value: string | null): void {
  memory.set(key, value);
  try {
    if (value === null) storageFor(area).removeItem(key);
    else storageFor(area).setItem(key, value);
  } catch {
    /* storage indisponível: fica só em memória */
  }
  emit();
}

/** PIN salvo nesta aba para a unidade; `undefined` no servidor/hidratação (ainda não lido). */
export function useStoredPin(slug: string): string | null | undefined {
  return useSyncExternalStore(
    subscribeStorage,
    () => readStored("session", PIN_KEY(slug)),
    () => undefined,
  );
}
export function writePin(slug: string, pin: string | null): void {
  writeStored("session", PIN_KEY(slug), pin || null);
}

export function useStoredOperator(): string {
  return useSyncExternalStore(subscribeStorage, () => readStored("local", OPERATOR_KEY) ?? "", () => "");
}
export function writeOperator(name: string): void {
  writeStored("local", OPERATOR_KEY, name ? name.slice(0, 60) : null);
}

export function parseUnitRef(raw: string | null): UnitRef | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "slug" in parsed && "name" in parsed) return parsed as UnitRef;
  } catch {
    /* json inválido */
  }
  return null;
}
/** Última unidade usada neste aparelho, como string crua (parsear com `parseUnitRef` em useMemo). */
export function useLastUnitRaw(): string | null {
  return useSyncExternalStore(subscribeStorage, () => readStored("local", LAST_UNIT_KEY), () => null);
}
export function writeLastUnit(unit: UnitRef): void {
  writeStored("local", LAST_UNIT_KEY, JSON.stringify(unit));
}

// ---------------------------------------------------------------- textos

/** "21/10 às 15:32" (sem o ano), para a linha "usado em …". */
export function shortDateTime(iso: string): string {
  return formatDateTimeBr(new Date(iso)).replace(/\/\d{4}/, "");
}

export function fullDateTime(iso: string): string {
  return formatDateTimeBr(new Date(iso));
}

export function minutesLabel(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return m === 1 ? "1 minuto" : `${m} minutos`;
}

export function usedLine(usedAt: string | null, usedUnit: UnitRef | null): string {
  const when = usedAt ? ` em ${shortDateTime(usedAt)}` : "";
  const where = usedUnit ? ` na unidade ${usedUnit.name}` : "";
  return `usado${when}${where}`;
}

export function conflictMessage(o: Extract<BurnOutcome, { kind: "conflict" }>): string {
  switch (o.reason) {
    case "ALREADY_USED":
      return `Este voucher já foi ${usedLine(o.usedAt, o.usedUnit)}. O desconto não pode ser aplicado de novo.`;
    case "EXPIRED":
      return "Este voucher expirou. O desconto não pode mais ser aplicado.";
    case "CANCELLED":
      return "Este voucher foi cancelado. O desconto não pode ser aplicado.";
  }
}

export const STATE_LABEL: Record<VoucherState, string> = {
  ACTIVE: "ATIVO",
  USED: "USADO",
  EXPIRED: "EXPIRADO",
  CANCELLED: "CANCELADO",
};
