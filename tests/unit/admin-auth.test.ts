import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_COOKIE,
  adminCookieValue,
  isAdminHeaders,
  isValidAdminCookie,
  isValidBearer,
  isValidToken,
  readCookieHeader,
} from "@/lib/admin-auth";

const TOKEN = "segredo-de-teste-admin-123";
const HASH = createHash("sha256").update(TOKEN).digest("hex");
let previousToken: string | undefined;

beforeAll(() => {
  previousToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = TOKEN;
});

afterAll(() => {
  if (previousToken === undefined) delete process.env.ADMIN_TOKEN;
  else process.env.ADMIN_TOKEN = previousToken;
});

describe("adminCookieValue", () => {
  it("é sha256 do token em hex (64 chars), nunca o token em si", () => {
    const v = adminCookieValue(TOKEN);
    expect(v).toBe(HASH);
    expect(v).toMatch(/^[0-9a-f]{64}$/);
    expect(v).not.toContain(TOKEN);
  });
});

describe("isValidAdminCookie", () => {
  it("aceita o hash correto (inclusive em maiúsculas)", () => {
    expect(isValidAdminCookie(HASH)).toBe(true);
    expect(isValidAdminCookie(HASH.toUpperCase())).toBe(true);
  });

  it("rejeita ausente, vazio, token puro, hash errado, tamanho errado e não-hex", () => {
    expect(isValidAdminCookie(undefined)).toBe(false);
    expect(isValidAdminCookie("")).toBe(false);
    expect(isValidAdminCookie(TOKEN)).toBe(false);
    expect(isValidAdminCookie(createHash("sha256").update("outro").digest("hex"))).toBe(false);
    expect(isValidAdminCookie(HASH.slice(0, 63))).toBe(false);
    expect(isValidAdminCookie("zz" + HASH.slice(2))).toBe(false);
  });

  it("rejeita tudo quando ADMIN_TOKEN não está definida", () => {
    const saved = process.env.ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    try {
      expect(isValidAdminCookie(HASH)).toBe(false);
      expect(isValidToken(TOKEN)).toBe(false);
      expect(isValidBearer(`Bearer ${TOKEN}`)).toBe(false);
    } finally {
      process.env.ADMIN_TOKEN = saved;
    }
  });
});

describe("isValidToken", () => {
  it("aceita só o token exato", () => {
    expect(isValidToken(TOKEN)).toBe(true);
    expect(isValidToken(TOKEN + "x")).toBe(false);
    expect(isValidToken(TOKEN.slice(0, -1))).toBe(false);
    expect(isValidToken("")).toBe(false);
    expect(isValidToken(null)).toBe(false);
    expect(isValidToken(HASH)).toBe(false);
  });
});

describe("isValidBearer", () => {
  it("aceita 'Bearer <token>' (prefixo sem distinção de maiúsculas, espaços extras)", () => {
    expect(isValidBearer(`Bearer ${TOKEN}`)).toBe(true);
    expect(isValidBearer(`bearer ${TOKEN}`)).toBe(true);
    expect(isValidBearer(`  Bearer   ${TOKEN}  `)).toBe(true);
  });

  it("rejeita sem prefixo, esquema errado, token errado, hash no lugar do token e null", () => {
    expect(isValidBearer(TOKEN)).toBe(false);
    expect(isValidBearer(`Basic ${TOKEN}`)).toBe(false);
    expect(isValidBearer(`Bearer ${TOKEN}x`)).toBe(false);
    expect(isValidBearer(`Bearer ${HASH}`)).toBe(false);
    expect(isValidBearer("Bearer ")).toBe(false);
    expect(isValidBearer(null)).toBe(false);
  });
});

describe("readCookieHeader", () => {
  it("encontra o cookie pelo nome entre vários, com espaços e url-encoding", () => {
    expect(readCookieHeader(`bvip_ref=joao; ${ADMIN_COOKIE}=${HASH}; other=1`, ADMIN_COOKIE)).toBe(HASH);
    expect(readCookieHeader(`${ADMIN_COOKIE}=${encodeURIComponent("a b")}`, ADMIN_COOKIE)).toBe("a b");
    expect(readCookieHeader(`x${ADMIN_COOKIE}=1`, ADMIN_COOKIE)).toBeUndefined();
    expect(readCookieHeader(null, ADMIN_COOKIE)).toBeUndefined();
  });
});

describe("isAdminHeaders (rota de export)", () => {
  it("aceita cookie válido", () => {
    const h = new Headers({ cookie: `bvip_ref=joao; ${ADMIN_COOKIE}=${HASH}` });
    expect(isAdminHeaders(h)).toBe(true);
  });

  it("aceita Bearer válido", () => {
    expect(isAdminHeaders(new Headers({ authorization: `Bearer ${TOKEN}` }))).toBe(true);
  });

  it("rejeita sem credenciais, cookie inválido e bearer inválido", () => {
    expect(isAdminHeaders(new Headers())).toBe(false);
    expect(isAdminHeaders(new Headers({ cookie: `${ADMIN_COOKIE}=${TOKEN}` }))).toBe(false);
    expect(isAdminHeaders(new Headers({ authorization: "Bearer nope" }))).toBe(false);
  });

  it("não aceita token na query string (só headers são consultados)", () => {
    const h = new Headers({ "x-url": `/api/admin/export?token=${TOKEN}` });
    expect(isAdminHeaders(h)).toBe(false);
  });
});
