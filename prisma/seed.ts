/**
 * Seed de desenvolvimento (idempotente):
 * - 3 influencers de exemplo
 * - todas as unidades de docs/data/unidades.csv com o MESMO PIN (SEED_UNIT_PIN, padrão 123456); coluna `ativo` respeitada
 * Em produção use `npm run unit:import` (PIN aleatório por unidade) e `npm run influencer:add`.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPin } from "../src/lib/unit-auth";
import { readUnitsCsv } from "../scripts/lib/units-csv";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed é só para desenvolvimento");
  const pin = process.env.SEED_UNIT_PIN ?? "123456";

  const influencers = [
    { slug: "joaobarber", name: "João Barber", handle: "@joaobarber", platform: "instagram" },
    { slug: "mariacortes", name: "Maria Cortes", handle: "@mariacortes", platform: "tiktok" },
    { slug: "inativo", name: "Influencer Inativo", handle: "@inativo", platform: "instagram", active: false },
  ];
  for (const i of influencers) {
    await prisma.influencer.upsert({ where: { slug: i.slug }, create: i, update: i });
  }

  const units = readUnitsCsv("docs/data/unidades.csv");
  for (const u of units) {
    const { externalId, ...rest } = u;
    const data = { ...rest, pinHash: hashPin(pin) };
    await prisma.unit.upsert({ where: { externalId }, create: { externalId, ...data }, update: data });
  }
  console.log(`seed: ${influencers.length} influencers, ${units.length} unidades (PIN ${pin} em todas; coluna "ativo" do CSV respeitada)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
