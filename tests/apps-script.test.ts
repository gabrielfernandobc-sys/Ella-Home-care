/** Versão gratuita para celular (Apps Script): a lógica pura roda igual aqui no Node. */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { describe, expect, it } from "vitest";
import { montarXmlNfe, NOTAS, totalNota } from "@/lib/exemplos/ficticios";

const L = createRequire(import.meta.url)(path.join(process.cwd(), "apps-script/src/Logica.js"));
const ops = { hoje: "2026-11-25", granularidade: "item" };

describe("XML da NF-e sem IA", () => {
  it("lê emitente, nota, itens e total; nunca lê destinatário nem dados de paciente", () => {
    const d = L.ceLerXml(montarXmlNfe(NOTAS[0]));
    expect(d.fornecedor).toBe(NOTAS[0].fornecedor);
    expect(L.ceCnpjValido(d.cnpj)).toBe(true);
    expect(d.numero).toBe("1201");
    expect(d.data).toBe("2026-11-03");
    expect(d.total).toBe(totalNota(NOTAS[0]));
    expect(d.itens).toHaveLength(3);
    expect(d.itens[0].categoria).toBe("material de consumo");
    expect(JSON.stringify(d)).not.toMatch(/DESTINATARIO|Paciente/i);
    const linhas = L.ceLinhasDoDocumento(d, { granularidade: "item", arquivo: "a.xml", lote: "L1" });
    const probs = L.ceValidar(linhas, d, ops);
    expect(probs.every((p: unknown[]) => p.length === 0)).toBe(true);
  });

  it("nota com total errado fica amarela", () => {
    const xml = montarXmlNfe(NOTAS[2]).replace(/<vNF>[\d.]+<\/vNF>/, "<vNF>999.99</vNF>");
    const d = L.ceLerXml(xml);
    const p = L.ceValidar(L.ceLinhasDoDocumento(d, { granularidade: "item" }), d, ops);
    expect(L.ceCor(p[0], false)).toBe("amarelo");
  });

  it("recusa XML de evento e XML com DOCTYPE", () => {
    expect(() => L.ceLerXml("<procEventoNFe><evento/></procEventoNFe>")).toThrow(/evento/);
    expect(() => L.ceLerXml('<!DOCTYPE x><infNFe/>')).toThrow();
  });
});

describe("texto reconhecido de DANFE (OCR gratuito)", async () => {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync("exemplos/pdf/danfe-ficticia-farmacia.pdf")));
  const { text } = await extractText(pdf, { mergePages: true });
  const d = L.ceLerTexto(text);

  it("a chave de acesso dá CNPJ e número com certeza", () => {
    expect(L.ceChaveValida(d.chave)).toBe(true);
    expect(d.cnpj).toBe("22.333.444/0001-81");
    expect(d.numero).toBe("88342");
    expect(d.incertos).not.toContain("numero");
  });

  it("acha data, total e só aceita itens que conferem (qtd x unitário = total)", () => {
    expect(d.data).toBe("2026-11-05");
    expect(d.total).toBe(totalNota(NOTAS[1]));
    expect(d.itens.map((i: { total: number }) => i.total)).toEqual([90, 93, 122.4]);
    expect(d.itens[0].descricao).toMatch(/DIPIRONA 500MG/);
  });

  it("apaga CPF e nome de paciente do texto", () => {
    expect(JSON.stringify(d)).not.toMatch(/000\.000\.000-00|NOME FICT/);
  });
});

describe("texto reconhecido de um print", () => {
  // Como o OCR do Google devolve o print fictício "Sistema de Compras — NF 2290".
  const ocr = [
    "Sistema de Compras — Papelaria Gama Demonstração ME",
    "NF 2290 · EXEMPLO FICTÍCIO (dados inventados)",
    "Item Qtd Vl. Unit. Vl. Total",
    "Caneta esferográfica azul cx/50 2 R$ 42,00 R$ 84,00",
    "Papel A4 75g resma 500fl 10 R$ 27,90 R$ 279,00",
    "Emissão 21/11/2026 · Total R$ 363,00 · CNPJ 33.444.555/0001-81",
  ].join("\n");
  const d = L.ceLerTexto(ocr);

  it("lê o que dá para conferir e marca o resto para conferência", () => {
    expect(d.cnpj).toBe("33.444.555/0001-81");
    expect(d.data).toBe("2026-11-21");
    expect(d.total).toBe(363);
    expect(d.itens).toHaveLength(2);
    expect(d.itens[1]).toMatchObject({ quantidade: 10, unitario: 27.9, total: 279 });
    expect(d.fornecedor).toMatch(/Papelaria Gama/);
    expect(d.incertos).toContain("fornecedor"); // fornecedor lido de imagem sempre pede conferência
    const linhas = L.ceLinhasDoDocumento(d, { granularidade: "item" });
    const p = L.ceValidar(linhas, d, ops);
    expect(L.ceCor(p[0], false)).toBe("amarelo");
  });

  it("nunca inventa: sem total legível, fica vazio", () => {
    const sem = L.ceLerTexto("Loja Exemplo Ltda\nCaneta 2 3,00 6,00");
    expect(sem.total).toBeNull();
    expect(sem.itens).toHaveLength(1);
  });
});

describe("planilha", () => {
  it("propõe colunas e nunca usa coluna com fórmula", () => {
    const mapa = L.ceProporMapeamento(["Data", "Fornecedor", "CNPJ", "Nº NF", "Descrição", "Qtd", "Un", "Valor Unitário", "Valor Total"], "item", [8]);
    expect(mapa).toEqual(["data", "fornecedor", "cnpj", "numero", "descricao", "quantidade", "unidade", "unitario", null]);
  });

  it("acha a última linha com dados e a linha de totais; estende a soma", () => {
    const formulas = [["Data", "Item", "Total"], ["01/11", "A", "=B2"], ["02/11", "B", "=B3"], ["TOTAL", "", "=SOMA(C2:C3)"]];
    const valores = [["Data", "Item", "Total"], ["01/11", "A", "1"], ["02/11", "B", "2"], ["TOTAL", "", "3"]];
    expect(L.ceAnalisarAba(formulas, valores, 1)).toEqual({ ultimaLinha: 3, linhaTotais: 4, colunasFormula: [2] });
    expect(L.ceEstenderIntervalos("=SOMA(C2:C3)", 3, 5)).toBe("=SOMA(C2:C5)");
  });

  it("texto que viraria fórmula ou número fica como texto", () => {
    expect(L.ceValorCelula("descricao", "=HIPERLINK(1)")).toBe("'=HIPERLINK(1)");
    expect(L.ceValorCelula("numero", "000123")).toBe("'000123");
    expect(L.ceValorCelula("total_item", "1.234,50")).toBe(1234.5);
    expect(L.ceValorCelula("data", "2026-11-05")).toEqual(new Date(2026, 10, 5));
  });

  it("chaves de duplicata batem entre XML e DANFE da mesma nota", () => {
    const x = L.ceLinhasDoDocumento(L.ceLerXml(montarXmlNfe(NOTAS[1])), { granularidade: "item" })[0];
    const k = L.ceChavesDocumento(x);
    expect(k.some((c: string) => c.startsWith("nfe:"))).toBe(true);
  });
});
