/**
 * Executa o acréscimo de linhas numa aba e confere o resultado:
 * 1. lê a aba; 2. planeja; 3. insere linhas e copia formato/fórmulas;
 * 4. escreve os valores; 5. relê e confere que as linhas antigas continuam iguais.
 * Se a escrita falhar, remove as linhas que acabou de inserir (só elas).
 * Se a conferência final achar diferença, devolve um alerta (as linhas ficam
 * registradas para poderem ser desfeitas).
 */
import type { ValoresLinha } from "../campos";
import { letraColuna, type Mapeamento } from "../mapeamento";
import { estenderInicio, estenderIntervalos } from "./formulas";
import { formulasParaEstender, planejarAcrescimo, type PlanoAcrescimo } from "./planejador";
import type { AdaptadorPlanilha, Celula, Grade } from "./tipos";
import { confere } from "./valores";

export interface ResultadoAcrescimo {
  aba: string;
  /** 0-based, na ordem das linhas recebidas */
  linhas: number[];
  celulasPorLinha: Celula[][];
  formulasAjustadas: Celula[];
  /** Problemas encontrados na conferência final (vazio = tudo certo) */
  alertas: string[];
}

export class ErroPlanilha extends Error {}

export async function acrescentarLinhas(params: {
  adaptador: AdaptadorPlanilha;
  aba: string;
  linhaCabecalho: number;
  mapeamento: Mapeamento;
  colunasFormula?: number[];
  linhas: ValoresLinha[];
}): Promise<ResultadoAcrescimo> {
  const { adaptador, aba } = params;
  if (params.linhas.length === 0) return { aba, linhas: [], celulasPorLinha: [], formulasAjustadas: [], alertas: [] };

  const localidade = await adaptador.localidade();
  const antes = await adaptador.lerGrade(aba);
  const plano = planejarAcrescimo({
    grade: antes,
    linhaCabecalho: params.linhaCabecalho,
    mapeamento: params.mapeamento,
    colunasFormula: params.colunasFormula,
    linhas: params.linhas,
    localidade,
  });

  let formulasAjustadas: Celula[] = [];
  try {
    await adaptador.aplicar(aba, plano.ops);
  } catch (e) {
    throw new ErroPlanilha("Não foi possível preparar as linhas novas na planilha. Nada foi alterado. " + detalhe(e));
  }
  try {
    await adaptador.escrever(aba, plano.escritas);
    if (plano.ajusteIntervalos || plano.ajusteInicio) {
      const meio = await adaptador.lerGrade(aba);
      formulasAjustadas = formulasParaEstender(meio, plano, (f) => {
        if (plano.ajusteIntervalos) return estenderIntervalos(f, plano.ajusteIntervalos.fimAntigo, plano.ajusteIntervalos.fimNovo);
        return estenderInicio(f, plano.ajusteInicio!.inicioAntigo, plano.ajusteInicio!.inicioNovo);
      });
      if (formulasAjustadas.length) await adaptador.escrever(aba, formulasAjustadas);
    }
  } catch (e) {
    // Remove só as linhas que o app acabou de inserir.
    const novas = Array.from({ length: plano.quantidade }, (_, i) => plano.inicio + i);
    await adaptador.excluirLinhas(aba, novas).catch(() => undefined);
    throw new ErroPlanilha("Não foi possível gravar na planilha. Nada foi alterado. " + detalhe(e));
  }

  const depois = await adaptador.lerGrade(aba).catch(() => null);
  const alertas = depois
    ? conferirIntegridade(antes, depois, plano, formulasAjustadas)
    : ["Não foi possível reler a planilha para conferir a gravação. Confira as últimas linhas."];

  return {
    aba,
    linhas: plano.celulasPorLinha.map((_, i) => plano.inicio + i),
    celulasPorLinha: plano.celulasPorLinha,
    formulasAjustadas,
    alertas,
  };
}

function detalhe(e: unknown) {
  return "Detalhe: " + (e instanceof Error ? e.message : String(e));
}

/**
 * Confere que (a) cada célula escrita está com o valor certo e
 * (b) todas as células antigas que não são fórmula continuam iguais, na mesma ordem.
 */
export function conferirIntegridade(antes: Grade, depois: Grade, plano: PlanoAcrescimo, ajustadas: Celula[] = []): string[] {
  const alertas: string[] = [];
  for (const cel of plano.escritas) {
    const lido = depois.formulas[cel.linha]?.[cel.coluna];
    if (!confere(cel.valor, lido)) {
      alertas.push(`A célula ${letraColuna(cel.coluna)}${cel.linha + 1} não ficou com o valor esperado. Confira na planilha.`);
    }
  }
  const ajustadasSet = new Set(ajustadas.map((c) => `${c.linha}:${c.coluna}`));
  const mudadas: number[] = [];
  for (let r = 0; r < antes.formulas.length; r++) {
    const rDepois = r >= plano.inicio ? r + plano.quantidade : r;
    const la = antes.formulas[r] ?? [];
    const ld = depois.formulas[rDepois] ?? [];
    const largura = Math.max(la.length, ld.length);
    for (let c = 0; c < largura; c++) {
      const a = la[c] ?? "";
      if (String(a).startsWith("=") || ajustadasSet.has(`${rDepois}:${c}`)) continue;
      if (String(a) !== String(ld[c] ?? "")) {
        mudadas.push(r + 1);
        break;
      }
    }
  }
  if (mudadas.length) {
    alertas.push(
      `Linhas antigas que parecem diferentes após a gravação (alguém editou a planilha ao mesmo tempo?): ${mudadas.slice(0, 10).join(", ")}${mudadas.length > 10 ? "…" : ""}. Confira.`,
    );
  }
  return alertas;
}
