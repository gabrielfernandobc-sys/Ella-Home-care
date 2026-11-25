/**
 * Fase 3: relatórios a partir da PRÓPRIA planilha (fonte da verdade, inclui o que foi lançado à mão).
 * - registrosDaGrade: transforma as linhas da aba em registros de compra (pelo mapeamento de colunas);
 * - resumoMensal: total do mês, por categoria, por fornecedor, comparação com o mês anterior;
 * - serieMensal: total dos últimos meses.
 * Nada é escondido: linhas sem data ou sem valor são contadas e informadas.
 */
import type { CampoId, Granularidade } from "./campos";
import { nomeBaseFornecedor } from "./duplicatas";
import { alertasDoMes, LIMITE_ACIMA_PADRAO } from "./precos";
import type { Mapeamento } from "./mapeamento";
import { analisarAba } from "./planilha/planejador";
import type { Grade } from "./planilha/tipos";
import { parseData, parseNumero } from "./texto";

export interface RegistroCompra {
  /** AAAA-MM-DD */
  data: string | null;
  fornecedor: string | null;
  categoria: string | null;
  descricao: string | null;
  quantidade: number | null;
  unidade: string | null;
  /** Preço unitário (lido ou total ÷ quantidade) */
  unitario: number | null;
  /** Valor da linha (total do item, ou da nota numa planilha "uma linha por nota") */
  total: number | null;
  /** Aba e linha (1-based) de onde veio, para rastrear */
  aba: string;
  linha: number;
}

const arred = (n: number) => Math.round(n * 100) / 100;

export function registrosDaGrade(
  grade: Grade,
  cfg: { mapeamento: Mapeamento; linhaCabecalho: number; granularidade: Granularidade },
  aba: string,
): RegistroCompra[] {
  const analise = analisarAba(grade, cfg.linhaCabecalho);
  const fim = analise.linhaTotais ?? grade.valores.length;
  const col = (c: CampoId) => cfg.mapeamento.indexOf(c);
  const ler = (linha: string[], c: CampoId) => {
    const i = col(c);
    const v = i >= 0 ? String(linha[i] ?? "").trim() : "";
    return v || null;
  };
  const out: RegistroCompra[] = [];
  for (let r = analise.linhaCabecalho + 1; r < fim; r++) {
    const linha = grade.valores[r] ?? [];
    if (!linha.some((v) => String(v ?? "").trim())) continue;
    const quantidade = parseNumero(ler(linha, "quantidade"));
    let unitario = parseNumero(ler(linha, "valor_unitario"));
    let total =
      parseNumero(ler(linha, "valor_total_item")) ?? (cfg.granularidade === "nota" ? parseNumero(ler(linha, "total_nota")) : null);
    // Total do item é fórmula (coluna não mapeada): usa quantidade x unitário.
    if (total === null && quantidade !== null && unitario !== null) total = arred(quantidade * unitario);
    if (unitario === null && total !== null && quantidade) unitario = Math.round((total / quantidade) * 10000) / 10000;
    out.push({
      data: parseData(ler(linha, "data_emissao")),
      fornecedor: ler(linha, "fornecedor"),
      categoria: ler(linha, "categoria"),
      descricao: ler(linha, "descricao"),
      quantidade,
      unidade: ler(linha, "unidade"),
      unitario,
      total,
      aba,
      linha: r + 1,
    });
  }
  return out;
}

export interface Fatia {
  nome: string;
  total: number;
  linhas: number;
  /** 0 a 100 */
  percentual: number;
}

export interface ResumoMensal {
  mes: string;
  total: number;
  linhas: number;
  fornecedores: number;
  porCategoria: Fatia[];
  porFornecedor: Fatia[];
  mesAnterior: { mes: string; total: number; variacao: number | null };
  /** Linhas do mês que não entraram na soma (sem valor) e linhas da planilha sem data válida */
  semValor: number;
  semData: number;
}

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

function fatias(registros: RegistroCompra[], chave: (r: RegistroCompra) => { id: string; nome: string }, total: number): Fatia[] {
  const grupos = new Map<string, { nomes: Map<string, number>; total: number; linhas: number }>();
  for (const r of registros) {
    if (r.total === null) continue;
    const { id, nome } = chave(r);
    const g = grupos.get(id) ?? { nomes: new Map(), total: 0, linhas: 0 };
    g.total += r.total;
    g.linhas++;
    g.nomes.set(nome, (g.nomes.get(nome) ?? 0) + 1);
    grupos.set(id, g);
  }
  return [...grupos.values()]
    .map((g) => ({
      // Mostra a grafia mais usada do nome.
      nome: [...g.nomes.entries()].sort((a, b) => b[1] - a[1])[0][0],
      total: arred(g.total),
      linhas: g.linhas,
      percentual: total > 0 ? Math.round((g.total / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));
}

const doMes = (registros: RegistroCompra[], mes: string) => registros.filter((r) => r.data?.startsWith(mes));
const somar = (registros: RegistroCompra[]) => arred(registros.reduce((s, r) => s + (r.total ?? 0), 0));

export function resumoMensal(registros: RegistroCompra[], mes: string): ResumoMensal {
  const domes = doMes(registros, mes);
  const total = somar(domes);
  const anterior = mesAnterior(mes);
  const totalAnterior = somar(doMes(registros, anterior));
  const porFornecedor = fatias(
    domes,
    (r) => {
      const nome = r.fornecedor?.trim() || "(sem fornecedor)";
      return { id: nomeBaseFornecedor(nome) || nome, nome };
    },
    total,
  );
  return {
    mes,
    total,
    linhas: domes.length,
    fornecedores: porFornecedor.filter((f) => f.nome !== "(sem fornecedor)").length,
    porCategoria: fatias(
      domes,
      (r) => {
        const nome = r.categoria?.trim() || "(sem categoria)";
        return { id: nome.toLowerCase(), nome };
      },
      total,
    ),
    porFornecedor,
    mesAnterior: {
      mes: anterior,
      total: totalAnterior,
      variacao: totalAnterior > 0 ? Math.round(((total - totalAnterior) / totalAnterior) * 1000) / 10 : null,
    },
    semValor: domes.filter((r) => r.total === null).length,
    semData: registros.filter((r) => !r.data).length,
  };
}

/** Total por mês, dos "quantos" meses até "mes" (inclusive), do mais antigo para o mais novo. */
export function serieMensal(registros: RegistroCompra[], mes: string, quantos = 6): { mes: string; total: number }[] {
  const meses: string[] = [mes];
  while (meses.length < quantos) meses.unshift(mesAnterior(meses[0]));
  return meses.map((m) => ({ mes: m, total: somar(doMes(registros, m)) }));
}

/** Meses (AAAA-MM) que têm alguma compra, do mais recente para o mais antigo. */
export function mesesComCompras(registros: RegistroCompra[]): string[] {
  return [...new Set(registros.map((r) => r.data?.slice(0, 7)).filter(Boolean) as string[])].sort().reverse();
}

// ---------------- Relatório completo (tela e exportação) ----------------


export interface AlertaRelatorio {
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
}

export interface Relatorio {
  resumo: ResumoMensal;
  serie: { mes: string; total: number }[];
  alertas: AlertaRelatorio[];
  compras: RegistroCompra[];
  meses: string[];
}

export function relatorioCompleto(
  registros: RegistroCompra[],
  mes: string,
  opcoes: { usarUnidade: boolean; limitePreco?: number; mesesSerie?: number },
): Relatorio {
  return {
    resumo: resumoMensal(registros, mes),
    serie: serieMensal(registros, mes, opcoes.mesesSerie ?? 6),
    alertas: alertasDoMes(registros, mes, opcoes.usarUnidade, opcoes.limitePreco ?? LIMITE_ACIMA_PADRAO).map(({ registro, alerta }) => ({
      data: registro.data,
      fornecedor: registro.fornecedor,
      descricao: registro.descricao,
      unidade: registro.unidade,
      pago: alerta.pago,
      normal: alerta.normal,
      variacao: alerta.variacao,
      compras: alerta.compras,
      tipo: alerta.tipo,
      aba: registro.aba,
      linha: registro.linha,
    })),
    compras: registros.filter((r) => r.data?.startsWith(mes)).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || a.linha - b.linha),
    meses: mesesComCompras(registros),
  };
}
