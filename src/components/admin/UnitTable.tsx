"use client";

import { useMemo, useState } from "react";
import type { UnitRow } from "@/lib/admin-stats";
import { Pill, numClass, tableClass, tdClass, thClass } from "./Card";
import { fmtDateTime, fmtDayShort, fmtInt } from "./format";

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function UnitTable({ rows }: { rows: UnitRow[] }) {
  const [q, setQ] = useState("");
  const [onlyIdle, setOnlyIdle] = useState(false);

  const filtered = useMemo(() => {
    const needle = normalize(q.trim());
    return rows.filter((r) => {
      if (onlyIdle && !(r.active && r.used === 0)) return false;
      if (!needle) return true;
      return normalize(`${r.name} ${r.city ?? ""} ${r.state ?? ""} ${r.slug}`).includes(needle);
    });
  }, [rows, q, onlyIdle]);

  const idleActive = rows.filter((r) => r.active && r.used === 0).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar unidade por nome, cidade ou UF"
          aria-label="Buscar unidade"
          className="w-full max-w-xs rounded-lg border border-line bg-bg px-3 py-1.5 text-sm text-fg outline-none focus:border-gold"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyIdle} onChange={(e) => setOnlyIdle(e.target.checked)} className="accent-gold" />
          Só ativas sem queima no período
          <Pill tone={idleActive > 0 ? "danger" : "success"}>{fmtInt(idleActive)}</Pill>
        </label>
        <span className="ml-auto text-xs text-muted">
          {fmtInt(filtered.length)} de {fmtInt(rows.length)} unidades
        </span>
      </div>

      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Unidade</th>
              <th className={thClass}>Cidade/UF</th>
              <th className={`${thClass} text-right`}>Usados</th>
              <th className={thClass}>Por dia</th>
              <th className={thClass}>Última queima</th>
              <th className={thClass}>Principais influencers</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const idle = r.active && r.used === 0;
              return (
                <tr key={r.slug} className={idle ? "bg-danger-bg/40" : r.active ? "" : "text-muted"}>
                  <td className={tdClass}>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${r.active ? "text-fg" : ""}`}>{r.name}</span>
                      {!r.active ? <Pill>inativa</Pill> : null}
                      {idle ? <Pill tone="danger">sem queima</Pill> : null}
                    </div>
                    <div className="text-xs text-muted">/balcao/{r.slug}</div>
                  </td>
                  <td className={tdClass}>{[r.city, r.state].filter(Boolean).join(" / ") || "–"}</td>
                  <td className={`${tdClass} ${numClass} font-semibold ${r.used > 0 ? "text-success" : ""}`}>{fmtInt(r.used)}</td>
                  <td className={`${tdClass} max-w-xs whitespace-normal text-xs text-muted`}>
                    {r.usedByDay.length === 0 ? "–" : r.usedByDay.map((d) => `${fmtDayShort(d.day)}: ${d.count}`).join(" · ")}
                  </td>
                  <td className={`${tdClass} text-muted`}>{fmtDateTime(r.lastUsedAt)}</td>
                  <td className={`${tdClass} max-w-xs whitespace-normal text-xs`}>
                    {r.byInfluencer.length === 0
                      ? "–"
                      : r.byInfluencer
                          .slice(0, 3)
                          .map((i) => `${i.name} (${i.count})`)
                          .join(", ") + (r.byInfluencer.length > 3 ? ` +${r.byInfluencer.length - 3}` : "")}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td className={`${tdClass} text-muted`} colSpan={6}>
                  Nenhuma unidade encontrada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
