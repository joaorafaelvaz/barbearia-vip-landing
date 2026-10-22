import Image from "next/image";
import { site } from "@/content/site";
import { getSiteAsset, isSvgAsset } from "@/lib/site-assets";
import { Section } from "@/components/ui/section";

export function Sobre() {
  const unidade = getSiteAsset("unidade");
  return (
    <Section id="sobre" title={site.about.title} tone="surface">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <div>
          {site.about.paragraphs.map((p) => (
            <p key={p} className="mt-4 text-base leading-relaxed text-muted first:mt-0 sm:text-lg">
              {p}
            </p>
          ))}
          <dl className="mt-8 grid grid-cols-3 gap-3">
            {site.about.stats.map((stat) => (
              <div key={stat.label} className="flex flex-col rounded-xl border border-line bg-bg p-4">
                <dt className="order-2 text-xs leading-snug text-muted sm:text-sm">{stat.label}</dt>
                <dd className="font-display text-3xl leading-none text-gold sm:text-4xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-card border border-line">
          <Image
            src={unidade}
            alt={site.about.imageAlt}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            unoptimized={isSvgAsset(unidade)}
            className="object-cover"
          />
        </div>
      </div>
    </Section>
  );
}
