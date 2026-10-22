import { createHash } from "node:crypto";
import { safeEqualHex } from "@/lib/hash";

export const ADMIN_COOKIE = "bvip_admin";
/** 12 horas, em segundos. */
export const ADMIN_COOKIE_MAX_AGE = 12 * 60 * 60;

const SHA256_HEX = /^[0-9a-f]{64}$/i;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Token configurado no ambiente; null se ausente (painel fica fechado). */
function adminToken(): string | null {
  const t = process.env.ADMIN_TOKEN?.trim();
  return t ? t : null;
}

/** Valor gravado no cookie: sha256(ADMIN_TOKEN) em hex. O token nunca vai ao navegador. */
export function adminCookieValue(token: string): string {
  return sha256Hex(token);
}

/** Compara o hash recebido com sha256(ADMIN_TOKEN) em tempo constante. */
export function isValidAdminCookie(value: string | undefined): boolean {
  const token = adminToken();
  if (!token || !value || !SHA256_HEX.test(value)) return false;
  return safeEqualHex(value.toLowerCase(), adminCookieValue(token));
}

/** Token em texto puro (formulário de login). Compara os hashes para ter tamanho fixo. */
export function isValidToken(candidate: string | undefined | null): boolean {
  const token = adminToken();
  if (!token || !candidate) return false;
  return safeEqualHex(sha256Hex(candidate), adminCookieValue(token));
}

/** `Authorization: Bearer <ADMIN_TOKEN>` (prefixo sem distinção de maiúsculas). */
export function isValidBearer(header: string | null): boolean {
  if (!header) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  return isValidToken(m[1].trim());
}

/** Lê um cookie do header `Cookie` cru (rota de API). */
export function readCookieHeader(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/** Autenticação para Route Handlers: cookie do painel OU Bearer com o token. */
export function isAdminHeaders(headers: Headers): boolean {
  if (isValidBearer(headers.get("authorization"))) return true;
  return isValidAdminCookie(readCookieHeader(headers.get("cookie"), ADMIN_COOKIE));
}

/** Autenticação em Server Components / Server Actions (via `cookies()`). */
export async function isAdminRequest(): Promise<boolean> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return isValidAdminCookie(store.get(ADMIN_COOKIE)?.value);
}

/** Opções do cookie de sessão do painel. */
export function adminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_COOKIE_MAX_AGE,
    path: "/",
  };
}

/** Grava o cookie de sessão (só em Server Action / Route Handler). Exige token válido. */
export async function setAdminSession(): Promise<void> {
  const token = adminToken();
  if (!token) throw new Error("ADMIN_TOKEN não definida");
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(ADMIN_COOKIE, adminCookieValue(token), adminCookieOptions());
}

export async function clearAdminSession(): Promise<void> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(ADMIN_COOKIE, "", { ...adminCookieOptions(), maxAge: 0 });
}
