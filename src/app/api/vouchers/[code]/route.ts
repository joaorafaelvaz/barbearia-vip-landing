import { NextResponse, type NextRequest } from "next/server";
import { hashIp } from "@/lib/hash";
import { clientIpFromHeaders } from "@/lib/request-context";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { VOUCHER_CODE_REGEX, normalizeVoucherCode } from "@/lib/voucher-code";
import { lookupVoucher } from "@/lib/voucher-service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

/**
 * Validador público do voucher: só leitura, nunca altera estado.
 * Rate limit por IP (60/min) contra enumeração de códigos.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const ipHash = hashIp(clientIpFromHeaders(request.headers));
  const rl = rateLimit(`voucher-lookup:${ipHash ?? "unknown"}`, RATE_LIMITS.voucherLookupIp);
  if (!rl.ok) {
    const retryAfterSeconds = Math.max(1, Math.ceil(rl.retryAfterMs / 1000));
    return json({ error: "RATE_LIMITED", retryAfterSeconds }, 429, { "Retry-After": String(retryAfterSeconds) });
  }

  const { code: raw } = await ctx.params;
  const code = normalizeVoucherCode(raw);
  if (!VOUCHER_CODE_REGEX.test(code)) return json({ error: "NOT_FOUND" }, 404);

  const voucher = await lookupVoucher(code, { ipHash });
  if (!voucher) return json({ error: "NOT_FOUND" }, 404);

  return json(voucher, 200);
}
