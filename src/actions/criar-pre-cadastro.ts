"use server";

import { redirect } from "next/navigation";
import type { PreCadastroState } from "./types";
import { FORM_FIELDS } from "./types";
import { getRequestContext } from "@/lib/request-context";
import { runPreCadastro } from "@/lib/pre-cadastro";
import { verifyTurnstile } from "@/lib/turnstile";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

/** Submissão final (etapas 1 + 2). Em sucesso redireciona para /voucher/[code]. */
export async function criarPreCadastro(_prev: PreCadastroState, formData: FormData): Promise<PreCadastroState> {
  const ctx = await getRequestContext();

  const turnstileOk = await verifyTurnstile(str(formData, FORM_FIELDS.turnstileToken) || null, ctx.ip);
  if (!turnstileOk) return { status: "error", fieldErrors: {}, formError: "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo." };

  const outcome = await runPreCadastro(
    {
      name: str(formData, FORM_FIELDS.name),
      phone: str(formData, FORM_FIELDS.phone),
      unitSlug: str(formData, FORM_FIELDS.unitSlug),
      email: str(formData, FORM_FIELDS.email),
      birthDate: str(formData, FORM_FIELDS.birthDate),
      consent: formData.get(FORM_FIELDS.consent) === "on" || formData.get(FORM_FIELDS.consent) === "true",
      honeypot: str(formData, FORM_FIELDS.honeypot),
    } as Parameters<typeof runPreCadastro>[0],
    ctx,
  );

  if (outcome.status === "redirect") redirect(`/voucher/${outcome.code}`);
  return outcome;
}
