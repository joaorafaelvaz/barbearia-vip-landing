import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { normalizeVoucherCode, VOUCHER_CODE_REGEX } from "@/lib/voucher-code";
import { getVoucherState, type VoucherState } from "@/lib/voucher";

export interface VoucherPageData {
  code: string;
  state: VoucherState;
  discountPercent: number;
  issuedAt: Date;
  expiresAt: Date;
  customerFirstName: string;
  usedAt: Date | null;
  usedUnit: { slug: string; name: string } | null;
  preferredUnit: { slug: string; name: string; phone: string | null; phoneType: string | null } | null;
}

export async function getVoucherPageData(codeInput: string): Promise<VoucherPageData | null> {
  const code = normalizeVoucherCode(codeInput);
  if (!VOUCHER_CODE_REGEX.test(code)) return null;
  const v = await prisma.voucher.findUnique({
    where: { code },
    include: {
      usedUnit: { select: { slug: true, name: true } },
      lead: { select: { name: true, preferredUnit: { select: { slug: true, name: true, phone: true, phoneType: true } } } },
    },
  });
  if (!v) return null;
  return {
    code: v.code,
    state: getVoucherState(v),
    discountPercent: v.discountPercent,
    issuedAt: v.issuedAt,
    expiresAt: v.expiresAt,
    customerFirstName: v.lead.name.trim().split(/\s+/)[0] ?? "",
    usedAt: v.usedAt,
    usedUnit: v.usedUnit,
    preferredUnit: v.lead.preferredUnit,
  };
}

/** URL que o QR carrega: a recepção escaneia e cai no balcão com o código preenchido. */
export function balcaoUrlForCode(code: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/balcao?code=${encodeURIComponent(code)}`;
}

/** SVG do QR como string (renderizável inline, sem imagem externa). */
export async function qrSvgForCode(code: string): Promise<string> {
  return QRCode.toString(balcaoUrlForCode(code), { type: "svg", errorCorrectionLevel: "M", margin: 1, width: 240 });
}

/** Texto para o botão "Salvar no WhatsApp". */
export function whatsappShareText(d: Pick<VoucherPageData, "code" | "discountPercent">, expiresLabel: string): string {
  return `Meu voucher Barbearia VIP: ${d.code} (${d.discountPercent}% de desconto, válido até ${expiresLabel}). Apresentar na recepção.`;
}
