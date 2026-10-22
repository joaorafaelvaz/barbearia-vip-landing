import { NextResponse, type NextRequest } from "next/server";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, isValidSlug } from "@/lib/attribution";

/**
 * Cobre links colados sem o /i/ (ex.: /?ref=joaobarber): grava o cookie de atribuição
 * se ainda não existir. Não consulta o banco; o slug é validado só no formato.
 */
export function proxy(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get("ref");
  if (!ref || !isValidSlug(ref) || request.cookies.get(REF_COOKIE)) return NextResponse.next();
  const res = NextResponse.next();
  res.cookies.set(REF_COOKIE, ref, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    maxAge: REF_COOKIE_MAX_AGE, path: "/",
  });
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|images|favicon.ico|i/).*)"],
};
