const MIN_AGE = 12;
const MAX_AGE = 110;

const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Monta Date UTC meia-noite só se dia/mês/ano existirem no calendário (rejeita 31/02). */
function utcDateIfValid(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d;
}

/** Soma `years` anos a uma data UTC meia-noite (29/02 vira 01/03 em ano não bissexto). */
function addYearsUtc(d: Date, years: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + years, d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Aceita "dd/mm/aaaa" e "aaaa-mm-dd" (input type=date). Devolve Date UTC meia-noite ou null.
 * Rejeita data inválida (31/02), futura, idade < 12 ou > 110 (relativo a `now`).
 */
export function parseBirthDate(input: string, now: Date = new Date()): Date | null {
  const raw = input.trim();
  let year: number;
  let month: number;
  let day: number;

  const br = BR_DATE.exec(raw);
  const iso = ISO_DATE.exec(raw);
  if (br) {
    [day, month, year] = [Number(br[1]), Number(br[2]), Number(br[3])];
  } else if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    return null;
  }

  const birth = utcDateIfValid(year, month, day);
  if (!birth) return null;

  // "Hoje" em UTC, meia-noite, para comparar só a parte de data.
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (birth.getTime() > today.getTime()) return null;

  // Idade mínima: o 12º aniversário já precisa ter acontecido (hoje inclusive).
  if (addYearsUtc(birth, MIN_AGE).getTime() > today.getTime()) return null;
  // Idade máxima: o 111º aniversário ainda não pode ter acontecido.
  if (addYearsUtc(birth, MAX_AGE + 1).getTime() <= today.getTime()) return null;

  return birth;
}

/** "dd-mm-aaaa", formato exigido pela API. */
export function formatBirthDateForApi(d: Date): string {
  return `${pad2(d.getUTCDate())}-${pad2(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** "dd/mm/aaaa" para exibição (parte de data em UTC, como está no banco). */
export function formatDateBr(d: Date): string {
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

const SAO_PAULO_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "dd/mm/aaaa às HH:mm" no fuso America/Sao_Paulo. */
export function formatDateTimeBr(d: Date): string {
  const parts: Record<string, string> = {};
  for (const p of SAO_PAULO_FORMATTER.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return `${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`;
}
