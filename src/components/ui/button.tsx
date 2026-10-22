import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex w-full items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-[background-color,transform,opacity] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const variants: Record<Variant, string> = {
  primary: "bg-gold text-ink shadow-gold hover:bg-gold-strong",
  secondary: "border border-line-strong bg-surface text-fg hover:border-gold hover:text-gold",
  ghost: "text-muted underline-offset-4 hover:text-fg hover:underline",
};

const sizes: Record<Size, string> = {
  md: "min-h-12 px-6 text-base",
  lg: "min-h-14 px-8 text-lg",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", extra = "") {
  return [base, variants[variant], sizes[size], extra].filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingText?: string;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  loadingText,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

type ButtonLinkProps = {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
  external?: boolean;
};

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
  external,
}: ButtonLinkProps) {
  const cls = buttonClasses(variant, size, className);
  if (external || href.startsWith("#")) {
    return (
      <a
        href={href}
        className={cls}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
