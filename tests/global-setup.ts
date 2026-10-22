import "dotenv/config";
import { execSync } from "node:child_process";

// Aplica as migrations no banco de TESTE uma vez por execução do vitest (não destrutivo).
// Testes que usam banco limpam as tabelas via resetDb() (ver tests/db.ts).
export default function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST não definida (ver .env.example)");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
