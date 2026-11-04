"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  CODE_INPUT_REGEX,
  STATE_LABEL,
  conflictMessage,
  discountText,
  fetchBurn,
  fetchLookup,
  fullDateTime,
  minutesLabel,
  normalizeCodeInput,
  usedLine,
  useStoredOperator,
  useStoredPin,
  writeLastUnit,
  writeOperator,
  writePin,
  type BurnOutcome,
  type UnitRef,
  type VoucherLookupJson,
} from "./balcao-client";

type Props = { unit: UnitRef; initialCode?: string };

const PIN_REGEX = /^\d{6}$/;

const STATE_STYLE: Record<VoucherLookupJson["state"], string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  USED: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40",
  EXPIRED: "bg-red-500/15 text-red-300 border-red-500/40",
  CANCELLED: "bg-red-500/15 text-red-300 border-red-500/40",
};

const inputClass =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-fg placeholder:text-muted";
const primaryButton =
  "min-h-12 w-full rounded-xl bg-gold px-4 py-3 text-base font-bold text-ink disabled:opacity-50";
const secondaryButton =
  "min-h-12 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base font-semibold text-fg";

export function BalcaoConsole({ unit, initialCode }: Props) {
  // undefined = ainda no servidor/hidratação (evita piscar o passo 1 em quem já tem PIN salvo)
  const pin = useStoredPin(unit.slug);
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  const operator = useStoredOperator();

  const [codeDraft, setCodeDraft] = useState(initialCode ? normalizeCodeInput(initialCode) : "");
  const [lookup, setLookup] = useState<VoucherLookupJson | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const [burning, setBurning] = useState(false);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [burnOk, setBurnOk] = useState<Extract<BurnOutcome, { kind: "ok" }> | null>(null);

  const codeInputRef = useRef<HTMLInputElement>(null);
  const autoValidated = useRef(false);

  // Lembra a última unidade usada neste aparelho (atalho em /balcao).
  useEffect(() => {
    writeLastUnit(unit);
  }, [unit]);

  const validate = useCallback(async (raw: string) => {
    const code = normalizeCodeInput(raw);
    setLookup(null);
    setBurnError(null);
    setBurnOk(null);
    if (!CODE_INPUT_REGEX.test(code)) {
      setLookupError("Código inválido. Formato esperado: VIP-XXXXXX (6 letras ou números).");
      return;
    }
    setCodeDraft(code);
    setLookupError(null);
    setLooking(true);
    const r = await fetchLookup(code);
    setLooking(false);
    switch (r.kind) {
      case "ok":
        setLookup(r.voucher);
        break;
      case "not_found":
        setLookupError("Voucher não encontrado. Confira o código com o cliente.");
        break;
      case "rate_limited":
        setLookupError(`Muitas consultas seguidas. Aguarde ${minutesLabel(r.retryAfterSeconds)} e tente de novo.`);
        break;
      default:
        setLookupError("Não foi possível consultar agora. Verifique a conexão e tente de novo.");
    }
  }, []);

  // Código vindo do QR (?code=): valida sozinho assim que o PIN estiver disponível.
  useEffect(() => {
    if (pin && initialCode && !autoValidated.current) {
      autoValidated.current = true;
      void validate(initialCode);
    }
  }, [pin, initialCode, validate]);

  function submitPin(e: FormEvent) {
    e.preventDefault();
    const value = pinDraft.trim();
    if (!PIN_REGEX.test(value)) {
      setPinError("O PIN tem 6 dígitos.");
      return;
    }
    writePin(unit.slug, value);
    setPinDraft("");
    setPinError(null);
  }

  function forgetPin(message: string | null) {
    writePin(unit.slug, null);
    setPinError(message);
  }

  function submitCode(e: FormEvent) {
    e.preventDefault();
    void validate(codeDraft);
  }

  function nextCustomer() {
    setCodeDraft("");
    setLookup(null);
    setLookupError(null);
    setBurnError(null);
    setBurnOk(null);
    codeInputRef.current?.focus();
  }

  async function burn() {
    if (!lookup || !pin) return;
    const ok = window.confirm(
      `Aplicar ${discountText(lookup)} para ${lookup.customerFirstName || "o cliente"} e queimar o voucher ${lookup.code}?\n\nIsso não pode ser desfeito.`,
    );
    if (!ok) return;
    setBurning(true);
    setBurnError(null);
    const op = operator.trim();
    const r = await fetchBurn(lookup.code, { unit: unit.slug, pin, ...(op ? { operator: op.slice(0, 60) } : {}) });
    setBurning(false);
    switch (r.kind) {
      case "ok":
        setBurnOk(r);
        setLookup({ ...lookup, state: "USED", usedAt: r.usedAt, usedUnit: r.unit });
        break;
      case "bad_pin":
        forgetPin("PIN incorreto. Digite o PIN da unidade de novo.");
        break;
      case "locked":
        setBurnError(
          `Unidade bloqueada por ${minutesLabel(r.retryAfterSeconds)} depois de 5 PINs errados. Confira o PIN com o responsável e tente depois.`,
        );
        break;
      case "not_found":
        setBurnError("Voucher não encontrado. Confira o código com o cliente.");
        break;
      case "conflict":
        setBurnError(conflictMessage(r));
        if (r.reason !== "WRONG_UNIT") {
          setLookup({
            ...lookup,
            state: r.reason === "ALREADY_USED" ? "USED" : r.reason,
            usedAt: r.usedAt ?? lookup.usedAt,
            usedUnit: r.usedUnit ?? lookup.usedUnit,
          });
        }
        break;
      default:
        setBurnError("Não foi possível queimar o voucher agora. Verifique a conexão e tente de novo.");
    }
  }

  // ------------------------------------------------------------ cabeçalho fixo

  const header = (
    <header className="flex items-center justify-between gap-3 border-b border-line pb-3">
      <p className="text-base leading-tight">
        <span className="block text-sm text-muted">Você está em:</span>
        <span className="font-bold text-gold">{unit.name}</span>
      </p>
      <Link href="/balcao" className="shrink-0 rounded-lg border border-line px-3 py-2 text-base text-fg">
        trocar unidade
      </Link>
    </header>
  );

  if (pin === undefined) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <p className="text-base text-muted">Carregando…</p>
      </div>
    );
  }

  // ------------------------------------------------------------ passo 1: PIN

  if (!pin) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <form onSubmit={submitPin} className="flex flex-col gap-4" noValidate>
          <h1 className="text-xl font-bold">PIN da unidade</h1>
          <p className="text-base text-muted">
            Digite o PIN de 6 dígitos desta recepção. Ele fica salvo só nesta aba, até você fechar o navegador.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-base">PIN</span>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
              aria-invalid={pinError ? true : undefined}
            />
          </label>
          {pinError && (
            <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-base text-red-200">
              {pinError}
            </p>
          )}
          <button type="submit" className={primaryButton}>
            Entrar
          </button>
        </form>
      </div>
    );
  }

  // ------------------------------------------------------------ passos 2 e 3

  const canBurn = lookup?.state === "ACTIVE" && !burnOk;

  return (
    <div className="flex flex-col gap-6">
      {header}

      {burnOk ? (
        <section
          aria-live="polite"
          className="flex flex-col gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-5"
        >
          <h1 className="text-xl font-bold text-emerald-200">Desconto aplicado</h1>
          <p className="text-base text-fg">
            {discountText(burnOk)} para <strong>{burnOk.customerFirstName || "o cliente"}</strong>. Voucher{" "}
            <strong>{burnOk.code}</strong> queimado.
          </p>
          <p className="text-base text-fg">
            {fullDateTime(burnOk.usedAt)} · {burnOk.unit.name}
            {operator.trim() ? ` · por ${operator.trim()}` : ""}
          </p>
          <button type="button" onClick={nextCustomer} className={primaryButton}>
            Próximo cliente
          </button>
        </section>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-3" noValidate>
          <label className="flex flex-col gap-2">
            <span className="text-base">Código do voucher</span>
            <input
              ref={codeInputRef}
              type="text"
              autoFocus
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="VIP-XXXXXX"
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value.toUpperCase())}
              className={`${inputClass} font-mono text-xl tracking-widest`}
              aria-invalid={lookupError ? true : undefined}
            />
          </label>
          <button type="submit" disabled={looking || !codeDraft.trim()} className={primaryButton}>
            {looking ? "Consultando…" : "Validar"}
          </button>
          {lookupError && (
            <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-base text-red-200">
              {lookupError}
            </p>
          )}
        </form>
      )}

      {lookup && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-muted">Cliente</p>
              <p className="text-2xl font-bold">{lookup.customerFirstName || "—"}</p>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-base font-bold ${STATE_STYLE[lookup.state]}`}>
              {STATE_LABEL[lookup.state]}
            </span>
          </div>
          <p className="text-lg font-semibold text-gold">{discountText(lookup)}</p>
          {lookup.restrictedUnit && (
            <p className={`rounded-xl border px-3 py-2 text-base ${lookup.restrictedUnit.slug === unit.slug ? "border-line text-muted" : "border-red-500/40 bg-red-500/15 text-red-200"}`}>
              {lookup.restrictedUnit.slug === unit.slug
                ? `Voucher exclusivo desta unidade (${lookup.restrictedUnit.name}).`
                : `Atenção: este voucher só vale na unidade ${lookup.restrictedUnit.name}.`}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
            <dt className="text-muted">Código</dt>
            <dd className="font-mono">{lookup.code}</dd>
            <dt className="text-muted">Válido até</dt>
            <dd>{fullDateTime(lookup.expiresAt)}</dd>
            {lookup.state === "USED" && (
              <>
                <dt className="text-muted">Situação</dt>
                <dd>{usedLine(lookup.usedAt, lookup.usedUnit)}</dd>
              </>
            )}
          </dl>

          {burnError && (
            <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-base text-red-200">
              {burnError}
            </p>
          )}

          {canBurn && (
            <>
              <label className="flex flex-col gap-2">
                <span className="text-base text-muted">Seu nome (opcional)</span>
                <input
                  type="text"
                  maxLength={60}
                  autoComplete="name"
                  value={operator}
                  onChange={(e) => writeOperator(e.target.value)}
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                onClick={() => void burn()}
                disabled={burning}
                className={`${primaryButton} min-h-16 text-lg`}
              >
                {burning ? "Queimando…" : "Aplicar desconto e queimar voucher"}
              </button>
            </>
          )}

          {!canBurn && !burnOk && (
            <button type="button" onClick={nextCustomer} className={secondaryButton}>
              Próximo cliente
            </button>
          )}
        </section>
      )}

      <p className="text-sm text-muted">
        <button type="button" onClick={() => forgetPin(null)} className="underline">
          Sair (apagar PIN desta aba)
        </button>
      </p>
    </div>
  );
}
