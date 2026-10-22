import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { safeEqualHex } from "@/lib/hash";

export const PIN_REGEX = /^\d{6}$/;

/** sha256(PIN_SALT:pin) em hex. O PIN nunca é gravado em texto puro. */
export function hashPin(pin: string): string {
  const salt = process.env.PIN_SALT;
  if (!salt) throw new Error("PIN_SALT não definida");
  return createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

export function verifyPinHash(pin: string, pinHash: string): boolean {
  if (!PIN_REGEX.test(pin)) return false;
  return safeEqualHex(hashPin(pin), pinHash);
}

export type UnitAuthResult =
  | { ok: true; unit: { id: string; slug: string; name: string; externalId: number } }
  | { ok: false; reason: "BAD_FORMAT" | "UNIT_NOT_FOUND" | "UNIT_INACTIVE" | "BAD_PIN" };

/**
 * Valida o PIN contra UMA unidade (nunca procura "qual unidade tem este PIN"),
 * para não multiplicar as chances de um chute por força bruta.
 */
export async function verifyUnitPin(unitSlug: string, pin: string): Promise<UnitAuthResult> {
  if (!PIN_REGEX.test(pin)) return { ok: false, reason: "BAD_FORMAT" };
  const unit = await prisma.unit.findUnique({
    where: { slug: unitSlug },
    select: { id: true, slug: true, name: true, externalId: true, active: true, pinHash: true },
  });
  if (!unit) return { ok: false, reason: "UNIT_NOT_FOUND" };
  if (!unit.active) return { ok: false, reason: "UNIT_INACTIVE" };
  if (!verifyPinHash(pin, unit.pinHash)) return { ok: false, reason: "BAD_PIN" };
  const { id, slug, name, externalId } = unit;
  return { ok: true, unit: { id, slug, name, externalId } };
}
