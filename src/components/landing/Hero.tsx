import Image from "next/image";
import { fill, site } from "@/content/site";
import { getSiteAsset, isSvgAsset } from "@/lib/site-assets";
import { Container } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";

export type HeroInfluencer = { name: string; handle: string | null } | null;

export function Hero({ influencer }: { influencer: HeroInfluencer }) {
  const hero = getSiteAsset("hero");
  const badge = influencer
    ? influencer.handle
      ? fill(site.hero.referralBadge, { handle: influencer.handle.replace(/^@/, "") })
      : fill(site.hero.referralBadgeFallback, { name: influencer.name })
    : null;

  return (
    <section className="relative isolate overflow-hidden" aria-labelledby="hero-title">
      <Image
        src={hero}
        alt=""
        fill
        priority
        sizes="100vw"
        unoptimized={isSvgAsset(hero)}
        className="-z-20 object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-b from-bg/40 via-bg/60 to-bg"
      />

      <Container className="flex min-h-[calc(100svh-4rem)] flex-col justify-center py-16 sm:py-24">
        <div className="max-w-2xl">
          {badge && (
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold/50 bg-gold-soft px-4 py-2 text-sm font-semibold text-gold">
              <span aria-hidden="true" className="size-2 rounded-full bg-gold" />
              {badge}
            </p>
          )}
          <p className="text-sm font-semibold tracking-[0.2em] text-gold uppercase">
            {site.hero.eyebrow}
          </p>
          <h1
            id="hero-title"
            className="mt-4 font-display text-[3.25rem] leading-[0.95] tracking-wide text-fg sm:text-7xl lg:text-8xl"
          >
            {site.hero.headline}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted sm:text-xl">
            {site.hero.subtitle}
          </p>
          <div className="mt-8">
            <ButtonLink href="#cadastro" size="lg">
              {site.hero.cta}
            </ButtonLink>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            {site.hero.highlights.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckIcon />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4 text-gold"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path d="m4 10 4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
