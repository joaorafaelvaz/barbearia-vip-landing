import { describe, expect, it } from "vitest";
import { formatPhoneBr, normalizeBrMobile, splitForApi } from "@/lib/phone";

describe("normalizeBrMobile", () => {
  it.each([
    "(11) 99999-9999",
    "11 9 9999 9999",
    "+55 11 99999-9999",
    "5511999999999",
    "11999999999",
    "+5511999999999",
    "  (11) 99999-9999  ",
  ])("normaliza %j para +5511999999999", (input) => {
    expect(normalizeBrMobile(input)).toBe("+5511999999999");
  });

  it("aceita outro DDD", () => {
    expect(normalizeBrMobile("(48) 99999-9999")).toBe("+5548999999999");
  });

  it("rejeita telefone fixo", () => {
    expect(normalizeBrMobile("(11) 3333-3333")).toBeNull();
    expect(normalizeBrMobile("+55 11 3333-3333")).toBeNull();
  });

  it("rejeita celular de 8 dígitos (sem o 9 inicial)", () => {
    expect(normalizeBrMobile("(32) 9989-9907")).toBeNull();
  });

  it("rejeita entradas curtas, vazias ou lixo", () => {
    expect(normalizeBrMobile("123")).toBeNull();
    expect(normalizeBrMobile("")).toBeNull();
    expect(normalizeBrMobile("   ")).toBeNull();
    expect(normalizeBrMobile("abc")).toBeNull();
  });

  it("rejeita número com 11 dígitos cujo 3º dígito não é 9", () => {
    expect(normalizeBrMobile("11899999999")).toBeNull();
  });

  it("rejeita número com dígitos a mais", () => {
    expect(normalizeBrMobile("119999999999")).toBeNull();
  });

  it("rejeita número de outro país", () => {
    expect(normalizeBrMobile("+1 202 555 0143")).toBeNull();
  });
});

describe("splitForApi", () => {
  it("separa DDI e dígitos nacionais", () => {
    expect(splitForApi("+5548999999999")).toEqual({ ddi: "55", telefone: "48999999999" });
    expect(splitForApi("+5511999999999")).toEqual({ ddi: "55", telefone: "11999999999" });
  });

  it("rejeita entrada que não seja celular BR em E.164", () => {
    expect(() => splitForApi("48999999999")).toThrow();
    expect(() => splitForApi("+12025550143")).toThrow();
  });
});

describe("formatPhoneBr", () => {
  it("formata para exibição", () => {
    expect(formatPhoneBr("+5548999999999")).toBe("(48) 99999-9999");
    expect(formatPhoneBr("+5511987654321")).toBe("(11) 98765-4321");
  });

  it("rejeita entrada que não seja celular BR em E.164", () => {
    expect(() => formatPhoneBr("11999999999")).toThrow();
  });
});
