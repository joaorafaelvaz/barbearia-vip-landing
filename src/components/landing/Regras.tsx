import { site } from "@/content/site";
import { Section } from "@/components/ui/section";

export function Regras() {
  return (
    <Section id="regras" title={site.rules.title}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {site.rules.items.map((rule) => (
          <li
            key={rule}
            className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-base leading-relaxed text-fg"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="mt-1 size-5 shrink-0 text-gold"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
