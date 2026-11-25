/**
 * Executa o acréscimo de linhas numa aba e confere o resultado:
 * 1. lê a aba; 2. planeja; 3. insere linhas e copia formato/fórmulas;
 * 4. escreve os valores; 5. relê e confere que as linhas antigas continuam iguais.
 * Se a escrita falhar, remove as linhas vazias que acabou de inserir.
 */
import type { ValoresLinha } from "../campos";
import type { Mapeamento } from "../mapeamento";
import { estenderIntervalos } from "./formulas";
import { formulasParaEstender, planejarAcrescimo, type PlanoAcrescimo } from "./planejador";
import type { AdaptadorPlanilha, Celula, Grade } from "./tipos";
import { confere } from "./valores";

export interface ResultadoAcrescimo {
  aba: string;
  /** 0-based, na ordem das linhas recebidas */
  linhas: number[];
  celulasPorLinha: Celula[][];
  formulasAjustadas: Celula[];
  avisos: string[];
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
  const avisos: string[] = [];
  if (params.linhas.length === 0) return { aba, linhas: [], celulasPorLinha: [], formulasAjustadas: [], avisos };

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

  await adaptador.aplicar(aba, plano.ops);

  let formulasAjustadas: Celula[] = [];
  try {
    await adaptador.escrever(aba, plano.escritas);
    if (plano.ajusteIntervalos) {
      const { fimAntigo, fimNovo } = plano.ajusteIntervalos;
      const meio = await adaptador.lerGrade(aba);
      formulasAjustadas = formulasParaEstender(meio, plano, (f) => estenderIntervalos(f, fimAntigo, fimNovo));
      if (formulasAjustadas.length) await adaptador.escrever(aba, formulasAjustadas);
    }
  } catch (e) {
    // Desfaz só as linhas que o app acabou de inserir (ainda vazias ou parcialmente escritas).
    const novas = Array.from({ length: plano.quantidade }, (_, i) => plano.inicio + i);
    await adaptador.excluirLinhas(aba, novas).catch(() => undefined);
    throw new ErroPlanilha(
      "Não foi possível gravar na planilha. Nada foi alterado. Detalhe: " + (e instanceof Error ? e.message : String(e)),
    );
  }

  const depois = await adaptador.lerGrade(aba);
  conferirIntegridade(antes, depois, plano, formulasAjustadas);

  return {
    aba,
    linhas: plano.celulasPorLinha.map((_, i) => plano.inicio + i),
    celulasPorLinha: plano.celulasPorLinha,
    formulasAjustadas,
    avisos,
  };
}

/**
 * Confere que (a) cada célula escrita está com o valor certo e
 * (b) todas as células antigas que não são fórmula continuam iguais, na mesma ordem.
 */
export function conferirIntegridade(antes: Grade, depois: Grade, plano: PlanoAcrescimo, ajustadas: Celula[] = []) {
  for (const cel of plano.escritas) {
    const lido = depois.formulas[cel.linha]?.[cel.coluna];
    if (!confere(cel.valor, lido)) {
      throw new ErroPlanilha(
        `Conferência falhou: a célula ${cel.coluna + 1} da linha ${cel.linha + 1} não ficou com o valor esperado.`,
      );
    }
  }
  const ajustadasSet = new Set(ajustadas.map((c) => `${c.linha}:${c.coluna}`));
  for (let r = 0; r < antes.formulas.length; r++) {
    const rDepois = r >= plano.inicio ? r + plano.quantidade : r;
    const la = antes.formulas[r] ?? [];
    const ld = depois.formulas[rDepois] ?? [];
    const largura = Math.max(la.length, ld.length);
    for (let c = 0; c < largura; c++) {
      const a = la[c] ?? "";
      const d = ld[c] ?? "";
      if (String(a).startsWith("=") || ajustadasSet.has(`${rDepois}:${c}`)) continue;
      if (String(a) !== String(d)) {
        throw new ErroPlanilha(
          `Atenção: a linha ${r + 1} da planilha parece ter mudado durante a gravação. Confira a planilha antes de continuar.`,
        );
      }
    }
  }
}
