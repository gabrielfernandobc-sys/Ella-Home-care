/**
 * Proteção de dados pessoais (LGPD): o app nunca deve guardar nem lançar
 * dados de pacientes ou de pessoas físicas que apareçam em notas e prints.
 * - mascarar() é aplicada ao texto ANTES de enviar à IA (PDF com texto e XML diferentes de NF-e);
 * - limparDocumento() é aplicada a tudo que a IA devolve, por garantia.
 */
import type { DocumentoExtraido } from "./schema";

const CPF_FORMATADO = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CPF_ROTULADO = /\b(CPF|C\.P\.F\.?)\s*[:nº°.-]*\s*\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/gi;
const CNS = /\b(CNS|cart[aã]o\s+(do\s+)?sus)\s*[:nº°.-]*\s*\d[\d\s]{13,17}\d\b/gi;
const RG = /\b(RG|R\.G\.)\s*[:nº°.-]*\s*[\dXx.\-]{5,14}\b/g;
const ROTULOS_PACIENTE =
  /\b(paciente|nome do paciente|prontu[aá]rio|leito|benefici[aá]rio|respons[aá]vel legal|m[aã]e do paciente)\s*[:\-]\s*[^\n;|]*/gi;

export function mascarar(texto: string): string {
  return texto
    .replace(CPF_ROTULADO, "$1: [removido]")
    .replace(CPF_FORMATADO, "[CPF removido]")
    .replace(CNS, "$1: [removido]")
    .replace(RG, "$1: [removido]")
    .replace(ROTULOS_PACIENTE, (_m, rotulo: string) => `${rotulo}: [removido]`);
}

/** Tem cara de dado pessoal? Usado para esvaziar campos de texto livre. */
export function pareceDadoPessoal(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return (
    new RegExp(CPF_FORMATADO.source).test(texto) ||
    /\b(paciente|prontu[aá]rio|leito|cart[aã]o sus)\b/i.test(texto)
  );
}

export function limparDocumento(doc: DocumentoExtraido): DocumentoExtraido {
  const limpar = (s: string | null) => (s ? mascarar(s) : s);
  const cnpj = doc.cnpj && doc.cnpj.replace(/\D/g, "").length === 11 ? null : doc.cnpj; // CPF no lugar do CNPJ: descarta
  return {
    ...doc,
    cnpj,
    fornecedor: limpar(doc.fornecedor),
    observacoes: pareceDadoPessoal(doc.observacoes) ? null : limpar(doc.observacoes),
    centro_custo: limpar(doc.centro_custo),
    forma_pagamento: limpar(doc.forma_pagamento),
    itens: doc.itens.map((i) => ({ ...i, descricao: limpar(i.descricao) })),
  };
}
