import { parsePhoneNumberFromString } from "libphonenumber-js/max";

// Celular brasileiro em E.164: +55, DDD (2 dígitos, 1º não é 0), 9 e mais 8 dígitos.
const BR_MOBILE_E164 = /^\+55([1-9]\d)(9\d{8})$/;

/**
 * Normaliza celular brasileiro para E.164 ("+5548999999999").
 * Aceita máscara, espaços, "+55", "55", DDD com ou sem parênteses.
 * Devolve null se não for celular BR válido (fixo é inválido; exige 11 dígitos
 * nacionais com 9 na 3ª posição).
 */
export function normalizeBrMobile(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const parsed = parsePhoneNumberFromString(raw, "BR");
  if (!parsed || parsed.country !== "BR" || !parsed.isValid()) return null;

  // A lib precisa classificar como celular; se não souber o tipo (metadados
  // incompletos), a regra de dígitos abaixo decide sozinha.
  const type = parsed.getType();
  if (type !== undefined && type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") return null;

  // Regra de dígitos independente da lib: 11 dígitos nacionais, 3º dígito 9.
  if (!BR_MOBILE_E164.test(parsed.number)) return null;

  return parsed.number;
}

function nationalDigits(e164: string): string {
  const match = BR_MOBILE_E164.exec(e164);
  if (!match) throw new Error(`Telefone inválido para celular BR em E.164: ${e164}`);
  return match[1] + match[2];
}

/** De E.164 para o formato da API da Barbearia VIP: { ddi: "55", telefone: "48999999999" }. */
export function splitForApi(e164: string): { ddi: "55"; telefone: string } {
  return { ddi: "55", telefone: nationalDigits(e164) };
}

/** De E.164 para exibição: "(48) 99999-9999". */
export function formatPhoneBr(e164: string): string {
  const digits = nationalDigits(e164);
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
