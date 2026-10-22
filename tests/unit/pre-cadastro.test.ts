import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../db";
import { hashPin } from "@/lib/unit-auth";
import { resetRateLimits } from "@/lib/rate-limit";
import { MockBarbeariaVipClient } from "@/lib/barbearia-vip/mock-client";
import { runEligibilityStep, runPreCadastro } from "@/lib/pre-cadastro";
import { VOUCHER_VALIDITY_DAYS } from "@/lib/voucher";

const ctx = { ref: "joaobarber", utm: { utmSource: "joaobarber", utmMedium: "influencer" }, ipHash: "iphash" };
const base = { name: "João da Silva", unitSlug: "centro", email: "joao@example.com", birthDate: "10/01/1990", consent: true as const };
// Sufixos do telefone controlam o mock: 1111 cliente sem consumo, 2222 com consumo, 9999 API fora, 0000 falha no cadastro
const NEW = "(48) 99999-5555";

let client: MockBarbeariaVipClient;

beforeEach(async () => {
  await resetDb();
  resetRateLimits();
  client = new MockBarbeariaVipClient();
  await prisma.unit.create({ data: { slug: "centro", externalId: 45, name: "Florianópolis - Centro", pinHash: hashPin("123456") } });
  await prisma.influencer.create({ data: { slug: "joaobarber", name: "João Barber", handle: "@joaobarber" } });
});

describe("runEligibilityStep (etapa 1)", () => {
  it("cliente novo → eligible e grava lead parcial atribuído ao influencer", async () => {
    const r = await runEligibilityStep({ name: base.name, phone: NEW, unitSlug: "centro" }, ctx, client);
    expect(r).toEqual({ status: "eligible" });
    const lead = await prisma.lead.findUnique({ where: { phone: "+5548999995555" }, include: { influencer: true, preferredUnit: true } });
    expect(lead?.eligibility).toBe("ELIGIBLE_NEW");
    expect(lead?.influencer?.slug).toBe("joaobarber");
    expect(lead?.preferredUnit?.slug).toBe("centro");
    expect(lead?.email).toBeNull();
  });

  it("cliente com consumo → denied", async () => {
    const r = await runEligibilityStep({ name: base.name, phone: "(48) 99999-2222", unitSlug: "centro" }, ctx, client);
    expect(r).toEqual({ status: "denied" });
    const lead = await prisma.lead.findUnique({ where: { phone: "+5548999992222" } });
    expect(lead?.eligibility).toBe("DENIED_HAS_SALES");
  });

  it("API fora → unknown com contagem de tentativas", async () => {
    const r1 = await runEligibilityStep({ name: base.name, phone: "(48) 99999-9999", unitSlug: "centro" }, ctx, client);
    const r2 = await runEligibilityStep({ name: base.name, phone: "(48) 99999-9999", unitSlug: "centro" }, ctx, client);
    expect(r1).toEqual({ status: "unknown", attempts: 1 });
    expect(r2).toEqual({ status: "unknown", attempts: 2 });
  });

  it("telefone inválido → erro de campo, nada gravado e API não chamada", async () => {
    const r = await runEligibilityStep({ name: base.name, phone: "(48) 3333-3333", unitSlug: "centro" }, ctx, client);
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.fieldErrors.phone).toBeTruthy();
    expect(await prisma.lead.count()).toBe(0);
    expect(client.calls.length).toBe(0);
  });

  it("unidade inexistente → erro de campo", async () => {
    const r = await runEligibilityStep({ name: base.name, phone: NEW, unitSlug: "nao-existe" }, ctx, client);
    expect(r.status === "error" && r.fieldErrors.unitSlug).toBeTruthy();
  });

  it("rate limit por telefone: 6ª tentativa em 1h é bloqueada", async () => {
    for (let i = 0; i < 5; i++) await runEligibilityStep({ name: base.name, phone: NEW, unitSlug: "centro" }, { ...ctx, ipHash: `ip${i}` }, client);
    const r = await runEligibilityStep({ name: base.name, phone: NEW, unitSlug: "centro" }, { ...ctx, ipHash: "ip9" }, client);
    expect(r.status === "error" && r.formError).toMatch(/tentativas/i);
  });
});

describe("runPreCadastro (etapa 2)", () => {
  it("cliente novo → lead completo, voucher de 7 dias e cadastro na API (SYNCED)", async () => {
    const before = Date.now();
    const r = await runPreCadastro({ ...base, phone: NEW }, ctx, client);
    expect(r.status).toBe("redirect");
    const lead = await prisma.lead.findUnique({ where: { phone: "+5548999995555" }, include: { voucher: true } });
    expect(lead?.email).toBe("joao@example.com");
    expect(lead?.consentAt).toBeInstanceOf(Date);
    expect(lead?.syncStatus).toBe("SYNCED");
    expect(lead?.externalId).toBeGreaterThanOrEqual(1000);
    expect(lead?.voucher?.code).toMatch(/^VIP-[A-HJ-NP-Z2-9]{6}$/);
    expect(lead?.voucher?.discountPercent).toBe(10);
    const diff = lead!.voucher!.expiresAt.getTime() - lead!.voucher!.issuedAt.getTime();
    expect(diff).toBe(VOUCHER_VALIDITY_DAYS * 24 * 3600 * 1000);
    expect(lead!.voucher!.issuedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    const criar = client.calls.find((c) => c.method === "criarCliente");
    expect(criar?.args[0]).toMatchObject({ ddi: "55", telefone: "48999995555", data_nascimento: "10-01-1990", unidade_id: 45, email: "joao@example.com" });
  });

  it("telefone já com voucher ativo → mesmo código, sem novo voucher nem nova chamada à API", async () => {
    const r1 = await runPreCadastro({ ...base, phone: NEW }, ctx, client);
    client.reset();
    const r2 = await runPreCadastro({ ...base, phone: NEW }, ctx, client);
    expect(r2).toEqual(r1);
    expect(await prisma.voucher.count()).toBe(1);
    expect(client.calls.length).toBe(0);
  });

  it("telefone com voucher expirado → expired, sem novo voucher", async () => {
    await runPreCadastro({ ...base, phone: NEW }, ctx, client);
    await prisma.voucher.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await runPreCadastro({ ...base, phone: NEW }, ctx, client);
    expect(r).toEqual({ status: "expired" });
    expect(await prisma.voucher.count()).toBe(1);
  });

  it("honeypot preenchido → finge sucesso e não grava nada", async () => {
    const r = await runPreCadastro({ ...base, phone: NEW, honeypot: "http://spam" }, ctx, client);
    expect(r.status).toBe("redirect");
    expect(await prisma.lead.count()).toBe(0);
    expect(client.calls.length).toBe(0);
  });

  it("API indisponível no cadastro → lead FAILED, voucher emitido mesmo assim", async () => {
    const r = await runPreCadastro({ ...base, phone: "(48) 99999-0000" }, ctx, client);
    expect(r.status).toBe("redirect");
    const lead = await prisma.lead.findUnique({ where: { phone: "+5548999990000" }, include: { voucher: true } });
    expect(lead?.syncStatus).toBe("FAILED");
    expect(lead?.syncError).toMatch(/UNAVAILABLE/);
    expect(lead?.voucher).toBeTruthy();
  });

  it("e-mail duplicado na API → DUPLICATE, voucher emitido, externalId nulo", async () => {
    const r = await runPreCadastro({ ...base, phone: NEW, email: "x@dup.test" }, ctx, client);
    expect(r.status).toBe("redirect");
    const lead = await prisma.lead.findUnique({ where: { phone: "+5548999995555" }, include: { voucher: true } });
    expect(lead?.syncStatus).toBe("DUPLICATE");
    expect(lead?.externalId).toBeNull();
    expect(lead?.voucher).toBeTruthy();
  });

  it("sem consentimento → erro de validação", async () => {
    const r = await runPreCadastro({ ...base, phone: NEW, consent: false as unknown as true }, ctx, client);
    expect(r.status === "error" && r.fieldErrors.consent).toBeTruthy();
    expect(await prisma.lead.count()).toBe(0);
  });

  it("ref de influencer inexistente → lead sem atribuição", async () => {
    await runPreCadastro({ ...base, phone: NEW }, { ...ctx, ref: "ninguem" }, client);
    const lead = await prisma.lead.findUnique({ where: { phone: "+5548999995555" } });
    expect(lead?.influencerId).toBeNull();
  });

  it("cliente com consumo → denied, lead gravado, nenhum voucher", async () => {
    const r = await runPreCadastro({ ...base, phone: "(48) 99999-2222" }, ctx, client);
    expect(r).toEqual({ status: "denied" });
    const lead = await prisma.lead.findUnique({ where: { phone: "+5548999992222" }, include: { voucher: true } });
    expect(lead?.eligibility).toBe("DENIED_HAS_SALES");
    expect(lead?.voucher).toBeNull();
    expect(client.calls.some((c) => c.method === "criarCliente")).toBe(false);
  });

  it("API fora na verificação → unavailable, lead UNKNOWN, nenhum voucher", async () => {
    const r = await runPreCadastro({ ...base, phone: "(48) 99999-9999" }, ctx, client);
    expect(r).toEqual({ status: "unavailable" });
    const lead = await prisma.lead.findUnique({ where: { phone: "+5548999999999" }, include: { voucher: true } });
    expect(lead?.eligibility).toBe("UNKNOWN");
    expect(lead?.voucher).toBeNull();
  });

  it("cadastro existente sem consumo → voucher emitido, id existente reaproveitado, sem POST", async () => {
    const r = await runPreCadastro({ ...base, phone: "(48) 99999-1111" }, ctx, client);
    expect(r.status).toBe("redirect");
    const lead = await prisma.lead.findUnique({ where: { phone: "+5548999991111" }, include: { voucher: true } });
    expect(lead?.eligibility).toBe("ELIGIBLE_NO_SALES");
    expect(lead?.syncStatus).toBe("SYNCED_EXISTING");
    expect(lead?.externalId).toBe(901);
    expect(lead?.voucher).toBeTruthy();
    expect(client.calls.some((c) => c.method === "criarCliente")).toBe(false);
  });

  it("e-mail já usado por outro telefone → erro no campo e-mail", async () => {
    await runPreCadastro({ ...base, phone: NEW }, ctx, client);
    const r = await runPreCadastro({ ...base, phone: "(48) 99999-5556" }, ctx, client);
    expect(r.status === "error" && r.fieldErrors.email).toBeTruthy();
    expect(await prisma.voucher.count()).toBe(1);
  });
});
