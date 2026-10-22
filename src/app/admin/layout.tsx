import type { Metadata } from "next";

/** Painel interno: nunca indexar (vale para /admin e /admin/login). A proteção fica em (protected)/layout.tsx. */
export const metadata: Metadata = {
  title: { absolute: "Painel | Barbearia VIP" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
