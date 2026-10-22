import "dotenv/config";
import { prisma } from "../../src/lib/db";
import { computeExpiresAt } from "../../src/lib/voucher";
async function main() {
  const unit = await prisma.unit.findFirst({ where: { slug: "florianopolis-centro" } });
  const inf = await prisma.influencer.findFirst({ where: { slug: "joaobarber" } });
  const lead = await prisma.lead.upsert({
    where: { phone: "+5548999995555" },
    create: { name: "Ana Souza", phone: "+5548999995555", email: "ana@example.com", birthDate: new Date(Date.UTC(1990,0,10)), consentAt: new Date(), preferredUnitId: unit?.id, influencerId: inf?.id, eligibility: "ELIGIBLE_NEW", syncStatus: "SYNCED", externalId: 1000 },
    update: {},
  });
  const v = await prisma.voucher.upsert({ where: { leadId: lead.id }, create: { code: "VIP-DEMA42", leadId: lead.id, expiresAt: computeExpiresAt(new Date()) }, update: { status: "ACTIVE", usedAt: null, usedUnitId: null, expiresAt: computeExpiresAt(new Date()) } });
  console.log(v.code);
  await prisma.$disconnect();
}
main();
