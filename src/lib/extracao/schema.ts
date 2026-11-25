import { z } from "zod";
import { CATEGORIAS } from "../campos";

export const ConfiancaSchema = z.enum(["alta", "media", "baixa"]);

export const ItemExtraidoSchema = z.object({
  descricao: z.string().nullable().describe("Descrição do produto como aparece no documento"),
  quantidade: z.number().nullable(),
  unidade: z.string().nullable().describe("Ex.: UN, CX, FR, PCT, KG, L"),
  valor_unitario: z.number().nullable(),
  valor_total: z.number().nullable().describe("Valor total da linha do item"),
  categoria: z.enum(CATEGORIAS).nullable(),
  confianca: z.object({
    descricao: ConfiancaSchema,
    quantidade: ConfiancaSchema,
    unidade: ConfiancaSchema,
    valor_unitario: ConfiancaSchema,
    valor_total: ConfiancaSchema,
    categoria: ConfiancaSchema,
  }),
});

export const DocumentoExtraidoSchema = z.object({
  tipo_documento: z.enum(["nfe", "nfce", "cupom_fiscal", "recibo", "pedido", "boleto", "outro"]),
  data_emissao: z.string().nullable().describe("Data de emissão/compra no formato AAAA-MM-DD"),
  fornecedor: z.string().nullable().describe("Razão social ou nome do emitente (quem vendeu)"),
  cnpj: z.string().nullable().describe("CNPJ do emitente/fornecedor, só se estiver visível"),
  numero_nota: z.string().nullable(),
  chave_acesso: z.string().nullable().describe("Chave de acesso de 44 dígitos, se visível"),
  total_nota: z.number().nullable().describe("Valor total do documento"),
  valor_frete: z.number().nullable(),
  valor_desconto: z.number().nullable(),
  forma_pagamento: z.string().nullable(),
  centro_custo: z.string().nullable().describe("Setor ou centro de custo, se houver"),
  observacoes: z.string().nullable(),
  itens: z.array(ItemExtraidoSchema),
  confianca: z.object({
    data_emissao: ConfiancaSchema,
    fornecedor: ConfiancaSchema,
    cnpj: ConfiancaSchema,
    numero_nota: ConfiancaSchema,
    total_nota: ConfiancaSchema,
    forma_pagamento: ConfiancaSchema,
  }),
});

export const RespostaExtracaoSchema = z.object({
  legivel: z.boolean().describe("false se o arquivo estiver ilegível ou não for um documento de compra"),
  aviso: z.string().nullable().describe("Explicação curta em português quando algo não pôde ser lido"),
  documentos: z.array(DocumentoExtraidoSchema),
});

export type ItemExtraido = z.infer<typeof ItemExtraidoSchema>;
export type DocumentoExtraido = z.infer<typeof DocumentoExtraidoSchema>;
export type RespostaExtracao = z.infer<typeof RespostaExtracaoSchema>;

export type MetodoExtracao = "xml" | "pdf_texto" | "visao";
