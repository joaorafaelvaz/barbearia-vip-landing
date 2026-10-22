import { cookies, headers } from "next/headers";
import { hashIp } from "@/lib/hash";
import { REF_COOKIE, parseUtm, resolveRef, type Utm } from "@/lib/attribution";

export interface RequestContext {
  ref: string | null;
  utm: Utm;
  ip: string | null;
  ipHash: string | null;
}

export function clientIpFromHeaders(h: Headers): string | null {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || null;
  return h.get("x-real-ip");
}

/** Contexto de atribuição e IP para server actions. Só funciona dentro de uma requisição. */
export async function getRequestContext(formUtm?: URLSearchParams): Promise<RequestContext> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const ip = clientIpFromHeaders(h);
  const referer = h.get("referer");
  let utm: Utm = {};
  let queryRef: string | null = null;
  try {
    const params = formUtm ?? (referer ? new URL(referer).searchParams : new URLSearchParams());
    utm = parseUtm(params);
    queryRef = params.get("ref");
  } catch { /* referer inválido */ }
  return {
    ref: resolveRef({ cookieRef: c.get(REF_COOKIE)?.value ?? null, queryRef }),
    utm,
    ip,
    ipHash: hashIp(ip),
  };
}
