"use client";

/**
 * Gráficos simples em HTML (sem biblioteca), seguindo o guia de visualização:
 * uma série = um tom (azul), barras finas (<= 24px) com ponta arredondada e base reta,
 * valor na ponta, grade/eixos discretos, tooltip no passar do mouse e no foco do teclado,
 * e sempre uma tabela com os mesmos números.
 */
import { useState } from "react";
import { formatarMoeda } from "@/lib/texto";

const SERIE = "#257de0"; // azul (validado: contraste 4,1:1 sobre branco)
const CONTEXTO = "#b4b4b4"; // cinza de apoio (meses anteriores)
const GRADE = "#e7e7e7";
const EIXO = "#c2c2c2";

export interface ItemBarra {
  nome: string;
  total: number;
  percentual: number;
  linhas: number;
}

function Dica({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="tooltip"
      className="absolute z-20 -top-2 left-0 -translate-y-full whitespace-nowrap rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-black/10 pointer-events-none"
    >
      {children}
    </div>
  );
}

/** Barras horizontais ranqueadas (maior primeiro), uma cor, valor na ponta. */
export function BarrasRanqueadas({ itens, rotulo }: { itens: ItemBarra[]; rotulo: string }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const max = Math.max(...itens.map((i) => i.total), 0);
  if (!itens.length) return <p className="text-slate-600">Nenhuma compra com valor neste mês.</p>;
  return (
    <ul className="space-y-2" aria-label={rotulo}>
      {itens.map((it, i) => {
        const largura = max > 0 ? Math.max(0.5, (it.total / max) * 100) : 0;
        return (
          <li
            key={it.nome}
            tabIndex={0}
            className="grid grid-cols-[minmax(7rem,14rem)_1fr] items-center gap-3 rounded-md outline-offset-2 focus-visible:outline-2"
            onPointerEnter={() => setAtivo(i)}
            onPointerLeave={() => setAtivo(null)}
            onFocus={() => setAtivo(i)}
            onBlur={() => setAtivo(null)}
            aria-label={`${it.nome}: ${formatarMoeda(it.total)}, ${it.percentual.toLocaleString("pt-BR")}% do mês, ${it.linhas} linha(s)`}
          >
            <span className="truncate text-sm text-slate-800" title={it.nome}>
              {it.nome}
            </span>
            <span className="relative flex items-center py-1">
              {ativo === i && (
                <Dica>
                  <b className="text-slate-900">{formatarMoeda(it.total)}</b>
                  <span className="text-slate-600">
                    {" "}
                    · {it.percentual.toLocaleString("pt-BR")}% do mês · {it.linhas} linha(s)
                  </span>
                </Dica>
              )}
              {/* Área da barra: proporcional ao maior valor; os 7,5rem à direita ficam para o valor. */}
              <span className="flex items-center gap-2" style={{ width: "calc(100% - 7.5rem)" }}>
                <span
                  className="block h-5 flex-none rounded-r transition-[filter] print:[print-color-adjust:exact]"
                  style={{
                    width: `${largura}%`,
                    background: SERIE,
                    filter: ativo === i ? "brightness(1.12)" : undefined,
                  }}
                />
                <span className="flex-none text-sm tabular-nums text-slate-800 whitespace-nowrap">{formatarMoeda(it.total)}</span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function teto(n: number): number {
  if (n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}

const eixo = (n: number) =>
  n >= 10000
    ? `R$ ${n.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })}`
    : `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;

export function rotuloMes(mes: string, longo = false): string {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", longo ? { month: "long", year: "numeric" } : { month: "short", year: "2-digit" });
}

/** Colunas da evolução mensal: o mês escolhido em destaque (azul), os outros em cinza de apoio. */
export function ColunasMensais({ serie, destaque }: { serie: { mes: string; total: number }[]; destaque: string }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const max = teto(Math.max(...serie.map((s) => s.total), 0));
  const ticks = [max, max / 2, 0];
  const ALTURA = 180;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col justify-between text-xs tabular-nums text-[#666666] text-right" style={{ height: ALTURA }}>
        {ticks.map((t) => (
          <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
            {eixo(t)}
          </span>
        ))}
      </div>
      <div className="flex-1">
        <div className="relative" style={{ height: ALTURA }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 h-px"
              style={{ top: `${(1 - t / max) * 100}%`, background: t === 0 ? EIXO : GRADE }}
            />
          ))}
          <div className="absolute inset-0 flex items-end justify-around">
            {serie.map((s, i) => {
              const h = (s.total / max) * 100;
              const ehDestaque = s.mes === destaque;
              return (
                <div
                  key={s.mes}
                  tabIndex={0}
                  className="relative flex h-full w-full items-end justify-center rounded-md outline-offset-2 focus-visible:outline-2"
                  onPointerEnter={() => setAtivo(i)}
                  onPointerLeave={() => setAtivo(null)}
                  onFocus={() => setAtivo(i)}
                  onBlur={() => setAtivo(null)}
                  aria-label={`${rotuloMes(s.mes, true)}: ${formatarMoeda(s.total)}`}
                >
                  {ativo === i && (
                    <div className="absolute z-20 bottom-full mb-2 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-black/10 pointer-events-none">
                      <b className="text-slate-900">{formatarMoeda(s.total)}</b>
                      <span className="text-slate-600"> · {rotuloMes(s.mes, true)}</span>
                    </div>
                  )}
                  {ehDestaque && s.total > 0 && (
                    <span
                      className="absolute text-xs font-semibold tabular-nums text-slate-900 whitespace-nowrap"
                      style={{ bottom: `calc(${h}% + 4px)` }}
                    >
                      {formatarMoeda(s.total)}
                    </span>
                  )}
                  <span
                    className="block w-6 rounded-t print:[print-color-adjust:exact]"
                    style={{
                      height: `${h}%`,
                      minHeight: s.total > 0 ? 2 : 0,
                      background: ehDestaque ? SERIE : CONTEXTO,
                      filter: ativo === i ? "brightness(1.1)" : undefined,
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-1 flex justify-around text-xs text-[#666666]">
          {serie.map((s) => (
            <span key={s.mes} className={s.mes === destaque ? "font-semibold text-slate-900" : ""}>
              {rotuloMes(s.mes)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
