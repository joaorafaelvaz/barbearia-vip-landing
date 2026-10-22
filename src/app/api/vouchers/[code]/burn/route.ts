import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashIp } from "@/lib/hash";
import { clientIpFromHeaders } from "@/lib/request-context";
import { verifyUnitPin } from "@/lib/unit-auth";
import { normalizeVoucherCode } from "@/lib/voucher-code";
import {
  burnVoucher,
  clearPinFailures,
  isPinLocked,
  recordPinFailure,
  recordRejectedAttempt,
} from "@/lib/voucher-service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

const bodySchema = z.object({
  unit: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  pin: z.string().regex(/^\d{6}$/),
  operator: z.string().trim().max(60).optional(),
});

/**
 * Queima do voucher com o PIN da unidade.
 * 1. bloqueio por força bruta (5 PINs errados em 15 min por unidade + IP) → 429 LOCKED
 * 2. PIN inválido (unidade inexistente, inativa ou PIN errado) → 401 BAD_PIN, sem revelar o motivo
 * 3. queima atômica → 200, 404 (código inexistente) ou 409 (expirado, já usado, cancelado)
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: raw } = await ctx.params;
  const code = normalizeVoucherCode(raw);
  const ipHash = hashIp(clientIpFromHeaders(request.headers));

  let parsed: z.infer<typeof bodySchema>;
  try {
    const result = bodySchema.safeParse(await request.json());
    if (!result.success) return json({ error: "BAD_REQUEST", issues: z.flattenError(result.error).fieldErrors }, 400);
    parsed = result.data;
  } catch {
    return json({ error: "BAD_REQUEST" }, 400);
  }
  const { unit: unitSlug, pin, operator } = parsed;

  // 1. Bloqueio: checado ANTES de verificar o PIN, para que nem o PIN certo passe enquanto bloqueado.
  const lock = isPinLocked(unitSlug, ipHash);
  if (lock.locked) {
    await recordRejectedAttempt({ codeInput: code, unitSlug, reason: "LOCKED", ipHash });
    return json({ error: "LOCKED", retryAfterSeconds: lock.retryAfterSeconds }, 429, {
      "Retry-After": String(lock.retryAfterSeconds),
    });
  }

  // 2. PIN contra a unidade informada.
  const auth = await verifyUnitPin(unitSlug, pin);
  if (!auth.ok) {
    recordPinFailure(unitSlug, ipHash);
    await recordRejectedAttempt({ codeInput: code, unitSlug, reason: "BAD_PIN", ipHash });
    return json({ error: "BAD_PIN" }, 401);
  }
  clearPinFailures(unitSlug, ipHash);

  // 3. Queima atômica.
  const result = await burnVoucher(code, auth.unit, operator ?? null, ipHash);
  if (result.ok) return json(result, 200);
  if (result.reason === "NOT_FOUND") return json({ ok: false, reason: "NOT_FOUND" }, 404);
  return json({ ok: false, reason: result.reason, usedAt: result.usedAt ?? null, usedUnit: result.usedUnit ?? null }, 409);
}
