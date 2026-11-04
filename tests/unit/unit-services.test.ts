import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetDb } from "../db";
import { hashPin } from "@/lib/unit-auth";
import { MockBarbeariaVipClient } from "@/lib/barbearia-vip/mock-client";
import { getUnitServices, resetUnitServicesCache } from "@/lib/unit-services";
import { createManualVoucher } from "@/lib/manual-voucher";
import { adminCookieValue, ADMIN_COOKIE } from "@/lib/admin-auth";
import { GET } from "@/app/api/admin/servicos/route";

let client: MockBarbeariaVipClient;

beforeEach(async () => {
  await resetDb();
  resetUnitServicesCache();
  client = new MockBarbeariaVipClient({ latencyMs: 0 });
  await prisma.unit.create({ data: { slug: "centro", externalId: 45, name: "Centro", pinHash: hashPin("123456") } });
  await prisma.unit.create({ data: { slug: "fora", externalId: 999, name: "API fora", pinHash: hashPin("123456") } });
});

describe("getUnitServices", () => {
  it("busca na API pelo id externo da unidade, ordena e usa cache por 10 min", async () => {
    const a = await getUnitServices("centro", client, 1_000);
    expect(a).toMatchObject({ ok: true, cached: false });
    if (!a.ok) return;
    expect(a.servicos.map((s) => s.nome)).toEqual(["Barba", "Corte", "Corte + Barba", "Sobrancelha"]);
    expect(client.calls.find((c) => c.method === "listarServicos")?.args).toEqual([45]);
    const b = await getUnitServices("centro", client, 1_000 + 5 * 60_000);
    expect(b).toMatchObject({ ok: true, cached: true });
    expect(client.calls.filter((c) => c.method === "listarServicos").length).toBe(1);
    await getUnitServices("centro", client, 1_000 + 11 * 60_000);
    expect(client.calls.filter((c) => c.method === "listarServicos").length).toBe(2);
  });

  it("unidade inexistente e API indisponível", async () => {
    expect(await getUnitServices("nao-existe", client)).toEqual({ ok: false, reason: "UNIT_NOT_FOUND" });
    expect(await getUnitServices("fora", client)).toEqual({ ok: false, reason: "UNAVAILABLE" });
  });
});

describe("GET /api/admin/servicos", () => {
  it("exige sessão de admin e devolve a lista da unidade", async () => {
    process.env.BARBEARIA_VIP_CLIENT = "mock";
    const anon = await GET(new NextRequest("http://localhost/api/admin/servicos?unit=centro"));
    expect(anon.status).toBe(401);
    const cookie = `${ADMIN_COOKIE}=${adminCookieValue(process.env.ADMIN_TOKEN ?? "dev-admin-token")}`;
    const ok = await GET(new NextRequest("http://localhost/api/admin/servicos?unit=centro", { headers: { cookie } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).servicos.length).toBe(4);
    const bad = await GET(new NextRequest("http://localhost/api/admin/servicos?unit=Inv@lido", { headers: { cookie } }));
    expect(bad.status).toBe(400);
  });
});

describe("voucher de serviço escolhido da lista", () => {
  it("guarda o id externo do serviço junto com o nome", async () => {
    const r = await createManualVoucher({ discountType: "SERVICE", discountValue: "Corte", serviceExternalId: "10", unitSlug: "centro" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = await prisma.voucher.findUniqueOrThrow({ where: { code: r.code } });
    expect(v.serviceName).toBe("Corte");
    expect(v.serviceExternalId).toBe(10);
  });
});
