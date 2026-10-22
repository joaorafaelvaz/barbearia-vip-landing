import type { Metadata } from "next";
import { site } from "@/content/site";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Container } from "@/components/ui/section";
import { MeuVoucherForm } from "@/components/MeuVoucherForm";

export const metadata: Metadata = {
  title: { absolute: site.meuVoucher.metaTitle },
  robots: { index: false, follow: false },
};

export default function MeuVoucherPage() {
  return (
    <>
      <Header showCta={false} />
      <main id="conteudo" className="flex flex-1 items-center py-16 sm:py-24">
        <Container className="max-w-xl">
          <div className="rounded-card border border-line bg-surface p-6 sm:p-10">
            <h1 className="font-display text-5xl leading-none tracking-wide text-fg">{site.meuVoucher.title}</h1>
            <p className="mt-4 mb-8 text-base leading-relaxed text-muted">{site.meuVoucher.text}</p>
            <MeuVoucherForm />
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
