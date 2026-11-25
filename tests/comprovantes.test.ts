/**
 * Comprovantes (Fase 2): arquivo original guardado em <pasta>/<AAAA-MM> e link na coluna "Comprovante".
 * O "Drive" aqui é simulado em memória.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ArmazemComprovantes, ArquivoComprovante } from "@/lib/comprovantes/tipos";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compras-comprovantes-"));
process.env.DADOS_DIR = dir;
process.env.ANTHROPIC_API_KEY = "";

class DriveSimulado implements ArmazemComprovantes {
  enviados: ArquivoComprovante[] = [];
  falhar = false;
  async enviar(a: ArquivoComprovante) {
    if (this.falhar) throw new Error("Drive fora do ar (simulado)");
    this.enviados.push(a);
    return { id: `id-${this.enviados.length}`, link: `https://drive.exemplo.invalid/${a.mes}/${this.enviados.length}` };
  }
}

type M = {
  repo: typeof import("@/lib/servidor/repositorio");
  proc: typeof import("@/lib/servidor/processamento");
  lanc: typeof import("@/lib/servidor/lancamento");
  cfg: typeof import("@/lib/servidor/config");
  demo: typeof import("@/lib/servidor/demo");
  ex: typeof import("@/lib/exemplos/ficticios");
  db: typeof import("@/lib/servidor/db");
  comp: typeof import("@/lib/servidor/comprovantes");
};
let m: M;
const drive = new DriveSimulado();

async function loteCom(notas: { nome: string; xml: string }[]) {
  const lote = m.repo.criarLote("teste", null);
  for (const n of notas) {
    const r = await m.proc.receberArquivo(lote.id, n.nome, new TextEncoder().encode(n.xml));
    if (!r.duplicado) await m.proc.processarArquivo(r.arquivo.id, () => undefined);
  }
  m.db.db().prepare("UPDATE linhas SET aprovada = 1 WHERE lote_id = ? AND cor = 'verde'").run(lote.id);
  return lote;
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
    comp: await import("@/lib/servidor/comprovantes"),
  };
  m.comp.definirArmazemParaTestes(drive);
  m.cfg.salvarConfigPlanilha({
    ...m.cfg.configPadrao(),
    fonte: "demo",
    planilhaId: m.demo.ID_DEMO,
    planilhaNome: "Demonstração",
    aba: "Compras",
    cabecalhos: m.ex.PLANILHA_MODELO[0].map(String),
    mapeamento: ["data_emissao", "fornecedor", "cnpj", "numero_nota", "descricao", "categoria", "quantidade", "unidade", "valor_unitario", null, "centro_custo", "arquivo_origem", "id_lote", "comprovante"],
    colunasFormula: [9],
    diasMaximos: 100_000,
    comprovantesAtivo: true,
    pastaComprovantes: "Notas",
  });
});

beforeEach(() => {
  m.demo.PlanilhaDemo.reiniciar();
  m.proc.limparCachePlanilha();
  drive.enviados = [];
  drive.falhar = false;
});

describe("comprovantes", () => {
  it("guarda cada arquivo uma vez, na pasta do mês da nota, e põe o link na planilha", async () => {
    const lote = await loteCom([{ nome: "nfe-1201.xml", xml: m.ex.montarXmlNfe(m.ex.NOTAS[0]) }]);
    const r = await m.lanc.lancarLote(lote.id, "teste");
    expect(r.lancadas).toBe(3);
    // Uma nota com 3 itens = 1 arquivo enviado.
    expect(drive.enviados).toHaveLength(1);
    expect(drive.enviados[0]).toMatchObject({ nome: "nfe-1201.xml", mes: "2026-11", mime: "application/xml" });
    const celulas = m.demo.PlanilhaDemo.carregar().estado.abas[0].celulas;
    const novas = r.abas[0].linhas.map((n) => celulas[n - 1]);
    expect(novas.every((l) => l[13] === "https://drive.exemplo.invalid/2026-11/1")).toBe(true);
  });

  it("se guardar o comprovante falhar, nada é gravado na planilha", async () => {
    const antes = JSON.stringify(m.demo.PlanilhaDemo.carregar().estado);
    const lote = await loteCom([{ nome: "nfe-88342.xml", xml: m.ex.montarXmlNfe(m.ex.NOTAS[1]) }]);
    drive.falhar = true;
    await expect(m.lanc.lancarLote(lote.id, "teste")).rejects.toThrow(/Nada foi lançado/);
    expect(JSON.stringify(m.demo.PlanilhaDemo.carregar().estado)).toBe(antes);
    // Tenta de novo, agora com o Drive funcionando.
    drive.falhar = false;
    expect((await m.lanc.lancarLote(lote.id, "teste")).lancadas).toBe(3);
  });

  it("o mesmo arquivo lançado de novo (após desfazer) reaproveita o comprovante, sem enviar outra vez", async () => {
    const xml = m.ex.montarXmlNfe(m.ex.NOTAS[2]);
    const lote = await loteCom([{ nome: "nfe-455.xml", xml }]);
    await m.lanc.lancarLote(lote.id, "teste");
    expect(drive.enviados).toHaveLength(1);
    await m.lanc.desfazerUltimoLote("teste");
    const lote2 = await loteCom([{ nome: "nfe-455-de-novo.xml", xml }]);
    expect((await m.lanc.lancarLote(lote2.id, "teste")).lancadas).toBe(2);
    expect(drive.enviados).toHaveLength(1);
  });

  it("pasta do mês: pela data da nota; sem data, pelo mês do lote", () => {
    expect(m.comp.mesDoComprovante("05/12/2026", "2026-11-25T10:00:00Z")).toBe("2026-12");
    expect(m.comp.mesDoComprovante(null, "2026-11-25T10:00:00Z")).toBe("2026-11");
  });
});

describe("comprovantes no modo demonstração (pasta local)", () => {
  it("grava em <pasta>/<AAAA-MM>/ sem sobrescrever arquivos com o mesmo nome", async () => {
    const { ComprovantesLocal } = await import("@/lib/comprovantes/local");
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "compras-local-"));
    const loc = new ComprovantesLocal(base, "Notas");
    const a = await loc.enviar({ nome: "nota.pdf", mime: "application/pdf", bytes: new Uint8Array([1]), mes: "2026-11" });
    const b = await loc.enviar({ nome: "nota.pdf", mime: "application/pdf", bytes: new Uint8Array([2]), mes: "2026-11" });
    expect(a.link).toBe("demo://Notas/2026-11/nota.pdf");
    expect(b.link).toBe("demo://Notas/2026-11/nota (2).pdf");
    expect(fs.readFileSync(path.join(base, "Notas", "2026-11", "nota.pdf"))[0]).toBe(1);
    // Nome com barra não escapa da pasta.
    const c = await loc.enviar({ nome: "../../fora.pdf", mime: "application/pdf", bytes: new Uint8Array([3]), mes: "2026-11" });
    expect(c.link.startsWith("demo://Notas/2026-11/")).toBe(true);
  });
});
