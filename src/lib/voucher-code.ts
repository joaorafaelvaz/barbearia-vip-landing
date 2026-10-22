import { randomInt } from "node:crypto";

// Alfabeto sem caracteres ambíguos (0/O, 1/I): 32 símbolos.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const PREFIX = "VIP-";

export const VOUCHER_CODE_REGEX = /^VIP-[A-HJ-NP-Z2-9]{6}$/;

/** Gera um código "VIP-XXXXXX" com aleatoriedade criptográfica. */
export function generateVoucherCode(): string {
  let body = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return PREFIX + body;
}

/**
 * Normaliza a digitação do código: maiúsculas, sem espaços/separadores, com o
 * prefixo "VIP-" garantido. Não valida (use VOUCHER_CODE_REGEX para isso).
 * "vip 7kq4m2", "VIP-7KQ4M2" e "7kq4m2" → "VIP-7KQ4M2".
 */
export function normalizeVoucherCode(input: string): string {
  const compact = input.toUpperCase().replace(/[\s\-_]+/g, "");
  if (!compact) return "";
  const body = compact.startsWith("VIP") ? compact.slice(3) : compact;
  return PREFIX + body;
}
