import { site } from "@/content/site";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Container } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <>
      <Header showCta={false} />
      <main id="conteudo" className="flex flex-1 items-center py-20">
        <Container className="max-w-xl text-center">
          <p className="font-display text-7xl leading-none text-gold">404</p>
          <h1 className="mt-4 font-display text-4xl tracking-wide text-fg">{site.notFound.title}</h1>
          <p className="mt-3 text-base text-muted">{site.notFound.text}</p>
          <div className="mt-8">
            <ButtonLink href="/">{site.notFound.cta}</ButtonLink>
          </div>
        </Container>
      </main>
      <Footer />
    </>
  );
}
