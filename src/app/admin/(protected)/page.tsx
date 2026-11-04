import { alerts, influencerStats, parsePeriod, toDateInput, unitStats } from "@/lib/admin-stats";
import { AlertsPanel } from "@/components/admin/AlertsPanel";
import { CancelVoucherForm } from "@/components/admin/CancelVoucherForm";
import { CreateVoucherForm } from "@/components/admin/CreateVoucherForm";
import { ManualVoucherList } from "@/components/admin/ManualVoucherList";
import { getUnitsForForm, groupUnitsByCity } from "@/lib/units";
import { Card } from "@/components/admin/Card";
import { InfluencerTable, parseSort } from "@/components/admin/InfluencerTable";
import { PendingContent } from "@/components/admin/PendingContent";
import { PeriodFilter } from "@/components/admin/PeriodFilter";
import { UnitTable } from "@/components/admin/UnitTable";
import { fmtInt } from "@/components/admin/format";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = parsePeriod({ from: first(sp.from), to: first(sp.to) });
  const from = toDateInput(period.from);
  const to = toDateInput(period.to);
  const { sort, dir } = parseSort(first(sp.sort), first(sp.dir));

  const [influencers, units, alertData, unitOptions] = await Promise.all([influencerStats(period), unitStats(period), alerts(period), getUnitsForForm()]);
  const exportHref = `/api/admin/export?from=${from}&to=${to}`;
  const activeIdle = units.filter((u) => u.active && u.used === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-wide">Atribuição da campanha</h1>
          <p className="text-sm text-muted">
            Período: {from.split("-").reverse().join("/")} a {to.split("-").reverse().join("/")} (Brasília)
          </p>
        </div>
        <a
          href={exportHref}
          className="rounded-full border border-gold px-4 py-1.5 text-sm font-semibold text-gold hover:bg-gold-soft"
          download
        >
          Exportar CSV
        </a>
      </div>

      <Card title="Período">
        <PeriodFilter from={from} to={to} extra={{ sort, dir }} />
      </Card>

      <AlertsPanel alerts={alertData} />

      <InfluencerTable rows={influencers} sort={sort} dir={dir} query={{ from, to }} />

      <Card
        title="Por unidade"
        description={`Vouchers queimados no período (por usedAt). ${fmtInt(units.length)} unidades; ${fmtInt(activeIdle)} ativas sem nenhuma queima.`}
      >
        <UnitTable rows={units} />
      </Card>

      <Card title="Criar voucher" description="Desconto em % ou em R$, válido apenas na unidade escolhida. O cliente recebe o link ou o código; a recepção queima no balcão com o PIN da unidade.">
        <CreateVoucherForm units={unitOptions} groups={groupUnitsByCity(unitOptions)} />
      </Card>

      <ManualVoucherList />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Cancelar voucher" description="Para abuso. Só vouchers ativos; usados não podem ser cancelados. Fica registrado na auditoria como REJECTED / CANCELLED_BY_ADMIN.">
          <CancelVoucherForm />
        </Card>
        <PendingContent />
      </div>
    </div>
  );
}
