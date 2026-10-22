import { prisma } from "@/lib/db";

/** Limpa todas as tabelas na ordem correta de FKs. Usar em beforeEach de testes com banco. */
export async function resetDb() {
  await prisma.voucherAudit.deleteMany();
  await prisma.voucher.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.click.deleteMany();
  await prisma.influencer.deleteMany();
  await prisma.unit.deleteMany();
}
