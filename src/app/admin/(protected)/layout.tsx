import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { logout } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminRequest())) redirect("/admin/login");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg text-fg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl tracking-wide text-gold">Barbearia VIP</span>
            <span className="text-sm text-muted">Painel da campanha</span>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:border-line-strong hover:text-fg"
            >
              Sair
            </button>
          </form>
        </div>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
