import type { Metadata } from "next";
import { getUnitsForForm } from "@/lib/units";
import { UnitPicker } from "@/components/balcao/UnitPicker";

export const metadata: Metadata = {
  title: "Balcão",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Só repassa para a próxima tela algo com cara de código (evita injetar lixo na URL). */
function safeCode(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && /^[A-Za-z0-9 _-]{1,16}$/.test(v) ? v : undefined;
}

export default async function BalcaoPage({ searchParams }: { searchParams: SearchParams }) {
  const [params, units] = await Promise.all([searchParams, getUnitsForForm()]);
  const code = safeCode(first(params.code));

  return (
    <main id="conteudo" className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6 text-fg">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-semibold tracking-widest text-gold uppercase">Barbearia VIP · Balcão</p>
        <h1 className="text-2xl font-bold">Escolha a sua unidade</h1>
        <p className="text-base text-muted">
          Depois, salve o link da sua unidade na tela inicial do celular para pular esta etapa.
        </p>
      </header>
      <UnitPicker units={units} code={code} />
    </main>
  );
}
