"use client";

import { useActionState, useState } from "react";
import { createVoucherAction, type CreateVoucherState } from "@/app/admin/actions";
import type { UnitOption } from "@/lib/units";

const initial: CreateVoucherState = {};
// PENDENTE: confirmar a lista de serviços oferecidos; o campo aceita qualquer texto.
const SERVICE_SUGGESTIONS = ["Corte de cabelo", "Barba", "Corte + Barba", "Sobrancelha", "Hidratação", "Pigmentação", "Pezinho"];
const input = "w-full rounded-lg border border-line bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-gold";
const label = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted";

function plusDays(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d); // aaaa-mm-dd
}

export function CreateVoucherForm({ units, groups }: { units: UnitOption[]; groups: { label: string; units: UnitOption[] }[] }) {
  const [state, action, pending] = useActionState(createVoucherAction, initial);
  const [type, setType] = useState<"PERCENT" | "AMOUNT" | "SERVICE">("PERCENT");
  const err = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Tipo de desconto
          <select name="discountType" value={type} onChange={(e) => setType(e.target.value as "PERCENT" | "AMOUNT" | "SERVICE")} className={input}>
            <option value="PERCENT">Percentual (%)</option>
            <option value="AMOUNT">Valor em R$</option>
            <option value="SERVICE">Serviço específico (cortesia)</option>
          </select>
        </label>
        <label className={label}>
          {type === "PERCENT" ? "Percentual (1 a 100)" : type === "AMOUNT" ? "Valor (ex.: 20,00)" : "Serviço (ex.: Corte de cabelo)"}
          <input
            name="discountValue"
            required
            inputMode={type === "SERVICE" ? "text" : "decimal"}
            list={type === "SERVICE" ? "servicos-sugeridos" : undefined}
            maxLength={type === "SERVICE" ? 60 : 12}
            placeholder={type === "PERCENT" ? "15" : type === "AMOUNT" ? "20,00" : "Corte de cabelo"}
            className={input}
            aria-invalid={err.discountValue ? true : undefined}
          />
          {type === "SERVICE" && (
            <datalist id="servicos-sugeridos">
              {SERVICE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          )}
          {err.discountValue && <span className="text-xs normal-case text-danger">{err.discountValue}</span>}
        </label>
        <label className={label}>
          Unidade (o voucher só vale nela)
          <select name="unitSlug" required className={input} defaultValue="" aria-invalid={err.unitSlug ? true : undefined}>
            <option value="" disabled>Escolha a unidade</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.units.map((u) => <option key={u.slug} value={u.slug}>{u.name}</option>)}
              </optgroup>
            ))}
          </select>
          {err.unitSlug && <span className="text-xs normal-case text-danger">{err.unitSlug}</span>}
          {units.length === 0 && <span className="text-xs normal-case text-danger">Nenhuma unidade ativa cadastrada.</span>}
        </label>
        <label className={label}>
          Válido até
          <input name="expiresAt" type="date" defaultValue={plusDays(7)} min={plusDays(1)} className={input} aria-invalid={err.expiresAt ? true : undefined} />
          {err.expiresAt && <span className="text-xs normal-case text-danger">{err.expiresAt}</span>}
        </label>
        <label className={label}>
          Nome do cliente (opcional)
          <input name="holderName" maxLength={80} className={input} />
        </label>
        <label className={label}>
          WhatsApp do cliente (opcional)
          <input name="holderPhone" inputMode="tel" placeholder="(48) 99999-9999" className={input} aria-invalid={err.holderPhone ? true : undefined} />
          {err.holderPhone && <span className="text-xs normal-case text-danger">{err.holderPhone}</span>}
        </label>
        <label className={`${label} sm:col-span-2`}>
          Observação interna (opcional)
          <input name="note" maxLength={200} placeholder="ex.: cortesia por atraso no atendimento" className={input} />
        </label>
      </div>
      <button type="submit" disabled={pending || units.length === 0} className="rounded-full bg-gold px-5 py-2 text-sm font-semibold text-ink hover:bg-gold-strong disabled:opacity-60">
        {pending ? "Criando…" : "Criar voucher"}
      </button>
      {state.error && !state.ok && (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</p>
      )}
      {state.ok && state.code && (
        <div role="status" className="rounded-lg border border-success/40 bg-success-bg px-3 py-3 text-sm text-fg">
          <p className="font-mono text-2xl tracking-widest text-gold">{state.code}</p>
          <p className="mt-1 text-muted">{state.summary}</p>
          <p className="mt-2">
            Link para o cliente:{" "}
            <a href={`/voucher/${state.code}`} target="_blank" rel="noreferrer" className="text-gold underline">
              /voucher/{state.code}
            </a>
          </p>
        </div>
      )}
    </form>
  );
}
