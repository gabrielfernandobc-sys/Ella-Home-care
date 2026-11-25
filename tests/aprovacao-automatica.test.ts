/** Opção "aprovar verdes automaticamente" (Fase 2): desligada por padrão e nunca grava sozinha. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compras-auto-"));
process.env.DADOS_DIR = dir;
process.env.ANTHROPIC_API_KEY = "";

type M = {
  repo: typeof import("@/lib/servidor/repositorio");
  proc: typeof import("@/lib/servidor/processamento");
  cfg: typeof import("@/lib/servidor/config");
  demo: typeof import("@/lib/servidor/demo");
  ex: typeof import("@/lib/exemplos/ficticios");
  rotaLinha: typeof import("@/app/api/linhas/[id]/route");
};
let m: M;
let n = 0;

async function processar(xml: string) {
  const lote = m.repo.criarLote("teste", null);
  const r = await m.proc.receberArquivo(lote.id, `nota-${++n}.xml`, new TextEncoder().encode(xml));
  await m.proc.processarArquivo(r.arquivo.id, () => undefined);
  return m.repo.linhasDoLote(lote.id);
}

function configurar(auto: boolean | undefined) {
  m.cfg.salvarConfigPlanilha({
    ...m.cfg.configPadrao(),
    fonte: "demo",
    planilhaId: m.demo.ID_DEMO,
    planilhaNome: "Demonstração",
    aba: "Compras",
    cabecalhos: m.ex.PLANILHA_MODELO[0].map(String),
    mapeamento: ["data_emissao", "fornecedor", "cnpj", "numero_nota", "descricao", "categoria", "quantidade", "unidade", "valor_unitario", null, "centro_custo", "arquivo_origem", "id_lote"],
    colunasFormula: [9],
    diasMaximos: 100_000,
    ...(auto === undefined ? {} : { aprovarVerdesAutomaticamente: auto }),
  });
}

async function patch(id: string, corpo: unknown) {
  const req = new Request(`http://localhost/api/linhas/${id}`, { method: "PATCH", body: JSON.stringify(corpo) });
  const r = await m.rotaLinha.PATCH(req, { params: Promise.resolve({ id }) } as never);
  expect(r.status).toBe(200);
}

beforeAll(async () => {
  m = {
    repo: await import("@/lib/servidor/repositorio"),
    proc: await import("@/lib/servidor/processamento"),
    cfg: await import("@/lib/servidor/config"),
    demo: await import("@/lib/servidor/demo"),
    ex: await import("@/lib/exemplos/ficticios"),
    rotaLinha: await import("@/app/api/linhas/[id]/route"),
  };
  m.demo.PlanilhaDemo.reiniciar();
});

describe("aprovar verdes automaticamente", () => {
  it("vem desligada: linhas verdes não são aprovadas sozinhas", async () => {
    configurar(undefined);
    expect(m.cfg.lerConfigPlanilha()!.aprovarVerdesAutomaticamente).toBe(false);
    const linhas = await processar(m.ex.montarXmlNfe({ ...m.ex.NOTAS[0], numero: "81001" }));
    expect(linhas.every((l) => l.cor === "verde" && !l.aprovada)).toBe(true);
  });

  it("ligada: aprova só as verdes, e nada é gravado na planilha sem clicar em lançar", async () => {
    configurar(true);
    const antes = JSON.stringify(m.demo.PlanilhaDemo.carregar().estado);
    const verdes = await processar(m.ex.montarXmlNfe({ ...m.ex.NOTAS[1], numero: "81002" }));
    expect(verdes.every((l) => l.aprovada && l.aprovada_auto)).toBe(true);
    const amarela = await processar(
      m.ex.montarXmlNfe({ ...m.ex.NOTAS[2], numero: "81003" }).replace(/<vNF>[\d.]+<\/vNF>/, "<vNF>1.00</vNF>"),
    );
    expect(amarela.every((l) => l.cor === "amarelo" && !l.aprovada)).toBe(true);
    expect(JSON.stringify(m.demo.PlanilhaDemo.carregar().estado)).toBe(antes);
  });

  it("linha que deixa de ser verde perde a aprovação automática", async () => {
    configurar(true);
    const [l] = await processar(m.ex.montarXmlNfe({ ...m.ex.NOTAS[0], numero: "81004" }));
    expect(l.aprovada).toBe(true);
    await patch(l.id, { valores: { descricao: "" } }); // "Falta: Descrição" -> amarela
    const depois = m.repo.obterLinha(l.id)!;
    expect(depois.cor).toBe("amarelo");
    expect(depois.aprovada).toBe(false);
  });

  it("se a usuária desmarcar, o app não marca de novo", async () => {
    configurar(true);
    const [l] = await processar(m.ex.montarXmlNfe({ ...m.ex.NOTAS[0], numero: "81005" }));
    await patch(l.id, { aprovada: false });
    await patch(l.id, { valores: { unidade: "CX" } }); // nova reavaliação da nota
    const depois = m.repo.obterLinha(l.id)!;
    expect(depois.cor).toBe("verde");
    expect(depois.aprovada).toBe(false);
  });
});
