import type { Metadata } from "next";
import Link from "next/link";
import { fill, site } from "@/content/site";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Container } from "@/components/ui/section";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: { absolute: site.privacy.metaTitle },
  robots: { index: false, follow: true },
};

export default function PrivacidadePage() {
  // PENDENTE: razão social, CNPJ e e-mail de privacidade reais (site.company).
  const vars = site.company;

  return (
    <>
      <Header showCta={false} />
      <main id="conteudo" className="flex-1 py-12 sm:py-16">
        <Container className="max-w-3xl">
          <ProvisionalBanner />

          <h1 className="mt-8 font-display text-5xl leading-none tracking-wide text-fg sm:text-6xl">
            {site.privacy.title}
          </h1>
          <p className="mt-3 text-sm text-muted">
            {site.privacy.updatedLabel}: {site.privacy.updatedAt}
          </p>

          <div className="mt-10 flex flex-col gap-8">
            {site.privacy.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold text-fg">{section.title}</h2>
                {"text" in section && section.text && (
                  <p className="mt-3 text-base leading-relaxed text-muted">{fill(section.text, vars)}</p>
                )}
                {"list" in section && section.list && (
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-muted">
                    {section.list.map((item) => (
                      <li key={item}>{fill(item, vars)}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>

          <p className="mt-10 text-base text-muted">
            Contato para assuntos de privacidade:{" "}
            <a href={`mailto:${vars.privacyEmail}`} className="font-semibold text-gold underline-offset-4 hover:underline">
              {vars.privacyEmail}
            </a>
          </p>

          <div className="mt-10">
            <ProvisionalBanner />
          </div>

          <p className="mt-8">
            <Link href="/" className="font-semibold text-gold underline-offset-4 hover:underline">
              ← {site.privacy.backHome}
            </Link>
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}

function ProvisionalBanner() {
  return (
    <Alert tone="warning">
      <strong className="font-semibold text-gold">Versão provisória.</strong>{" "}
      {site.privacy.provisionalBanner}
    </Alert>
  );
}
