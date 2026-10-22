/** Cadastra (ou atualiza) um influencer e imprime o link:
 *   npm run influencer:add -- --slug joaobarber --name "João Barber" --handle @joaobarber --platform instagram
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { parseArgs } from "./lib/units-csv";
import { SLUG_RE } from "./lib/units-csv";

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const slug = typeof flags.slug === "string" ? flags.slug : "";
  const name = typeof flags.name === "string" ? flags.name : "";
  if (!SLUG_RE.test(slug) || !name) throw new Error("uso: --slug <a-z0-9->, --name <nome> [--handle @x] [--platform instagram|tiktok|youtube] [--inactive]");
  const data = {
    name,
    handle: typeof flags.handle === "string" ? flags.handle : null,
    platform: typeof flags.platform === "string" ? flags.platform : null,
    active: flags.inactive !== true,
  };
  const inf = await prisma.influencer.upsert({ where: { slug }, create: { slug, ...data }, update: data });
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  console.log(`${inf.active ? "ativo" : "INATIVO"}  ${inf.name} (${inf.handle ?? "sem @"})\nLink: ${base}/i/${inf.slug}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
