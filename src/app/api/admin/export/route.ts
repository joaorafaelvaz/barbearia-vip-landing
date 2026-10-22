import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminHeaders } from "@/lib/admin-auth";
import { parsePeriod, toDateInput } from "@/lib/admin-stats";
import { formatDateBr } from "@/lib/date";
import { formatPhoneBr } from "@/lib/phone";
import { getVoucherState } from "@/lib/voucher";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "nome",
  "telefone",
  "email",
  "nascimento",
  "influencer",
  "unidade_preferida",
  "cadastro_em",
  "elegibilidade",
  "sync",
  "id_externo",
  "codigo_voucher",
  "status_voucher",
  "emitido_em",
  "expira_em",
  "usado_em",
  "unidade_uso",
] as const;

const SEP = ";";
const BOM = "﻿";

const DT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "dd/mm/aaaa HH:mm" em Brasília. */
function formatCsvDateTime(d: Date | null | undefined): string {
  if (!d) return "";
  const p: Record<string, string> = {};
  for (const part of DT.formatToParts(d)) if (part.type !== "literal") p[part.type] = part.value;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** Escapa para CSV com `;`: aspas quando preciso e neutraliza fórmulas (=, +, -, @) no Excel. */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function safePhone(e164: string): string {
  try {
    return formatPhoneBr(e164);
  } catch {
    return e164;
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminHeaders(request.headers)) {
    return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="admin"' } });
  }

  const sp = request.nextUrl.searchParams;
  const period = parsePeriod({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const now = new Date();

  const leads = await prisma.lead.findMany({
    where: { createdAt: { gte: period.from, lte: period.to } },
    orderBy: { createdAt: "asc" },
    select: {
      name: true,
      phone: true,
      email: true,
      birthDate: true,
      createdAt: true,
      eligibility: true,
      syncStatus: true,
      externalId: true,
      influencer: { select: { slug: true } },
      preferredUnit: { select: { name: true } },
      voucher: {
        select: {
          code: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          usedAt: true,
          usedUnit: { select: { name: true } },
        },
      },
    },
  });

  const lines = [COLUMNS.join(SEP)];
  for (const l of leads) {
    const v = l.voucher;
    lines.push(
      [
        l.name,
        safePhone(l.phone),
        l.email,
        l.birthDate ? formatDateBr(l.birthDate) : "",
        l.influencer?.slug ?? "",
        l.preferredUnit?.name ?? "",
        formatCsvDateTime(l.createdAt),
        l.eligibility,
        l.syncStatus,
        l.externalId,
        v?.code ?? "",
        v ? getVoucherState(v, now) : "",
        formatCsvDateTime(v?.issuedAt),
        formatCsvDateTime(v?.expiresAt),
        formatCsvDateTime(v?.usedAt),
        v?.usedUnit?.name ?? "",
      ]
        .map(csvCell)
        .join(SEP),
    );
  }

  const filename = `leads-${toDateInput(period.from)}-${toDateInput(period.to)}.csv`;
  return new Response(BOM + lines.join("\r\n") + "\r\n", {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
