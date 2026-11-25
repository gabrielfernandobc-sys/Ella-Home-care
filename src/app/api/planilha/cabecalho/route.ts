import type { Granularidade } from "@/lib/campos";
import { detectarLinhaCabecalho, proporMapeamento } from "@/lib/mapeamento";
import { analisarAba } from "@/lib/planilha/planejador";
import { adaptadorPara } from "@/lib/servidor/adaptador";
import { lerConfigPlanilha } from "@/lib/servidor/config";
import { lerJson, ok, respostaDeErro } from "@/lib/servidor/http";

/** Lê o cabeçalho da aba e propõe o mapeamento "campo -> coluna". */
export async function POST(req: Request) {
  try {
    const c = await lerJson<{
      fonte: "google" | "demo";
      planilhaId: string;
      aba: string;
      linhaCabecalho?: number;
      granularidade?: Granularidade;
    }>(req);
    const granularidade = c.granularidade ?? "item";
    const adaptador = adaptadorPara({ fonte: c.fonte, planilhaId: c.planilhaId });
    const grade = await adaptador.lerGrade(c.aba);
    const linhaCabecalho = c.linhaCabecalho && c.linhaCabecalho > 0 ? c.linhaCabecalho : detectarLinhaCabecalho(grade.valores, granularidade);
    const cabecalhos = (grade.valores[linhaCabecalho - 1] ?? []).map((x) => String(x ?? "").trim());
    const analise = analisarAba(grade, linhaCabecalho);
    // Se já existe um mapeamento salvo para esta mesma aba e cabeçalho, ele é mantido.
    const salvo = lerConfigPlanilha();
    const mesmo =
      salvo &&
      salvo.planilhaId === c.planilhaId &&
      salvo.aba === c.aba &&
      salvo.linhaCabecalho === linhaCabecalho &&
      salvo.granularidade === granularidade &&
      JSON.stringify(salvo.cabecalhos) === JSON.stringify(cabecalhos);
    const proposta = mesmo ? salvo!.mapeamento : proporMapeamento(cabecalhos, { granularidade, colunasFormula: analise.colunasFormula });
    const amostra = grade.valores.slice(linhaCabecalho, Math.min(linhaCabecalho + 3, analise.linhaTotais ?? grade.valores.length));
    return ok({
      linhaCabecalho,
      cabecalhos,
      colunasFormula: analise.colunasFormula,
      proposta,
      amostra,
      totalLinhasDados: analise.totalLinhasDados,
      temTotais: analise.linhaTotais !== null,
      mapeamentoSalvo: !!mesmo,
    });
  } catch (e) {
    return respostaDeErro(e);
  }
}
