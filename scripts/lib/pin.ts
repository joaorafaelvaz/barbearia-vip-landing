import { randomInt } from "node:crypto";

/** PIN numérico de 6 dígitos, criptograficamente aleatório, sem sequências óbvias. */
export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    if (/^(\d)\1{5}$/.test(pin)) continue; // 111111
    if ("0123456789".includes(pin) || "9876543210".includes(pin)) continue; // 123456, 654321
    return pin;
  }
}
