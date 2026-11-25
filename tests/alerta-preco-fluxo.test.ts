/** Fase 3: o alerta de preço aparece na revisão, comparando com o histórico da própria planilha. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compras-preco-"));
process.env.DADOS_DIR = dir;
process.env.ANTHROPIC_API_KEY = "";

type M = {
  repo: typeof import("@/lib/servidor/repositorio");
  proc: typeof import("@/lib/servidor/processamento");
  cfg: typeof import("@/lib/servidor/config");
  demo: typeof import("@/lib/servidor/demo");
  ex: typeof import("@/lib/exemplos/ficticios");
};
let m: M;

async function processar(nome: string, unitario: number, numero: string) {
  const nota = {
    ...m.ex.NOTAS[1],
    numero,
    data: "2026-11-20",
    itens: [{ descricao: "Dipirona 500 mg", ncm: "30049099", unidade: "CX", quantidade: 10, unitario }],
  };
  const lote = m.repo.criarLote("teste", null);
  const r = await m.proc.receberArquivo(lote.id, nome, new TextEncoder().encode(m.ex.montarXmlNfe(nota)));
  await m.proc.processarArquivo(r.arquivo.id, () => undefined);
  return m.repo.linhasDoLote(lote.id)[0];
}

beforeAll(async () => {
  m = {
    repo: await import("@/lib/servidor/repositorio"),
    proc: await import("@/lib/servidor/processamento"),
    cfg: await import("@/lib/servidor/config"),
    demo: await import("@/lib/servidor/demo"),
    ex: await import("@/lib/exemplos/ficticios"),
  };
  // Histórico na planilha: 3 compras de "Dipirona 500 mg" (CX) a ~R$ 4,50.
  const p = m.demo.PlanilhaDemo.reiniciar();
  const aba = p.estado.abas[0].celulas;
  const totais = aba.pop()!;
  const base = aba[2]; // linha fictícia da farmácia
  for (const [data, preco] of [
    ["10/08/2026", 4.4],
    ["12/09/2026", 4.5],
    ["15/10/2026", 4.6],
  ] as const) {
    const l = [...base];
    l[0] = data;
    l[4] = "Dipirona 500 mg";
    l[7] = "CX";
    l[8] = preco;
    aba.push(l);
  }
  aba.push(totais);
  p.salvar();
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
  });
});

describe("alerta de preço na revisão", () => {
  it("preço normal fica verde", async () => {
    const l = await processar("normal.xml", 4.7, "93001");
    expect(l.cor).toBe("verde");
  });

  it("preço 53% acima do normal fica amarelo, com explicação, sem mudar o valor", async () => {
    const l = await processar("caro.xml", 6.9, "93002");
    expect(l.cor).toBe("amarelo");
    expect(l.valores.valor_unitario).toBe(6.9);
    const p = l.problemas.find((x) => x.campo === "valor_unitario")!;
    expect(p.mensagem).toMatch(/53% acima do normal/);
    // 3 compras adicionadas + 1 que já existe na planilha de demonstração (29/10, R$ 4,50).
    expect(p.mensagem).toMatch(/últimas 4 compras/);
  });

  it("pode ser desligado na configuração", async () => {
    m.cfg.salvarConfigPlanilha({ ...m.cfg.lerConfigPlanilha()!, alertaPrecoAtivo: false });
    m.proc.limparCachePlanilha();
    const l = await processar("caro-sem-alerta.xml", 6.9, "93003");
    expect(l.cor).toBe("verde");
  });
});
