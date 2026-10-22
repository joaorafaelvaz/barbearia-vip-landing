import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/content/site";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Container } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: site.jaCliente.metaTitle },
  robots: { index: false, follow: false },
};

export default function JaClientePage() {
  // PENDENTE: site.booking.url é "#" até o cliente enviar o link de agendamento/WhatsApp.
  const bookingUrl = site.booking.url;
  const isExternal = /^https?:\/\//.test(bookingUrl);

  return (
    <>
      <Header showCta={false} />
      <main id="conteudo" className="flex flex-1 items-center py-16 sm:py-24">
        <Container className="max-w-2xl">
          <div className="rounded-card border border-line bg-surface p-6 sm:p-10">
            <p className="text-sm font-semibold tracking-[0.2em] text-gold uppercase">
              {site.brand.name}
            </p>
            <h1 className="mt-3 font-display text-5xl leading-none tracking-wide text-fg sm:text-6xl">
              {site.jaCliente.title}
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-muted">{site.jaCliente.text}</p>
            <p className="mt-3 text-base leading-relaxed text-muted">{site.jaCliente.loyaltyNote}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ButtonLink href={bookingUrl} size="lg" external={isExternal}>
                {site.booking.label}
              </ButtonLink>
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center px-4 text-base font-semibold text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                {site.jaCliente.backHome}
              </Link>
            </div>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
