import { createHash, timingSafeEqual } from "node:crypto";

function salt(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} não definida`);
  return v;
}

/** sha256(salt:ip) em hex. Nunca armazenamos o IP em texto puro. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${salt("IP_HASH_SALT")}:${ip}`).digest("hex");
}

/** Comparação em tempo constante de duas strings hex do mesmo tamanho. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
