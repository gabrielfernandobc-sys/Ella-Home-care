/**
 * Leitura direta do XML da NF-e / NFC-e (modelos 55 e 65), sem IA.
 * Lê só dados do emitente (fornecedor), da nota e dos itens.
 * O destinatário e as informações complementares NÃO são lidos (podem conter dados pessoais).
 */
import { XMLParser } from "fast-xml-parser";
import { formatarCnpj } from "../cnpj";
import { arredondar, parseData } from "../texto";
import { categoriaPorNcm, categoriaPorTexto } from "./categoria";
import type { DocumentoExtraido, ItemExtraido } from "./schema";

const FORMAS_PAGAMENTO: Record<string, string> = {
  "01": "Dinheiro",
  "02": "Cheque",
  "03": "Cartão de crédito",
  "04": "Cartão de débito",
  "05": "Crédito loja",
  "10": "Vale alimentação",
  "11": "Vale refeição",
  "12": "Vale presente",
  "13": "Vale combustível",
  "15": "Boleto bancário",
  "16": "Depósito bancário",
  "17": "PIX",
  "18": "Transferência bancária",
  "19": "Programa de fidelidade",
  "20": "PIX",
  "90": "Sem pagamento",
  "99": "Outros",
};

export class ErroXml extends Error {}

/** Nó do XML já convertido em objeto. */
type No = { [chave: string]: unknown };
const no = (v: unknown): No => (v && typeof v === "object" ? (v as No) : {});
const lista = (v: unknown): No[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v.map(no) : [no(v)]);
const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s : null;
};

/** O conteúdo parece um XML de NF-e? */
export function ehXmlNfe(conteudo: string): boolean {
  return /<infNFe[\s>]/.test(conteudo);
}

export function lerXmlNfe(conteudo: string): DocumentoExtraido {
  // NF-e nunca tem DOCTYPE; recusar evita ataques de expansão de entidades.
  if (/<!DOCTYPE|<!ENTITY/i.test(conteudo)) throw new ErroXml("XML com estrutura não permitida (DOCTYPE).");
  if (/<procEventoNFe|<envEvento/.test(conteudo) && !/<infNFe[\s>]/.test(conteudo)) {
    throw new ErroXml("Este XML é de um evento (cancelamento ou carta de correção), não de uma nota.");
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@",
    removeNSPrefix: true,
    parseTagValue: false, // mantém tudo como texto (evita perder zeros à esquerda)
    processEntities: true,
    // Proteção contra XML malicioso
    htmlEntities: false,
  });
  let raiz: Record<string, unknown>;
  try {
    raiz = parser.parse(conteudo);
  } catch {
    throw new ErroXml("O XML está corrompido ou incompleto.");
  }
  const procurar = (obj: unknown, chave: string): unknown => {
    if (!obj || typeof obj !== "object") return undefined;
    const o = obj as Record<string, unknown>;
    if (chave in o) return o[chave];
    for (const v of Object.values(o)) {
      const r = procurar(v, chave);
      if (r !== undefined) return r;
    }
    return undefined;
  };
  const achado = procurar(raiz, "infNFe");
  if (!achado || typeof achado !== "object") throw new ErroXml("Não encontrei os dados da nota (infNFe) neste XML.");
  const inf = no(achado);

  const ide = no(inf.ide);
  const emit = no(inf.emit);
  const tot = no(no(inf.total).ICMSTot);
  const idAttr = txt(inf["@Id"]) ?? "";
  const chProt = txt(procurar(raiz, "chNFe"));
  const chave = (chProt ?? idAttr.replace(/^NFe/, "")).replace(/\D/g, "") || null;

  const itens: ItemExtraido[] = lista(inf.det).map((det) => {
    const p = no(det.prod);
    const descricao = txt(p.xProd);
    const sug = categoriaPorNcm(txt(p.NCM)) ?? categoriaPorTexto(descricao);
    return {
      descricao,
      quantidade: num(p.qCom),
      unidade: txt(p.uCom),
      valor_unitario: num(p.vUnCom),
      valor_total: num(p.vProd),
      categoria: sug?.categoria ?? "outros",
      confianca: {
        descricao: "alta",
        quantidade: "alta",
        unidade: "alta",
        valor_unitario: "alta",
        valor_total: "alta",
        categoria: sug?.confianca ?? "baixa",
      },
    };
  });

  const vNF = num(tot.vNF);
  const vProd = num(tot.vProd);
  const vDesc = num(tot.vDesc) ?? 0;
  // Tudo que entra no total além dos produtos (frete, seguro, impostos, outras despesas).
  const acrescimos = vNF !== null && vProd !== null ? arredondar(vNF - vProd + vDesc) : num(tot.vFrete);

  const pag = no(inf.pag);
  const pagamentos = lista(pag.detPag ?? (pag.tPag ? pag : undefined))
    .map((d) => FORMAS_PAGAMENTO[txt(d.tPag) ?? ""] ?? null)
    .filter(Boolean) as string[];

  const cnpj = txt(emit.CNPJ);
  return {
    tipo_documento: txt(ide.mod) === "65" ? "nfce" : "nfe",
    data_emissao: parseData(txt(ide.dhEmi) ?? txt(ide.dEmi)),
    fornecedor: txt(emit.xNome) ?? txt(emit.xFant),
    // Emitente pessoa física (CPF) não é guardado.
    cnpj: cnpj ? formatarCnpj(cnpj) : null,
    numero_nota: txt(ide.nNF),
    chave_acesso: chave,
    total_nota: vNF,
    valor_frete: acrescimos,
    valor_desconto: vDesc || null,
    forma_pagamento: [...new Set(pagamentos)].join(" + ") || null,
    centro_custo: null,
    observacoes: null,
    itens,
    confianca: {
      data_emissao: "alta",
      fornecedor: "alta",
      cnpj: "alta",
      numero_nota: "alta",
      total_nota: "alta",
      forma_pagamento: "alta",
    },
  };
}
