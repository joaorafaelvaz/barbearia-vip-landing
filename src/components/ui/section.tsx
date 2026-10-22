import type { ReactNode } from "react";

/** Container com gutter de 16px no celular e largura máxima no desktop. */
export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</div>;
}

export function Section({
  id,
  title,
  subtitle,
  children,
  className = "",
  tone = "default",
}: {
  id?: string;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  tone?: "default" | "surface";
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`scroll-mt-20 py-14 sm:py-20 ${tone === "surface" ? "bg-surface" : ""} ${className}`}
    >
      <Container>
        {(title || subtitle) && (
          <header className="mb-8 max-w-2xl sm:mb-12">
            {title && (
              <h2
                id={headingId}
                className="font-display text-4xl leading-none tracking-wide text-fg sm:text-5xl"
              >
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-3 text-base text-muted sm:text-lg">{subtitle}</p>}
          </header>
        )}
        {children}
      </Container>
    </section>
  );
}
