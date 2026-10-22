"use server";

import type { EligibilityCheckState } from "./types";
import { FORM_FIELDS } from "./types";
import { getRequestContext } from "@/lib/request-context";
import { runEligibilityStep } from "@/lib/pre-cadastro";

const str = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

/** Etapa 1 do formulário: nome, WhatsApp e unidade. Verifica elegibilidade e grava o lead parcial. */
export async function verificarElegibilidade(_prev: EligibilityCheckState, formData: FormData): Promise<EligibilityCheckState> {
  const ctx = await getRequestContext();
  return runEligibilityStep(
    { name: str(formData, FORM_FIELDS.name), phone: str(formData, FORM_FIELDS.phone), unitSlug: str(formData, FORM_FIELDS.unitSlug) },
    ctx,
  );
}
