"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Cartao, Carregando } from "@/components/ui";
import { api } from "@/lib/cliente/api";
import { dataParaBR, formatarMoeda } from "@/lib/texto";
import { BarrasRanqueadas, ColunasMensais, rotuloMes, type ItemBarra } from "./graficos";

interface Relatorio {
  resumo: {
    mes: string;
    total: number;
    linhas: number;
    fornecedores: number;
    porCategoria: ItemBarra[];
    porFornecedor: ItemBarra[];
    mesAnterior: { mes: string; total: number; variacao: number | null };
    semValor: number;
    semData: number;
  };
  serie: { mes: string; total: number }[];
  alertas: {
    data: string | null;
    fornecedor: string | null;
    descricao: string | null;
    unidade: string | null;
    pago: number;
    normal: number;
    variacao: number;
    compras: number;
    tipo: "acima" | "abaixo";
    aba: string;
    linha: number;
  }[];
  meses: string[];
  planilha: string;
  abasLidas: string[];
  abasAusentes: string[];
  temCategoria: boolean;
  temFornecedor: boolean;
}

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Tile({ rotulo, valor, detalhe, grande }: { rotulo: string; valor: string; detalhe?: React.ReactNode; grande?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-[#666666]">{rotulo}</p>
      <p className={`${grande ? "text-5xl" : "text-3xl"} font-semibold text-slate-900 mt-1`}>{valor}</p>
      {detalhe && <p className="mt-1 text-sm text-[#666666]">{detalhe}</p>}
    </div>
  );
}

function Variacao({ v, mes }: { v: number | null; mes: string }) {
  if (v === null) return <>sem compras em {rotuloMes(mes, true)}</>;
  const sobe = v > 0;
  return (
    <>
      <span aria-hidden>{v === 0 ? "=" : sobe ? "▲" : "▼"}</span> {Math.abs(v).toLocaleString("pt-BR")}% {sobe ? "a mais" : v < 0 ? "a menos" : ""}{" "}
      que {rotuloMes(mes, true)}
    </>
  );
}

export default function Relatorios() {
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async (m: string) => {
    setCarregando(true);
    try {
      setDados(await api<Relatorio>(`/api/relatorios?mes=${m}`));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar(mes);
  }, [mes, carregar]);

  if (!dados && carregando) return <Carregando texto="Lendo a planilha…" />;
  if (!dados) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold">Relatórios</h1>
        <Aviso tipo="erro">
          {erro}{" "}
          <Link href="/configurar" className="underline">
            Ir para Planilha
          </Link>
        </Aviso>
      </div>
    );
  }

  const { resumo } = dados;
  const opcoesMes = [...new Set([mesAtual(), ...dados.meses, mes])].sort().reverse();

  return (
    <div className={`max-w-6xl mx-auto space-y-6 transition-opacity ${carregando ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Relatório de compras</h1>
          <p className="text-slate-600">
            {rotuloMes(mes, true)} · lido da planilha “{dados.planilha}”
          </p>
        </div>
      </div>

      {/* Filtros e ações numa linha só, acima de tudo (não aparecem na impressão) */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">
          Mês
          <select
            className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 bg-white text-base"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
          >
            {opcoesMes.map((m) => (
              <option key={m} value={m}>
                {rotuloMes(m, true)}
              </option>
            ))}
          </select>
        </label>
        <a href={`/api/relatorios/exportar?mes=${mes}`} download>
          <Botao variante="secundario">⬇️ Baixar em Excel</Botao>
        </a>
        <Botao variante="secundario" onClick={() => window.print()}>
          🖨️ Imprimir / salvar PDF
        </Botao>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_1fr]">
        <Tile
          grande
          rotulo={`Total de ${rotuloMes(mes, true)}`}
          valor={formatarMoeda(resumo.total)}
          detalhe={<Variacao v={resumo.mesAnterior.variacao} mes={resumo.mesAnterior.mes} />}
        />
        <Tile rotulo="Linhas de compra" valor={resumo.linhas.toLocaleString("pt-BR")} />
        <Tile rotulo="Fornecedores" valor={resumo.fornecedores.toLocaleString("pt-BR")} />
        <Tile rotulo="Preços fora do padrão" valor={dados.alertas.length.toLocaleString("pt-BR")} />
      </div>

      {(resumo.semValor > 0 || resumo.semData > 0 || dados.abasAusentes.length > 0 || !dados.temCategoria) && (
        <Aviso tipo="atencao">
          <ul className="list-disc pl-5 space-y-0.5">
            {resumo.semValor > 0 && <li>{resumo.semValor} linha(s) deste mês estão sem valor e ficaram fora da soma.</li>}
            {resumo.semData > 0 && <li>{resumo.semData} linha(s) da planilha estão sem data válida e não entram em nenhum mês.</li>}
            {dados.abasAusentes.length > 0 && (
              <li>
                Abas mensais que não existem na planilha (sem compras nesses meses?): {dados.abasAusentes.slice(0, 6).join(", ")}
                {dados.abasAusentes.length > 6 ? "…" : ""}.
              </li>
            )}
            {!dados.temCategoria && <li>A planilha não tem coluna de categoria: tudo aparece como “(sem categoria)”.</li>}
          </ul>
        </Aviso>
      )}

      {resumo.linhas === 0 ? (
        <Aviso tipo="info">Nenhuma compra encontrada em {rotuloMes(mes, true)}.</Aviso>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao titulo="Por categoria">
            <BarrasRanqueadas itens={resumo.porCategoria} rotulo="Total por categoria" />
          </Cartao>
          <Cartao titulo={`Evolução (últimos ${dados.serie.length} meses)`}>
            <ColunasMensais serie={dados.serie} destaque={mes} />
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-blue-800 print:hidden">Ver em tabela</summary>
              <table className="mt-2 w-full text-left">
                <tbody>
                  {dados.serie.map((s) => (
                    <tr key={s.mes} className="border-b border-slate-100">
                      <td className="py-1">{rotuloMes(s.mes, true)}</td>
                      <td className="py-1 text-right tabular-nums">{formatarMoeda(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </Cartao>
        </div>
      )}

      {resumo.linhas > 0 && (
        <Cartao titulo="Por fornecedor">
          <BarrasRanqueadas itens={resumo.porFornecedor.slice(0, 15)} rotulo="Total por fornecedor" />
          {resumo.porFornecedor.length > 15 && (
            <p className="mt-2 text-sm text-slate-600">
              Mostrando os 15 maiores de {resumo.porFornecedor.length}. A lista completa está no Excel.
            </p>
          )}
        </Cartao>
      )}

      <Cartao titulo="Preços fora do padrão">
        <p className="text-sm text-slate-600 mb-3">
          Compras deste mês cujo preço unitário ficou muito acima (ou muito abaixo) da mediana das compras anteriores do mesmo item,
          nos 12 meses antes. Confira se foi aumento de preço, item diferente ou unidade trocada (caixa x unidade).
        </p>
        {dados.alertas.length === 0 ? (
          <p className="text-slate-700">Nenhum preço fora do padrão neste mês. ✓</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-600">
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">Item</th>
                  <th className="py-2 pr-3">Fornecedor</th>
                  <th className="py-2 pr-3 text-right">Pago</th>
                  <th className="py-2 pr-3 text-right">Normal</th>
                  <th className="py-2 pr-3 text-right">Diferença</th>
                  <th className="py-2">Onde</th>
                </tr>
              </thead>
              <tbody>
                {dados.alertas.map((a) => (
                  <tr key={`${a.aba}-${a.linha}`} className="border-b border-slate-100">
                    <td className="py-2 pr-3 whitespace-nowrap">{dataParaBR(a.data)}</td>
                    <td className="py-2 pr-3">
                      {a.descricao} {a.unidade && <span className="text-slate-500">({a.unidade})</span>}
                    </td>
                    <td className="py-2 pr-3">{a.fornecedor}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatarMoeda(a.pago)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatarMoeda(a.normal)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold">
                      <span aria-hidden>{a.tipo === "acima" ? "▲ " : "▼ "}</span>
                      {Math.abs(Math.round(a.variacao))}% {a.tipo === "acima" ? "acima" : "abaixo"}
                    </td>
                    <td className="py-2 text-slate-600 whitespace-nowrap">
                      aba “{a.aba}”, linha {a.linha}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <p className="text-xs text-slate-500">
        Os números vêm da própria planilha (inclusive o que foi lançado à mão). Abas lidas: {dados.abasLidas.join(", ") || "nenhuma"}.
      </p>
    </div>
  );
}
