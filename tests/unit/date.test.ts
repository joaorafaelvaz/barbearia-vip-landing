import { describe, expect, it } from "vitest";
import {
  formatBirthDateForApi,
  formatDateBr,
  formatDateTimeBr,
  parseBirthDate,
} from "@/lib/date";

const now = new Date("2026-10-22T15:00:00Z");

describe("parseBirthDate", () => {
  it("aceita dd/mm/aaaa e aaaa-mm-dd e devolve a mesma data UTC meia-noite", () => {
    const a = parseBirthDate("10/01/1990", now);
    const b = parseBirthDate("1990-01-10", now);
    expect(a).not.toBeNull();
    expect(a?.toISOString()).toBe("1990-01-10T00:00:00.000Z");
    expect(b?.toISOString()).toBe("1990-01-10T00:00:00.000Z");
  });

  it("tolera espaços em volta", () => {
    expect(parseBirthDate("  10/01/1990 ", now)?.toISOString()).toBe("1990-01-10T00:00:00.000Z");
  });

  it("rejeita datas inexistentes no calendário", () => {
    expect(parseBirthDate("31/02/2000", now)).toBeNull();
    expect(parseBirthDate("2000-02-31", now)).toBeNull();
    expect(parseBirthDate("31/04/2000", now)).toBeNull();
    expect(parseBirthDate("29/02/2001", now)).toBeNull();
  });

  it("aceita 29/02 em ano bissexto", () => {
    expect(parseBirthDate("29/02/2000", now)?.toISOString()).toBe("2000-02-29T00:00:00.000Z");
  });

  it("rejeita formatos inválidos", () => {
    expect(parseBirthDate("", now)).toBeNull();
    expect(parseBirthDate("10-01-1990", now)).toBeNull();
    expect(parseBirthDate("1/1/1990", now)).toBeNull();
    expect(parseBirthDate("10/01/90", now)).toBeNull();
    expect(parseBirthDate("abc", now)).toBeNull();
    expect(parseBirthDate("10/13/1990", now)).toBeNull();
    expect(parseBirthDate("00/01/1990", now)).toBeNull();
  });

  it("rejeita data futura (amanhã) e aceita hoje? não: hoje tem idade 0 → rejeita", () => {
    expect(parseBirthDate("23/10/2026", now)).toBeNull();
    expect(parseBirthDate("22/10/2026", now)).toBeNull();
  });

  it("rejeita idade menor que 12 anos", () => {
    expect(parseBirthDate("22/10/2016", now)).toBeNull(); // 10 anos
    expect(parseBirthDate("23/10/2014", now)).toBeNull(); // faz 12 amanhã
  });

  it("aceita exatamente 12 anos (aniversário hoje)", () => {
    expect(parseBirthDate("22/10/2014", now)?.toISOString()).toBe("2014-10-22T00:00:00.000Z");
  });

  it("aceita idade 110 (anos completos) e rejeita a partir do 111º aniversário", () => {
    expect(parseBirthDate("22/10/1916", now)?.toISOString()).toBe("1916-10-22T00:00:00.000Z"); // 110 hoje
    expect(parseBirthDate("23/10/1915", now)?.toISOString()).toBe("1915-10-23T00:00:00.000Z"); // faz 111 amanhã
    expect(parseBirthDate("22/10/1915", now)).toBeNull(); // 111 hoje
    expect(parseBirthDate("10/01/1900", now)).toBeNull();
  });

  it("usa a hora atual quando `now` é omitido", () => {
    expect(parseBirthDate("10/01/1990")?.toISOString()).toBe("1990-01-10T00:00:00.000Z");
    expect(parseBirthDate("10/01/2100")).toBeNull();
  });
});

describe("formatBirthDateForApi", () => {
  it("formata como dd-mm-aaaa", () => {
    expect(formatBirthDateForApi(new Date(Date.UTC(1990, 0, 10)))).toBe("10-01-1990");
    expect(formatBirthDateForApi(new Date(Date.UTC(2005, 11, 1)))).toBe("01-12-2005");
  });
});

describe("formatDateBr", () => {
  it("formata como dd/mm/aaaa", () => {
    expect(formatDateBr(new Date(Date.UTC(1990, 0, 10)))).toBe("10/01/1990");
  });
});

describe("formatDateTimeBr", () => {
  it("formata no fuso America/Sao_Paulo", () => {
    expect(formatDateTimeBr(new Date("2026-10-21T18:32:00Z"))).toBe("21/10/2026 às 15:32");
  });

  it("vira o dia ao converter de UTC para Brasília", () => {
    expect(formatDateTimeBr(new Date("2026-10-22T01:05:00Z"))).toBe("21/10/2026 às 22:05");
  });

  it("usa dois dígitos para hora e minuto", () => {
    expect(formatDateTimeBr(new Date("2026-10-22T12:03:00Z"))).toBe("22/10/2026 às 09:03");
  });
});
