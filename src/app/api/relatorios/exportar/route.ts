import type { NextRequest } from "next/server";
import { relatorioCompleto } from "@/lib/relatorios";
import { lerConfigPlanilha } from "@/lib/servidor/config";
import { registrarEvento } from "@/lib/servidor/db";
import { exportarRelatorioXlsx } from "@/lib/servidor/exportar";
import { erro, respostaDeErro, usuariaAtual } from "@/lib/servidor/http";
import { mesAtual, registrosDaPlanilha } from "@/lib/servidor/relatorios";

/** Baixa o relatório do mês em Excel (.xlsx). */
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
    const arquivo = await exportarRelatorioXlsx(r, cfg.planilhaNome);
    registrarEvento("exportar_relatorio", { mes }, undefined, usuariaAtual() ?? undefined);
    return new Response(new Uint8Array(arquivo), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="relatorio-compras-${mes}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return respostaDeErro(e);
  }
}
