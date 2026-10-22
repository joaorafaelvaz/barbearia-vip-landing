import Image from "next/image";
import Link from "next/link";
import { site } from "@/content/site";
import { getSiteAsset, isSvgAsset } from "@/lib/site-assets";
import { Container } from "@/components/ui/section";

export function Header({ showCta = true }: { showCta?: boolean }) {
  const logo = getSiteAsset("logo");
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center" aria-label={site.brand.name}>
          <Image
            src={logo}
            alt={site.brand.name}
            width={150}
            height={40}
            priority
            unoptimized={isSvgAsset(logo)}
            className="h-9 w-auto"
          />
        </Link>
        {showCta && (
          <a
            href="#cadastro"
            className="inline-flex min-h-10 items-center rounded-full bg-gold px-4 text-sm font-semibold text-ink hover:bg-gold-strong"
          >
            {site.nav.ctaShort}
          </a>
        )}
      </Container>
    </header>
  );
}
