/**
 * Contratos compartilhados entre o formulário (cliente) e as server actions.
 * Definidos aqui para que UI e ações possam ser desenvolvidas em paralelo.
 */

/** Resultado da etapa 1 do formulário: verificação de elegibilidade por telefone. */
export type EligibilityCheckState =
  | { status: "idle" }
  | { status: "eligible" }
  | { status: "denied" } // já é cliente com consumo → UI redireciona para /ja-cliente
  | { status: "unknown"; attempts: number } // API indisponível → UI oferece tentar de novo
  | { status: "error"; fieldErrors: Record<string, string>; formError?: string };

/** Resultado da submissão final. Em caso de sucesso a action faz redirect para /voucher/[code] e nunca retorna. */
export type PreCadastroState =
  | { status: "idle" }
  | { status: "denied" }
  | { status: "unavailable" } // elegibilidade não pôde ser confirmada; lead salvo, sem voucher
  | { status: "expired" } // telefone já tem voucher expirado; não emite outro
  | { status: "error"; fieldErrors: Record<string, string>; formError?: string };

/** Campos do formulário (names dos inputs). */
export const FORM_FIELDS = {
  name: "name",
  phone: "phone",
  unitSlug: "unitSlug",
  email: "email",
  birthDate: "birthDate", // dd/mm/aaaa
  consent: "consent",
  honeypot: "website",
  captchaToken: "g-recaptcha-response",
} as const;
