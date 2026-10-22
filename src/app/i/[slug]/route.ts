import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { hashIp } from "@/lib/hash";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, buildLandingUrl, isValidSlug, parseUtm } from "@/lib/attribution";
import { clientIpFromHeaders } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * Link do influencer: /i/<slug>
 * Registra o clique, grava o cookie de atribuição (first-touch: só se ainda não existir)
 * e redireciona para a landing com ref + UTM.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const home = new URL("/", request.url);

  if (!isValidSlug(slug)) return NextResponse.redirect(home, 302);

  const influencer = await prisma.influencer.findFirst({ where: { slug, active: true }, select: { id: true, slug: true } });
  if (!influencer) return NextResponse.redirect(home, 302);

  const utm = parseUtm(request.nextUrl.searchParams);
  try {
    await prisma.click.create({
      data: {
        influencerId: influencer.id,
        utmSource: utm.utmSource ?? null,
        utmMedium: utm.utmMedium ?? null,
        utmCampaign: utm.utmCampaign ?? null,
        utmContent: utm.utmContent ?? null,
        referer: request.headers.get("referer")?.slice(0, 500) ?? null,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        ipHash: hashIp(clientIpFromHeaders(request.headers)),
      },
    });
  } catch (e) {
    console.error("click: falha ao registrar", e instanceof Error ? e.message : e);
  }

  const res = NextResponse.redirect(new URL(buildLandingUrl(influencer.slug, request.nextUrl.searchParams), request.url), 302);
  if (!request.cookies.get(REF_COOKIE)) {
    res.cookies.set(REF_COOKIE, influencer.slug, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      maxAge: REF_COOKIE_MAX_AGE, path: "/",
    });
  }
  return res;
}
