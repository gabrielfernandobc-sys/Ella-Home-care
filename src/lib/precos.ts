/**
 * Fase 3: alerta de preço fora do padrão.
 * Para cada item (mesma descrição normalizada e, se a planilha tiver a coluna, mesma unidade),
 * compara o preço unitário com a MEDIANA das compras anteriores dos últimos 12 meses.
 * - Precisa de pelo menos 3 compras anteriores (senão não há "padrão").
 * - Acima de +limite% (padrão 30%): "preço acima do normal".
 * - Abaixo de -50%: "preço muito abaixo do normal" (muitas vezes é unidade trocada: caixa x unidade).
 * Só gera aviso (amarelo): nunca muda nenhum valor.
 */
import { chaveDePara } from "./depara";
import type { RegistroCompra } from "./relatorios";
import { diasEntre, formatarMoeda, normalizar } from "./texto";

export const MINIMO_COMPRAS_ANTERIORES = 3;
export const LIMITE_ACIMA_PADRAO = 30; // %
export const LIMITE_ABAIXO = 50; // %
const JANELA_DIAS = 365;
const MAXIMO_OBSERVACOES = 20;

export interface AlertaPreco {
  tipo: "acima" | "abaixo";
  pago: number;
  normal: number;
  /** variação percentual (ex.: 53 = 53% acima; -60 = 60% abaixo) */
  variacao: number;
  compras: number;
  mensagem: string;
}

export function chaveItem(descricao: unknown, unidade: unknown, usarUnidade: boolean): string {
  const d = chaveDePara("descricao", descricao);
  if (!d) return "";
  return usarUnidade ? `${d}|${normalizar(unidade as string)}` : d;
}

export function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export interface HistoricoPrecos {
  /** chave do item -> compras anteriores (data, preço unitário), mais recentes primeiro */
  porItem: Map<string, { data: string; unitario: number }[]>;
  usarUnidade: boolean;
}

export function montarHistorico(registros: RegistroCompra[], usarUnidade: boolean): HistoricoPrecos {
  const porItem = new Map<string, { data: string; unitario: number }[]>();
  for (const r of registros) {
    if (!r.data || r.unitario === null || r.unitario <= 0) continue;
    const k = chaveItem(r.descricao, r.unidade, usarUnidade);
    if (!k) continue;
    porItem.set(k, [...(porItem.get(k) ?? []), { data: r.data, unitario: r.unitario }]);
  }
  for (const lista of porItem.values()) lista.sort((a, b) => b.data.localeCompare(a.data));
  return { porItem, usarUnidade };
}

/**
 * O preço desta compra está fora do padrão? Compara só com compras ANTERIORES à data dela
 * (ou todas, se ela não tiver data), dentro de 12 meses.
 */
export function alertaDePreco(
  compra: { descricao: unknown; unidade: unknown; unitario: number | null; data: string | null },
  historico: HistoricoPrecos,
  limiteAcima = LIMITE_ACIMA_PADRAO,
): AlertaPreco | null {
  if (compra.unitario === null || compra.unitario <= 0) return null;
  const k = chaveItem(compra.descricao, compra.unidade, historico.usarUnidade);
  const lista = k ? historico.porItem.get(k) : undefined;
  if (!lista) return null;
  const anteriores = lista
    .filter((o) => !compra.data || (o.data < compra.data && diasEntre(o.data, compra.data) <= JANELA_DIAS))
    .slice(0, MAXIMO_OBSERVACOES);
  if (anteriores.length < MINIMO_COMPRAS_ANTERIORES) return null;
  const normal = Math.round(mediana(anteriores.map((o) => o.unitario)) * 10000) / 10000;
  const variacao = Math.round(((compra.unitario - normal) / normal) * 1000) / 10;
  const base = `(normal: ${formatarMoeda(normal)}, pela mediana das últimas ${anteriores.length} compras)`;
  if (variacao > limiteAcima) {
    return {
      tipo: "acima",
      pago: compra.unitario,
      normal,
      variacao,
      compras: anteriores.length,
      mensagem: `Preço ${Math.round(variacao)}% acima do normal para este item: ${formatarMoeda(compra.unitario)} ${base}.`,
    };
  }
  if (variacao < -LIMITE_ABAIXO) {
    return {
      tipo: "abaixo",
      pago: compra.unitario,
      normal,
      variacao,
      compras: anteriores.length,
      mensagem: `Preço ${Math.round(-variacao)}% abaixo do normal: ${formatarMoeda(compra.unitario)} ${base}. Confira a unidade (caixa x unidade).`,
    };
  }
  return null;
}

/** Compras de um mês com preço fora do padrão (para o relatório). */
export function alertasDoMes(registros: RegistroCompra[], mes: string, usarUnidade: boolean, limiteAcima = LIMITE_ACIMA_PADRAO) {
  const historico = montarHistorico(registros, usarUnidade);
  return registros
    .filter((r) => r.data?.startsWith(mes))
    .map((r) => ({ registro: r, alerta: alertaDePreco(r, historico, limiteAcima) }))
    .filter((x): x is { registro: RegistroCompra; alerta: AlertaPreco } => x.alerta !== null)
    .sort((a, b) => Math.abs(b.alerta.variacao) - Math.abs(a.alerta.variacao));
}
