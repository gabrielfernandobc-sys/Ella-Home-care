import { describe, expect, it } from "vitest";
import { chaveAcessoValida, cnpjValido } from "@/lib/cnpj";
import { FORNECEDORES, montarXmlNfe, NOTAS, totalNota } from "@/lib/exemplos/ficticios";
import { categoriaPorNcm, categoriaPorTexto } from "@/lib/extracao/categoria";
import { detectarTipo } from "@/lib/extracao/imagem";
import { lerXmlNfe } from "@/lib/extracao/nfe-xml";
import { limparDocumento, mascarar } from "@/lib/extracao/privacidade";
import { documentoParaLinhas } from "@/lib/linhas";
import { validarDocumento } from "@/lib/validacao";

describe("XML de NF-e (sem IA)", () => {
  const nota = NOTAS[0];
  const doc = lerXmlNfe(montarXmlNfe(nota));

  it("lê emitente, número, data, chave e itens", () => {
    expect(doc.fornecedor).toBe(FORNECEDORES.alfa.nome);
    expect(cnpjValido(doc.cnpj)).toBe(true);
    expect(doc.numero_nota).toBe("1201");
    expect(doc.data_emissao).toBe("2026-11-03");
    expect(chaveAcessoValida(doc.chave_acesso)).toBe(true);
    expect(doc.itens).toHaveLength(3);
    expect(doc.itens[1]).toMatchObject({ quantidade: 200, valor_unitario: 0.38, valor_total: 76, unidade: "UN" });
    expect(doc.total_nota).toBe(totalNota(nota));
    expect(doc.forma_pagamento).toBe("Boleto bancário");
  });

  it("nunca lê destinatário nem informações complementares (dados pessoais)", () => {
    const json = JSON.stringify(doc);
    expect(json).not.toMatch(/DESTINATARIO/);
    expect(json).not.toMatch(/Paciente/i);
  });

  it("categoria pelo NCM", () => {
    expect(doc.itens.map((i) => i.categoria)).toEqual(["material de consumo", "material de consumo", "material de consumo"]);
    const farmacia = lerXmlNfe(montarXmlNfe(NOTAS[1]));
    expect(farmacia.itens.every((i) => i.categoria === "medicamento")).toBe(true);
  });

  it("validações passam (verde) para notas corretas, com frete e desconto", () => {
    for (const n of NOTAS) {
      const d = lerXmlNfe(montarXmlNfe(n));
      const linhas = documentoParaLinhas(d, { granularidade: "item", arquivo: "x.xml", loteId: "L1" });
      const problemas = validarDocumento(
        linhas,
        { frete: d.valor_frete, desconto: d.valor_desconto },
        { hoje: "2026-11-25", obrigatorios: ["data_emissao", "fornecedor", "descricao", "valor_total_item"], granularidade: "item" },
      );
      expect(problemas.flat()).toEqual([]);
    }
  });

  it("recusa XML com DOCTYPE e XML de evento", () => {
    expect(() => lerXmlNfe('<!DOCTYPE x [<!ENTITY a "b">]><infNFe/>')).toThrow();
    expect(() => lerXmlNfe("<procEventoNFe><evento/></procEventoNFe>")).toThrow(/evento/);
  });
});

describe("tipos de arquivo", () => {
  it("detecta pelo conteúdo", () => {
    expect(detectarTipo(new TextEncoder().encode("%PDF-1.7"), "a.bin")).toBe("pdf");
    expect(detectarTipo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "a")).toBe("jpeg");
    expect(detectarTipo(new TextEncoder().encode("﻿  <?xml"), "a")).toBe("xml");
    const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode("ftypheic")]);
    expect(detectarTipo(heic, "foto.HEIC")).toBe("heic");
  });
});

describe("privacidade", () => {
  it("mascara CPF, cartão SUS e nome de paciente antes de enviar à IA", () => {
    const t = mascarar("Paciente: Fulano de Tal\nCPF: 123.456.789-09\nCNS 123 4567 8901 2345\nTotal R$ 10,00");
    expect(t).not.toMatch(/Fulano|123\.456|8901/);
    expect(t).toMatch(/Total R\$ 10,00/);
  });
  it("limpa a resposta da IA: CPF no lugar do CNPJ e observação com dado de paciente", () => {
    const d = limparDocumento({
      tipo_documento: "recibo",
      data_emissao: null,
      fornecedor: "Loja",
      cnpj: "123.456.789-09",
      numero_nota: null,
      chave_acesso: null,
      total_nota: 1,
      valor_frete: null,
      valor_desconto: null,
      forma_pagamento: null,
      centro_custo: null,
      observacoes: "Entregar no leito 12 do paciente",
      itens: [],
      confianca: { data_emissao: "baixa", fornecedor: "alta", cnpj: "alta", numero_nota: "baixa", total_nota: "alta", forma_pagamento: "baixa" },
    });
    expect(d.cnpj).toBeNull();
    expect(d.observacoes).toBeNull();
  });
});

describe("categoria", () => {
  it("por NCM e por palavras", () => {
    expect(categoriaPorNcm("30049099")?.categoria).toBe("medicamento");
    expect(categoriaPorNcm("30059090")?.categoria).toBe("material de consumo");
    expect(categoriaPorTexto("Luvas de procedimento")?.categoria).toBe("material de consumo");
    expect(categoriaPorTexto("Amoxicilina 500mg")?.categoria).toBe("medicamento");
    expect(categoriaPorTexto("Caneta azul")?.categoria).toBe("escritório");
    expect(categoriaPorTexto("Notebook CPU")).toBeNull();
  });
});

describe("linhas", () => {
  const doc = lerXmlNfe(montarXmlNfe(NOTAS[1]));
  it("uma linha por item", () => {
    const l = documentoParaLinhas(doc, { granularidade: "item", arquivo: "n.xml", loteId: "L9" });
    expect(l).toHaveLength(3);
    expect(l[0].valores).toMatchObject({ descricao: "DIPIRONA 500MG C/10 CP", arquivo_origem: "n.xml", id_lote: "L9" });
  });
  it("uma linha por nota", () => {
    const l = documentoParaLinhas(doc, { granularidade: "nota", arquivo: "n.xml", loteId: "L9" });
    expect(l).toHaveLength(1);
    expect(l[0].valores.valor_total_item).toBe(totalNota(NOTAS[1]));
    expect(l[0].valores.categoria).toBe("medicamento");
  });
});

describe("XML com total inconsistente", () => {
  it("não esconde a diferença (fica amarelo)", () => {
    const xml = montarXmlNfe(NOTAS[2]).replace(/<vNF>[\d.]+<\/vNF>/, "<vNF>999.99</vNF>");
    const d = lerXmlNfe(xml);
    const linhas = documentoParaLinhas(d, { granularidade: "item", arquivo: "x.xml", loteId: "L" });
    const p = validarDocumento(linhas, { frete: d.valor_frete, desconto: d.valor_desconto }, {
      hoje: "2026-11-25",
      obrigatorios: [],
      granularidade: "item",
    });
    expect(p[0].some((x) => /soma dos itens/i.test(x.mensagem))).toBe(true);
  });
});
