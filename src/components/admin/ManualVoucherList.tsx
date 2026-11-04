import { listManualVouchers } from "@/lib/manual-voucher";
import { formatDiscount, getVoucherState } from "@/lib/voucher";
import { Card, Pill, tableClass, tdClass, thClass } from "@/components/admin/Card";
import { fmtDateTime } from "@/components/admin/format";

const tone = { ACTIVE: "success", USED: "muted", EXPIRED: "danger", CANCELLED: "danger" } as const;
const labelOf = { ACTIVE: "ativo", USED: "usado", EXPIRED: "expirado", CANCELLED: "cancelado" } as const;

export async function ManualVoucherList() {
  const rows = await listManualVouchers(30);
  return (
    <Card title="Vouchers manuais" description="Últimos 30 criados pelo painel. Cada um vale só na unidade indicada.">
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nenhum voucher manual criado ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Código</th><th className={thClass}>Desconto</th><th className={thClass}>Unidade</th>
                <th className={thClass}>Cliente</th><th className={thClass}>Situação</th><th className={thClass}>Válido até</th>
                <th className={thClass}>Criado em</th><th className={thClass}>Obs.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const st = getVoucherState({ status: r.status, expiresAt: r.expiresAt });
                return (
                  <tr key={r.code}>
                    <td className={`${tdClass} font-mono`}><a href={`/voucher/${r.code}`} target="_blank" rel="noreferrer" className="hover:text-gold">{r.code}</a></td>
                    <td className={tdClass}>{formatDiscount(r.discount)}</td>
                    <td className={tdClass}>{r.unit?.name ?? "—"}</td>
                    <td className={tdClass}>{r.holderName ?? "—"}</td>
                    <td className={tdClass}><Pill tone={tone[st]}>{labelOf[st]}</Pill>{st === "USED" && r.usedAt ? <span className="ml-2 text-xs text-muted">{fmtDateTime(r.usedAt)}</span> : null}</td>
                    <td className={tdClass}>{fmtDateTime(r.expiresAt)}</td>
                    <td className={tdClass}>{fmtDateTime(r.issuedAt)}<span className="ml-1 text-xs text-muted">{r.createdBy}</span></td>
                    <td className={`${tdClass} max-w-[16rem] truncate`} title={r.note ?? ""}>{r.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
