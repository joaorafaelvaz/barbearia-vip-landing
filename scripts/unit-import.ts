/**
 * Importa/atualiza unidades a partir do CSV (padrão: docs/data/unidades.csv).
 *
 *   npm run unit:import -- [arquivo.csv] [--dry-run] [--reset-pins] [--inactive slug1,slug2] [--pins-out caminho.csv]
 *
 * - Unidade nova: gera PIN aleatório de 6 dígitos, grava só o hash, e escreve o PIN no arquivo de saída.
 * - Unidade existente (mesmo unidade_id): atualiza os dados cadastrais e MANTÉM o PIN, salvo --reset-pins.
 * - O arquivo de PINs vai por padrão para ../unidades-pins-<data>.csv (FORA do repositório). Apague após entregar às recepções.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/db";
import { hashPin } from "../src/lib/unit-auth";
import { readUnitsCsv, parseArgs } from "./lib/units-csv";
import { generatePin } from "./lib/pin";

async function main() {
  const { positional, flags } = parseArgs(process.argv.slice(2));
  const file = positional[0] ?? "docs/data/unidades.csv";
  const dryRun = flags["dry-run"] === true;
  const resetPins = flags["reset-pins"] === true;
  const inactive = new Set(String(flags.inactive ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const date = new Date().toISOString().slice(0, 10);
  const pinsOut = resolve(typeof flags["pins-out"] === "string" ? flags["pins-out"] : `../unidades-pins-${date}.csv`);

  const units = readUnitsCsv(file);
  console.log(`${units.length} unidades no CSV${dryRun ? " (dry-run, nada será gravado)" : ""}`);

  const pins: string[] = ["slug,unidade_id,nome,pin"];
  let created = 0, updated = 0;
  for (const u of units) {
    const existing = await prisma.unit.findUnique({ where: { externalId: u.externalId }, select: { id: true, slug: true } });
    const needsPin = !existing || resetPins;
    const pin = needsPin ? generatePin() : null;
    const data = {
      slug: u.slug, name: u.name, address: u.address, cep: u.cep, city: u.city, state: u.state,
      phone: u.phone, phoneType: u.phoneType, hours: u.hours, instagram: u.instagram, mapsUrl: u.mapsUrl,
      active: !inactive.has(u.slug),
      ...(pin ? { pinHash: hashPin(pin), pinRotatedAt: existing ? new Date() : null } : {}),
    };
    if (!dryRun) {
      if (existing) await prisma.unit.update({ where: { id: existing.id }, data });
      else await prisma.unit.create({ data: { ...data, externalId: u.externalId, pinHash: data.pinHash! } });
    }
    if (existing) updated++; else created++;
    if (pin) pins.push(`${u.slug},${u.externalId},"${u.name.replace(/"/g, '""')}",${pin}`);
    console.log(`${existing ? "atualizada" : "criada   "}  ${String(u.externalId).padStart(3)}  ${u.slug}${data.active ? "" : "  [INATIVA]"}${pin ? "  (PIN novo)" : ""}`);
  }
  console.log(`\ncriadas: ${created}, atualizadas: ${updated}`);
  if (pins.length > 1 && !dryRun) {
    writeFileSync(pinsOut, pins.join("\n") + "\n", { mode: 0o600 });
    console.log(`\nPINs gravados em ${pinsOut}\nEntregue a cada recepção o seu PIN e APAGUE este arquivo em seguida.`);
  } else if (pins.length > 1) {
    console.log(`\n(dry-run) ${pins.length - 1} PINs seriam gerados.`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
