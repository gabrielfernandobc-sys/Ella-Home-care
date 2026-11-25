/**
 * Planeja como acrescentar linhas numa aba SEM sobrescrever nada:
 * - encontra o cabeçalho, a última linha com dados e a linha de totais (se houver);
 * - insere linhas novas logo após a última linha com dados (antes dos totais);
 * - copia formato, validação de dados e fórmulas da última linha para as novas;
 * - nunca escreve em colunas com fórmula;
 * - ajusta somas que terminavam na última linha para incluírem as novas.
 */
import type { CampoId, ValoresLinha } from "../campos";
import type { Mapeamento } from "../mapeamento";
import { ehLinhaDeTotais, intervalos } from "./formulas";
import type { Celula, Grade, OpEstrutura } from "./tipos";
import { valorParaCelula } from "./valores";

export interface AnaliseAba {
  /** 0-based */
  linhaCabecalho: number;
  /** 0-based; = linhaCabecalho quando não há dados */
  ultimaLinhaDados: number;
  /** 0-based ou null */
  linhaTotais: number | null;
  colunasFormula: number[];
  totalLinhasDados: number;
}

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const ehFormula = (v: unknown) => typeof v === "string" && v.startsWith("=");

export function analisarAba(grade: Grade, linhaCabecalho1: number, colunasFormulaExtras: number[] = []): AnaliseAba {
  const cab = linhaCabecalho1 - 1;
  const f = grade.formulas;
  let linhaTotais: number | null = null;
  for (let r = cab + 1; r < f.length; r++) {
    if (ehLinhaDeTotais(f[r] ?? [], r + 1)) {
      linhaTotais = r;
      break;
    }
  }
  const fimBusca = linhaTotais ?? f.length;
  const formulaCols = new Set<number>(colunasFormulaExtras);
  for (let r = cab + 1; r < fimBusca; r++) {
    (f[r] ?? []).forEach((v, c) => {
      if (ehFormula(v)) formulaCols.add(c);
    });
  }
  let ultima = cab;
  let total = 0;
  for (let r = cab + 1; r < fimBusca; r++) {
    const linha = f[r] ?? [];
    const temDado = linha.some((v, c) => !formulaCols.has(c) && !ehFormula(v) && !vazio(v));
    if (temDado) {
      ultima = r;
      total++;
    }
  }
  return {
    linhaCabecalho: cab,
    ultimaLinhaDados: ultima,
    linhaTotais,
    colunasFormula: [...formulaCols].sort((a, b) => a - b),
    totalLinhasDados: total,
  };
}

export interface PlanoAcrescimo {
  analise: AnaliseAba;
  /** 0-based: onde a primeira linha nova vai ficar */
  inicio: number;
  quantidade: number;
  ops: OpEstrutura[];
  escritas: Celula[];
  /** Para cada linha nova (na ordem), as células escritas */
  celulasPorLinha: Celula[][];
  /** Somas que terminavam na última linha de dados (1-based) devem passar a terminar em fimNovo */
  ajusteIntervalos: { fimAntigo: number; fimNovo: number; primeiraLinhaDados: number } | null;
}

export function planejarAcrescimo(params: {
  grade: Grade;
  linhaCabecalho: number; // 1-based
  mapeamento: Mapeamento;
  colunasFormula?: number[];
  linhas: ValoresLinha[];
  localidade?: string;
}): PlanoAcrescimo {
  const analise = analisarAba(params.grade, params.linhaCabecalho, params.colunasFormula);
  const n = params.linhas.length;
  const temDados = analise.ultimaLinhaDados > analise.linhaCabecalho;
  const inicio = analise.ultimaLinhaDados + 1;
  const ops: OpEstrutura[] = [];
  if (n > 0) {
    ops.push({ tipo: "inserir", indice: inicio, quantidade: n });
    if (temDados) {
      const origem = analise.ultimaLinhaDados;
      ops.push({ tipo: "copiar", origem, destinoInicio: inicio, destinoFim: inicio + n - 1, modo: "formato" });
      ops.push({ tipo: "copiar", origem, destinoInicio: inicio, destinoFim: inicio + n - 1, modo: "validacao" });
      const linhaOrigem = params.grade.formulas[origem] ?? [];
      for (const col of analise.colunasFormula) {
        if (ehFormula(linhaOrigem[col])) {
          ops.push({ tipo: "copiarFormula", origem, destinoInicio: inicio, destinoFim: inicio + n - 1, coluna: col });
        }
      }
      ops.push({ tipo: "estenderFiltro", fimAntigo: origem + 1, quantidade: n });
    }
  }
  const proibidas = new Set(analise.colunasFormula);
  const celulasPorLinha: Celula[][] = params.linhas.map((valores, i) => {
    const linha = inicio + i;
    const cels: Celula[] = [];
    params.mapeamento.forEach((campo, coluna) => {
      if (!campo || proibidas.has(coluna)) return;
      const v = valorParaCelula(campo as CampoId, valores[campo as CampoId], params.localidade);
      if (v === null) return;
      cels.push({ linha, coluna, valor: v.valor, tipo: v.tipo });
    });
    return cels;
  });
  return {
    analise,
    inicio,
    quantidade: n,
    ops,
    escritas: celulasPorLinha.flat(),
    celulasPorLinha,
    ajusteIntervalos:
      temDados && n > 0
        ? {
            fimAntigo: analise.ultimaLinhaDados + 1,
            fimNovo: analise.ultimaLinhaDados + 1 + n,
            primeiraLinhaDados: analise.linhaCabecalho + 2,
          }
        : null,
  };
}

/**
 * Depois da inserção: quais fórmulas fora da área de dados (cabeçalho e totais)
 * somam até a antiga última linha e devem passar a incluir as linhas novas.
 */
export function formulasParaEstender(
  gradeDepois: Grade,
  plano: PlanoAcrescimo,
  estender: (f: string) => string,
): Celula[] {
  if (!plano.ajusteIntervalos) return [];
  const { primeiraLinhaDados } = plano.ajusteIntervalos;
  const out: Celula[] = [];
  const linhasAlvo: number[] = [];
  for (let r = 0; r <= plano.analise.linhaCabecalho; r++) linhasAlvo.push(r);
  if (plano.analise.linhaTotais !== null) linhasAlvo.push(plano.analise.linhaTotais + plano.quantidade);
  for (const r of linhasAlvo) {
    (gradeDepois.formulas[r] ?? []).forEach((f, c) => {
      if (!ehFormula(f)) return;
      const comeca = intervalos(f).some((iv) => iv.inicio <= primeiraLinhaDados);
      if (!comeca) return;
      const novo = estender(f);
      if (novo !== f) out.push({ linha: r, coluna: c, valor: novo, tipo: "formula" });
    });
  }
  return out;
}
