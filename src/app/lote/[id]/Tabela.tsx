"use client";

import { Fragment, useState } from "react";
import type { CampoId } from "@/lib/campos";
import { dataParaBR, parseData, parseNumero } from "@/lib/texto";
import type { ArquivoTela, CampoTela, LinhaTela } from "./tipos";

const COR_LINHA = {
  verde: "bg-green-50",
  amarelo: "bg-amber-50",
  vermelho: "bg-red-50",
};
const COR_BARRA = {
  verde: "bg-green-500",
  amarelo: "bg-amber-400",
  vermelho: "bg-red-600",
};
const LARGURA: Partial<Record<CampoId, string>> = {
  data_emissao: "min-w-[7.5rem]",
  fornecedor: "min-w-[15rem]",
  cnpj: "min-w-[11.5rem]",
  numero_nota: "min-w-[6.5rem]",
  chave_acesso: "min-w-[24rem]",
  descricao: "min-w-[20rem]",
  categoria: "min-w-[10rem]",
  quantidade: "min-w-[5rem]",
  unidade: "min-w-[4.5rem]",
  valor_unitario: "min-w-[7rem]",
  valor_total_item: "min-w-[7.5rem]",
  total_nota: "min-w-[7.5rem]",
  forma_pagamento: "min-w-[10rem]",
  centro_custo: "min-w-[10rem]",
  observacoes: "min-w-[14rem]",
};
const CAMPOS_SUGESTAO: CampoId[] = ["fornecedor", "descricao", "unidade", "categoria", "centro_custo", "forma_pagamento"];

export function mostrar(campo: CampoTela, v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (campo.tipo === "data") return parseData(v) ? dataParaBR(parseData(v)) : String(v);
  if (campo.tipo === "moeda" || campo.tipo === "numero") {
    const n = typeof v === "number" ? v : parseNumero(v);
    if (n === null) return String(v);
    const casas = campo.id === "valor_unitario" ? 4 : campo.tipo === "moeda" ? 2 : 3;
    return n.toLocaleString("pt-BR", { minimumFractionDigits: campo.tipo === "moeda" ? 2 : 0, maximumFractionDigits: casas });
  }
  return String(v);
}

function interpretar(campo: CampoTela, texto: string): string | number | null {
  const t = texto.trim();
  if (!t) return null;
  if (campo.tipo === "data") return parseData(t) ?? t;
  if (campo.tipo === "moeda" || campo.tipo === "numero") return parseNumero(t) ?? t;
  return t;
}

function Celula({
  linha,
  campo,
  aoSalvar,
}: {
  linha: LinhaTela;
  campo: CampoTela;
  aoSalvar: (linha: LinhaTela, campo: CampoId, valor: string | number | null) => void;
}) {
  const original = mostrar(campo, linha.valores[campo.id]);
  const [texto, setTexto] = useState(original);
  const [base, setBase] = useState(original);
  if (original !== base) {
    // O servidor mudou o valor (ex.: edição em outra linha da mesma nota).
    setBase(original);
    setTexto(original);
  }
  const problema = linha.problemas.find((p) => p.campo === campo.id && p.nivel !== "info");
  const incerta = linha.confianca[campo.id] && linha.confianca[campo.id] !== "alta";
  const borda = problema ? (problema.nivel === "erro" ? "!border-red-500" : "!border-amber-500") : incerta ? "!border-amber-300" : "";
  const numerico = campo.tipo === "moeda" || campo.tipo === "numero";
  return (
    <input
      className={`celula ${borda} ${numerico ? "text-right tabular-nums" : ""} ${LARGURA[campo.id] ?? "min-w-[9rem]"}`}
      value={texto}
      disabled={linha.lancada}
      list={CAMPOS_SUGESTAO.includes(campo.id) ? `sugestoes-${campo.id}` : undefined}
      title={problema?.mensagem ?? (incerta ? "Leitura incerta — confira no documento" : "")}
      aria-label={campo.rotulo}
      onChange={(e) => setTexto(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setTexto(original);
      }}
      onBlur={() => {
        if (texto === original) return;
        aoSalvar(linha, campo.id, interpretar(campo, texto));
      }}
    />
  );
}

export function Tabela({
  linhas,
  campos,
  arquivos,
  selecionado,
  aoSelecionar,
  aoSalvar,
  aoAprovar,
}: {
  linhas: LinhaTela[];
  campos: CampoTela[];
  arquivos: Map<string, ArquivoTela>;
  selecionado: string | null;
  aoSelecionar: (arquivoId: string) => void;
  aoSalvar: (linha: LinhaTela, campo: CampoId, valor: string | number | null) => void;
  aoAprovar: (linha: LinhaTela, aprovada: boolean, forcar?: boolean) => void;
}) {
  return (
    <div className="overflow-auto max-h-[70vh] border border-slate-200 rounded-xl bg-white">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-slate-100 z-10">
          <tr className="text-left text-slate-700">
            <th className="p-2 w-20">Aprovar</th>
            {campos.map((c) => (
              <th key={c.id} className="p-2 whitespace-nowrap font-semibold">
                {c.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => {
            const arq = arquivos.get(l.arquivoId);
            const novoArquivo = i === 0 || linhas[i - 1].arquivoId !== l.arquivoId;
            const avisos = [...(l.motivoDuplicata ? [{ nivel: "erro", mensagem: `Duplicata: ${l.motivoDuplicata}` }] : []), ...l.problemas];
            return (
              <Fragment key={l.id}>
                {novoArquivo && (
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td colSpan={campos.length + 1} className="px-2 py-1.5">
                      <button
                        className={`text-left font-medium hover:underline ${selecionado === l.arquivoId ? "text-blue-800" : "text-slate-700"}`}
                        onClick={() => aoSelecionar(l.arquivoId)}
                      >
                        📄 {arq?.nome ?? "arquivo"} {selecionado === l.arquivoId ? "(aberto ao lado)" : "— ver documento"}
                      </button>
                    </td>
                  </tr>
                )}
                <tr
                  className={`${COR_LINHA[l.cor]} ${l.lancada ? "opacity-60" : ""} border-t border-white`}
                  onFocus={() => aoSelecionar(l.arquivoId)}
                  onClick={() => aoSelecionar(l.arquivoId)}
                >
                  <td className="p-1.5 align-top">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-8 rounded ${COR_BARRA[l.cor]}`} aria-label={`situação: ${l.cor}`} />
                      {l.lancada ? (
                        <span title="Já lançada" className="text-green-800 font-bold">
                          ✓
                        </span>
                      ) : l.cor === "vermelho" && !l.forcada ? (
                        <input type="checkbox" disabled title="Corrija ou use “Lançar mesmo assim”" className="w-5 h-5" />
                      ) : (
                        <span className="flex flex-col items-center">
                          <input
                            type="checkbox"
                            className="w-5 h-5 accent-green-700"
                            checked={l.aprovada}
                            onChange={(e) => aoAprovar(l, e.target.checked)}
                            aria-label="Aprovar linha"
                          />
                          {l.aprovadaAuto && (
                            <span className="text-[0.65rem] text-green-800" title="Aprovada automaticamente (linha verde)">
                              auto
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </td>
                  {campos.map((c) => (
                    <td key={c.id} className="p-0.5 align-top">
                      <Celula linha={l} campo={c} aoSalvar={aoSalvar} />
                    </td>
                  ))}
                </tr>
                {avisos.length > 0 && !l.lancada && (
                  <tr className={COR_LINHA[l.cor]}>
                    <td />
                    <td colSpan={campos.length} className="px-2 pb-2 text-[0.85rem]">
                      <ul className="space-y-0.5">
                        {avisos.map((p, i) => (
                          <li key={i} className={p.nivel === "erro" ? "text-red-800" : p.nivel === "info" ? "text-slate-600" : "text-amber-900"}>
                            {p.nivel === "erro" ? "⛔" : p.nivel === "info" ? "ℹ️" : "⚠️"} {p.mensagem}
                          </li>
                        ))}
                      </ul>
                      {l.cor === "vermelho" && (
                        <button
                          className="mt-1 text-sm underline text-red-800"
                          onClick={() => {
                            if (l.forcada) aoAprovar(l, false);
                            else if (confirm("Tem certeza? Esta linha tem erro ou parece duplicada.\n\nSó continue se você conferiu e ela realmente deve entrar na planilha."))
                              aoAprovar(l, true, true);
                          }}
                        >
                          {l.forcada ? "Cancelar “lançar mesmo assim”" : "Lançar mesmo assim"}
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
