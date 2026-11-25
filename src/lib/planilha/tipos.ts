/**
 * Contrato entre a lógica do app e uma planilha (Google Sheets ou a planilha
 * de demonstração em memória). Índices de linha e coluna são 0-based
 * (linha 0 = linha 1 da planilha; coluna 0 = A).
 */

export interface Grade {
  /** Conteúdo como foi digitado: fórmulas aparecem como "=..." */
  formulas: string[][];
  /** Conteúdo como aparece na tela (valores calculados e formatados) */
  valores: string[][];
}

export type OpEstrutura =
  /** Insere "quantidade" linhas vazias antes de "indice", herdando o formato da linha anterior. */
  | { tipo: "inserir"; indice: number; quantidade: number }
  /** Copia formato ou validação de dados da linha "origem" para o intervalo de linhas (inclusive). */
  | { tipo: "copiar"; origem: number; destinoInicio: number; destinoFim: number; modo: "formato" | "validacao" }
  /** Copia a fórmula da coluna, ajustando referências relativas (como "arrastar para baixo"). */
  | { tipo: "copiarFormula"; origem: number; destinoInicio: number; destinoFim: number; coluna: number }
  /** Se houver filtro terminando em "fimAntigo" (exclusivo), estende "quantidade" linhas. */
  | { tipo: "estenderFiltro"; fimAntigo: number; quantidade: number };

export interface Celula {
  linha: number;
  coluna: number;
  valor: string | number;
  /**
   * "texto" e "numero" são gravados como estão (nunca viram fórmula, data ou porcentagem);
   * "data" e "formula" são gravados como se fossem digitados.
   */
  tipo: "texto" | "numero" | "data" | "formula";
}

export interface AdaptadorPlanilha {
  /** Localidade da planilha, ex. "pt_BR" (define como datas são escritas). */
  localidade(): Promise<string>;
  listarAbas(): Promise<string[]>;
  lerGrade(aba: string): Promise<Grade>;
  aplicar(aba: string, ops: OpEstrutura[]): Promise<void>;
  /** Escreve valores como se fossem digitados (fórmulas começam com "="). */
  escrever(aba: string, celulas: Celula[]): Promise<void>;
  /** Exclui linhas inteiras (usado só para desfazer linhas criadas pelo próprio app). */
  excluirLinhas(aba: string, linhas: number[]): Promise<void>;
  duplicarAba(modelo: string, novoNome: string): Promise<void>;
}
