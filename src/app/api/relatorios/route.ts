import type { NextRequest } from "next/server";
import { relatorioCompleto } from "@/lib/relatorios";
import { lerConfigPlanilha } from "@/lib/servidor/config";
import { erro, ok, respostaDeErro } from "@/lib/servidor/http";
import { mesAtual, registrosDaPlanilha } from "@/lib/servidor/relatorios";

/** Relatório do mês (AAAA-MM), lido da própria planilha. */
export async function GET(req: NextRequest) {
  try {
    const cfg = lerConfigPlanilha();
    if (!cfg || !cfg.mapeamento.some(Boolean)) return erro("Conecte a planilha primeiro (menu Planilha).");
    const pedido = req.nextUrl.searchParams.get("mes");
    const mes = pedido && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : mesAtual();
    const leitura = await registrosDaPlanilha(cfg, mes);
    const r = relatorioCompleto(leitura.registros, mes, {
      usarUnidade: cfg.mapeamento.includes("unidade"),
      limitePreco: cfg.alertaPrecoPercentual,
    });
    return ok({
      ...r,
      compras: undefined, // a tela não precisa da lista completa (vai na exportação)
      planilha: cfg.planilhaNome,
      abasLidas: leitura.abasLidas,
      abasAusentes: leitura.abasAusentes,
      temCategoria: cfg.mapeamento.includes("categoria"),
      temFornecedor: cfg.mapeamento.includes("fornecedor"),
    });
  } catch (e) {
    return respostaDeErro(e);
  }
}
