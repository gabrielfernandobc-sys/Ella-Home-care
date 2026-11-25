import { describe, expect, it } from "vitest";
import {
  detectarLinhaCabecalho,
  indiceColuna,
  letraColuna,
  problemasDoMapeamento,
  proporMapeamento,
} from "@/lib/mapeamento";

describe("proporMapeamento", () => {
  it("mapeia um cabeçalho típico de planilha de compras (uma linha por item)", () => {
    const cab = [
      "Data",
      "Fornecedor",
      "CNPJ",
      "Nº NF",
      "Descrição",
      "Categoria",
      "Qtd",
      "Un",
      "Valor Unitário",
      "Valor Total",
      "Setor",
      "Obs",
    ];
    expect(proporMapeamento(cab, { granularidade: "item" })).toEqual([
      "data_emissao",
      "fornecedor",
      "cnpj",
      "numero_nota",
      "descricao",
      "categoria",
      "quantidade",
      "unidade",
      "valor_unitario",
      "valor_total_item",
      "centro_custo",
      "observacoes",
    ]);
  });

  it("entende variações de escrita, acentos e maiúsculas", () => {
    const cab = ["DT EMISSÃO", "Razão Social", "Produto", "QTDE", "Preço Unit.", "Vl. Total", "Forma de Pagamento"];
    expect(proporMapeamento(cab, { granularidade: "item" })).toEqual([
      "data_emissao",
      "fornecedor",
      "descricao",
      "quantidade",
      "valor_unitario",
      "valor_total_item",
      "forma_pagamento",
    ]);
  });

  it("com uma linha por nota, 'Valor' vira o total da nota", () => {
    const cab = ["Data", "Fornecedor", "Nota Fiscal", "Valor"];
    expect(proporMapeamento(cab, { granularidade: "nota" })).toEqual([
      "data_emissao",
      "fornecedor",
      "numero_nota",
      "total_nota",
    ]);
  });

  it("nunca mapeia colunas com fórmula", () => {
    const cab = ["Data", "Descrição", "Qtd", "Valor Unitário", "Valor Total"];
    const m = proporMapeamento(cab, { granularidade: "item", colunasFormula: [4] });
    expect(m[4]).toBeNull();
    expect(m.filter((x) => x === "valor_total_item")).toHaveLength(0);
  });

  it("cada campo vai para no máximo uma coluna e colunas desconhecidas ficam vazias", () => {
    const cab = ["Data", "Data", "Coluna X", "Total da Nota", "Valor Total"];
    const m = proporMapeamento(cab, { granularidade: "item" });
    expect(m).toEqual(["data_emissao", null, null, "total_nota", "valor_total_item"]);
  });
});

describe("detectarLinhaCabecalho", () => {
  it("acha o cabeçalho mesmo com título acima", () => {
    const valores = [
      ["CONTROLE DE COMPRAS 2026"],
      [],
      ["Data", "Fornecedor", "Descrição", "Valor Total"],
      ["01/11/2026", "Fornecedor Exemplo", "Luva", "10,00"],
    ];
    expect(detectarLinhaCabecalho(valores)).toBe(3);
  });
});

describe("problemasDoMapeamento", () => {
  it("avisa sobre campo repetido e coluna com fórmula", () => {
    const msgs = problemasDoMapeamento(["descricao", "descricao", "valor_total_item"], [2]);
    expect(msgs.join(" ")).toMatch(/duas colunas/);
    expect(msgs.join(" ")).toMatch(/fórmula/);
  });
});

describe("letras de coluna", () => {
  it("converte índice <-> letra", () => {
    expect(letraColuna(0)).toBe("A");
    expect(letraColuna(25)).toBe("Z");
    expect(letraColuna(26)).toBe("AA");
    expect(indiceColuna("AB")).toBe(27);
  });
});
