/**
 * Fluxo completo com XML fictício e a planilha de demonstração (sem IA, sem Google):
 * receber -> processar -> aprovar -> lançar -> reenviar (0 linhas novas) -> desfazer.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compras-teste-"));
process.env.DADOS_DIR = dir;
process.env.ANTHROPIC_API_KEY = "";

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

async function enviar(loteId: string, nome: string, conteudo: string | Uint8Array) {
  const bytes = typeof conteudo === "string" ? new TextEncoder().encode(conteudo) : conteudo;
  const r = await m.proc.receberArquivo(loteId, nome, bytes);
  if (!r.duplicado) await m.proc.processarArquivo(r.arquivo.id, () => undefined);
  return m.repo.obterArquivo(r.arquivo.id)!;
}

function aprovarVerdes(loteId: string) {
  m.db.db().prepare("UPDATE linhas SET aprovada = 1 WHERE lote_id = ? AND cor = 'verde'").run(loteId);
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
    mapeamento: [
      "data_emissao",
      "fornecedor",
      "cnpj",
      "numero_nota",
      "descricao",
      "categoria",
      "quantidade",
      "unidade",
      "valor_unitario",
      null, // Valor Total tem fórmula
      "centro_custo",
      "arquivo_origem",
      "id_lote",
    ],
    colunasFormula: [9],
    diasMaximos: 100_000,
  });
});

describe("fluxo completo", () => {
  it("lança, não duplica ao reenviar e desfaz", async () => {
    const antes = JSON.parse(JSON.stringify(m.demo.PlanilhaDemo.carregar().estado.abas[0].celulas));
    const lote = m.repo.criarLote("teste", null);

    // Dois XMLs + o mesmo XML repetido + um arquivo inválido (não pode travar o lote).
    const a1 = await enviar(lote.id, "nota1.xml", m.ex.montarXmlNfe(m.ex.NOTAS[0]));
    const a2 = await enviar(lote.id, "nota2.xml", m.ex.montarXmlNfe(m.ex.NOTAS[1]));
    const rep = await enviar(lote.id, "nota1-copia.xml", m.ex.montarXmlNfe(m.ex.NOTAS[0]));
    const ruim = await enviar(lote.id, "foto.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));

    expect(a1.status).toBe("pronto");
    expect(a2.status).toBe("pronto");
    expect(rep.status).toBe("duplicado");
    expect(ruim.status).toBe("erro"); // sem chave da IA: erro só neste arquivo
    expect(ruim.erro).toMatch(/chave da IA/i);

    const linhas = m.repo.linhasDoLote(lote.id);
    expect(linhas).toHaveLength(6);
    expect(linhas.every((l) => l.cor === "verde")).toBe(true);

    // Nada é gravado sem aprovação.
    const semAprovar = await m.lanc.lancarLote(lote.id, "teste");
    expect(semAprovar.lancadas).toBe(0);

    aprovarVerdes(lote.id);
    const r = await m.lanc.lancarLote(lote.id, "teste");
    expect(r.lancadas).toBe(6);
    expect(r.alertas.filter((a) => !/estendida/.test(a))).toEqual([]);

    const depois = m.demo.PlanilhaDemo.carregar().estado.abas[0].celulas;
    // Linhas antigas intactas; novas antes do TOTAL; soma estendida.
    for (let i = 0; i < 4; i++) expect(depois[i]).toEqual(antes[i]);
    expect(depois).toHaveLength(antes.length + 6);
    expect(depois[depois.length - 1][0]).toBe("TOTAL");
    expect(depois[depois.length - 1][9]).toBe("=SOMA(J2:J10)");
    expect(depois[4][9]).toBe("=G5*I5"); // fórmula copiada, nunca escrita com valor
    expect(depois[4][12]).toBe(lote.id); // rastreável: ID do lote
    expect(depois[4][11]).toBe("nota1.xml"); // rastreável: arquivo de origem

    // Lançar de novo o mesmo lote: 0 linhas novas.
    const deNovo = await m.lanc.lancarLote(lote.id, "teste");
    expect(deNovo.lancadas).toBe(0);

    // Reenviar os mesmos arquivos num lote novo: arquivo repetido, 0 linhas novas.
    const lote2 = m.repo.criarLote("teste", null);
    const b1 = await enviar(lote2.id, "nota1.xml", m.ex.montarXmlNfe(m.ex.NOTAS[0]));
    expect(b1.status).toBe("duplicado");
    // Mesma nota, arquivo diferente (ex.: espaço extra) => detectada pela chave/planilha.
    const b2 = await enviar(lote2.id, "nota2-outra.xml", m.ex.montarXmlNfe(m.ex.NOTAS[1]) + "\n");
    expect(b2.status).toBe("pronto");
    const l2 = m.repo.linhasDoLote(lote2.id);
    expect(l2.every((l) => l.duplicada && l.cor === "vermelho")).toBe(true);
    aprovarVerdes(lote2.id);
    expect((await m.lanc.lancarLote(lote2.id, "teste")).lancadas).toBe(0);
    // Mesmo "forçando", o hash já lançado impede a duplicação.
    m.db.db().prepare("UPDATE linhas SET aprovada = 1, forcada = 1 WHERE lote_id = ?").run(lote2.id);
    const forcado = await m.lanc.lancarLote(lote2.id, "teste");
    expect(forcado.lancadas).toBe(0);
    expect(forcado.puladas).toBe(3);
    expect(m.demo.PlanilhaDemo.carregar().estado.abas[0].celulas).toHaveLength(antes.length + 6);

    // Desfazer remove só as linhas do lote e a planilha volta a ser como antes.
    const d = await m.lanc.desfazerUltimoLote("teste");
    expect(d.removidas).toBe(6);
    expect(m.demo.PlanilhaDemo.carregar().estado.abas[0].celulas).toEqual(antes);
    await expect(m.lanc.desfazerUltimoLote("teste")).rejects.toThrow(/Não há lote/);
  });

  it("não desfaz se a linha lançada foi alterada na planilha", async () => {
    const lote = m.repo.criarLote("teste", null);
    await enviar(lote.id, "nota3.xml", m.ex.montarXmlNfe(m.ex.NOTAS[2]));
    aprovarVerdes(lote.id);
    const r = await m.lanc.lancarLote(lote.id, "teste");
    expect(r.lancadas).toBe(2);
    const p = m.demo.PlanilhaDemo.carregar();
    p.estado.abas[0].celulas[r.abas[0].linhas[0] - 1][4] = "editado pela usuária";
    p.salvar();
    await expect(m.lanc.desfazerUltimoLote("teste")).rejects.toThrow(/nada foi desfeito/);
    expect(m.demo.PlanilhaDemo.carregar().estado.abas[0].celulas[r.abas[0].linhas[0] - 1][4]).toBe("editado pela usuária");
  });

  it("edição da usuária vira de/para e é aplicada no próximo lote", async () => {
    m.demo.PlanilhaDemo.reiniciar();
    m.db.db().exec("UPDATE lancamentos SET desfeito_em = 'x' WHERE desfeito_em IS NULL");
    const lote = m.repo.criarLote("teste", null);
    await enviar(lote.id, "farmacia.xml", m.ex.montarXmlNfe({ ...m.ex.NOTAS[1], numero: "99001" }));
    const linha = m.repo.linhasDoLote(lote.id).find((l) => l.valores.descricao === "DIPIRONA 500MG C/10 CP")!;
    await m.proc.editarLinha(linha.id, { descricao: "Dipirona 500 mg" });

    const lote2 = m.repo.criarLote("teste", null);
    await enviar(lote2.id, "farmacia2.xml", m.ex.montarXmlNfe({ ...m.ex.NOTAS[1], numero: "99002" }));
    const nova = m.repo.linhasDoLote(lote2.id).find((l) => l.indice === 0)!;
    expect(nova.valores.descricao).toBe("Dipirona 500 mg");
    expect(nova.cor).toBe("amarelo"); // correção automática sempre pede conferência
    expect(nova.problemas.some((p) => /Corrigido automaticamente/.test(p.mensagem))).toBe(true);
  });

  it("modo uma aba por mês: cria a aba do mês a partir do modelo", async () => {
    m.demo.PlanilhaDemo.reiniciar();
    m.db.db().exec("UPDATE lancamentos SET desfeito_em = 'x' WHERE desfeito_em IS NULL; DELETE FROM depara;");
    const atual = m.cfg.lerConfigPlanilha()!;
    m.cfg.salvarConfigPlanilha({ ...atual, modoAbas: "mensal", abaModelo: "Modelo", aba: "Modelo", padraoNomeAba: "{MES} {AAAA}" });
    const lote = m.repo.criarLote("teste", null);
    await enviar(lote.id, "mensal.xml", m.ex.montarXmlNfe({ ...m.ex.NOTAS[0], numero: "77001" }));
    aprovarVerdes(lote.id);
    const r = await m.lanc.lancarLote(lote.id, "teste");
    expect(r.lancadas).toBe(3);
    expect(r.abas[0].aba).toBe("Novembro 2026");
    const p = m.demo.PlanilhaDemo.carregar();
    const aba = p.estado.abas.find((a) => a.titulo === "Novembro 2026")!;
    expect(aba.celulas).toHaveLength(6); // cabeçalho + 3 itens + linha vazia + TOTAL
    expect(aba.celulas[5][0]).toBe("TOTAL");
    expect(aba.celulas[5][9]).toBe("=SOMA(J2:J5)"); // a soma inclui as linhas novas
    // A aba modelo continua intacta.
    expect(p.estado.abas.find((a) => a.titulo === "Modelo")!.celulas).toHaveLength(3);
    m.cfg.salvarConfigPlanilha(atual);
  });
});
