"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { criarPreCadastro } from "@/actions/criar-pre-cadastro";
import { verificarElegibilidade } from "@/actions/verificar-elegibilidade";
import { FORM_FIELDS, type EligibilityCheckState, type PreCadastroState } from "@/actions/types";
import { fill, site } from "@/content/site";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxField, SelectField, TextField } from "@/components/ui/field";

export type UnitGroup = {
  label: string;
  units: { slug: string; name: string }[];
};

type Props = {
  unitGroups: UnitGroup[];
  defaultUnitSlug?: string;
};

type AnalyticsEvent = "form_step1_done" | "form_step2_view" | "form_submit";

const MAX_UNKNOWN_ATTEMPTS = 3;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const F = FORM_FIELDS;
const copy = site.form;

/** Listener de GA4 virá depois; por enquanto só emitimos o evento no window. */
function track(event: AnalyticsEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("bvip:analytics", { detail: { event } }));
}

/** `(DD) 9XXXX-XXXX` — máscara progressiva, só dígitos, máx. 11. */
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** `dd/mm/aaaa` — máscara progressiva, só dígitos, máx. 8. */
export function maskDate(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function isValidDate(value: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!m) return false;
  const [, dd, mm, yyyy] = m.map(Number);
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  const now = new Date();
  return (
    date.getUTCFullYear() === yyyy &&
    date.getUTCMonth() === mm - 1 &&
    date.getUTCDate() === dd &&
    yyyy >= now.getUTCFullYear() - 120 &&
    date.getTime() <= now.getTime()
  );
}

const initialEligibility: EligibilityCheckState = { status: "idle" };
const initialSubmit: PreCadastroState = { status: "idle" };

export function PreCadastroForm({ unitGroups, defaultUnitSlug }: Props) {
  const router = useRouter();
  const uid = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [eligState, eligAction, eligPending] = useActionState(verificarElegibilidade, initialEligibility);
  const [submitState, submitAction, submitPending] = useActionState(criarPreCadastro, initialSubmit);

  // Etapa derivada do resultado da verificação; "Voltar" força a etapa 1 até a próxima verificação.
  const [backToStep1, setBackToStep1] = useState(false);
  const step: 1 | 2 = eligState.status === "eligible" && !backToStep1 ? 2 : 1;

  // Valores controlados só onde há máscara; os demais ficam no DOM (nunca desmontados).
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");

  // Erros de validação feitos no cliente (antes de chamar a action).
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  // Contagem de tentativas quando a API não responde (etapa 1 e etapa 2).
  const [unknownStreak, setUnknownStreak] = useState(0);
  const [unavailableStreak, setUnavailableStreak] = useState(0);

  // Reações a resultados das actions (sem setState: só navegação e analytics).
  useEffect(() => {
    if (eligState.status === "denied") router.push("/ja-cliente");
    if (eligState.status === "eligible") {
      track("form_step1_done");
      track("form_step2_view");
    }
  }, [eligState, router]);

  useEffect(() => {
    if (submitState.status === "denied") router.push("/ja-cliente");
  }, [submitState, router]);

  const serverErrors =
    (step === 1 && eligState.status === "error" ? eligState.fieldErrors : null) ??
    (submitState.status === "error" ? submitState.fieldErrors : null) ??
    {};
  const errors: Record<string, string> = { ...serverErrors, ...clientErrors };

  const formError =
    (eligState.status === "error" && eligState.formError) ||
    (submitState.status === "error" && submitState.formError) ||
    null;

  const unknownAttempts =
    eligState.status === "unknown" ? Math.max(eligState.attempts, unknownStreak) : 0;
  const unknownExhausted = unknownAttempts >= MAX_UNKNOWN_ATTEMPTS;
  const unavailableExhausted =
    submitState.status === "unavailable" && unavailableStreak >= MAX_UNKNOWN_ATTEMPTS;

  const ids = {
    name: `${uid}-name`,
    phone: `${uid}-phone`,
    unit: `${uid}-unit`,
    email: `${uid}-email`,
    birthDate: `${uid}-birth`,
    consent: `${uid}-consent`,
  };

  function readStep1() {
    const form = formRef.current;
    const fd = new FormData(form ?? undefined);
    return {
      name: String(fd.get(F.name) ?? "").trim(),
      phoneDigits: phone.replace(/\D/g, ""),
      unitSlug: String(fd.get(F.unitSlug) ?? ""),
    };
  }

  function validateStep1(): Record<string, string> {
    const { name, phoneDigits, unitSlug } = readStep1();
    const next: Record<string, string> = {};
    if (!name) next[F.name] = copy.validation.nameRequired;
    else if (name.split(/\s+/).filter(Boolean).length < 2) next[F.name] = copy.validation.nameTooShort;
    if (!phoneDigits) next[F.phone] = copy.validation.phoneRequired;
    else if (phoneDigits.length < 10 || phoneDigits.length > 11) next[F.phone] = copy.validation.phoneInvalid;
    if (!unitSlug) next[F.unitSlug] = copy.validation.unitRequired;
    return next;
  }

  function handleContinue() {
    const next = validateStep1();
    setClientErrors(next);
    if (Object.keys(next).length > 0) {
      focusFirstError(next);
      return;
    }
    // Se a tentativa anterior foi "unknown", esta é uma nova tentativa na sequência.
    setUnknownStreak(eligState.status === "unknown" ? unknownStreak + 1 : 1);
    setBackToStep1(false);

    const fd = new FormData();
    const { name, unitSlug } = readStep1();
    fd.set(F.name, name);
    fd.set(F.phone, phone);
    fd.set(F.unitSlug, unitSlug);
    startTransition(() => eligAction(fd));
  }

  function handleBack() {
    setClientErrors({});
    setBackToStep1(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const fd = new FormData(form);
    const email = String(fd.get(F.email) ?? "").trim();
    const consent = fd.get(F.consent);
    const next: Record<string, string> = {};
    if (!email) next[F.email] = copy.validation.emailRequired;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next[F.email] = copy.validation.emailInvalid;
    if (!birthDate) next[F.birthDate] = copy.validation.birthDateRequired;
    else if (!isValidDate(birthDate)) next[F.birthDate] = copy.validation.birthDateInvalid;
    if (!consent) next[F.consent] = copy.validation.consentRequired;

    setClientErrors(next);
    if (Object.keys(next).length > 0) {
      event.preventDefault();
      focusFirstError(next);
      return;
    }
    setUnavailableStreak(submitState.status === "unavailable" ? unavailableStreak + 1 : 1);
    track("form_submit");
    // Sem preventDefault: o <form action={submitAction}> segue com todos os campos (etapas 1 e 2).
  }

  function focusFirstError(errs: Record<string, string>) {
    const order = [F.name, F.phone, F.unitSlug, F.email, F.birthDate, F.consent];
    const first = order.find((k) => errs[k]);
    if (!first) return;
    const el = formRef.current?.elements.namedItem(first);
    if (el instanceof HTMLElement) el.focus();
  }

  function clearError(field: string) {
    if (!clientErrors[field]) return;
    setClientErrors((prev) => {
      const rest = { ...prev };
      delete rest[field];
      return rest;
    });
  }

  const hasUnits = unitGroups.some((g) => g.units.length > 0);

  return (
    <form
      ref={formRef}
      action={submitAction}
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-6"
      data-step={step}
    >
      {/* Sem JS as duas etapas aparecem juntas e o envio vai direto para criarPreCadastro. */}
      <noscript>
        <style>{`[data-step-panel]{display:block!important}[data-js-only]{display:none!important}`}</style>
      </noscript>

      <p className="text-xs font-semibold tracking-[0.2em] text-gold uppercase" aria-live="polite">
        {fill(copy.stepLabel, { current: step, total: 2 })}
      </p>

      {/* ETAPA 1 — permanece no DOM quando escondida para manter valores e ir no FormData final. */}
      <fieldset data-step-panel hidden={step !== 1} className="flex flex-col gap-5" disabled={submitPending}>
        <legend className="mb-1 font-display text-3xl tracking-wide text-fg">{copy.step1.title}</legend>

        <TextField
          id={ids.name}
          name={F.name}
          label={copy.step1.name.label}
          placeholder={copy.step1.name.placeholder}
          autoComplete="name"
          autoCapitalize="words"
          aria-required="true"
          error={errors[F.name]}
          onChange={() => clearError(F.name)}
        />

        <TextField
          id={ids.phone}
          name={F.phone}
          label={copy.step1.phone.label}
          placeholder={copy.step1.phone.placeholder}
          hint={copy.step1.phone.hint}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-required="true"
          maxLength={15}
          value={phone}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setPhone(maskPhone(e.target.value));
            clearError(F.phone);
          }}
          error={errors[F.phone]}
        />

        <SelectField
          id={ids.unit}
          name={F.unitSlug}
          label={copy.step1.unit.label}
          hint={copy.step1.unit.hint}
          defaultValue={defaultUnitSlug ?? ""}
          aria-required="true"
          disabled={!hasUnits}
          error={errors[F.unitSlug]}
          onChange={() => clearError(F.unitSlug)}
        >
          <option value="" disabled>
            {copy.step1.unit.placeholder}
          </option>
          {unitGroups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.units.map((unit) => (
                <option key={unit.slug} value={unit.slug}>
                  {unit.name}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>

        {step === 1 && eligState.status === "unknown" && (
          <Alert tone="warning" role="alert">
            <p>{copy.messages.unknown}</p>
            {unknownExhausted && (
              <p className="mt-1">
                {copy.messages.unknownExhausted}{" "}
                <Link href={copy.messages.unknownExhaustedLink} className="font-semibold text-gold underline-offset-4 hover:underline">
                  {copy.messages.unknownExhaustedLinkText}
                </Link>
                .
              </p>
            )}
          </Alert>
        )}

        {step === 1 && formError && (
          <Alert tone="danger" role="alert">
            {formError}
          </Alert>
        )}

        <div data-js-only>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={handleContinue}
            loading={eligPending}
            loadingText={copy.step1.submitting}
            disabled={!hasUnits || (eligState.status === "unknown" && unknownExhausted)}
          >
            {eligState.status === "unknown" && !unknownExhausted ? copy.messages.retry : copy.step1.submit}
          </Button>
        </div>
      </fieldset>

      {/* ETAPA 2 */}
      <fieldset data-step-panel hidden={step !== 2} className="flex flex-col gap-5">
        <legend className="mb-1 font-display text-3xl tracking-wide text-fg">{copy.step2.title}</legend>
        <p className="text-sm leading-relaxed text-muted">{copy.step2.intro}</p>

        <TextField
          id={ids.email}
          name={F.email}
          label={copy.step2.email.label}
          placeholder={copy.step2.email.placeholder}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          aria-required="true"
          error={errors[F.email]}
          onChange={() => clearError(F.email)}
        />

        <TextField
          id={ids.birthDate}
          name={F.birthDate}
          label={copy.step2.birthDate.label}
          placeholder={copy.step2.birthDate.placeholder}
          hint={copy.step2.birthDate.hint}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          aria-required="true"
          maxLength={10}
          value={birthDate}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setBirthDate(maskDate(e.target.value));
            clearError(F.birthDate);
          }}
          error={errors[F.birthDate]}
        />

        <CheckboxField
          id={ids.consent}
          name={F.consent}
          value="on"
          aria-required="true"
          error={errors[F.consent]}
          onChange={() => clearError(F.consent)}
        >
          <ConsentLabel />
        </CheckboxField>

        {/* Honeypot: pessoas não veem nem alcançam; bots preenchem. */}
        <div className="hp-field" aria-hidden="true">
          <label htmlFor={`${uid}-website`}>Website</label>
          <input
            id={`${uid}-website`}
            type="text"
            name={F.honeypot}
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>

        {TURNSTILE_SITE_KEY && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="lazyOnload" />
            <div
              className="cf-turnstile"
              data-sitekey={TURNSTILE_SITE_KEY}
              data-theme="dark"
              data-response-field-name={F.turnstileToken}
            />
          </>
        )}

        {submitState.status === "unavailable" && (
          <Alert tone="warning" role="alert">
            <p>{copy.messages.unknown}</p>
            {unavailableExhausted && (
              <p className="mt-1">
                {copy.messages.unknownExhausted}{" "}
                <Link href={copy.messages.unknownExhaustedLink} className="font-semibold text-gold underline-offset-4 hover:underline">
                  {copy.messages.unknownExhaustedLinkText}
                </Link>
                .
              </p>
            )}
          </Alert>
        )}

        {submitState.status === "expired" && (
          <Alert tone="danger" role="alert">
            {copy.messages.expired}
          </Alert>
        )}

        {step === 2 && formError && (
          <Alert tone="danger" role="alert">
            {formError}
          </Alert>
        )}

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            loading={submitPending}
            loadingText={copy.step2.submitting}
            disabled={submitState.status === "expired" || unavailableExhausted}
          >
            {submitState.status === "unavailable" && !unavailableExhausted ? copy.messages.retry : copy.step2.submit}
          </Button>
          <div data-js-only>
            <Button type="button" variant="ghost" className="w-full" onClick={handleBack} disabled={submitPending}>
              {copy.step2.back}
            </Button>
          </div>
        </div>
      </fieldset>

      <p className="text-center text-xs text-muted">{copy.messages.secure}</p>
    </form>
  );
}

function ConsentLabel() {
  const [before, after] = copy.step2.consent.label.split("{link}");
  return (
    <>
      {before}
      <Link href="/privacidade" target="_blank" className="font-semibold text-gold underline underline-offset-4">
        {copy.step2.consent.linkText}
      </Link>
      {after}
    </>
  );
}
