import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetDb } from "../db";
import { hashPin } from "@/lib/unit-auth";
import { MockBarbeariaVipClient } from "@/lib/barbearia-vip/mock-client";
import { runCronSync } from "@/lib/cron-sync";
import { GET } from "@/app/api/cron/sync-leads/route";

let client: MockBarbeariaVipClient;
let unitId: string;

async function lead(phone: string, extra: Record<string, unknown> = {}) {
  return prisma.lead.create({
    data: { name: "Ana Souza", phone, email: `${phone.slice(-4)}@example.com`, birthDate: new Date(Date.UTC(1990, 0, 10)),
      consentAt: new Date(), preferredUnitId: unitId, ...extra } as Parameters<typeof prisma.lead.create>[0]["data"],
  });
}

beforeEach(async () => {
  await resetDb();
  client = new MockBarbeariaVipClient({ latencyMs: 0 });
  const u = await prisma.unit.create({ data: { slug: "centro", externalId: 45, name: "Centro", pinHash: hashPin("123456") } });
  unitId = u.id;
});

describe("runCronSync", () => {
  it("UNKNOWN com cadastro completo → elegível: emite voucher e sincroniza", async () => {
    const l = await lead("+5548999995555", { eligibility: "UNKNOWN", eligibilityAttempts: 2 });
    const s = await runCronSync(client);
    expect(s.eligibility).toMatchObject({ checked: 1, eligible: 1, vouchersIssued: 1 });
    const after = await prisma.lead.findUnique({ where: { id: l.id }, include: { voucher: true } });
    expect(after?.eligibility).toBe("ELIGIBLE_NEW");
    expect(after?.eligibilityAttempts).toBe(3);
    expect(after?.voucher).toBeTruthy();
    expect(after?.syncStatus).toBe("SYNCED");
  });

  it("UNKNOWN parcial (sem consentimento) → atualiza elegibilidade mas não emite voucher", async () => {
    const l = await lead("+5548999995555", { eligibility: "UNKNOWN", consentAt: null, email: null, birthDate: null });
    const s = await runCronSync(client);
    expect(s.eligibility.vouchersIssued).toBe(0);
    const after = await prisma.lead.findUnique({ where: { id: l.id }, include: { voucher: true } });
    expect(after?.eligibility).toBe("ELIGIBLE_NEW");
    expect(after?.voucher).toBeNull();
  });

  it("UNKNOWN que agora tem consumo → DENIED sem voucher; API ainda fora → continua UNKNOWN", async () => {
    await lead("+5548999992222", { eligibility: "UNKNOWN" });
    await lead("+5548999999999", { eligibility: "UNKNOWN", eligibilityAttempts: 1 });
    const s = await runCronSync(client);
    expect(s.eligibility).toMatchObject({ checked: 2, denied: 1, stillUnknown: 1, vouchersIssued: 0 });
    expect((await prisma.lead.findUnique({ where: { phone: "+5548999992222" } }))?.eligibility).toBe("DENIED_HAS_SALES");
    const still = await prisma.lead.findUnique({ where: { phone: "+5548999999999" } });
    expect(still?.eligibility).toBe("UNKNOWN");
    expect(still?.eligibilityAttempts).toBe(2);
  });

  it("não re-verifica UNKNOWN com 12 tentativas", async () => {
    await lead("+5548999995555", { eligibility: "UNKNOWN", eligibilityAttempts: 12 });
    const s = await runCronSync(client);
    expect(s.eligibility.checked).toBe(0);
  });

  it("FAILED com voucher → vira SYNCED quando a API volta; DUPLICATE e SYNCED não são reprocessados", async () => {
    const a = await lead("+5548999995555", { eligibility: "ELIGIBLE_NEW", syncStatus: "FAILED", syncAttempts: 1 });
    const b = await lead("+5548999995556", { eligibility: "ELIGIBLE_NEW", syncStatus: "DUPLICATE" });
    const c = await lead("+5548999995557", { eligibility: "ELIGIBLE_NEW", syncStatus: "FAILED", syncAttempts: 5 });
    for (const l of [a, b, c]) await prisma.voucher.create({ data: { code: `VIP-${l.phone.slice(-4)}AB`, leadId: l.id, expiresAt: new Date(Date.now() + 1e6) } });
    const s = await runCronSync(client);
    expect(s.sync).toMatchObject({ attempted: 1, synced: 1 });
    expect((await prisma.lead.findUnique({ where: { id: a.id } }))?.syncStatus).toBe("SYNCED");
    expect(client.calls.filter((x) => x.method === "criarCliente").length).toBe(1);
  });

  it("lead FAILED sem voucher (ex.: negado) não é sincronizado", async () => {
    await lead("+5548999995555", { eligibility: "DENIED_HAS_SALES", syncStatus: "PENDING" });
    const s = await runCronSync(client);
    expect(s.sync.attempted).toBe(0);
  });
});

describe("GET /api/cron/sync-leads", () => {
  it("exige o CRON_SECRET", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(new NextRequest("http://localhost/api/cron/sync-leads"))).status).toBe(401);
    expect((await GET(new NextRequest("http://localhost/api/cron/sync-leads", { headers: { authorization: "Bearer errado" } }))).status).toBe(401);
    const ok = await GET(new NextRequest("http://localhost/api/cron/sync-leads", { headers: { authorization: "Bearer s3cret" } }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });
  });
});
