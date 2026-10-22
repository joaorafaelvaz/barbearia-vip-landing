import { describe, expect, it } from "vitest";
import {
  VOUCHER_CODE_REGEX,
  generateVoucherCode,
  normalizeVoucherCode,
} from "@/lib/voucher-code";

describe("VOUCHER_CODE_REGEX", () => {
  it("aceita códigos no formato VIP-XXXXXX com alfabeto sem ambiguidade", () => {
    expect(VOUCHER_CODE_REGEX.test("VIP-7KQ4M2")).toBe(true);
    expect(VOUCHER_CODE_REGEX.test("VIP-ABCDEF")).toBe(true);
  });

  it("rejeita caracteres ambíguos, minúsculas e tamanhos errados", () => {
    expect(VOUCHER_CODE_REGEX.test("VIP-7KQ4M0")).toBe(false);
    expect(VOUCHER_CODE_REGEX.test("VIP-7KQ4MO")).toBe(false);
    expect(VOUCHER_CODE_REGEX.test("VIP-7KQ4M1")).toBe(false);
    expect(VOUCHER_CODE_REGEX.test("VIP-7KQ4MI")).toBe(false);
    expect(VOUCHER_CODE_REGEX.test("vip-7kq4m2")).toBe(false);
    expect(VOUCHER_CODE_REGEX.test("VIP-7KQ4M")).toBe(false);
    expect(VOUCHER_CODE_REGEX.test("VIP-7KQ4M22")).toBe(false);
    expect(VOUCHER_CODE_REGEX.test("VIP7KQ4M2")).toBe(false);
    expect(VOUCHER_CODE_REGEX.test(" VIP-7KQ4M2")).toBe(false);
  });
});

describe("generateVoucherCode", () => {
  it("gera código no formato esperado", () => {
    for (let i = 0; i < 100; i++) {
      expect(generateVoucherCode()).toMatch(VOUCHER_CODE_REGEX);
    }
  });

  it("não gera colisões em 10.000 códigos", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateVoucherCode());
    expect(seen.size).toBe(10_000);
  });

  it("nunca contém os caracteres ambíguos 0, O, 1 e I", () => {
    for (let i = 0; i < 10_000; i++) {
      const body = generateVoucherCode().slice(4);
      expect(body).not.toMatch(/[0O1I]/);
    }
  });

  it("usa todo o alfabeto (distribuição não degenerada)", () => {
    const chars = new Set<string>();
    for (let i = 0; i < 5_000; i++) {
      for (const c of generateVoucherCode().slice(4)) chars.add(c);
    }
    expect(chars.size).toBe(32);
  });
});

describe("normalizeVoucherCode", () => {
  it.each([
    ["vip 7kq4m2", "VIP-7KQ4M2"],
    ["VIP-7KQ4M2", "VIP-7KQ4M2"],
    ["  vip-7kq4m2  ", "VIP-7KQ4M2"],
    ["vip7kq4m2", "VIP-7KQ4M2"],
    ["VIP - 7KQ 4M2", "VIP-7KQ4M2"],
    ["vip_7kq4m2", "VIP-7KQ4M2"],
    ["7kq4m2", "VIP-7KQ4M2"],
  ])("normaliza %j para %j", (input, expected) => {
    expect(normalizeVoucherCode(input)).toBe(expected);
  });

  it("não valida: devolve lixo normalizado sem lançar", () => {
    expect(normalizeVoucherCode("")).toBe("");
    expect(normalizeVoucherCode("abc")).toBe("VIP-ABC");
    expect(normalizeVoucherCode("vip-0o1i")).toBe("VIP-0O1I");
  });
});
