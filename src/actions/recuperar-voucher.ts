"use server";

import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/request-context";
import { recoverVoucher, type RecoveryResult } from "@/lib/voucher-recovery";

export type RecoveryState = Exclude<RecoveryResult, { status: "found" }> | { status: "idle" };

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

export async function recuperarVoucher(_prev: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const ctx = await getRequestContext();
  const r = await recoverVoucher({ phone: str(formData, "phone"), birthDate: str(formData, "birthDate") }, ctx.ipHash);
  if (r.status === "found") redirect(`/voucher/${r.code}`);
  return r;
}
