/**
 * Google reCAPTCHA v3 (invisível, com score). Sem RECAPTCHA_SECRET_KEY (dev/test) a verificação é pulada.
 * Chaves: https://www.google.com/recaptcha/admin (tipo v3, domínios: indicacao.barbeariavip.com.br e localhost).
 */
export const RECAPTCHA_ACTION = "pre_cadastro";

export async function verifyRecaptcha(
  token: string | null | undefined,
  ip: string | null,
  expectedAction = RECAPTCHA_ACTION,
): Promise<boolean> {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const minScore = Number(process.env.RECAPTCHA_MIN_SCORE ?? "0.5");
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { success?: boolean; score?: number; action?: string; "error-codes"?: string[] };
    if (!json.success) {
      console.warn("recaptcha: recusado", json["error-codes"]);
      return false;
    }
    if (json.action && json.action !== expectedAction) return false;
    if (typeof json.score === "number" && json.score < minScore) {
      console.warn("recaptcha: score baixo", json.score);
      return false;
    }
    return true;
  } catch (e) {
    console.error("recaptcha: falha na verificação", e instanceof Error ? e.message : e);
    return false;
  }
}
