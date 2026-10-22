import type { ReactNode } from "react";

type Tone = "danger" | "warning" | "info";

const tones: Record<Tone, string> = {
  danger: "border-danger/40 bg-danger-bg text-danger",
  warning: "border-gold/40 bg-gold-soft text-fg",
  info: "border-line bg-surface-2 text-muted",
};

export function Alert({
  tone = "info",
  children,
  className = "",
  role = "status",
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
