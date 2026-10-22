import type { Alerts } from "@/lib/admin-stats";
import { Card, Pill, tableClass, tdClass, thClass, numClass } from "./Card";
import { fmtInt } from "./format";

export function AlertsPanel({ alerts }: { alerts: Alerts }) {
  const hasUnknown = alerts.unknownOlderThan1h > 0;
  const hasFailed = alerts.failedValidation > 0;
  const rejectedTotal = alerts.rejectedByReason.reduce((s, r) => s + r.count, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Elegibilidade pendente" tone={hasUnknown ? "warning" : "default"}>
        <p className="font-display text-4xl text-fg">{fmtInt(alerts.unknownOlderThan1h)}</p>
        <p className="mt-1 text-sm text-muted">
          {hasUnknown
            ? "leads UNKNOWN há mais de 1 h. A API da Barbearia VIP pode estar fora ou ter mudado; o cron re-verifica automaticamente."
            : "Nenhum lead UNKNOWN com mais de 1 h."}
        </p>
      </Card>

      <Card title="Falha de sincronização" tone={hasFailed ? "warning" : "default"}>
        <p className="font-display text-4xl text-fg">{fmtInt(alerts.failedValidation)}</p>
        <p className="mt-1 text-sm text-muted">
          {hasFailed
            ? "leads com syncStatus FAILED (erro de validação na API). Corrigir manualmente; veja syncError no export."
            : "Nenhum lead com falha de validação."}
        </p>
      </Card>

      <Card title="Tentativas rejeitadas" description="Por motivo e unidade, no período" tone={rejectedTotal > 0 ? "warning" : "default"}>
        {alerts.rejectedByReason.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma tentativa rejeitada no período.</p>
        ) : (
          <div className="max-h-56 overflow-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>Motivo</th>
                  <th className={thClass}>Unidade</th>
                  <th className={`${thClass} text-right`}>Qtd.</th>
                </tr>
              </thead>
              <tbody>
                {alerts.rejectedByReason.map((r) => (
                  <tr key={`${r.reason}|${r.unitName ?? ""}`}>
                    <td className={tdClass}>
                      <Pill tone={r.reason === "BAD_PIN" ? "danger" : "muted"}>{r.reason}</Pill>
                    </td>
                    <td className={tdClass}>{r.unitName ?? <span className="text-muted">sem unidade</span>}</td>
                    <td className={`${tdClass} ${numClass}`}>{fmtInt(r.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
