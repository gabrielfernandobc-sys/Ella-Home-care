/**
 * Gera os arquivos de exemplo FICTÍCIOS da pasta /exemplos:
 *   npm run exemplos                     -> notas XML, PDF, prints e planilha modelo
 *   npm run exemplos -- --lote-grande 100 -> 100 XMLs variados em data/lote-grande (teste de volume)
 * Tudo aqui é inventado: nenhum fornecedor, CNPJ ou valor é real.
 */
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { formatarCnpj } from "../src/lib/cnpj";
import { chaveDaNota, FORNECEDORES, montarXmlNfe, NOTAS, PLANILHA_MODELO, totalNota, type NotaFicticia } from "../src/lib/exemplos/ficticios";

const raiz = path.resolve(import.meta.dirname, "..");
const ex = path.join(raiz, "exemplos");
const brl = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

function escrever(rel: string, conteudo: string | Uint8Array) {
  const p = path.join(ex, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, conteudo);
  console.log("  ✓", path.relative(raiz, p));
}

async function xmls() {
  NOTAS.forEach((n, i) => escrever(`notas-xml/nfe-${i + 1}-${n.numero}.xml`, montarXmlNfe(n)));
  // Nota com total errado (soma dos itens não bate) -> deve ficar amarela na revisão.
  const errada = montarXmlNfe({ ...NOTAS[2], numero: "456" }).replace(/<vNF>[\d.]+<\/vNF>/, "<vNF>999.99</vNF>");
  escrever("notas-xml/nfe-soma-errada.xml", errada);
}

async function pdf(n: NotaFicticia, nome: string) {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([595, 842]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const fb = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  const t = (s: string, x: number, tam = 10, fonte = f) => pagina.drawText(s, { x, y, size: tam, font: fonte, color: rgb(0, 0, 0) });
  t("DANFE - DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRÔNICA (EXEMPLO FICTÍCIO)", 40, 11, fb);
  y -= 22;
  t(`EMITENTE: ${n.fornecedor}`, 40);
  y -= 14;
  t(`CNPJ: ${formatarCnpj(n.cnpj)}`, 40);
  y -= 14;
  t(`NF-e Nº ${n.numero}   SÉRIE 1   DATA DE EMISSÃO: ${dataBR(n.data)}`, 40);
  y -= 14;
  t(`CHAVE DE ACESSO: ${chaveDaNota(n).replace(/(\d{4})/g, "$1 ").trim()}`, 40, 9);
  y -= 14;
  t("DESTINATÁRIO: INSTITUIÇÃO FICTÍCIA DE EXEMPLO", 40);
  y -= 26;
  t("DADOS DOS PRODUTOS", 40, 10, fb);
  y -= 16;
  t("DESCRIÇÃO", 40, 9, fb);
  t("UN", 300, 9, fb);
  t("QTD", 340, 9, fb);
  t("VL. UNIT.", 400, 9, fb);
  t("VL. TOTAL", 480, 9, fb);
  for (const i of n.itens) {
    y -= 14;
    t(i.descricao, 40, 9);
    t(i.unidade, 300, 9);
    t(String(i.quantidade).replace(".", ","), 340, 9);
    t(brl(i.unitario), 400, 9);
    t(brl(Math.round(i.quantidade * i.unitario * 100) / 100), 480, 9);
  }
  y -= 26;
  if (n.frete) {
    t(`VALOR DO FRETE: ${brl(n.frete)}`, 40);
    y -= 14;
  }
  if (n.desconto) {
    t(`DESCONTO: ${brl(n.desconto)}`, 40);
    y -= 14;
  }
  t(`VALOR TOTAL DA NOTA: R$ ${brl(totalNota(n))}`, 40, 11, fb);
  y -= 20;
  t("INFORMAÇÕES COMPLEMENTARES: Paciente: NOME FICTÍCIO  CPF: 000.000.000-00 (deve ser ignorado pelo app)", 40, 8);
  escrever(`pdf/${nome}`, await doc.save());
}

function svgPrint(titulo: string, subtitulo: string, linhas: string[][], rodape: string, estilo: "whatsapp" | "sistema") {
  const largura = 760;
  const altura = 140 + linhas.length * 34 + 70;
  const fundo = estilo === "whatsapp" ? "#e5ddd5" : "#ffffff";
  const cab = estilo === "whatsapp" ? "#075e54" : "#1e3a8a";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cols = [20, 380, 470, 600];
  const corpo = linhas
    .map(
      (l, i) =>
        `<rect x="10" y="${110 + i * 34}" width="${largura - 20}" height="32" fill="${i === 0 ? "#e2e8f0" : i % 2 ? "#f8fafc" : "#ffffff"}"/>` +
        l.map((c, j) => `<text x="${cols[j] + 10}" y="${132 + i * 34}" font-size="17" font-family="DejaVu Sans, Arial, sans-serif" ${i === 0 ? 'font-weight="bold"' : ""}>${esc(c)}</text>`).join(""),
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
  <rect width="100%" height="100%" fill="${fundo}"/>
  <rect width="100%" height="60" fill="${cab}"/>
  <text x="20" y="38" font-size="22" fill="#fff" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold">${esc(titulo)}</text>
  <text x="20" y="92" font-size="16" fill="#334155" font-family="DejaVu Sans, Arial, sans-serif">${esc(subtitulo)} · EXEMPLO FICTÍCIO (dados inventados)</text>
  ${corpo}
  <text x="20" y="${altura - 30}" font-size="18" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold">${esc(rodape)}</text>
</svg>`;
}

async function prints() {
  const pedido = [
    ["Produto", "Qtd", "Unitário", "Total"],
    ["Máscara cirúrgica tripla c/50", "4", "R$ 18,90", "R$ 75,60"],
    ["Álcool gel 70% 500ml", "6", "R$ 9,50", "R$ 57,00"],
    ["Fita micropore 25mm", "10", "R$ 4,20", "R$ 42,00"],
  ];
  const svg1 = svgPrint(
    FORNECEDORES.alfa.nome,
    "Pedido 7731 de 18/11/2026",
    pedido,
    `Total do pedido: R$ 174,60 · CNPJ ${formatarCnpj(FORNECEDORES.alfa.cnpj)} · PIX`,
    "whatsapp",
  );
  escrever("prints/print-pedido-whatsapp.png", await sharp(Buffer.from(svg1)).png().toBuffer());

  const sistema = [
    ["Item", "Qtd", "Vl. Unit.", "Vl. Total"],
    ["Caneta esferográfica azul cx/50", "2", "R$ 42,00", "R$ 84,00"],
    ["Papel A4 75g resma 500fl", "10", "R$ 27,90", "R$ 279,00"],
  ];
  const svg2 = svgPrint(
    `Sistema de Compras — ${FORNECEDORES.gama.nome}`,
    "NF 2290",
    sistema,
    `Emissão 21/11/2026 · Total R$ 363,00 · CNPJ ${formatarCnpj(FORNECEDORES.gama.cnpj)}`,
    "sistema",
  );
  escrever("prints/print-sistema-compras.png", await sharp(Buffer.from(svg2)).png().toBuffer());
}

async function planilha() {
  const wb = new ExcelJS.Workbook();
  const preencher = (ws: ExcelJS.Worksheet, linhas: (string | number)[][]) => {
    linhas.forEach((l, r) =>
      l.forEach((v, c) => {
        const cel = ws.getCell(r + 1, c + 1);
        cel.value = typeof v === "string" && v.startsWith("=") ? { formula: v.slice(1).replace(/SOMA\(/g, "SUM(") } : v;
      }),
    );
    ws.getRow(1).font = { bold: true };
    ws.getRow(linhas.length).font = { bold: true };
    ws.columns.forEach((col, i) => (col.width = [12, 40, 22, 10, 34, 20, 8, 8, 14, 14, 16, 24, 12][i] ?? 14));
    ["I", "J"].forEach((c) => (ws.getColumn(c).numFmt = '"R$" #,##0.00'));
  };
  preencher(wb.addWorksheet("Compras"), PLANILHA_MODELO);
  preencher(wb.addWorksheet("Modelo"), [PLANILHA_MODELO[0], [], ["TOTAL", "", "", "", "", "", "", "", "", "=SUM(J2:J2)", "", "", ""]]);
  const buf = await wb.xlsx.writeBuffer();
  escrever("planilha-modelo.xlsx", new Uint8Array(buf as ArrayBuffer));
}

function loteGrande(qtd: number) {
  const pasta = path.join(raiz, "data", "lote-grande");
  fs.mkdirSync(pasta, { recursive: true });
  for (let i = 0; i < qtd; i++) {
    const base = NOTAS[i % NOTAS.length];
    const n: NotaFicticia = {
      ...base,
      numero: String(50000 + i),
      data: `2026-11-${String((i % 20) + 1).padStart(2, "0")}`,
      // Quantidades diferentes em cada nota: nenhuma nota repete CNPJ + data + valor.
      itens: base.itens.map((it, k) => ({ ...it, quantidade: it.quantidade + i + k })),
    };
    fs.writeFileSync(path.join(pasta, `nfe-${n.numero}.xml`), montarXmlNfe(n));
  }
  console.log(`  ✓ ${qtd} XMLs fictícios em ${path.relative(raiz, pasta)}`);
}

async function main() {
  const i = process.argv.indexOf("--lote-grande");
  if (i >= 0) return loteGrande(Number(process.argv[i + 1] || 100));
  console.log("Gerando exemplos fictícios…");
  await xmls();
  await pdf(NOTAS[1], "danfe-ficticia-farmacia.pdf");
  await prints();
  await planilha();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
