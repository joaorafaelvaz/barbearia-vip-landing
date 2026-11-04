/**
 * Importa/atualiza unidades a partir do CSV (padrão: docs/data/unidades.csv).
 *
 *   npm run unit:import -- [arquivo.csv] [--dry-run] [--reset-pins] [--inactive slug1,slug2] [--pins-out caminho.csv]
 *
 * - Unidade nova: gera PIN aleatório de 6 dígitos, grava só o hash, e escreve o PIN no arquivo de saída.
 * - Unidade existente (mesmo unidade_id): atualiza os dados cadastrais e MANTÉM o PIN, salvo --reset-pins.
 * - Coluna `ativo` do CSV (sim/nao) define unidades inativas; --inactive é um complemento pontual.
 * - O arquivo de PINs vai por padrão para ~/unidades-pins-<data>.csv (FORA do repositório). Apague após entregar às recepções.
 * - O arquivo é aberto ANTES de qualquer gravação no banco: se não der para escrevê-lo, nada é alterado.
 */
import "dotenv/config";
import { closeSync, openSync, writeFileSync, writeSync } from "node:fs";
import { homedir } from "node:os";
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
  const pinsOut = resolve(typeof flags["pins-out"] === "string" ? flags["pins-out"] : `${homedir()}/unidades-pins-${date}.csv`);

  const units = readUnitsCsv(file);
  console.log(`${units.length} unidades no CSV${dryRun ? " (dry-run, nada será gravado)" : ""}`);

  // Abre o arquivo de PINs antes de tocar no banco: se falhar (permissão, pasta inexistente), aborta sem alterar nada.
  let pinsFd: number | null = null;
  if (!dryRun) {
    try {
      pinsFd = openSync(pinsOut, "w", 0o600);
      writeSync(pinsFd, "slug,unidade_id,nome,pin\n");
    } catch (e) {
      throw new Error(`não foi possível criar o arquivo de PINs em ${pinsOut} (${(e as Error).message}). Use --pins-out <caminho gravável>.`);
    }
  }

  const pins: string[] = ["slug,unidade_id,nome,pin"];
  let created = 0, updated = 0;
  for (const u of units) {
    const existing = await prisma.unit.findUnique({ where: { externalId: u.externalId }, select: { id: true, slug: true } });
    const needsPin = !existing || resetPins;
    const pin = needsPin ? generatePin() : null;
    const data = {
      slug: u.slug, name: u.name, address: u.address, cep: u.cep, city: u.city, state: u.state,
      phone: u.phone, phoneType: u.phoneType, hours: u.hours, instagram: u.instagram, mapsUrl: u.mapsUrl,
      active: u.active && !inactive.has(u.slug),
      ...(pin ? { pinHash: hashPin(pin), pinRotatedAt: existing ? new Date() : null } : {}),
    };
    if (!dryRun) {
      if (existing) await prisma.unit.update({ where: { id: existing.id }, data });
      else await prisma.unit.create({ data: { ...data, externalId: u.externalId, pinHash: data.pinHash! } });
    }
    if (existing) updated++; else created++;
    if (pin) {
      const line = `${u.slug},${u.externalId},"${u.name.replace(/"/g, '""')}",${pin}`;
      pins.push(line);
      if (pinsFd !== null) writeSync(pinsFd, line + "\n"); // grava na hora: se o processo cair no meio, os PINs já emitidos não se perdem
    }
    console.log(`${existing ? "atualizada" : "criada   "}  ${String(u.externalId).padStart(3)}  ${u.slug}${data.active ? "" : "  [INATIVA]"}${pin ? "  (PIN novo)" : ""}`);
  }
  console.log(`\ncriadas: ${created}, atualizadas: ${updated}`);
  if (pinsFd !== null) closeSync(pinsFd);
  if (pins.length > 1 && !dryRun) {
    console.log(`\nPINs gravados em ${pinsOut}\nEntregue a cada recepção o seu PIN e APAGUE este arquivo em seguida.`);
  } else if (!dryRun) {
    writeFileSync(pinsOut, ""); // nenhum PIN novo: deixa o arquivo vazio para não confundir
    console.log(`\nNenhum PIN novo (unidades já existiam). Use --reset-pins para gerar todos de novo.`);
  } else if (pins.length > 1) {
    console.log(`\n(dry-run) ${pins.length - 1} PINs seriam gerados.`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); }).finally(() => prisma.$disconnect());
