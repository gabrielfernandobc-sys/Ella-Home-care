/**
 * "Lançar na planilha" e "Desfazer último lote".
 * - Só linhas aprovadas são gravadas; vermelhas só se a usuária forçou.
 * - Idempotente: uma linha cujo hash já foi lançado nunca é gravada de novo.
 * - Desfazer remove somente as linhas criadas por aquele lote, depois de conferir
 *   que elas continuam exatamente como foram gravadas.
 */
import type { CampoId } from "../campos";
import { problemasDoMapeamento } from "../mapeamento";
import { acrescentarLinhas, ErroPlanilha } from "../planilha/acrescentar";
import { analisarAba } from "../planilha/planejador";
import type { AdaptadorPlanilha, Grade } from "../planilha/tipos";
import { confere } from "../planilha/valores";
import { parseData } from "../texto";
import { adaptadorPara, mensagemErroPlanilha } from "./adaptador";
import { lerConfigPlanilha, type ConfigPlanilha } from "./config";
import { agora, registrarEvento, transacao } from "./db";
import { abaDestino, limparCachePlanilha } from "./processamento";
import * as repo from "./repositorio";

export class ErroLancamento extends Error {}

type G = { __comprasTrava?: boolean };
async function comTrava<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as G;
  if (g.__comprasTrava) throw new ErroLancamento("Já existe um lançamento em andamento. Aguarde terminar.");
  g.__comprasTrava = true;
  try {
    return await fn();
  } finally {
    g.__comprasTrava = false;
  }
}

export interface ResultadoLancamento {
  lancadas: number;
  puladas: number;
  abas: { aba: string; linhas: number[] }[];
  alertas: string[];
}

async function garantirAba(adaptador: AdaptadorPlanilha, cfg: ConfigPlanilha, aba: string) {
  const abas = await adaptador.listarAbas();
  if (abas.includes(aba)) return;
  if (cfg.modoAbas !== "mensal" || !cfg.abaModelo) {
    throw new ErroLancamento(`A aba “${aba}” não existe na planilha.`);
  }
  if (!abas.includes(cfg.abaModelo)) throw new ErroLancamento(`A aba modelo “${cfg.abaModelo}” não existe mais.`);
  const modelo = await adaptador.lerGrade(cfg.abaModelo);
  if (analisarAba(modelo, cfg.linhaCabecalho).totalLinhasDados > 0) {
    throw new ErroLancamento(
      `A aba modelo “${cfg.abaModelo}” tem dados. Ela precisa ter só o cabeçalho (e, se quiser, a linha de totais).`,
    );
  }
  await adaptador.duplicarAba(cfg.abaModelo, aba);
}

export function lancarLote(loteId: string, usuaria: string | null): Promise<ResultadoLancamento> {
  return comTrava(async () => {
    const cfg = lerConfigPlanilha();
    if (!cfg || !cfg.mapeamento.some(Boolean)) throw new ErroLancamento("Conecte a planilha e confirme as colunas antes de lançar.");
    const probMap = problemasDoMapeamento(cfg.mapeamento, cfg.colunasFormula);
    if (probMap.length) throw new ErroLancamento("Ajuste as colunas da planilha: " + probMap.join(" "));
    const lote = repo.obterLote(loteId);
    if (!lote) throw new ErroLancamento("Lote não encontrado.");

    const ja = repo.hashesLancados();
    const candidatas = repo
      .linhasDoLote(loteId)
      .filter((l) => l.aprovada && !l.lancada && (l.cor !== "vermelho" || l.forcada));
    const puladas = candidatas.filter((l) => ja.has(l.hash));
    const aLancar = candidatas.filter((l) => !ja.has(l.hash));
    if (!aLancar.length) {
      return {
        lancadas: 0,
        puladas: puladas.length,
        abas: [],
        alertas: puladas.length ? ["Estas linhas já estavam lançadas; nada foi gravado de novo."] : ["Nenhuma linha aprovada para lançar."],
      };
    }

    // Agrupa por aba de destino, em ordem de data.
    const grupos = new Map<string, repo.Linha[]>();
    for (const l of aLancar) {
      const aba = abaDestino(cfg, l.valores);
      if (!aba) throw new ErroLancamento("Há linhas aprovadas sem data válida; preencha a data para escolher a aba do mês.");
      grupos.set(aba, [...(grupos.get(aba) ?? []), l]);
    }
    const adaptador = adaptadorPara(cfg);
    const resultado: ResultadoLancamento = { lancadas: 0, puladas: puladas.length, abas: [], alertas: [] };
    const arquivos = new Map(repo.arquivosDoLote(loteId).map((a) => [a.id, a]));

    for (const [aba, linhasAba] of grupos) {
      const ordenadas = [...linhasAba].sort((a, b) =>
        (parseData(a.valores.data_emissao) ?? "").localeCompare(parseData(b.valores.data_emissao) ?? ""),
      );
      try {
        await garantirAba(adaptador, cfg, aba);
        const r = await acrescentarLinhas({
          adaptador,
          aba,
          linhaCabecalho: cfg.linhaCabecalho,
          mapeamento: cfg.mapeamento,
          colunasFormula: cfg.colunasFormula,
          linhas: ordenadas.map((l) => ({ ...l.valores, id_lote: loteId, arquivo_origem: arquivos.get(l.arquivo_id)?.nome ?? null })),
        });
        transacao(() => {
          ordenadas.forEach((l, i) => {
            repo.inserirLancamento({
              lote_id: loteId,
              linha_id: l.id,
              hash: l.hash,
              arquivo_nome: arquivos.get(l.arquivo_id)?.nome ?? null,
              arquivo_hash: arquivos.get(l.arquivo_id)?.hash ?? null,
              planilha_id: cfg.planilhaId,
              aba,
              numero_linha: r.linhas[i],
              celulas: r.celulasPorLinha[i].map((c) => ({ coluna: c.coluna, valor: c.valor })),
              criado_em: agora(),
              usuaria,
            });
            repo.atualizarLinha(l.id, { lancada: true });
          });
          // Correção do de/para lançada sem mudança pela usuária: uma confirmação por regra (por lançamento,
          // não por item, para que uma nota com 10 itens não conte como 10 confirmações).
          const confirmadas = new Map<string, { campo: CampoId; base: CampoId; de: string }>();
          for (const l of ordenadas) {
            for (const d of l.depara ?? []) {
              if (d.regra && l.valores[d.campo] === d.para) confirmadas.set(`${d.regra.campo}|${d.regra.base}|${d.regra.de}`, d.regra);
            }
          }
          for (const r of confirmadas.values()) repo.confirmarDePara(r);
        });
        resultado.lancadas += ordenadas.length;
        resultado.abas.push({ aba, linhas: r.linhas.map((x) => x + 1) });
        resultado.alertas.push(...r.alertas);
        if (r.formulasAjustadas.length) {
          resultado.alertas.push(`A soma da linha de totais da aba “${aba}” foi estendida para incluir as novas linhas.`);
        }
      } catch (e) {
        const msg = e instanceof ErroPlanilha || e instanceof ErroLancamento ? e.message : mensagemErroPlanilha(e);
        resultado.alertas.push(`Aba “${aba}”: ${msg}`);
        if (resultado.lancadas === 0) {
          registrarEvento("lancar_falhou", { aba, motivo: msg }, loteId, usuaria ?? undefined);
          throw new ErroLancamento(msg);
        }
      }
    }

    repo.atualizarLote(loteId, { status: "lancado", lancado_em: agora() });
    registrarEvento(
      "lancar",
      { linhas: resultado.lancadas, puladas: resultado.puladas, abas: resultado.abas.map((a) => ({ aba: a.aba, linhas: a.linhas })) },
      loteId,
      usuaria ?? undefined,
    );
    limparCachePlanilha();
    return resultado;
  });
}

function linhaConfere(grade: Grade, numero: number, celulas: { coluna: number; valor: string | number }[]) {
  const l = grade.formulas[numero];
  if (!l) return false;
  // Linha gravada sem nenhum valor: só aceita se ela continua vazia (fora as fórmulas).
  if (!celulas.length) return l.every((v) => !v || String(v).startsWith("="));
  return celulas.every((c) => confere(c.valor, l[c.coluna]));
}

export function desfazerUltimoLote(usuaria: string | null): Promise<{ loteId: string; removidas: number }> {
  return comTrava(async () => {
    const loteId = repo.ultimoLoteLancado();
    if (!loteId) throw new ErroLancamento("Não há lote lançado para desfazer.");
    const cfg = lerConfigPlanilha();
    if (!cfg) throw new ErroLancamento("Planilha não configurada.");
    const lancs = repo.lancamentosAtivosDoLote(loteId);
    if (lancs.some((l) => l.planilha_id !== cfg.planilhaId)) {
      throw new ErroLancamento("Este lote foi lançado em outra planilha. Conecte aquela planilha para desfazer.");
    }
    const adaptador = adaptadorPara(cfg);
    const porAba = new Map<string, repo.Lancamento[]>();
    for (const l of lancs) porAba.set(l.aba, [...(porAba.get(l.aba) ?? []), l]);

    // 1) Confere TUDO antes de apagar qualquer coisa.
    const exclusoes = new Map<string, number[]>();
    const problemas: string[] = [];
    for (const [aba, ls] of porAba) {
      let grade: Grade;
      try {
        grade = await adaptador.lerGrade(aba);
      } catch (e) {
        throw new ErroLancamento(`Não consegui ler a aba “${aba}”: ${mensagemErroPlanilha(e)}`);
      }
      const usadas = new Set<number>();
      for (const l of ls) {
        let alvo: number | null = linhaConfere(grade, l.numero_linha, l.celulas) ? l.numero_linha : null;
        if (alvo === null || usadas.has(alvo)) {
          // A linha pode ter mudado de posição (alguém inseriu linhas acima): procura uma única correspondência.
          const achadas: number[] = [];
          for (let r = 0; r < grade.formulas.length; r++) {
            if (!usadas.has(r) && linhaConfere(grade, r, l.celulas)) achadas.push(r);
          }
          alvo = achadas.length === 1 ? achadas[0] : null;
        }
        if (alvo === null) {
          const desc = l.celulas.map((c) => c.valor).slice(0, 3).join(" | ");
          problemas.push(`aba “${aba}”, linha lançada como ${l.numero_linha + 1} (${desc})`);
        } else usadas.add(alvo);
      }
      exclusoes.set(aba, [...usadas]);
    }
    if (problemas.length) {
      throw new ErroLancamento(
        "Por segurança, nada foi desfeito: estas linhas foram alteradas na planilha depois do lançamento ou não foram encontradas — " +
          problemas.slice(0, 5).join("; ") +
          (problemas.length > 5 ? "…" : "") +
          ". Corrija ou apague manualmente.",
      );
    }

    // 2) Apaga só as linhas do lote.
    let removidas = 0;
    for (const [aba, linhas] of exclusoes) {
      await adaptador.excluirLinhas(aba, linhas);
      removidas += linhas.length;
    }
    transacao(() => {
      const momento = agora();
      for (const l of lancs) repo.atualizarLinha(l.linha_id, { lancada: false });
      repo.marcarLancamentosDesfeitos(loteId, momento);
      repo.atualizarLote(loteId, { status: "desfeito", desfeito_em: momento });
    });
    registrarEvento("desfazer", { linhas: removidas }, loteId, usuaria ?? undefined);
    limparCachePlanilha();
    return { loteId, removidas };
  });
}
