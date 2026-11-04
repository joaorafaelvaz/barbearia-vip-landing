"use client";

import { useActionState, useEffect, useState } from "react";
import { createVoucherAction, type CreateVoucherState } from "@/app/admin/actions";
import type { UnitOption } from "@/lib/units";

const initial: CreateVoucherState = {};
type Servico = { id: number; nome: string };
type ServicesState = { status: "idle" | "loading" | "ok" | "error"; servicos: Servico[] };
const OTHER = "__other__";
const input = "w-full rounded-lg border border-line bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-gold";
const label = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted";

function plusDays(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d); // aaaa-mm-dd
}

export function CreateVoucherForm({ units, groups }: { units: UnitOption[]; groups: { label: string; units: UnitOption[] }[] }) {
  const [state, action, pending] = useActionState(createVoucherAction, initial);
  const [type, setType] = useState<"PERCENT" | "AMOUNT" | "SERVICE">("PERCENT");
  const [unitSlug, setUnitSlug] = useState("");
  const [services, setServices] = useState<ServicesState>({ status: "idle", servicos: [] });
  const [pick, setPick] = useState(OTHER);
  const err = state.fieldErrors ?? {};

  // Serviços da unidade (API da Barbearia VIP, via rota do painel) quando o tipo é "serviço".
  useEffect(() => {
    if (type !== "SERVICE" || !unitSlug) return;
    const ctrl = new AbortController();
    fetch(`/api/admin/servicos?unit=${encodeURIComponent(unitSlug)}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { servicos?: Servico[] };
        const list = Array.isArray(data.servicos) ? data.servicos : [];
        setServices({ status: "ok", servicos: list });
        setPick(list.length ? `${list[0].id}|${list[0].nome}` : OTHER);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === "AbortError") return;
        setServices({ status: "error", servicos: [] });
        setPick(OTHER);
      });
    return () => ctrl.abort();
  }, [type, unitSlug]);

  const showFreeText = type !== "SERVICE" || pick === OTHER;

  function changeType(next: "PERCENT" | "AMOUNT" | "SERVICE") {
    setType(next);
    if (next === "SERVICE" && unitSlug) setServices({ status: "loading", servicos: [] });
  }
  function changeUnit(next: string) {
    setUnitSlug(next);
    if (type === "SERVICE" && next) setServices({ status: "loading", servicos: [] });
  }

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Tipo de desconto
          <select name="discountType" value={type} onChange={(e) => changeType(e.target.value as "PERCENT" | "AMOUNT" | "SERVICE")} className={input}>
            <option value="PERCENT">Percentual (%)</option>
            <option value="AMOUNT">Valor em R$</option>
            <option value="SERVICE">Serviço específico (cortesia)</option>
          </select>
        </label>
        <label className={label}>
          {type === "PERCENT" ? "Percentual (1 a 100)" : type === "AMOUNT" ? "Valor (ex.: 20,00)" : "Serviço"}
          {type === "SERVICE" && (
            <>
              <select name="servicePick" value={pick} onChange={(e) => setPick(e.target.value)} className={input} disabled={!unitSlug || services.status === "loading"}>
                {!unitSlug && <option value={OTHER}>Escolha a unidade primeiro</option>}
                {unitSlug && services.status === "loading" && <option value={OTHER}>Carregando serviços…</option>}
                {services.servicos.map((sv) => <option key={sv.id} value={`${sv.id}|${sv.nome}`}>{sv.nome}</option>)}
                {unitSlug && services.status !== "loading" && <option value={OTHER}>Outro (digitar)</option>}
              </select>
              {services.status === "error" && <span className="text-xs normal-case text-danger">Não foi possível carregar os serviços da unidade; digite o nome abaixo.</span>}
              {services.status === "ok" && services.servicos.length === 0 && <span className="text-xs normal-case text-muted">A unidade não tem serviços cadastrados no app; digite o nome abaixo.</span>}
            </>
          )}
          <input
            name="discountValue"
            required={showFreeText}
            inputMode={type === "SERVICE" ? "text" : "decimal"}
            maxLength={type === "SERVICE" ? 60 : 12}
            placeholder={type === "PERCENT" ? "15" : type === "AMOUNT" ? "20,00" : "Nome do serviço"}
            className={`${input} ${showFreeText ? "" : "hidden"}`}
            aria-hidden={!showFreeText}
            aria-invalid={err.discountValue ? true : undefined}
          />
          {err.discountValue && <span className="text-xs normal-case text-danger">{err.discountValue}</span>}
        </label>
        <label className={label}>
          Unidade (o voucher só vale nela)
          <select name="unitSlug" required className={input} value={unitSlug} onChange={(e) => changeUnit(e.target.value)} aria-invalid={err.unitSlug ? true : undefined}>
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
