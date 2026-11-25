/**
 * Deduplicação avançada por arquivo:
 * - PDF salvo de novo (bytes diferentes, mesmo texto);
 * - print/foto reenviado (outra compressão), sem contradição nos dados lidos.
 * A IA é simulada (resposta fixa), então o teste não usa internet nem chave.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { RespostaExtracao } from "@/lib/extracao/schema";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compras-dedup-"));
process.env.DADOS_DIR = dir;
process.env.ANTHROPIC_API_KEY = "chave-ficticia-para-teste";

// Fila de respostas da "IA" simulada.
const respostas: RespostaExtracao[] = [];
vi.mock("@/lib/extracao/ia", () => ({
  iaConfigurada: () => true,
  ErroIA: class extends Error {},
  extrairComIA: vi.fn(async () => {
    const r = respostas.shift();
    if (!r) throw new Error("sem resposta simulada");
    return r;
  }),
}));

const conf = { descricao: "alta", quantidade: "alta", unidade: "alta", valor_unitario: "alta", valor_total: "alta", categoria: "alta" } as const;
function resposta(total: number | null, data: string | null): RespostaExtracao {
  return {
    legivel: true,
    aviso: null,
    documentos: [
      {
        tipo_documento: "pedido",
        data_emissao: data,
        fornecedor: "Distribuidora Fictícia de Teste",
        cnpj: null,
        numero_nota: null,
        chave_acesso: null,
        total_nota: total,
        valor_frete: null,
        valor_desconto: null,
        forma_pagamento: null,
        centro_custo: null,
        observacoes: null,
        itens: [{ descricao: "Máscara cirúrgica c/50", quantidade: 1, unidade: "CX", valor_unitario: 18.9, valor_total: 18.9, categoria: "material de consumo", confianca: conf }],
        confianca: { data_emissao: "alta", fornecedor: "alta", cnpj: "baixa", numero_nota: "baixa", total_nota: "alta", forma_pagamento: "baixa" },
      },
    ],
  };
}

type M = {
  repo: typeof import("@/lib/servidor/repositorio");
  proc: typeof import("@/lib/servidor/processamento");
  lanc: typeof import("@/lib/servidor/lancamento");
  cfg: typeof import("@/lib/servidor/config");
  demo: typeof import("@/lib/servidor/demo");
  ex: typeof import("@/lib/exemplos/ficticios");
  db: typeof import("@/lib/servidor/db");
};
let m: M;

async function enviar(loteId: string, nome: string, bytes: Uint8Array) {
  const r = await m.proc.receberArquivo(loteId, nome, bytes);
  if (!r.duplicado) await m.proc.processarArquivo(r.arquivo.id, () => undefined);
  return m.repo.obterArquivo(r.arquivo.id)!;
}

async function pdfFicticio(titulo: string) {
  const doc = await PDFDocument.create();
  doc.setTitle(titulo); // muda os bytes, não o texto
  const p = doc.addPage([595, 842]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const linhas = [
    "DANFE FICTICIO - EXEMPLO PARA TESTE",
    "EMITENTE: DISTRIBUIDORA FICTICIA DE TESTE LTDA",
    "NF-e No 4321  DATA DE EMISSAO 12/11/2026",
    "LUVA PROCED LATEX M C/100   10 CX   32,90   329,00",
    "SERINGA DESC 5ML            200 UN    0,38    76,00",
    "VALOR TOTAL DA NOTA: R$ 405,00",
  ];
  linhas.forEach((t, i) => p.drawText(t, { x: 40, y: 800 - i * 20, size: 11, font: f }));
  return doc.save();
}

beforeAll(async () => {
  m = {
    repo: await import("@/lib/servidor/repositorio"),
    proc: await import("@/lib/servidor/processamento"),
    lanc: await import("@/lib/servidor/lancamento"),
    cfg: await import("@/lib/servidor/config"),
    demo: await import("@/lib/servidor/demo"),
    ex: await import("@/lib/exemplos/ficticios"),
    db: await import("@/lib/servidor/db"),
  };
  m.demo.PlanilhaDemo.reiniciar();
  m.cfg.salvarConfigPlanilha({
    ...m.cfg.configPadrao(),
    fonte: "demo",
    planilhaId: m.demo.ID_DEMO,
    planilhaNome: "Demonstração",
    aba: "Compras",
    cabecalhos: m.ex.PLANILHA_MODELO[0].map(String),
    mapeamento: ["data_emissao", "fornecedor", "cnpj", "numero_nota", "descricao", "categoria", "quantidade", "unidade", "valor_unitario", null, "centro_custo", "arquivo_origem", "id_lote"],
    colunasFormula: [9],
    obrigatorios: ["fornecedor", "descricao"],
    diasMaximos: 100_000,
  });
});

describe("deduplicação avançada por arquivo", () => {
  it("PDF salvo de novo (outros bytes, mesmo texto) é reconhecido como repetido", async () => {
    const a = await pdfFicticio("versão 1");
    const b = await pdfFicticio("versão 2 salva de novo");
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).not.toBe(0);
    respostas.push(resposta(405, "2026-11-12"));
    const lote = m.repo.criarLote("teste", null);
    const p1 = await enviar(lote.id, "danfe.pdf", a);
    const p2 = await enviar(lote.id, "danfe (1).pdf", b);
    expect(p1.status).toBe("pronto");
    expect(p2.status).toBe("duplicado");
    expect(p2.erro).toMatch(/Mesmo conteúdo/);
  });

  it("print reenviado (PNG virou JPEG) sem CNPJ, número ou total é marcado como possível duplicata", async () => {
    const png = fs.readFileSync(path.join(process.cwd(), "exemplos/prints/print-pedido-whatsapp.png"));
    const jpg = await sharp(png).jpeg({ quality: 60 }).toBuffer();
    const outro = fs.readFileSync(path.join(process.cwd(), "exemplos/prints/print-sistema-compras.png"));

    // Lote 1: lança o print.
    respostas.push(resposta(null, null));
    const lote1 = m.repo.criarLote("teste", null);
    await enviar(lote1.id, "pedido.png", png);
    m.db.db().prepare("UPDATE linhas SET aprovada = 1 WHERE lote_id = ?").run(lote1.id);
    expect((await m.lanc.lancarLote(lote1.id, "teste")).lancadas).toBe(1);

    // Lote 2: o mesmo print, recomprimido pelo WhatsApp; e um print diferente.
    respostas.push(resposta(null, null), resposta(null, null));
    const lote2 = m.repo.criarLote("teste", null);
    const rep = await enviar(lote2.id, "IMG-0001.jpg", jpg);
    const dif = await enviar(lote2.id, "outro.png", outro);
    expect(rep.status).toBe("pronto");
    const lRep = m.repo.linhasDoLote(lote2.id).filter((l) => l.arquivo_id === rep.id);
    const lDif = m.repo.linhasDoLote(lote2.id).filter((l) => l.arquivo_id === dif.id);
    expect(lRep[0].duplicada).toBe(true);
    expect(lRep[0].motivo_duplicata).toMatch(/Imagem praticamente igual a “pedido.png”/);
    expect(lDif[0].duplicada).toBe(false);
  });

  it("mesma imagem com valor lido diferente NÃO é duplicata; com o mesmo valor, é", async () => {
    // Outra imagem (não usada nos testes acima).
    const base = fs.readFileSync(path.join(process.cwd(), "exemplos/prints/print-sistema-compras.png"));
    const png = await sharp(base).extend({ bottom: 40, background: "#ffffff" }).png().toBuffer();
    respostas.push(resposta(363, "2026-11-21"));
    const lote1 = m.repo.criarLote("teste", null);
    await enviar(lote1.id, "nf-2290.png", png);
    m.db.db().prepare("UPDATE linhas SET aprovada = 1 WHERE lote_id = ?").run(lote1.id);
    await m.lanc.lancarLote(lote1.id, "teste");

    respostas.push(resposta(999.99, "2026-11-21"), resposta(363, null));
    const lote2 = m.repo.criarLote("teste", null);
    const outroValor = await enviar(lote2.id, "nf-a.jpg", await sharp(png).jpeg({ quality: 70 }).toBuffer());
    const mesmoValor = await enviar(lote2.id, "nf-b.jpg", await sharp(png).jpeg({ quality: 50 }).toBuffer());
    const linha = (id: string) => m.repo.linhasDoLote(lote2.id).find((x) => x.arquivo_id === id)!;
    expect(linha(outroValor.id).duplicada).toBe(false);
    expect(linha(mesmoValor.id).duplicada).toBe(true);
    expect(linha(mesmoValor.id).motivo_duplicata).toMatch(/nf-2290.png/);
  });
});
