"use server";

import type { EligibilityCheckState } from "./types";

/**
 * Etapa 1 do formulário. Recebe FormData com `phone` e `unitSlug`.
 * STUB: implementação real na lane E (Tarefa 5b/6 do plano).
 */
export async function verificarElegibilidade(
  _prev: EligibilityCheckState,
  _formData: FormData,
): Promise<EligibilityCheckState> {
  throw new Error("verificarElegibilidade ainda não implementada");
}
