"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { UnitOption } from "@/lib/units";
import { parseUnitRef, useLastUnitRaw } from "./balcao-client";

/** Remove acentos e baixa a caixa para busca tolerante ("florianopolis" acha "Florianópolis"). */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function UnitPicker({ units, code }: { units: UnitOption[]; code?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const lastUnitRaw = useLastUnitRaw();
  const lastUnit = useMemo(() => {
    const last = parseUnitRef(lastUnitRaw);
    return last && units.some((u) => u.slug === last.slug) ? last : null;
  }, [lastUnitRaw, units]);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return units;
    return units.filter((u) => fold([u.name, u.city ?? "", u.state ?? ""].join(" ")).includes(q));
  }, [units, query]);

  const hrefFor = (slug: string) => `/balcao/${encodeURIComponent(slug)}${code ? `?code=${encodeURIComponent(code)}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      {lastUnit && !query && (
        <button
          type="button"
          onClick={() => router.push(hrefFor(lastUnit.slug))}
          className="min-h-12 rounded-xl border border-gold bg-gold-soft px-4 py-3 text-left text-base font-semibold text-gold"
        >
          Continuar em {lastUnit.name}
          <span className="block text-sm font-normal text-muted">última unidade usada neste aparelho</span>
        </button>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-base text-muted">Buscar unidade</span>
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nome, bairro ou cidade"
          autoComplete="off"
          className="min-h-12 rounded-xl border border-line bg-surface px-4 text-base text-fg placeholder:text-muted"
        />
      </label>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-4 text-base text-muted">
          Nenhuma unidade encontrada para “{query}”.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Unidades">
          {filtered.map((u) => (
            <li key={u.slug}>
              <button
                type="button"
                onClick={() => router.push(hrefFor(u.slug))}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left text-base text-fg active:border-gold"
              >
                <span className="font-medium">{u.name}</span>
                {(u.city || u.state) && (
                  <span className="shrink-0 text-sm text-muted">{[u.city, u.state].filter(Boolean).join(" - ")}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
