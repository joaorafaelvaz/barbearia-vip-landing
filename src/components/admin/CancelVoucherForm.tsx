"use client";

import { useActionState } from "react";
import { cancelVoucher, type CancelVoucherState } from "@/app/admin/actions";

const initial: CancelVoucherState = {};

export function CancelVoucherForm() {
  const [state, action, pending] = useActionState(cancelVoucher, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Cancelar este voucher? A ação é irreversível e fica registrada na auditoria.")) e.preventDefault();
      }}
      className="space-y-3"
    >
      <div className="flex flex-wrap gap-2">
        <input
          name="code"
          required
          placeholder="VIP-XXXXXX"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 font-mono text-sm uppercase text-fg outline-none focus:border-gold"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-full border border-danger/60 px-4 py-1.5 text-sm font-semibold text-danger hover:bg-danger-bg disabled:opacity-60"
        >
          {pending ? "Cancelando…" : "Cancelar voucher"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok && state.message ? (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
