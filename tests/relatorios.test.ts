import { describe, expect, it } from "vitest";
import type { Mapeamento } from "@/lib/mapeamento";
import { alertaDePreco, alertasDoMes, mediana, montarHistorico } from "@/lib/precos";
import { mesAnterior, mesesComCompras, registrosDaGrade, resumoMensal, serieMensal, type RegistroCompra } from "@/lib/relatorios";

// Planilha fictícia: J é fórmula (Qtd x Unitário); TOTAL no fim.
const cab = ["Data", "Fornecedor", "Descrição", "Categoria", "Qtd", "Un", "Unitário", "Total"];
const linhas = [
  ["05/10/2026", "Farmácia Beta", "Dipirona 500 mg", "medicamento", "10", "CX", "4,50", "45,00"],
  ["06/11/2026", "Farmácia Beta", "Dipirona 500 mg", "medicamento", "20", "CX", "4,50", "90,00"],
  ["07/11/2026", "FARMACIA BETA LTDA", "Paracetamol 750 mg", "medicamento", "10", "CX", "6,20", "62,00"],
  ["08/11/2026", "Papelaria Gama", "Caneta azul", "escritório", "2", "CX", "42,00", "84,00"],
  ["09/11/2026", "Papelaria Gama", "Papel A4", "", "1", "RS", "", ""],
  ["", "Sem data Ltda", "Item sem data", "outros", "1", "UN", "1,00", "1,00"],
];
const grade = {
  valores: [cab, ...linhas, ["TOTAL", "", "", "", "", "", "", "282,00"]],
  formulas: [cab, ...linhas.map((l, i) => [...l.slice(0, 7), `=E${i + 2}*G${i + 2}`]), ["TOTAL", "", "", "", "", "", "", "=SOMA(H2:H7)"]],
};
const mapa: Mapeamento = ["data_emissao", "fornecedor", "descricao", "categoria", "quantidade", "unidade", "valor_unitario", null];
const registros = registrosDaGrade(grade, { mapeamento: mapa, linhaCabecalho: 1, granularidade: "item" }, "Compras");

describe("registros da planilha", () => {
  it("lê as linhas, para na linha de totais e calcula o total quando a coluna é fórmula", () => {
    expect(registros).toHaveLength(6);
    expect(registros[1]).toMatchObject({ data: "2026-11-06", total: 90, unitario: 4.5, aba: "Compras", linha: 3 });
    expect(registros[4].total).toBeNull(); // sem unitário: nunca inventa valor
  });
});

describe("resumo mensal", () => {
  const r = resumoMensal(registros, "2026-11");
  it("soma o mês, por categoria e por fornecedor (juntando grafias diferentes do mesmo fornecedor)", () => {
    expect(r.total).toBe(236);
    expect(r.linhas).toBe(4);
    expect(r.porCategoria.map((c) => [c.nome, c.total])).toEqual([
      ["medicamento", 152],
      ["escritório", 84],
    ]);
    expect(r.porFornecedor.map((f) => [f.nome, f.total, f.linhas])).toEqual([
      ["Farmácia Beta", 152, 2],
      ["Papelaria Gama", 84, 1],
    ]);
    expect(r.porCategoria[0].percentual).toBe(64.4);
  });
  it("compara com o mês anterior e informa o que ficou de fora", () => {
    expect(r.mesAnterior).toEqual({ mes: "2026-10", total: 45, variacao: 424.4 });
    expect(r.semValor).toBe(1);
    expect(r.semData).toBe(1);
  });
  it("série dos últimos meses e meses com compras", () => {
    expect(serieMensal(registros, "2026-11", 3)).toEqual([
      { mes: "2026-09", total: 0 },
      { mes: "2026-10", total: 45 },
      { mes: "2026-11", total: 236 },
    ]);
    expect(mesesComCompras(registros)).toEqual(["2026-11", "2026-10"]);
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });
  it("planilha com uma linha por nota usa o total da nota", () => {
    const g = { valores: [["Data", "Fornecedor", "Valor"], ["03/11/2026", "Alfa", "1.234,50"]], formulas: [["Data", "Fornecedor", "Valor"], ["03/11/2026", "Alfa", "1234.5"]] };
    const rs = registrosDaGrade(g, { mapeamento: ["data_emissao", "fornecedor", "total_nota"], linhaCabecalho: 1, granularidade: "nota" }, "A");
    expect(resumoMensal(rs, "2026-11").total).toBe(1234.5);
  });
});

describe("alerta de preço fora do padrão", () => {
  const compra = (data: string, unitario: number, descricao = "Dipirona 500 mg", unidade = "CX"): RegistroCompra => ({
    data,
    unitario,
    descricao,
    unidade,
    fornecedor: "X",
    categoria: null,
    quantidade: 1,
    total: unitario,
    aba: "A",
    linha: 1,
  });
  const historico = montarHistorico(
    [compra("2026-08-01", 4.4), compra("2026-09-01", 4.5), compra("2026-10-01", 4.6), compra("2026-10-15", 4.5)],
    true,
  );

  it("mediana", () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 2, 3])).toBe(2.5);
  });

  it("avisa preço bem acima do normal", () => {
    const a = alertaDePreco({ descricao: "DIPIRONA 500 MG", unidade: "cx", unitario: 6.9, data: "2026-11-20" }, historico);
    expect(a).toMatchObject({ tipo: "acima", normal: 4.5, compras: 4 });
    expect(a!.variacao).toBeCloseTo(53.3, 1);
    expect(a!.mensagem).toMatch(/53% acima do normal/);
  });

  it("não avisa variação dentro do normal", () => {
    expect(alertaDePreco({ descricao: "Dipirona 500 mg", unidade: "CX", unitario: 5.2, data: "2026-11-20" }, historico)).toBeNull();
  });

  it("avisa preço muito abaixo (unidade trocada)", () => {
    const a = alertaDePreco({ descricao: "Dipirona 500 mg", unidade: "CX", unitario: 0.45, data: "2026-11-20" }, historico);
    expect(a?.tipo).toBe("abaixo");
    expect(a!.mensagem).toMatch(/Confira a unidade/);
  });

  it("não compara unidades diferentes nem itens sem histórico suficiente", () => {
    expect(alertaDePreco({ descricao: "Dipirona 500 mg", unidade: "UN", unitario: 0.45, data: "2026-11-20" }, historico)).toBeNull();
    expect(alertaDePreco({ descricao: "Outro item", unidade: "CX", unitario: 99, data: "2026-11-20" }, historico)).toBeNull();
    // Só 2 compras antes de 10/10 -> sem padrão ainda.
    expect(alertaDePreco({ descricao: "Dipirona 500 mg", unidade: "CX", unitario: 99, data: "2026-09-15" }, historico)).toBeNull();
  });

  it("ignora compras com mais de 12 meses", () => {
    const antigo = montarHistorico([compra("2025-01-01", 1), compra("2025-02-01", 1), compra("2025-03-01", 1)], true);
    expect(alertaDePreco({ descricao: "Dipirona 500 mg", unidade: "CX", unitario: 9, data: "2026-11-20" }, antigo)).toBeNull();
  });

  it("lista os alertas do mês no relatório", () => {
    const todos = [...[4.4, 4.5, 4.6].map((p, i) => compra(`2026-0${7 + i}-01`, p)), compra("2026-11-10", 7.2), compra("2026-11-12", 4.5)];
    const al = alertasDoMes(todos, "2026-11", true);
    expect(al).toHaveLength(1);
    expect(al[0].registro.data).toBe("2026-11-10");
  });
});
