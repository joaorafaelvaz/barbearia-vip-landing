/** Troca o PIN de uma unidade:  npm run unit:rotate-pin -- --slug centro  */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { hashPin } from "../src/lib/unit-auth";
import { parseArgs } from "./lib/units-csv";
import { generatePin } from "./lib/pin";

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const slug = typeof flags.slug === "string" ? flags.slug : null;
  if (!slug) throw new Error("uso: npm run unit:rotate-pin -- --slug <slug>");
  const unit = await prisma.unit.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!unit) throw new Error(`unidade "${slug}" não encontrada`);
  const pin = generatePin();
  await prisma.unit.update({ where: { id: unit.id }, data: { pinHash: hashPin(pin), pinRotatedAt: new Date() } });
  console.log(`Novo PIN de ${unit.name} (${slug}): ${pin}\nEntregue à recepção e não guarde este valor.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
