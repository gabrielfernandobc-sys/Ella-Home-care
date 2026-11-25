/** Configuração da planilha conectada (salva no banco local). */
import { CAMPOS_OBRIGATORIOS_PADRAO, type CampoId, type Granularidade } from "../campos";
import type { Mapeamento } from "../mapeamento";
import { lerConfig, salvarConfig } from "./db";

export interface ConfigPlanilha {
  fonte: "google" | "demo";
  planilhaId: string;
  planilhaNome: string;
  /** "unica" = uma aba que cresce; "mensal" = uma aba por mês */
  modoAbas: "unica" | "mensal";
  /** Aba única, ou aba usada como referência do cabeçalho no modo mensal */
  aba: string;
  /** Modo mensal: aba modelo (vazia, só cabeçalho) duplicada quando o mês não existe */
  abaModelo: string | null;
  padraoNomeAba: string;
  linhaCabecalho: number;
  granularidade: Granularidade;
  cabecalhos: string[];
  mapeamento: Mapeamento;
  colunasFormula: number[];
  obrigatorios: CampoId[];
  diasMaximos: number;
  /** Fase 2: salvar o arquivo original no Google Drive (Notas/AAAA-MM) e o link na coluna Comprovante */
  comprovantesAtivo?: boolean;
  pastaComprovantes?: string;
  /** Fase 2: aprovar sozinho as linhas verdes (desligado por padrão) */
  aprovarVerdesAutomaticamente?: boolean;
  /** Fase 3: avisar preço unitário fora do padrão do item (ligado por padrão; só gera aviso) */
  alertaPrecoAtivo?: boolean;
  /** % acima da mediana das compras anteriores que gera aviso */
  alertaPrecoPercentual?: number;
  atualizadoEm: string;
}

export function configPadrao(): Omit<ConfigPlanilha, "fonte" | "planilhaId" | "planilhaNome" | "aba"> {
  return {
    modoAbas: "unica",
    abaModelo: null,
    padraoNomeAba: "{MES} {AAAA}",
    linhaCabecalho: 1,
    granularidade: "item",
    cabecalhos: [],
    mapeamento: [],
    colunasFormula: [],
    obrigatorios: CAMPOS_OBRIGATORIOS_PADRAO,
    diasMaximos: 180,
    comprovantesAtivo: false,
    pastaComprovantes: "Notas",
    aprovarVerdesAutomaticamente: false,
    alertaPrecoAtivo: true,
    alertaPrecoPercentual: 30,
    atualizadoEm: new Date().toISOString(),
  };
}

export function lerConfigPlanilha(): ConfigPlanilha | null {
  return lerConfig<ConfigPlanilha>("planilha");
}

export function salvarConfigPlanilha(c: ConfigPlanilha) {
  salvarConfig("planilha", { ...c, atualizadoEm: new Date().toISOString() });
}

export function porta(): number {
  const p = Number(process.env.PORTA || process.env.PORT || 3000);
  return Number.isInteger(p) && p > 0 ? p : 3000;
}
