import Link from "next/link";
import { site } from "@/content/site";
import { Section } from "@/components/ui/section";

export function Faq() {
  return (
    <Section id="faq" title={site.faq.title} tone="surface">
      <div className="mx-auto max-w-3xl divide-y divide-line rounded-card border border-line bg-bg">
        {site.faq.items.map((item) => (
          <details key={item.q} className="group px-5 py-4 open:bg-surface-2/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-1 text-base font-semibold text-fg [&::-webkit-details-marker]:hidden">
              {item.q}
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-5 shrink-0 text-gold transition-transform group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <p className="pt-2 pb-1 text-base leading-relaxed text-muted">
              {item.a}
              {"link" in item && item.link && (
                <>
                  {" "}
                  <Link href={item.link.href} className="font-semibold text-gold underline-offset-4 hover:underline">
                    {item.link.text}
                  </Link>
                </>
              )}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
