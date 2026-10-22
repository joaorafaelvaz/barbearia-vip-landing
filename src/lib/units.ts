import { prisma } from "@/lib/db";

export type UnitOption = {
  slug: string;
  name: string;
  city: string | null;
  state: string | null;
};

/** Unidades ativas para o select do formulário, ordenadas por UF, cidade e nome. */
export async function getUnitsForForm(): Promise<UnitOption[]> {
  return prisma.unit.findMany({
    where: { active: true },
    select: { slug: true, name: true, city: true, state: true },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
  });
}

/** Agrupa por "Cidade - UF" preservando a ordem. */
export function groupUnitsByCity(units: UnitOption[]): { label: string; units: UnitOption[] }[] {
  const groups = new Map<string, UnitOption[]>();
  for (const u of units) {
    const label = [u.city, u.state].filter(Boolean).join(" - ") || "Outras";
    const arr = groups.get(label) ?? [];
    arr.push(u);
    groups.set(label, arr);
  }
  return [...groups.entries()].map(([label, units]) => ({ label, units }));
}

export type UnitPublic = {
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  phoneType: string | null;
  hours: string | null;
  mapsUrl: string | null;
};

export async function getUnitPublicBySlug(slug: string): Promise<UnitPublic | null> {
  return prisma.unit.findFirst({
    where: { slug, active: true },
    select: {
      slug: true, name: true, address: true, city: true, state: true,
      phone: true, phoneType: true, hours: true, mapsUrl: true,
    },
  });
}
