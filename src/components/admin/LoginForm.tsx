"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/admin/actions";

const initial: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="token" className="mb-1 block text-sm text-muted">
          Token de acesso
        </label>
        <input
          id="token"
          name="token"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
          className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-fg outline-none focus:border-gold"
        />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-gold px-4 py-2 font-semibold text-ink hover:bg-gold-strong disabled:opacity-60"
      >
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
