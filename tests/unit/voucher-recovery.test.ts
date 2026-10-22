import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../db";
import { resetRateLimits } from "@/lib/rate-limit";
import { recoverVoucher } from "@/lib/voucher-recovery";

const birth = new Date(Date.UTC(1990, 0, 10));

beforeEach(async () => { await resetDb(); resetRateLimits(); });

describe("recoverVoucher", () => {
  it("telefone + nascimento corretos → código", async () => {
    const lead = await prisma.lead.create({ data: { name: "Ana Souza", phone: "+5548999995555", birthDate: birth, eligibility: "ELIGIBLE_NEW" } });
    await prisma.voucher.create({ data: { code: "VIP-ABCDEF", leadId: lead.id, expiresAt: new Date(Date.now() + 1e6) } });
    expect(await recoverVoucher({ phone: "(48) 99999-5555", birthDate: "10/01/1990" }, "ip")).toEqual({ status: "found", code: "VIP-ABCDEF" });
  });

  it("nascimento errado e telefone inexistente dão a mesma resposta", async () => {
    const lead = await prisma.lead.create({ data: { name: "Ana Souza", phone: "+5548999995555", birthDate: birth, eligibility: "ELIGIBLE_NEW" } });
    await prisma.voucher.create({ data: { code: "VIP-ABCDEF", leadId: lead.id, expiresAt: new Date(Date.now() + 1e6) } });
    const wrong = await recoverVoucher({ phone: "(48) 99999-5555", birthDate: "11/01/1990" }, "ip");
    const missing = await recoverVoucher({ phone: "(48) 99999-0001", birthDate: "10/01/1990" }, "ip");
    expect(wrong).toEqual({ status: "not_found" });
    expect(missing).toEqual(wrong);
  });

  it("pendente (UNKNOWN) e negado têm respostas próprias", async () => {
    await prisma.lead.create({ data: { name: "A B", phone: "+5548999995555", birthDate: birth, eligibility: "UNKNOWN" } });
    await prisma.lead.create({ data: { name: "C D", phone: "+5548999992222", birthDate: birth, eligibility: "DENIED_HAS_SALES" } });
    expect(await recoverVoucher({ phone: "48999995555", birthDate: "10/01/1990" }, "ip")).toEqual({ status: "pending" });
    expect(await recoverVoucher({ phone: "48999992222", birthDate: "10/01/1990" }, "ip")).toEqual({ status: "denied" });
  });

  it("entrada inválida → erros de campo sem consultar; 11ª tentativa por IP é bloqueada", async () => {
    const r = await recoverVoucher({ phone: "123", birthDate: "x" }, "ip");
    expect(r.status === "invalid" && Object.keys(r.fieldErrors).sort()).toEqual(["birthDate", "phone"]);
    for (let i = 0; i < 10; i++) await recoverVoucher({ phone: "48999995555", birthDate: "10/01/1990" }, "ip2");
    expect(await recoverVoucher({ phone: "48999995555", birthDate: "10/01/1990" }, "ip2")).toEqual({ status: "rate_limited" });
  });
});
