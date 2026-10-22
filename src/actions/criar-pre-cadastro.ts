"use server";

import type { PreCadastroState } from "./types";

/**
 * Submissão final do formulário (etapas 1 + 2). Em sucesso redireciona para /voucher/[code].
 * STUB: implementação real na lane E (Tarefa 6 do plano).
 */
export async function criarPreCadastro(
  _prev: PreCadastroState,
  _formData: FormData,
): Promise<PreCadastroState> {
  throw new Error("criarPreCadastro ainda não implementada");
}
