import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { resetDb } from "../db";
import { GET } from "@/app/i/[slug]/route";
import { proxy } from "@/proxy";

function req(url: string, cookie?: string) {
  return new NextRequest(url, { headers: cookie ? { cookie, "user-agent": "vitest", "x-forwarded-for": "1.2.3.4" } : { "user-agent": "vitest", "x-forwarded-for": "1.2.3.4" } });
}
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(async () => {
  await resetDb();
  await prisma.influencer.create({ data: { slug: "joaobarber", name: "João Barber" } });
  await prisma.influencer.create({ data: { slug: "inativo", name: "Inativo", active: false } });
});

describe("GET /i/[slug]", () => {
  it("registra clique, grava cookie e redireciona com ref + utm", async () => {
    const res = await GET(req("http://localhost/i/joaobarber?utm_content=stories"), params("joaobarber"));
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/");
    expect(loc.searchParams.get("ref")).toBe("joaobarber");
    expect(loc.searchParams.get("utm_source")).toBe("joaobarber");
    expect(loc.searchParams.get("utm_medium")).toBe("influencer");
    expect(loc.searchParams.get("utm_content")).toBe("stories");
    expect(res.headers.get("set-cookie")).toMatch(/bvip_ref=joaobarber/);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    const click = await prisma.click.findFirst({ include: { influencer: true } });
    expect(click?.influencer.slug).toBe("joaobarber");
    expect(click?.utmContent).toBe("stories");
    expect(click?.ipHash).toHaveLength(64);
  });

  it("first-touch: não troca cookie já existente", async () => {
    const res = await GET(req("http://localhost/i/joaobarber", "bvip_ref=outro"), params("joaobarber"));
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await prisma.click.count()).toBe(1); // o clique conta mesmo assim
  });

  it("slug inexistente, inativo ou inválido → home sem cookie nem clique", async () => {
    for (const slug of ["ninguem", "inativo", "Inv@lido"]) {
      const res = await GET(req(`http://localhost/i/${slug}`), params(slug));
      expect(res.status).toBe(302);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    expect(await prisma.click.count()).toBe(0);
  });
});

describe("proxy (?ref= sem /i/)", () => {
  it("grava cookie quando há ref válido e nenhum cookie", () => {
    const res = proxy(req("http://localhost/?ref=joaobarber"));
    expect(res.headers.get("set-cookie")).toMatch(/bvip_ref=joaobarber/);
  });
  it("não grava se já existe cookie ou se o ref é inválido", () => {
    expect(proxy(req("http://localhost/?ref=joaobarber", "bvip_ref=outro")).headers.get("set-cookie")).toBeNull();
    expect(proxy(req("http://localhost/?ref=Inv@lido")).headers.get("set-cookie")).toBeNull();
    expect(proxy(req("http://localhost/")).headers.get("set-cookie")).toBeNull();
  });
});
