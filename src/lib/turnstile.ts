/** Verificação do Cloudflare Turnstile. Sem TURNSTILE_SECRET_KEY (dev/test) a verificação é pulada. */
export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch (e) {
    console.error("turnstile: falha na verificação", e instanceof Error ? e.message : e);
    return false;
  }
}
