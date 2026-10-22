import { describe, expect, it } from "vitest";
import {
  REF_COOKIE,
  REF_COOKIE_MAX_AGE,
  SLUG_REGEX,
  buildLandingUrl,
  isValidSlug,
  parseUtm,
  resolveRef,
} from "@/lib/attribution";

describe("constantes", () => {
  it("nome do cookie e validade de 30 dias", () => {
    expect(REF_COOKIE).toBe("bvip_ref");
    expect(REF_COOKIE_MAX_AGE).toBe(30 * 24 * 60 * 60);
  });
});

describe("isValidSlug / SLUG_REGEX", () => {
  it.each(["joaobarber", "joao-barber", "a", "x1", "abc-123-def"])("aceita %j", (s) => {
    expect(SLUG_REGEX.test(s)).toBe(true);
    expect(isValidSlug(s)).toBe(true);
  });

  it.each([
    "",
    "Joao",
    "joao_barber",
    "-joao",
    "joao-",
    "joao--barber",
    "joão",
    "joao barber",
    "joao/barber",
    "a".repeat(65),
  ])("rejeita %j", (s) => {
    expect(isValidSlug(s)).toBe(false);
  });

  it("aceita exatamente 64 caracteres", () => {
    expect(isValidSlug("a".repeat(64))).toBe(true);
  });

  it("rejeita não-strings", () => {
    expect(isValidSlug(undefined)).toBe(false);
    expect(isValidSlug(null)).toBe(false);
    expect(isValidSlug(123)).toBe(false);
    expect(isValidSlug(["joao"])).toBe(false);
  });
});

describe("parseUtm", () => {
  it("extrai as quatro chaves utm_*", () => {
    const params = new URLSearchParams(
      "utm_source=joao&utm_medium=influencer&utm_campaign=lancamento&utm_content=stories",
    );
    expect(parseUtm(params)).toEqual({
      utmSource: "joao",
      utmMedium: "influencer",
      utmCampaign: "lancamento",
      utmContent: "stories",
    });
  });

  it("só inclui chaves presentes e não vazias", () => {
    const params = new URLSearchParams("utm_source=joao&utm_medium=&utm_content=%20%20&ref=x");
    const utm = parseUtm(params);
    expect(utm).toEqual({ utmSource: "joao" });
    expect("utmMedium" in utm).toBe(false);
    expect("utmCampaign" in utm).toBe(false);
    expect("utmContent" in utm).toBe(false);
  });

  it("devolve objeto vazio sem utm", () => {
    expect(parseUtm(new URLSearchParams(""))).toEqual({});
  });

  it("trunca valores em 100 caracteres", () => {
    const long = "x".repeat(250);
    const utm = parseUtm(new URLSearchParams({ utm_source: long }));
    expect(utm.utmSource).toHaveLength(100);
  });

  it("remove espaços em volta", () => {
    const utm = parseUtm(new URLSearchParams({ utm_campaign: "  lancamento " }));
    expect(utm.utmCampaign).toBe("lancamento");
  });
});

describe("resolveRef", () => {
  it("first-touch: cookie vence a query", () => {
    expect(resolveRef({ cookieRef: "primeiro", queryRef: "segundo" })).toBe("primeiro");
  });

  it("usa a query quando não há cookie", () => {
    expect(resolveRef({ cookieRef: null, queryRef: "segundo" })).toBe("segundo");
    expect(resolveRef({ queryRef: "segundo" })).toBe("segundo");
  });

  it("ignora cookie inválido e cai na query", () => {
    expect(resolveRef({ cookieRef: "INVÁLIDO", queryRef: "segundo" })).toBe("segundo");
    expect(resolveRef({ cookieRef: "", queryRef: "segundo" })).toBe("segundo");
  });

  it("devolve null se nenhum for slug válido", () => {
    expect(resolveRef({ cookieRef: "x y", queryRef: "Z" })).toBeNull();
    expect(resolveRef({})).toBeNull();
    expect(resolveRef({ cookieRef: undefined, queryRef: undefined })).toBeNull();
  });
});

describe("buildLandingUrl", () => {
  it("monta a URL padrão com ref e utm_* padrão", () => {
    expect(buildLandingUrl("joaobarber", new URLSearchParams(""))).toBe(
      "/?ref=joaobarber&utm_source=joaobarber&utm_medium=influencer&utm_campaign=lancamento",
    );
  });

  it("utm_* já presentes na query original têm prioridade sobre os padrões", () => {
    const url = buildLandingUrl(
      "joaobarber",
      new URLSearchParams("utm_medium=stories&utm_campaign=natal&utm_content=video1"),
    );
    const params = new URL(url, "http://x").searchParams;
    expect(params.get("ref")).toBe("joaobarber");
    expect(params.get("utm_source")).toBe("joaobarber");
    expect(params.get("utm_medium")).toBe("stories");
    expect(params.get("utm_campaign")).toBe("natal");
    expect(params.get("utm_content")).toBe("video1");
  });

  it("preserva utm_source da query original", () => {
    const params = new URL(
      buildLandingUrl("joaobarber", new URLSearchParams("utm_source=instagram")),
      "http://x",
    ).searchParams;
    expect(params.get("utm_source")).toBe("instagram");
    expect(params.get("ref")).toBe("joaobarber");
  });

  it("não propaga parâmetros que não sejam utm_* e ignora utm_* vazios", () => {
    const url = buildLandingUrl("joaobarber", new URLSearchParams("foo=bar&utm_medium=&ref=outro"));
    const params = new URL(url, "http://x").searchParams;
    expect(params.get("foo")).toBeNull();
    expect(params.get("ref")).toBe("joaobarber");
    expect(params.get("utm_medium")).toBe("influencer");
  });

  it("sempre começa com /? e codifica valores", () => {
    const url = buildLandingUrl("joaobarber", new URLSearchParams({ utm_content: "a b&c" }));
    expect(url.startsWith("/?")).toBe(true);
    expect(new URL(url, "http://x").searchParams.get("utm_content")).toBe("a b&c");
  });
});
