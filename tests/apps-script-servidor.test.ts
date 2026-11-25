/**
 * Simula o Google Apps Script (planilha, Drive, propriedades) para rodar o fluxo completo do
 * Codigo.gs gerado: enviar → revisar → lançar (só acrescenta) → reenviar (0 novas) → desfazer.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { montarXmlNfe, NOTAS } from "@/lib/exemplos/ficticios";
import { gerarCodigo } from "../scripts/gerar-apps-script.mjs";

type Cel = string | number | boolean | Date | null;

class Aba {
  dados: Cel[][] = [];
  formulas: string[][] = [];
  oculta = false;
  constructor(public nome: string) {}
  getName() { return this.nome; }
  hideSheet() { this.oculta = true; }
  getLastRow() {
    for (let r = this.dados.length; r > 0; r--) if ((this.dados[r - 1] || []).some((v, c) => (v !== null && v !== "") || this.formulas[r - 1]?.[c])) return r;
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.dados.map((l) => l.length)); }
  garantir(r: number, c: number) {
    while (this.dados.length < r) { this.dados.push([]); this.formulas.push([]); }
    for (let i = 0; i < r; i++) while (this.dados[i].length < c) { this.dados[i].push(""); this.formulas[i].push(""); }
  }
  exibir(v: Cel): string {
    if (Object.prototype.toString.call(v) === "[object Date]") { const d = v as Date; return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; }
    if (typeof v === "number") return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
    if (typeof v === "string" && v.startsWith("'")) return v.slice(1);
    return v === null ? "" : String(v);
  }
  getRange(r: number, c: number, nr = 1, nc = 1) {
    this.garantir(r + nr - 1, c + nc - 1);
    const mapa = <T,>(f: (rr: number, cc: number) => T) => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => f(r - 1 + i, c - 1 + j)));
    return {
      getValues: () => mapa((i, j) => this.dados[i][j]),
      getDisplayValues: () => mapa((i, j) => this.formulas[i][j] ? "0" : this.exibir(this.dados[i][j])),
      getFormulas: () => mapa((i, j) => this.formulas[i][j]),
      setValues: (v: Cel[][]) => { v.forEach((l, i) => l.forEach((x, j) => { this.dados[r - 1 + i][c - 1 + j] = x; this.formulas[r - 1 + i][c - 1 + j] = ""; })); },
      setValue: (x: Cel) => { this.dados[r - 1][c - 1] = x; },
      setFormula: (f: string) => { this.formulas[r - 1][c - 1] = f; },
      copyTo: (destino: { _r: number; _c: number; _nr: number; _nc: number }, tipo: string) => {
        if (tipo !== "PASTE_FORMULA") return;
        for (let i = 0; i < destino._nr; i++) this.formulas[destino._r - 1 + i][destino._c - 1] = this.formulas[r - 1][c - 1];
      },
      _r: r, _c: c, _nr: nr, _nc: nc,
    };
  }
  insertRowsAfter(depois: number, n: number) {
    const w = this.getLastColumn();
    this.dados.splice(depois, 0, ...Array.from({ length: n }, () => Array(w).fill("")));
    this.formulas.splice(depois, 0, ...Array.from({ length: n }, () => Array(w).fill("")));
  }
  deleteRow(n: number) { this.dados.splice(n - 1, 1); this.formulas.splice(n - 1, 1); }
  appendRow(l: Cel[]) { const r = this.getLastRow() + 1; this.getRange(r, 1, 1, l.length).setValues([l]); }
}

function ambiente(ocr: string) {
  const abas: Aba[] = [];
  const compras = new Aba("Compras");
  abas.push(compras);
  const cab = ["Data", "Fornecedor", "CNPJ", "Nº NF", "Descrição", "Qtd", "Valor Unitário", "Valor Total", "Lote"];
  compras.getRange(1, 1, 1, cab.length).setValues([cab]);
  compras.getRange(2, 1, 1, 9).setValues([[new Date(2026, 9, 1), "Antiga Ltda", "", "'1", "Item antigo", 1, 5, 5, ""]]);
  compras.getRange(3, 1, 1, 9).setValues([["TOTAL", "", "", "", "", "", "", "", ""]]);
  compras.getRange(3, 8).setFormula("=SOMA(H2:H2)");
  const props: Record<string, string> = {};
  const ss = {
    getName: () => "Planilha fictícia",
    getSheets: () => abas,
    getSheetByName: (n: string) => abas.find((a) => a.nome === n) ?? null,
    insertSheet: (n: string) => { const a = new Aba(n); abas.push(a); return a; },
  };
  const g = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, CopyPasteType: { PASTE_FORMAT: "PASTE_FORMAT", PASTE_DATA_VALIDATION: "PASTE_DATA_VALIDATION", PASTE_FORMULA: "PASTE_FORMULA" }, flush: () => {} },
    PropertiesService: { getDocumentProperties: () => ({ getProperty: (k: string) => props[k] ?? null, setProperty: (k: string, v: string) => { props[k] = v; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_: string, b: number[]) => Array.from(crypto.createHash("sha256").update(Buffer.from(b)).digest()).map((x) => (x > 127 ? x - 256 : x)),
      base64Decode: (s: string) => Array.from(Buffer.from(s, "base64")),
      newBlob: (b: number[], tipo?: string) => ({ getDataAsString: () => Buffer.from(b).toString("utf8"), getContentType: () => tipo }),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d: Date, _tz: string, f: string) => (f === "yyyy-MM-dd" ? "2026-11-25" : d.toISOString()),
    },
    Session: { getScriptTimeZone: () => "America/Sao_Paulo", getActiveUser: () => ({ getEmail: () => "" }) },
    LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    ScriptApp: { getService: () => ({ getUrl: () => null }) },
    MimeType: { GOOGLE_DOCS: "application/vnd.google-apps.document" },
    Drive: { Files: { create: () => ({ id: "tmp" }), remove: () => {} } },
    DocumentApp: { openById: () => ({ getBody: () => ({ getText: () => ocr }) }) },
    DriveApp: { getFileById: () => ({ setTrashed: () => {} }) },
    console,
  };
  const ctx = vm.createContext(g);
  vm.runInContext(gerarCodigo(), ctx);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- funções do Apps Script sem tipos
  return { ctx: ctx as unknown as Record<string, (...a: unknown[]) => any>, compras, abas };
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("Apps Script: fluxo completo na planilha simulada", () => {
  it("o arquivo gerado está atualizado com o código-fonte", () => {
    expect(fs.readFileSync("apps-script/dist/Codigo.gs", "utf8")).toBe(gerarCodigo());
    expect(fs.readFileSync("apps-script/dist/Index.html", "utf8")).toBe(fs.readFileSync("apps-script/src/Index.html", "utf8"));
  });

  it("o JavaScript da tela não tem erro de sintaxe", () => {
    const html = fs.readFileSync("apps-script/src/Index.html", "utf8");
    const js = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    expect(() => new vm.Script(js)).not.toThrow();
  });

  it("lança só o aprovado, antes dos totais, estende a soma, é idempotente e desfaz", () => {
    const { ctx, compras, abas } = ambiente("");
    const c = ctx.ceLerCabecalho("Compras", "item");
    expect(c.temTotais).toBe(true);
    ctx.ceSalvarConfig({ aba: "Compras", granularidade: "item", linhaCabecalho: c.linhaCabecalho, mapeamento: [...c.proposta.slice(0, 8), "lote"], colunasFormula: c.colunasFormula });

    const xml = montarXmlNfe(NOTAS[0]);
    const r = ctx.ceProcessar({ nome: "nota.xml", mime: "text/xml", base64: b64(xml) });
    expect(r.ok).toBe(true);
    const pend = ctx.cePendentes();
    expect(pend).toHaveLength(3);
    expect(pend.every((p: { cor: string }) => p.cor === "verde")).toBe(true);

    // Nada é gravado sem aprovação.
    expect(ctx.ceLancar().lancadas).toBe(0);
    expect(compras.getLastRow()).toBe(3);

    ctx.ceAprovarVerdes();
    const l = ctx.ceLancar();
    expect(l.lancadas).toBe(3);
    // Linha antiga intacta; novas entre ela e os totais; soma estendida.
    expect(compras.dados[1][4]).toBe("Item antigo");
    expect(compras.dados[2][1]).toBe(NOTAS[0].fornecedor);
    expect(compras.dados[5][0]).toBe("TOTAL");
    expect(compras.formulas[5][7]).toBe("=SOMA(H2:H5)");
    expect(compras.dados[2][8]).toBe(l.lote);
    expect(abas.find((a) => a.nome === "CE_Pendentes")!.oculta).toBe(true);

    // Reenviar o mesmo arquivo: 0 linhas novas.
    const de_novo = ctx.ceProcessar({ nome: "nota.xml", mime: "text/xml", base64: b64(xml) });
    expect(de_novo.ok).toBe(false);
    expect(de_novo.repetido).toBe(true);
    // O mesmo conteúdo com outro arquivo (outro hash) vira duplicata vermelha.
    const outro = ctx.ceProcessar({ nome: "copia.xml", mime: "text/xml", base64: b64(xml + "\n") });
    expect(outro.ok).toBe(true);
    expect(ctx.cePendentes()[0].cor).toBe("vermelho");
    expect(() => ctx.ceAprovar(ctx.cePendentes()[0].id, true, false)).toThrow(/vermelha/);

    // Desfazer remove só as 3 linhas do lote.
    const d = ctx.ceDesfazer();
    expect(d.removidas).toBe(3);
    expect(compras.getLastRow()).toBe(3);
    expect(compras.dados[1][4]).toBe("Item antigo");
    expect(compras.dados[2][0]).toBe("TOTAL");
  });

  it("não desfaz se alguém mudou uma linha do lote", () => {
    const { ctx, compras } = ambiente("");
    const c = ctx.ceLerCabecalho("Compras", "item");
    ctx.ceSalvarConfig({ aba: "Compras", granularidade: "item", linhaCabecalho: c.linhaCabecalho, mapeamento: c.proposta, colunasFormula: c.colunasFormula });
    ctx.ceProcessar({ nome: "n.xml", mime: "text/xml", base64: b64(montarXmlNfe(NOTAS[2])) });
    ctx.ceAprovarVerdes();
    ctx.ceLancar();
    compras.dados[2][4] = "mudado à mão";
    expect(() => ctx.ceDesfazer()).toThrow(/nada foi desfeito/);
  });

  it("foto: o que não dá para conferir fica amarelo e editar ensina o de/para", () => {
    const ocr = "Papelaria Exemplo Ltda\nCNPJ 33.444.555/0001-81\nEmissão 21/11/2026\nCaneta azul 2 42,00 84,00\nTotal R$ 84,00";
    const { ctx } = ambiente(ocr);
    const c = ctx.ceLerCabecalho("Compras", "item");
    ctx.ceSalvarConfig({ aba: "Compras", granularidade: "item", linhaCabecalho: c.linhaCabecalho, mapeamento: c.proposta, colunasFormula: c.colunasFormula });
    const r = ctx.ceProcessar({ nome: "foto.jpg", mime: "image/jpeg", base64: b64("imagem fictícia") });
    expect(r.ok).toBe(true);
    let p = ctx.cePendentes();
    expect(p[0].cor).toBe("amarelo");
    p = ctx.ceEditar(p[0].id, "fornecedor", "Papelaria Exemplo Ltda");
    expect(p[0].cor).toBe("verde");
    p = ctx.ceEditar(p[0].id, "descricao", "Caneta esferográfica azul");
    expect(p[0].valores.descricao).toBe("Caneta esferográfica azul");
  });
});
