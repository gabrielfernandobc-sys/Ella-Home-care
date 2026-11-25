import type { CampoId, TipoCampo } from "@/lib/campos";

export interface ArquivoTela {
  id: string;
  nome: string;
  tamanho: number;
  tipo: string | null;
  status: "na_fila" | "processando" | "pronto" | "erro" | "duplicado";
  metodo: string | null;
  erro: string | null;
  temPrevia: boolean;
  apagado: boolean;
}

export interface ProblemaTela {
  campo?: CampoId;
  nivel: "erro" | "aviso";
  mensagem: string;
}

export interface LinhaTela {
  id: string;
  arquivoId: string;
  documentoId: string;
  indice: number;
  valores: Partial<Record<CampoId, string | number | null>>;
  confianca: Partial<Record<CampoId, "alta" | "media" | "baixa">>;
  problemas: ProblemaTela[];
  cor: "verde" | "amarelo" | "vermelho";
  duplicada: boolean;
  motivoDuplicata: string | null;
  aprovada: boolean;
  forcada: boolean;
  editada: boolean;
  lancada: boolean;
}

export interface CampoTela {
  id: CampoId;
  rotulo: string;
  tipo: TipoCampo;
  nivel: "nota" | "item" | "app";
}

export interface LoteTela {
  lote: { id: string; criado_em: string; status: string; mes_referencia: string | null };
  arquivos: ArquivoTela[];
  linhas: LinhaTela[];
  campos: CampoTela[];
  progresso: { total: number; naFila: number; processando: number; prontos: number; erros: number; duplicados: number };
  resumo: { verde: number; amarelo: number; vermelho: number; aprovadas: number; lancadas: number };
  planilha: { nome: string; aba: string; fonte: string } | null;
}

export interface Envio {
  chave: string;
  nome: string;
  progresso: number;
  estado: "aguardando" | "enviando" | "enviado" | "erro";
  erro?: string;
}
