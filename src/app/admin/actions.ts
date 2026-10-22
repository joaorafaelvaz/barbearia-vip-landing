"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { clearAdminSession, isAdminRequest, isValidToken, setAdminSession } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/request-context";

export interface LoginState {
  error?: string;
}

const LOGIN_LIMIT = { limit: 10, windowMs: 15 * 60_000 };

/** Login do painel: valida o token e grava o cookie. O token só é aceito via POST (nunca na query). */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const ip = clientIpFromHeaders(h) ?? "unknown";
  if (!rateLimit(`admin-login:${ip}`, LOGIN_LIMIT).ok) {
    return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }
  const token = String(formData.get("token") ?? "").trim();
  if (!isValidToken(token)) return { error: "Token inválido." };
  await setAdminSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}

export interface CancelVoucherState {
  ok?: boolean;
  message?: string;
  error?: string;
}

const CANCELLED_BY_ADMIN = "CANCELLED_BY_ADMIN";

/** Cancela um voucher ACTIVE (abuso). Recusa USED; CANCELLED é idempotente. Sempre audita. */
export async function cancelVoucher(_prev: CancelVoucherState, formData: FormData): Promise<CancelVoucherState> {
  if (!(await isAdminRequest())) return { error: "Sessão expirada. Entre novamente." };

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return { error: "Informe o código do voucher." };

  const voucher = await prisma.voucher.findUnique({
    where: { code },
    select: { id: true, status: true, lead: { select: { name: true } } },
  });
  if (!voucher) return { error: `Voucher ${code} não encontrado.` };
  if (voucher.status === "USED") return { error: `Voucher ${code} já foi usado; não pode ser cancelado.` };
  if (voucher.status === "CANCELLED") return { ok: true, message: `Voucher ${code} já estava cancelado.` };

  const result = await prisma.$transaction(async (tx) => {
    // Transição atômica: só cancela se ainda estiver ACTIVE (evita corrida com uma queima simultânea).
    const updated = await tx.voucher.updateMany({
      where: { id: voucher.id, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    if (updated.count === 0) return false;
    await tx.voucherAudit.create({
      data: { voucherId: voucher.id, code, action: "REJECTED", reason: CANCELLED_BY_ADMIN },
    });
    return true;
  });

  if (!result) return { error: `Voucher ${code} mudou de estado durante a operação; recarregue e confira.` };

  revalidatePath("/admin");
  return { ok: true, message: `Voucher ${code} (${voucher.lead.name}) cancelado.` };
}
