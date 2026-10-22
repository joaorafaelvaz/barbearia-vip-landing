"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

/**
 * Campos de formulário acessíveis: label visível, erro ligado por
 * aria-describedby/aria-invalid, altura mínima de 48px e fonte ≥ 16px
 * (evita zoom automático no iOS).
 */

const controlBase =
  "block w-full rounded-xl border bg-surface-2 px-4 text-[17px] text-fg placeholder:text-muted/70 min-h-13 transition-colors focus:border-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/50 disabled:opacity-60";

function controlClasses(invalid: boolean) {
  return `${controlBase} ${invalid ? "border-danger" : "border-line hover:border-line-strong"}`;
}

type CommonProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
};

export function FieldShell({
  id,
  label,
  error,
  hint,
  children,
}: CommonProps & { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-fg">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, error?: string, hint?: string) {
  const ids = [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

type TextFieldProps = CommonProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id">;

export function TextField({ id, label, error, hint, className = "", ...rest }: TextFieldProps) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${controlClasses(Boolean(error))} ${className}`}
        {...rest}
      />
    </FieldShell>
  );
}

type SelectFieldProps = CommonProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & { children: ReactNode };

export function SelectField({
  id,
  label,
  error,
  hint,
  className = "",
  children,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <div className="relative">
        <select
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={`${controlClasses(Boolean(error))} appearance-none pr-11 ${className}`}
          {...rest}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </FieldShell>
  );
}

type CheckboxFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  id: string;
  error?: string;
  children: ReactNode;
};

export function CheckboxField({ id, error, children, className = "", ...rest }: CheckboxFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed text-fg transition-colors ${
          error ? "border-danger" : "border-line hover:border-line-strong"
        }`}
      >
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`mt-0.5 size-5 shrink-0 cursor-pointer accent-gold ${className}`}
          {...rest}
        />
        <span>{children}</span>
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
