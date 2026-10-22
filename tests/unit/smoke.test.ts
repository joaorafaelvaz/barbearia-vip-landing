import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../db";

describe("infra", () => {
  it("conecta no banco de teste", async () => {
    await resetDb();
    expect(await prisma.unit.count()).toBe(0);
  });
});
