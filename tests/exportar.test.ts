import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { relatorioCompleto, type RegistroCompra } from "@/lib/relatorios";
import { exportarRelatorioXlsx, nomeDoMes } from "@/lib/servidor/exportar";

const r = (data: string, descricao: string, fornecedor: string, categoria: string, unitario: number, qtd: number, linha: number): RegistroCompra => ({
  data,
  descricao,
  fornecedor,
  categoria,
  unidade: "CX",
  quantidade: qtd,
  unitario,
  total: Math.round(unitario * qtd * 100) / 100,
  aba: "Compras",
  linha,
});

const registros = [
  r("2026-08-05", "Dipirona 500 mg", "Farmácia Beta", "medicamento", 4.4, 10, 2),
  r("2026-09-05", "Dipirona 500 mg", "Farmácia Beta", "medicamento", 4.5, 10, 3),
  r("2026-10-05", "Dipirona 500 mg", "Farmácia Beta", "medicamento", 4.6, 10, 4),
  r("2026-11-05", "Dipirona 500 mg", "Farmácia Beta", "medicamento", 6.9, 10, 5),
  r("2026-11-06", "Caneta azul", "Papelaria Gama", "escritório", 42, 2, 6),
];

describe("exportação do relatório em Excel", () => {
  it("gera as abas com os números do mês e a origem de cada compra", async () => {
    const rel = relatorioCompleto(registros, "2026-11", { usarUnidade: true });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportarRelatorioXlsx(rel, "Planilha fictícia")) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Resumo",
      "Por categoria",
      "Por fornecedor",
      "Evolução",
      "Preços fora do padrão",
      "Compras do mês",
    ]);
    const resumo = wb.getWorksheet("Resumo")!;
    expect(resumo.getCell("B1").value).toBe(nomeDoMes("2026-11"));
    expect(resumo.getCell("B5").value).toBe(153);
    const cat = wb.getWorksheet("Por categoria")!;
    expect(cat.getRow(2).values).toEqual([undefined, "escritório", 84, 54.9, 1]);
    const alertas = wb.getWorksheet("Preços fora do padrão")!;
    expect(alertas.rowCount).toBe(2);
    expect(alertas.getRow(2).getCell(3).value).toBe("Dipirona 500 mg");
    const compras = wb.getWorksheet("Compras do mês")!;
    expect(compras.rowCount).toBe(3);
    expect(compras.getRow(2).getCell(9).value).toBe("Compras");
    expect(compras.getRow(2).getCell(10).value).toBe(5);
  });

  it("nome do mês em português", () => {
    expect(nomeDoMes("2026-03")).toBe("Março de 2026");
  });
});
