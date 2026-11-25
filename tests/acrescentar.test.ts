import { describe, expect, it } from "vitest";
import type { ValoresLinha } from "@/lib/campos";
import type { Mapeamento } from "@/lib/mapeamento";
import { acrescentarLinhas } from "@/lib/planilha/acrescentar";
import { estenderIntervalos, ehLinhaDeTotais } from "@/lib/planilha/formulas";
import { PlanilhaMemoria } from "@/lib/planilha/memoria";
import { analisarAba } from "@/lib/planilha/planejador";

// Planilha fictícia: cabeçalho, 3 linhas, coluna F com fórmula (Qtd x Unitário) e linha de totais.
function planilhaExemplo() {
  return PlanilhaMemoria.de({
    Compras: [
      ["Data", "Fornecedor", "Descrição", "Qtd", "Valor Unitário", "Valor Total", "Arquivo"],
      ["03/11/2026", "Distribuidora Alfa (fictícia)", "Luva de procedimento M", 2, 25, "=D2*E2", "a.xml"],
      ["05/11/2026", "Farmácia Beta (fictícia)", "Dipirona 500 mg", 10, 1.5, "=D3*E3", "b.pdf"],
      ["07/11/2026", "Papelaria Gama (fictícia)", "Papel A4", 1, 30, "=D4*E4", "c.jpg"],
      ["TOTAL", "", "", "", "", "=SOMA(F2:F4)", ""],
    ],
  });
}

const mapa: Mapeamento = [
  "data_emissao",
  "fornecedor",
  "descricao",
  "quantidade",
  "valor_unitario",
  "valor_total_item", // coluna com fórmula: não pode ser escrita
  "arquivo_origem",
];

const novas: ValoresLinha[] = [
  {
    data_emissao: "2026-11-20",
    fornecedor: "Distribuidora Alfa (fictícia)",
    descricao: "Seringa 5 ml",
    quantidade: 100,
    valor_unitario: 0.4,
    valor_total_item: 40,
    arquivo_origem: "d.xml",
  },
  {
    data_emissao: "2026-11-21",
    fornecedor: "Farmácia Beta (fictícia)",
    descricao: "=HYPERLINK(\"http://exemplo.invalid\")",
    quantidade: 1,
    valor_unitario: 12.9,
    valor_total_item: 12.9,
    arquivo_origem: "e.png",
  },
];

describe("acrescentar sem sobrescrever", () => {
  it("detecta cabeçalho, última linha, totais e colunas com fórmula", async () => {
    const p = planilhaExemplo();
    const a = analisarAba(await p.lerGrade("Compras"), 1);
    expect(a.ultimaLinhaDados).toBe(3);
    expect(a.linhaTotais).toBe(4);
    expect(a.colunasFormula).toEqual([5]);
  });

  it("insere antes da linha de totais, preserva linhas antigas e fórmulas, e ajusta a soma", async () => {
    const p = planilhaExemplo();
    const antes = JSON.parse(JSON.stringify(p.estado.abas[0].celulas));

    const r = await acrescentarLinhas({ adaptador: p, aba: "Compras", linhaCabecalho: 1, mapeamento: mapa, linhas: novas });
    const c = p.estado.abas[0].celulas;

    // Linhas antigas intactas, na mesma posição.
    for (let i = 0; i < 4; i++) expect(c[i]).toEqual(antes[i]);
    // Novas linhas logo depois da última linha com dados.
    expect(r.linhas).toEqual([4, 5]);
    expect(c[4].slice(0, 5)).toEqual(["20/11/2026", "Distribuidora Alfa (fictícia)", "Seringa 5 ml", 100, 0.4]);
    // Coluna com fórmula: nunca escrita com valor, recebe a fórmula copiada da linha de cima.
    expect(c[4][5]).toBe("=D5*E5");
    expect(c[5][5]).toBe("=D6*E6");
    // Texto que parecia fórmula foi gravado como texto.
    expect(c[5][2]).toBe(`'=HYPERLINK("http://exemplo.invalid")`);
    // Linha de totais desceu e passou a somar as novas linhas.
    expect(c[6][0]).toBe("TOTAL");
    expect(c[6][5]).toBe("=SOMA(F2:F6)");
    const grade = await p.lerGrade("Compras");
    expect(grade.valores[6][5]).toBe(String(50 + 15 + 30 + 40 + 12.9));
  });

  it("sem linha de totais, acrescenta no fim", async () => {
    const p = PlanilhaMemoria.de({
      Compras: [
        ["Data", "Descrição", "Valor Total"],
        ["01/11/2026", "Item A", 10],
      ],
    });
    const r = await acrescentarLinhas({
      adaptador: p,
      aba: "Compras",
      linhaCabecalho: 1,
      mapeamento: ["data_emissao", "descricao", "valor_total_item"],
      linhas: [{ data_emissao: "2026-11-02", descricao: "Item B", valor_total_item: 5 }],
    });
    expect(r.linhas).toEqual([2]);
    expect(p.estado.abas[0].celulas).toEqual([
      ["Data", "Descrição", "Valor Total"],
      ["01/11/2026", "Item A", 10],
      ["02/11/2026", "Item B", 5],
    ]);
  });

  it("aba vazia (só cabeçalho) recebe as linhas logo abaixo do cabeçalho", async () => {
    const p = PlanilhaMemoria.de({ Compras: [["Data", "Descrição", "Valor Total"]] });
    const r = await acrescentarLinhas({
      adaptador: p,
      aba: "Compras",
      linhaCabecalho: 1,
      mapeamento: ["data_emissao", "descricao", "valor_total_item"],
      linhas: [{ descricao: "Item", valor_total_item: 1 }],
    });
    expect(r.linhas).toEqual([1]);
    expect(p.estado.abas[0].celulas[1]).toEqual(["", "Item", 1]);
  });

  it("não escreve em células vazias (nunca inventa valor)", async () => {
    const p = planilhaExemplo();
    await acrescentarLinhas({
      adaptador: p,
      aba: "Compras",
      linhaCabecalho: 1,
      mapeamento: mapa,
      linhas: [{ descricao: "Sem valor", fornecedor: null }],
    });
    const nova = p.estado.abas[0].celulas[4];
    expect(nova[0] ?? "").toBe("");
    expect(nova[1] ?? "").toBe("");
    expect(nova[2]).toBe("Sem valor");
  });

  it("se a escrita falhar, remove as linhas inseridas e não altera nada", async () => {
    const p = planilhaExemplo();
    const antes = JSON.parse(JSON.stringify(p.estado.abas[0].celulas));
    p.escrever = async () => {
      throw new Error("falha simulada");
    };
    await expect(
      acrescentarLinhas({ adaptador: p, aba: "Compras", linhaCabecalho: 1, mapeamento: mapa, linhas: novas }),
    ).rejects.toThrow(/Nada foi alterado/);
    expect(p.estado.abas[0].celulas).toEqual(antes);
  });
});

describe("fórmulas", () => {
  it("estende só intervalos que terminavam na antiga última linha", () => {
    expect(estenderIntervalos("=SOMA(F2:F4)+SOMA(G2:G9)", 4, 6)).toBe("=SOMA(F2:F6)+SOMA(G2:G9)");
    expect(estenderIntervalos('=SE(A1="F2:F4";1;SOMA($F$2:$F$4))', 4, 6)).toBe('=SE(A1="F2:F4";1;SOMA($F$2:$F$6))');
  });
  it("reconhece a linha de totais", () => {
    expect(ehLinhaDeTotais(["TOTAL", "", "=SOMA(F2:F4)"], 5)).toBe(true);
    expect(ehLinhaDeTotais(["", "", "=SOMA(F2:F4)"], 5)).toBe(true);
    // Soma horizontal na própria linha não é linha de totais.
    expect(ehLinhaDeTotais(["01/11/2026", "Item", "=SOMA(C3:E3)"], 3)).toBe(false);
    expect(ehLinhaDeTotais(["Total Distribuidora (nome de empresa)", "Item", "10"], 3)).toBe(false);
  });
});

describe("aba sem dados com linha de totais", () => {
  it("a soma volta a começar logo abaixo do cabeçalho", async () => {
    const p = PlanilhaMemoria.de({
      Mes: [["Data", "Descrição", "Valor"], [], ["TOTAL", "", "=SOMA(C2:C2)"]],
    });
    await acrescentarLinhas({
      adaptador: p,
      aba: "Mes",
      linhaCabecalho: 1,
      mapeamento: ["data_emissao", "descricao", "valor_total_item"],
      linhas: [{ descricao: "A", valor_total_item: 1 }, { descricao: "B", valor_total_item: 2 }],
    });
    const c = p.estado.abas[0].celulas;
    expect(c[1].slice(1)).toEqual(["A", 1]);
    expect(c[2].slice(1)).toEqual(["B", 2]);
    expect(c[4]).toEqual(["TOTAL", "", "=SOMA(C2:C4)"]);
  });
});
