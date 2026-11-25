import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compras Express",
  description: "Lance notas fiscais e prints de compras na sua planilha em minutos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="bg-white border-b border-slate-200 print:hidden">
          <nav className="mx-auto max-w-[1600px] px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="text-xl font-bold text-blue-800">
              🧾 Compras Express
            </Link>
            <div className="flex gap-1 text-base">
              <Link href="/" className="px-3 py-2 rounded-lg hover:bg-slate-100">
                Início
              </Link>
              <Link href="/configurar" className="px-3 py-2 rounded-lg hover:bg-slate-100">
                Planilha
              </Link>
              <Link href="/relatorios" className="px-3 py-2 rounded-lg hover:bg-slate-100">
                Relatórios
              </Link>
              <Link href="/historico" className="px-3 py-2 rounded-lg hover:bg-slate-100">
                Histórico
              </Link>
              <Link href="/ajuda" className="px-3 py-2 rounded-lg hover:bg-slate-100">
                Ajuda
              </Link>
              <Link href="/verificar" className="px-3 py-2 rounded-lg hover:bg-slate-100">
                Verificar
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1 mx-auto w-full max-w-[1600px] px-4 py-6">{children}</main>
        <footer className="text-center text-sm text-slate-500 py-4 print:hidden">
          Funciona só neste computador. Os arquivos ficam aqui; veja em Ajuda o que é enviado para fora.
        </footer>
      </body>
    </html>
  );
}
