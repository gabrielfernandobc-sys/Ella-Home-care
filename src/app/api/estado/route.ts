import { iaConfigurada } from "@/lib/extracao/ia";
import { lerConfigPlanilha } from "@/lib/servidor/config";
import { fila } from "@/lib/servidor/fila";
import { googleConfigurado, sessaoGoogle, temEscopoDrive } from "@/lib/servidor/google-auth";
import { ok } from "@/lib/servidor/http";
import { diasDeRetencao } from "@/lib/servidor/limpeza";
import { ultimoLoteLancado } from "@/lib/servidor/repositorio";

export async function GET() {
  const cfg = lerConfigPlanilha();
  const sessao = sessaoGoogle();
  return ok({
    googleConfigurado: googleConfigurado(),
    googleConectado: !!sessao,
    email: sessao?.email ?? null,
    driveAutorizado: temEscopoDrive(),
    iaConfigurada: iaConfigurada(),
    planilha: cfg
      ? {
          fonte: cfg.fonte,
          nome: cfg.planilhaNome,
          aba: cfg.aba,
          modoAbas: cfg.modoAbas,
          colunasMapeadas: cfg.mapeamento.filter(Boolean).length,
          granularidade: cfg.granularidade,
        }
      : null,
    fila: fila().estado(),
    ultimoLoteLancado: ultimoLoteLancado(),
    retencaoDias: diasDeRetencao(),
  });
}
