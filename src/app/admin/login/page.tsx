import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { LoginForm } from "@/components/admin/LoginForm";

export const dynamic = "force-dynamic";

/**
 * Login do painel. O token só entra pelo formulário (POST via server action);
 * `?token=` na URL é ignorado de propósito, para não vazar em logs e histórico.
 */
export default async function AdminLoginPage() {
  if (await isAdminRequest()) redirect("/admin");

  return (
    <main id="conteudo" className="flex flex-1 items-center justify-center bg-bg px-4 py-12 text-fg">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-6">
        <p className="font-display text-3xl tracking-wide text-gold">Barbearia VIP</p>
        <h1 className="mt-1 text-lg font-semibold">Painel da campanha</h1>
        <p className="mb-6 text-sm text-muted">Acesso restrito à equipe. Informe o token de administração.</p>
        <LoginForm />
      </div>
    </main>
  );
}
