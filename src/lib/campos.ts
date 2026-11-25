/**
 * Campos que o app sabe extrair e lançar na planilha.
 * O "id" é interno; o "rotulo" é o que a usuária vê.
 */

export const CATEGORIAS = [
  "medicamento",
  "material de consumo",
  "limpeza",
  "escritório",
  "outros",
] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export type TipoCampo = "data" | "texto" | "numero" | "moeda";

export interface DefinicaoCampo {
  id: CampoId;
  rotulo: string;
  tipo: TipoCampo;
  /** "nota" = igual para todos os itens da nota; "item" = muda por item; "app" = preenchido pelo app */
  nivel: "nota" | "item" | "app";
}

export const CAMPO_IDS = [
  "data_emissao",
  "fornecedor",
  "cnpj",
  "numero_nota",
  "chave_acesso",
  "descricao",
  "categoria",
  "quantidade",
  "unidade",
  "valor_unitario",
  "valor_total_item",
  "total_nota",
  "forma_pagamento",
  "centro_custo",
  "observacoes",
  "arquivo_origem",
  "id_lote",
] as const;
export type CampoId = (typeof CAMPO_IDS)[number];

export const CAMPOS: DefinicaoCampo[] = [
  { id: "data_emissao", rotulo: "Data da compra / emissão", tipo: "data", nivel: "nota" },
  { id: "fornecedor", rotulo: "Fornecedor", tipo: "texto", nivel: "nota" },
  { id: "cnpj", rotulo: "CNPJ do fornecedor", tipo: "texto", nivel: "nota" },
  { id: "numero_nota", rotulo: "Número da nota", tipo: "texto", nivel: "nota" },
  { id: "chave_acesso", rotulo: "Chave de acesso (NF-e)", tipo: "texto", nivel: "nota" },
  { id: "descricao", rotulo: "Descrição do item", tipo: "texto", nivel: "item" },
  { id: "categoria", rotulo: "Categoria", tipo: "texto", nivel: "item" },
  { id: "quantidade", rotulo: "Quantidade", tipo: "numero", nivel: "item" },
  { id: "unidade", rotulo: "Unidade", tipo: "texto", nivel: "item" },
  { id: "valor_unitario", rotulo: "Valor unitário", tipo: "moeda", nivel: "item" },
  { id: "valor_total_item", rotulo: "Valor total do item", tipo: "moeda", nivel: "item" },
  { id: "total_nota", rotulo: "Total da nota", tipo: "moeda", nivel: "nota" },
  { id: "forma_pagamento", rotulo: "Forma de pagamento", tipo: "texto", nivel: "nota" },
  { id: "centro_custo", rotulo: "Setor / centro de custo", tipo: "texto", nivel: "nota" },
  { id: "observacoes", rotulo: "Observações", tipo: "texto", nivel: "nota" },
  { id: "arquivo_origem", rotulo: "Arquivo de origem", tipo: "texto", nivel: "app" },
  { id: "id_lote", rotulo: "ID do lote", tipo: "texto", nivel: "app" },
];

export const CAMPO_POR_ID: Record<CampoId, DefinicaoCampo> = Object.fromEntries(
  CAMPOS.map((c) => [c.id, c]),
) as Record<CampoId, DefinicaoCampo>;

/** Campos que, se vazios, deixam a linha amarela (padrão; pode ser alterado na configuração). */
export const CAMPOS_OBRIGATORIOS_PADRAO: CampoId[] = [
  "data_emissao",
  "fornecedor",
  "descricao",
  "valor_total_item",
];

export type Confianca = "alta" | "media" | "baixa";

/** Valores de uma linha (uma linha da planilha). */
export type ValoresLinha = Partial<Record<CampoId, string | number | null>>;
export type ConfiancaLinha = Partial<Record<CampoId, Confianca>>;

export type Granularidade = "item" | "nota";
