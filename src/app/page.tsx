import { cookies } from "next/headers";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { ComoFunciona } from "@/components/landing/ComoFunciona";
import { FormSection } from "@/components/landing/FormSection";
import { Sobre } from "@/components/landing/Sobre";
import { Regras } from "@/components/landing/Regras";
import { Faq } from "@/components/landing/Faq";
import { Footer } from "@/components/landing/Footer";
import { getActiveInfluencerBySlug } from "@/lib/influencers";
import { getUnitsForForm, groupUnitsByCity, type UnitOption } from "@/lib/units";

// Mesmo valor de `REF_COOKIE` em src/lib/attribution.ts (lane paralela); duplicado aqui
// de propósito para a landing não depender daquele módulo enquanto ele é escrito.
const REF_COOKIE = "bvip_ref";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-_]{0,63}$/i;
function safeSlug(value: string | undefined): string | undefined {
  return value && SLUG_RE.test(value) ? value : undefined;
}

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const [cookieStore, params] = await Promise.all([cookies(), searchParams]);

  // First-touch: o cookie gravado na primeira visita tem prioridade sobre o ?ref= atual.
  const refSlug = safeSlug(cookieStore.get(REF_COOKIE)?.value) ?? safeSlug(first(params.ref));
  const defaultUnitSlug = safeSlug(first(params.unidade));

  const [influencer, units] = await Promise.all([
    getActiveInfluencerBySlug(refSlug).catch((err: unknown) => {
      console.error("[landing] falha ao buscar influencer", err);
      return null;
    }),
    getUnitsForForm().catch((err: unknown): UnitOption[] => {
      console.error("[landing] falha ao buscar unidades", err);
      return [];
    }),
  ]);

  const unitGroups = groupUnitsByCity(units).map((g) => ({
    label: g.label,
    units: g.units.map((u) => ({ slug: u.slug, name: u.name })),
  }));

  const unitPreselected =
    defaultUnitSlug && units.some((u) => u.slug === defaultUnitSlug) ? defaultUnitSlug : undefined;

  return (
    <>
      <Header />
      <main id="conteudo" className="flex-1">
        <Hero influencer={influencer} />
        <ComoFunciona />
        <FormSection unitGroups={unitGroups} defaultUnitSlug={unitPreselected} />
        <Sobre />
        <Regras />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
