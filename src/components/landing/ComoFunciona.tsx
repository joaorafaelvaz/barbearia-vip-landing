import { site } from "@/content/site";
import { Section } from "@/components/ui/section";

export function ComoFunciona() {
  return (
    <Section id="como-funciona" title={site.howItWorks.title} subtitle={site.howItWorks.subtitle}>
      <ol className="grid gap-4 sm:grid-cols-3 sm:gap-6">
        {site.howItWorks.steps.map((step, index) => (
          <li
            key={step.title}
            className="relative rounded-card border border-line bg-surface p-6 pt-7"
          >
            <span
              aria-hidden="true"
              className="absolute -top-4 left-6 flex size-9 items-center justify-center rounded-full bg-gold font-display text-xl text-ink"
            >
              {index + 1}
            </span>
            <h3 className="text-lg font-semibold text-fg">
              <span className="sr-only">Passo {index + 1}: </span>
              {step.title}
            </h3>
            <p className="mt-2 text-base leading-relaxed text-muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
