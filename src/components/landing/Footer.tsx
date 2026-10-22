import Image from "next/image";
import Link from "next/link";
import { fill, site } from "@/content/site";
import { getSiteAsset, isSvgAsset } from "@/lib/site-assets";
import { Container } from "@/components/ui/section";

export function Footer() {
  const logo = getSiteAsset("logo");
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-line bg-bg py-10 text-sm text-muted">
      <Container className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-xs">
          <Image
            src={logo}
            alt={site.brand.name}
            width={150}
            height={40}
            unoptimized={isSvgAsset(logo)}
            className="h-9 w-auto"
          />
          <p className="mt-4 leading-relaxed">{site.footer.tagline}</p>
        </div>

        <nav aria-label="Links do rodapé" className="flex flex-col gap-3">
          {site.footer.links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-gold">
              {link.text}
            </Link>
          ))}
          <a
            href={site.brand.instagram.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gold"
          >
            Instagram {site.brand.instagram.handle}
          </a>
        </nav>

        <div className="sm:text-right">
          <p>{fill(site.footer.legalLine, site.company)}</p>
          <p className="mt-1">{site.company.address}</p>
          <p className="mt-1">
            <a href={`mailto:${site.company.privacyEmail}`} className="hover:text-gold">
              {site.company.privacyEmail}
            </a>
          </p>
          <p className="mt-4">
            © {year} {site.brand.name}. {site.footer.rights}
          </p>
        </div>
      </Container>
    </footer>
  );
}
