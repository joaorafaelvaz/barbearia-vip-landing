"use client";

import { useActionState } from "react";
import { site } from "@/content/site";
import { recuperarVoucher, type RecoveryState } from "@/actions/recuperar-voucher";
import { Button, ButtonLink } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";

const t = site.meuVoucher;

export function MeuVoucherForm() {
  const [state, action, pending] = useActionState<RecoveryState, FormData>(recuperarVoucher, { status: "idle" });
  const fieldErrors = state.status === "invalid" ? state.fieldErrors : {};
  const message =
    state.status === "not_found" ? t.notFound
    : state.status === "pending" ? t.pending
    : state.status === "denied" ? t.denied
    : state.status === "rate_limited" ? t.rateLimited
    : null;

  return (
    <form action={action} className="space-y-5" noValidate>
      <TextField id="phone" name="phone" label={t.phoneLabel} type="tel" inputMode="tel" autoComplete="tel-national"
        placeholder="(11) 91234-5678" error={fieldErrors.phone} required />
      <TextField id="birthDate" name="birthDate" label={t.birthLabel} inputMode="numeric" autoComplete="bday"
        placeholder="dd/mm/aaaa" error={fieldErrors.birthDate} required />
      {message && <Alert tone={state.status === "denied" ? "warning" : "info"} role="alert">{message}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" loading={pending} loadingText="Buscando…">{t.submit}</Button>
        {state.status === "not_found" && <ButtonLink href="/#cadastro" variant="ghost">{t.backHome}</ButtonLink>}
      </div>
    </form>
  );
}
