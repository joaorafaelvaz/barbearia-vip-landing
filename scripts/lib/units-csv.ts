import { readFileSync } from "node:fs";
import { parseCsv } from "./csv";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface UnitRow {
  slug: string;
  externalId: number;
  name: string;
  address: string | null;
  cep: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  phoneType: string | null;
  hours: string | null;
  instagram: string | null;
  mapsUrl: string | null;
}

const nul = (v: string | undefined) => (v && v.trim() !== "" ? v.trim() : null);

/** Lê e valida o CSV de unidades (colunas de docs/templates/unidades.csv). Lança erro listando todos os problemas. */
export function readUnitsCsv(path: string): UnitRow[] {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const errors: string[] = [];
  const seenSlug = new Set<string>();
  const seenId = new Set<number>();
  const units: UnitRow[] = [];
  rows.forEach((r, i) => {
    const line = i + 2;
    const slug = (r.slug ?? "").trim();
    const externalId = Number(r.unidade_id);
    if (!SLUG_RE.test(slug)) errors.push(`linha ${line}: slug inválido "${slug}"`);
    if (!Number.isInteger(externalId) || externalId <= 0) errors.push(`linha ${line}: unidade_id inválido "${r.unidade_id}"`);
    if (!r.nome) errors.push(`linha ${line}: nome vazio`);
    if (seenSlug.has(slug)) errors.push(`linha ${line}: slug repetido "${slug}"`);
    if (seenId.has(externalId)) errors.push(`linha ${line}: unidade_id repetido ${externalId}`);
    seenSlug.add(slug); seenId.add(externalId);
    const phone = nul(r.telefone)?.replace(/\D/g, "") ?? null;
    if (phone && ![10, 11].includes(phone.length)) errors.push(`linha ${line}: telefone com ${phone.length} dígitos`);
    units.push({
      slug, externalId, name: r.nome.trim(),
      address: nul(r.endereco), cep: nul(r.cep), city: nul(r.cidade), state: nul(r.uf),
      phone, phoneType: nul(r.tipo_telefone), hours: nul(r.horario), instagram: nul(r.instagram), mapsUrl: nul(r.link_maps),
    });
  });
  if (errors.length) throw new Error(`CSV inválido:\n- ${errors.join("\n- ")}`);
  return units;
}

export function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2);
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) { flags[k] = argv[++i]; }
      else flags[k] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}
