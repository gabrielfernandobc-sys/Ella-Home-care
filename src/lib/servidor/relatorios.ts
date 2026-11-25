/** Leitura dos registros de compra da planilha conectada (com cache curto), para relatórios e alertas de preço. */
import { nomeAbaMensal } from "../abas";
import { montarHistorico, type HistoricoPrecos } from "../precos";
import { mesAnterior, registrosDaGrade, type RegistroCompra } from "../relatorios";
import { adaptadorPara } from "./adaptador";
import type { ConfigPlanilha } from "./config";

export interface LeituraPlanilha {
  registros: RegistroCompra[];
  abasLidas: string[];
  /** Modo mensal: meses sem aba na planilha */
  abasAusentes: string[];
}

type Cache = { em: number; leitura: LeituraPlanilha };
const g = globalThis as { __comprasRegistros?: Map<string, Cache> };
const cache = () => (g.__comprasRegistros ??= new Map());
const TTL = 5 * 60 * 1000;

export function limparCacheRegistros() {
  cache().clear();
}

export function mesAtual(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

/** Lê a aba única, ou as abas mensais dos "meses" meses até "ateMes" (inclusive). */
export async function registrosDaPlanilha(cfg: ConfigPlanilha, ateMes = mesAtual(), meses = 13): Promise<LeituraPlanilha> {
  const k = `${cfg.planilhaId}|${cfg.modoAbas}|${cfg.aba}|${ateMes}|${meses}|${cfg.atualizadoEm}`;
  const c = cache().get(k);
  if (c && Date.now() - c.em < TTL) return c.leitura;

  const adaptador = adaptadorPara(cfg);
  const leitura: LeituraPlanilha = { registros: [], abasLidas: [], abasAusentes: [] };
  if (cfg.modoAbas === "unica") {
    leitura.registros = registrosDaGrade(await adaptador.lerGrade(cfg.aba), cfg, cfg.aba);
    leitura.abasLidas.push(cfg.aba);
  } else {
    const existentes = new Set(await adaptador.listarAbas());
    let mes = ateMes;
    for (let i = 0; i < meses; i++, mes = mesAnterior(mes)) {
      const aba = nomeAbaMensal(cfg.padraoNomeAba, `${mes}-01`);
      if (!aba) continue;
      if (!existentes.has(aba)) {
        leitura.abasAusentes.push(aba);
        continue;
      }
      leitura.registros.push(...registrosDaGrade(await adaptador.lerGrade(aba), cfg, aba));
      leitura.abasLidas.push(aba);
    }
  }
  cache().set(k, { em: Date.now(), leitura });
  return leitura;
}

/** Histórico de preços para a revisão (últimos 13 meses da planilha). */
export async function historicoDePrecos(cfg: ConfigPlanilha): Promise<HistoricoPrecos> {
  const { registros } = await registrosDaPlanilha(cfg);
  return montarHistorico(registros, cfg.mapeamento.includes("unidade"));
}
