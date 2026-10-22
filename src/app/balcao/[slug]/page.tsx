import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUnitPublicBySlug } from "@/lib/units";
import { BalcaoConsole } from "@/components/balcao/BalcaoConsole";

export const metadata: Metadata = {
  title: "Balcão",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeCode(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && /^[A-Za-z0-9 _-]{1,16}$/.test(v) ? v : undefined;
}

export default async function BalcaoUnitPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();

  const unit = await getUnitPublicBySlug(slug);
  if (!unit) notFound();

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 text-fg">
      <BalcaoConsole unit={{ slug: unit.slug, name: unit.name }} initialCode={safeCode(first(sp.code))} />
    </main>
  );
}
