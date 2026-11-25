/** Transforma documentos extraídos em linhas da planilha e aplica o de/para da usuária. */
import type { CampoId, Confianca, ConfiancaLinha, Granularidade, ValoresLinha } from "./campos";
import { chaveCnpj, formatarCnpj } from "./cnpj";
import type { DocumentoExtraido } from "./extracao/schema";
import { normalizar, parseData } from "./texto";

export interface LinhaGerada {
  valores: ValoresLinha;
  confianca: ConfiancaLinha;
}

const pior = (...cs: (Confianca | undefined)[]): Confianca =>
  cs.includes("baixa") ? "baixa" : cs.includes("media") ? "media" : "alta";

export function camposDoDocumento(doc: DocumentoExtraido): { valores: ValoresLinha; confianca: ConfiancaLinha } {
  const cnpj = doc.cnpj ? chaveCnpj(doc.cnpj) : "";
  return {
    valores: {
      data_emissao: parseData(doc.data_emissao),
      fornecedor: doc.fornecedor?.trim() || null,
      cnpj: cnpj ? formatarCnpj(cnpj) : null,
      numero_nota: doc.numero_nota?.trim() || null,
      chave_acesso: doc.chave_acesso ? doc.chave_acesso.replace(/\D/g, "") || null : null,
      total_nota: doc.total_nota,
      forma_pagamento: doc.forma_pagamento?.trim() || null,
      centro_custo: doc.centro_custo?.trim() || null,
      observacoes: doc.observacoes?.trim() || null,
    },
    confianca: {
      data_emissao: doc.data_emissao && !parseData(doc.data_emissao) ? "baixa" : doc.confianca.data_emissao,
      fornecedor: doc.confianca.fornecedor,
      cnpj: doc.confianca.cnpj,
      numero_nota: doc.confianca.numero_nota,
      total_nota: doc.confianca.total_nota,
      forma_pagamento: doc.confianca.forma_pagamento,
    },
  };
}

export function documentoParaLinhas(
  doc: DocumentoExtraido,
  opcoes: { granularidade: Granularidade; arquivo: string; loteId: string },
): LinhaGerada[] {
  const base = camposDoDocumento(doc);
  const app: ValoresLinha = { arquivo_origem: opcoes.arquivo, id_lote: opcoes.loteId };

  if (opcoes.granularidade === "nota") {
    const descricoes = doc.itens.map((i) => i.descricao).filter(Boolean) as string[];
    const resumo =
      descricoes.length <= 3
        ? descricoes.join("; ")
        : `${descricoes.slice(0, 3).join("; ")} e mais ${descricoes.length - 3} ${descricoes.length - 3 === 1 ? "item" : "itens"}`;
    const contagem = new Map<string, number>();
    for (const i of doc.itens) if (i.categoria) contagem.set(i.categoria, (contagem.get(i.categoria) ?? 0) + 1);
    const categoria = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return [
      {
        valores: {
          ...base.valores,
          ...app,
          descricao: resumo || null,
          categoria,
          valor_total_item: doc.total_nota,
          quantidade: null,
          unidade: null,
          valor_unitario: null,
        },
        confianca: {
          ...base.confianca,
          descricao: pior(...doc.itens.map((i) => i.confianca.descricao)),
          categoria: pior(...doc.itens.map((i) => i.confianca.categoria)),
          valor_total_item: doc.confianca.total_nota,
        },
      },
    ];
  }

  if (doc.itens.length === 0) {
    return [
      {
        valores: { ...base.valores, ...app, descricao: null, valor_total_item: null },
        confianca: { ...base.confianca, descricao: "baixa", valor_total_item: "baixa" },
      },
    ];
  }

  return doc.itens.map((item) => ({
    valores: {
      ...base.valores,
      ...app,
      descricao: item.descricao?.trim() || null,
      categoria: item.categoria,
      quantidade: item.quantidade,
      unidade: item.unidade?.trim() || null,
      valor_unitario: item.valor_unitario,
      valor_total_item: item.valor_total,
    },
    confianca: {
      ...base.confianca,
      descricao: item.confianca.descricao,
      categoria: item.confianca.categoria,
      quantidade: item.confianca.quantidade,
      unidade: item.confianca.unidade,
      valor_unitario: item.confianca.valor_unitario,
      valor_total_item: item.confianca.valor_total,
    },
  }));
}

/** Campos em que a usuária pode ensinar um "de -> para". */
export const CAMPOS_DEPARA: CampoId[] = ["descricao", "fornecedor", "unidade", "categoria", "forma_pagamento", "centro_custo"];

/** campo -> (texto original normalizado -> texto corrigido) */
export type TabelaDePara = Map<CampoId, Map<string, string>>;

export function aplicarDePara(
  valores: ValoresLinha,
  tabela: TabelaDePara,
): { valores: ValoresLinha; aplicados: { campo: CampoId; de: string; para: string }[] } {
  const novo = { ...valores };
  const aplicados: { campo: CampoId; de: string; para: string }[] = [];
  for (const campo of CAMPOS_DEPARA) {
    const atual = novo[campo];
    if (typeof atual !== "string" || !atual) continue;
    const para = tabela.get(campo)?.get(normalizar(atual));
    if (para && para !== atual) {
      novo[campo] = para;
      aplicados.push({ campo, de: atual, para });
    }
  }
  return { valores: novo, aplicados };
}
