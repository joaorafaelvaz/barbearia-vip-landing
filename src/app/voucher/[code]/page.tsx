import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fill, site } from "@/content/site";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Container } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CopyCodeButton } from "@/components/CopyCodeButton";
import { getVoucherPageData, qrSvgForCode, whatsappShareText } from "@/lib/voucher-page";
import { formatDateBr, formatDateTimeBr } from "@/lib/date";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: site.voucher.metaTitle },
  robots: { index: false, follow: false },
};

const stateStyles = {
  ACTIVE: "border-success/40 bg-success-bg text-success",
  EXPIRED: "border-danger/40 bg-danger-bg text-danger",
  USED: "border-line-strong bg-surface-2 text-muted",
  CANCELLED: "border-danger/40 bg-danger-bg text-danger",
} as const;

export default async function VoucherPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const v = await getVoucherPageData(code);
  if (!v) notFound();

  const t = site.voucher;
  const active = v.state === "ACTIVE";
  const expiresLabel = formatDateTimeBr(v.expiresAt);
  const qr = active ? await qrSvgForCode(v.code, v.restrictedUnit?.slug) : null;
  const shareHref = `https://wa.me/?text=${encodeURIComponent(whatsappShareText(v, expiresLabel))}`;
  // PENDENTE: destino do "Agendar agora". Usa o WhatsApp da unidade de referência se for celular; senão, site.booking.url.
  const unitWa = v.preferredUnit?.phone && v.preferredUnit.phoneType === "celular" ? `https://wa.me/55${v.preferredUnit.phone}` : null;
  const bookHref = unitWa ?? site.booking.url;

  return (
    <>
      <Header showCta={false} />
      <main id="conteudo" className="flex-1 py-10 sm:py-16">
        <Container className="max-w-xl">
          <div className="rounded-card border border-line bg-surface p-6 sm:p-10">
            <p className="text-sm font-semibold tracking-[0.2em] text-gold uppercase">{t.eyebrow}</p>
            <h1 className="mt-3 font-display text-5xl leading-none tracking-wide text-fg sm:text-6xl">{t.title}</h1>
            <p className="mt-4 text-base leading-relaxed text-muted">{fill(t.greeting, { name: v.customerFirstName })}</p>

            <div className="mt-8 rounded-xl border border-line-strong bg-bg p-5 text-center">
              <p className="font-display text-4xl tracking-[0.15em] text-gold sm:text-5xl" data-testid="voucher-code">{v.code}</p>
              <p className="mt-2 text-xl font-semibold text-fg">{fill(t.discount, { label: v.discountLabel })}</p>
              <span className={`mt-4 inline-block rounded-full border px-3 py-1 text-sm font-semibold ${stateStyles[v.state]}`} data-testid="voucher-state">
                {t.states[v.state]}
              </span>
              <p className="mt-3 text-sm text-muted">{fill(t.validUntil, { date: expiresLabel })}</p>
              <p className="text-xs text-muted">{fill(t.issuedAt, { date: formatDateBr(v.issuedAt) })}</p>
            </div>

            {v.restrictedUnit && <Alert tone="warning" className="mt-6">{fill(t.restrictedNote, { unit: v.restrictedUnit.name })}</Alert>}

            {v.state === "USED" && v.usedAt && (
              <Alert className="mt-6">{fill(t.usedAt, { date: formatDateTimeBr(v.usedAt), unit: v.usedUnit?.name ?? "" })}</Alert>
            )}
            {v.state === "EXPIRED" && <Alert tone="danger" className="mt-6">{t.expiredNote}</Alert>}
            {v.state === "CANCELLED" && <Alert tone="danger" className="mt-6">{t.cancelledNote}</Alert>}

            {qr && (
              <div className="mt-8 flex justify-center">
                <div className="rounded-xl bg-white p-3" aria-label="QR code do voucher" role="img" dangerouslySetInnerHTML={{ __html: qr }} />
              </div>
            )}

            <div className="mt-8 flex flex-col gap-3">
              {active && <ButtonLink href={shareHref} size="lg" external>{t.share}</ButtonLink>}
              <CopyCodeButton code={v.code} />
              <ButtonLink href={bookHref} variant="secondary" external={/^https?:/.test(bookHref)}>{t.book}</ButtonLink>
              {v.preferredUnit && <p className="text-center text-xs text-muted">{fill(t.bookHint, { unit: v.preferredUnit.name })}</p>}
            </div>

            <div className="mt-8 border-t border-line pt-6">
              <h2 className="text-sm font-semibold tracking-[0.15em] text-gold uppercase">{t.rulesTitle}</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                {t.rules.map((r) => (
                  <li key={r}>• {v.restrictedUnit && r.includes("qualquer unidade") ? `Uso único, apenas na unidade ${v.restrictedUnit.name}.` : r}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-center text-sm text-muted">
            <Link href="/meu-voucher" className="underline-offset-4 hover:text-fg hover:underline">{t.lostLink}</Link>
          </p>
        </Container>
      </main>
      <Footer />
    </>
  );
}
