export const REF_COOKIE = "bvip_ref";
export const REF_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // segundos (30 dias)

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 64;
const UTM_MAX_LENGTH = 100;

export function isValidSlug(s: unknown): s is string {
  return typeof s === "string" && s.length <= SLUG_MAX_LENGTH && SLUG_REGEX.test(s);
}

export type Utm = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
};

const UTM_KEYS: ReadonlyArray<readonly [keyof Utm, string]> = [
  ["utmSource", "utm_source"],
  ["utmMedium", "utm_medium"],
  ["utmCampaign", "utm_campaign"],
  ["utmContent", "utm_content"],
];

/** Só chaves presentes e não vazias; valores sem espaços em volta e truncados em 100 chars. */
export function parseUtm(params: URLSearchParams): Utm {
  const utm: Utm = {};
  for (const [field, param] of UTM_KEYS) {
    const value = params.get(param)?.trim();
    if (value) utm[field] = value.slice(0, UTM_MAX_LENGTH);
  }
  return utm;
}

/** First-touch: o cookie vence a query. Devolve null se nenhum for slug válido. */
export function resolveRef(input: { cookieRef?: string | null; queryRef?: string | null }): string | null {
  if (isValidSlug(input.cookieRef)) return input.cookieRef;
  if (isValidSlug(input.queryRef)) return input.queryRef;
  return null;
}

/**
 * URL de destino após /i/[slug]:
 * "/?ref=<slug>&utm_source=<slug>&utm_medium=influencer&utm_campaign=lancamento".
 * utm_* já presentes (e não vazios) na query original têm prioridade sobre os padrões.
 */
export function buildLandingUrl(slug: string, original: URLSearchParams): string {
  const defaults: Record<string, string> = {
    utm_source: slug,
    utm_medium: "influencer",
    utm_campaign: "lancamento",
  };
  const out = new URLSearchParams({ ref: slug });
  for (const [, param] of UTM_KEYS) {
    const value = original.get(param)?.trim() || defaults[param];
    if (value) out.set(param, value);
  }
  return `/?${out.toString()}`;
}
