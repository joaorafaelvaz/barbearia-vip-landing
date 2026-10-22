export const VOUCHER_VALIDITY_DAYS = 7;
export const DISCOUNT_PERCENT = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Espelha o enum `VoucherStatus` do Prisma. */
export type VoucherStatusDb = "ACTIVE" | "USED" | "CANCELLED";

/** Estado derivado: EXPIRED não é persistido, vem de ACTIVE + expiresAt no passado. */
export type VoucherState = "ACTIVE" | "EXPIRED" | "USED" | "CANCELLED";

type VoucherLike = { status: VoucherStatusDb; expiresAt: Date };

/** issuedAt + 7 × 24h exatos (sem ajuste de fuso ou de horário de verão). */
export function computeExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + VOUCHER_VALIDITY_DAYS * DAY_MS);
}

/** Expirado quando expiresAt <= now (o instante exato já conta como vencido). */
function isExpired(v: VoucherLike, now: Date): boolean {
  return v.expiresAt.getTime() <= now.getTime();
}

export function getVoucherState(v: VoucherLike, now: Date = new Date()): VoucherState {
  if (v.status !== "ACTIVE") return v.status;
  return isExpired(v, now) ? "EXPIRED" : "ACTIVE";
}

/** Só pode ser queimado se estiver ACTIVE e ainda não expirado. */
export function canBurn(v: VoucherLike, now: Date = new Date()): boolean {
  return getVoucherState(v, now) === "ACTIVE";
}
