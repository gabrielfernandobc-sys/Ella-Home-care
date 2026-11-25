/**
 * Exporta o relatório do mês em Excel (.xlsx). O arquivo é gerado neste computador e baixado
 * pelo navegador; nada é enviado para fora. Cada compra traz a aba e a linha da planilha de origem.
 */
import ExcelJS from "exceljs";
import type { Relatorio } from "../relatorios";
import { dataParaBR, MESES } from "../texto";

const MOEDA = '"R$" #,##0.00';
const PCT = '0.0"%"';

export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]} de ${a}`;
}

function cabecalho(ws: ExcelJS.Worksheet, colunas: { titulo: string; largura: number; formato?: string }[]) {
  ws.columns = colunas.map((c) => ({ header: c.titulo, width: c.largura, style: c.formato ? { numFmt: c.formato } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE7EEF8" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function exportarRelatorioXlsx(r: Relatorio, planilha: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Compras Express";
  wb.created = new Date();
  const { resumo } = r;

  const ws = wb.addWorksheet("Resumo");
  ws.columns = [{ width: 36 }, { width: 22 }];
  const linhas: [string, string | number | null, string?][] = [
    ["Relatório de compras", nomeDoMes(resumo.mes)],
    ["Planilha", planilha],
    ["Gerado em", new Date().toLocaleString("pt-BR")],
    ["", ""],
    ["Total do mês", resumo.total, MOEDA],
    [`Total de ${nomeDoMes(resumo.mesAnterior.mes)}`, resumo.mesAnterior.total, MOEDA],
    ["Variação em relação ao mês anterior", resumo.mesAnterior.variacao, PCT],
    ["Linhas de compra no mês", resumo.linhas],
    ["Fornecedores diferentes", resumo.fornecedores],
    ["Compras com preço fora do padrão", r.alertas.length],
    ["Linhas do mês sem valor (fora da soma)", resumo.semValor],
    ["Linhas da planilha sem data válida", resumo.semData],
  ];
  linhas.forEach(([a, b, fmt], i) => {
    const row = ws.getRow(i + 1);
    row.getCell(1).value = a;
    row.getCell(2).value = b ?? "—";
    if (fmt && typeof b === "number") row.getCell(2).numFmt = fmt;
  });
  ws.getRow(1).font = { bold: true, size: 14 };

  const cat = wb.addWorksheet("Por categoria");
  cabecalho(cat, [
    { titulo: "Categoria", largura: 26 },
    { titulo: "Total", largura: 16, formato: MOEDA },
    { titulo: "% do mês", largura: 12, formato: PCT },
    { titulo: "Linhas", largura: 10 },
  ]);
  for (const f of resumo.porCategoria) cat.addRow([f.nome, f.total, f.percentual, f.linhas]);

  const forn = wb.addWorksheet("Por fornecedor");
  cabecalho(forn, [
    { titulo: "Fornecedor", largura: 44 },
    { titulo: "Total", largura: 16, formato: MOEDA },
    { titulo: "% do mês", largura: 12, formato: PCT },
    { titulo: "Linhas", largura: 10 },
  ]);
  for (const f of resumo.porFornecedor) forn.addRow([f.nome, f.total, f.percentual, f.linhas]);

  const evo = wb.addWorksheet("Evolução");
  cabecalho(evo, [
    { titulo: "Mês", largura: 22 },
    { titulo: "Total", largura: 16, formato: MOEDA },
  ]);
  for (const s of r.serie) evo.addRow([nomeDoMes(s.mes), s.total]);

  const al = wb.addWorksheet("Preços fora do padrão");
  cabecalho(al, [
    { titulo: "Data", largura: 12 },
    { titulo: "Fornecedor", largura: 34 },
    { titulo: "Item", largura: 36 },
    { titulo: "Unidade", largura: 10 },
    { titulo: "Preço pago", largura: 14, formato: MOEDA },
    { titulo: "Preço normal", largura: 14, formato: MOEDA },
    { titulo: "Variação", largura: 12, formato: PCT },
    { titulo: "Compras comparadas", largura: 12 },
    { titulo: "Aba", largura: 16 },
    { titulo: "Linha", largura: 8 },
  ]);
  for (const a of r.alertas) {
    al.addRow([dataParaBR(a.data), a.fornecedor, a.descricao, a.unidade, a.pago, a.normal, a.variacao, a.compras, a.aba, a.linha]);
  }

  const comp = wb.addWorksheet("Compras do mês");
  cabecalho(comp, [
    { titulo: "Data", largura: 12 },
    { titulo: "Fornecedor", largura: 34 },
    { titulo: "Item", largura: 36 },
    { titulo: "Categoria", largura: 18 },
    { titulo: "Qtd", largura: 8 },
    { titulo: "Unidade", largura: 10 },
    { titulo: "Unitário", largura: 13, formato: MOEDA },
    { titulo: "Total", largura: 14, formato: MOEDA },
    { titulo: "Aba", largura: 16 },
    { titulo: "Linha", largura: 8 },
  ]);
  for (const c of r.compras) {
    comp.addRow([dataParaBR(c.data), c.fornecedor, c.descricao, c.categoria, c.quantidade, c.unidade, c.unitario, c.total, c.aba, c.linha]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
