"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variante = "primario" | "secundario" | "perigo" | "sucesso" | "discreto";

const estilos: Record<Variante, string> = {
  primario: "bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-300",
  sucesso: "bg-green-700 text-white hover:bg-green-800 disabled:bg-green-300",
  perigo: "bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300",
  secundario: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400",
  discreto: "bg-transparent text-blue-800 hover:bg-blue-50 disabled:text-slate-400",
};

export function Botao({
  variante = "primario",
  grande,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; grande?: boolean }) {
  return (
    <button
      {...props}
      className={`${estilos[variante]} ${grande ? "px-6 py-4 text-lg" : "px-4 py-2.5 text-base"} rounded-xl font-semibold shadow-sm transition disabled:cursor-not-allowed ${className}`}
    />
  );
}

export function Cartao({ titulo, children, className = "" }: { titulo?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 ${className}`}>
      {titulo && <h2 className="text-lg font-bold mb-3">{titulo}</h2>}
      {children}
    </section>
  );
}

export function Aviso({ tipo = "info", children }: { tipo?: "info" | "ok" | "atencao" | "erro"; children: ReactNode }) {
  const c = {
    info: "bg-blue-50 border-blue-200 text-blue-900",
    ok: "bg-green-50 border-green-300 text-green-900",
    atencao: "bg-amber-50 border-amber-300 text-amber-900",
    erro: "bg-red-50 border-red-300 text-red-900",
  }[tipo];
  return <div className={`border rounded-xl px-4 py-3 ${c}`}>{children}</div>;
}

export function Selo({ cor, children }: { cor: "verde" | "amarelo" | "vermelho" | "cinza" | "azul"; children: ReactNode }) {
  const c = {
    verde: "bg-green-100 text-green-900 border-green-300",
    amarelo: "bg-amber-100 text-amber-900 border-amber-300",
    vermelho: "bg-red-100 text-red-900 border-red-300",
    cinza: "bg-slate-100 text-slate-700 border-slate-300",
    azul: "bg-blue-100 text-blue-900 border-blue-300",
  }[cor];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-sm font-medium ${c}`}>{children}</span>;
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <p className="text-slate-600 animate-pulse">{texto}</p>;
}
