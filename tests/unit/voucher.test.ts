import { describe, expect, it } from "vitest";
import {
  DISCOUNT_PERCENT,
  VOUCHER_VALIDITY_DAYS,
  canBurn,
  computeExpiresAt,
  getVoucherState,
} from "@/lib/voucher";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-22T12:00:00Z");
const past = new Date(now.getTime() - 1);
const future = new Date(now.getTime() + 1);

describe("constantes", () => {
  it("7 dias de validade e 10% de desconto", () => {
    expect(VOUCHER_VALIDITY_DAYS).toBe(7);
    expect(DISCOUNT_PERCENT).toBe(10);
  });
});

describe("computeExpiresAt", () => {
  it("soma exatamente 7 × 24h em milissegundos", () => {
    const issuedAt = new Date("2026-10-22T18:32:11.123Z");
    const expiresAt = computeExpiresAt(issuedAt);
    expect(expiresAt.getTime() - issuedAt.getTime()).toBe(7 * DAY_MS);
    expect(expiresAt.toISOString()).toBe("2026-10-29T18:32:11.123Z");
  });

  it("não muta a data de emissão", () => {
    const issuedAt = new Date("2026-10-22T00:00:00Z");
    computeExpiresAt(issuedAt);
    expect(issuedAt.toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });
});

describe("getVoucherState", () => {
  it("ACTIVE com expiresAt no passado → EXPIRED", () => {
    expect(getVoucherState({ status: "ACTIVE", expiresAt: past }, now)).toBe("EXPIRED");
  });

  it("ACTIVE com expiresAt no futuro → ACTIVE", () => {
    expect(getVoucherState({ status: "ACTIVE", expiresAt: future }, now)).toBe("ACTIVE");
  });

  it("limite exato: expiresAt === now → EXPIRED", () => {
    expect(getVoucherState({ status: "ACTIVE", expiresAt: new Date(now) }, now)).toBe("EXPIRED");
  });

  it("USED → USED mesmo se expirado", () => {
    expect(getVoucherState({ status: "USED", expiresAt: past }, now)).toBe("USED");
    expect(getVoucherState({ status: "USED", expiresAt: future }, now)).toBe("USED");
  });

  it("CANCELLED → CANCELLED mesmo se expirado", () => {
    expect(getVoucherState({ status: "CANCELLED", expiresAt: past }, now)).toBe("CANCELLED");
    expect(getVoucherState({ status: "CANCELLED", expiresAt: future }, now)).toBe("CANCELLED");
  });

  it("usa a hora atual quando `now` é omitido", () => {
    const farFuture = new Date(Date.now() + 365 * DAY_MS);
    const farPast = new Date(Date.now() - 365 * DAY_MS);
    expect(getVoucherState({ status: "ACTIVE", expiresAt: farFuture })).toBe("ACTIVE");
    expect(getVoucherState({ status: "ACTIVE", expiresAt: farPast })).toBe("EXPIRED");
  });
});

describe("canBurn", () => {
  it("true só para ACTIVE não expirado", () => {
    expect(canBurn({ status: "ACTIVE", expiresAt: future }, now)).toBe(true);
  });

  it("false para ACTIVE expirado, inclusive no limite exato", () => {
    expect(canBurn({ status: "ACTIVE", expiresAt: past }, now)).toBe(false);
    expect(canBurn({ status: "ACTIVE", expiresAt: new Date(now) }, now)).toBe(false);
  });

  it("false para USED e CANCELLED", () => {
    expect(canBurn({ status: "USED", expiresAt: future }, now)).toBe(false);
    expect(canBurn({ status: "CANCELLED", expiresAt: future }, now)).toBe(false);
  });
});
