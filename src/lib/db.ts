import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient() {
  const connectionString =
    process.env.NODE_ENV === "test"
      ? process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL
      : process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL não definida");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
