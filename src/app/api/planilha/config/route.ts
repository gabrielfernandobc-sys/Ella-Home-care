import { CAMPO_IDS, type CampoId } from "@/lib/campos";
import { problemasDoMapeamento } from "@/lib/mapeamento";
import { configPadrao, lerConfigPlanilha, salvarConfigPlanilha, type ConfigPlanilha } from "@/lib/servidor/config";
import { registrarEvento } from "@/lib/servidor/db";
import { temEscopoDrive } from "@/lib/servidor/google-auth";
import { erro, lerJson, ok, respostaDeErro, usuariaAtual } from "@/lib/servidor/http";
import { limparCachePlanilha } from "@/lib/servidor/processamento";

export async function GET() {
  return ok({ config: lerConfigPlanilha(), padrao: configPadrao() });
}

export async function PUT(req: Request) {
  try {
    const c = await lerJson<ConfigPlanilha>(req);
    if (!c.planilhaId || !c.aba) return erro("Escolha a planilha e a aba.");
    if (c.fonte !== "google" && c.fonte !== "demo") return erro("Fonte inválida.");
    const mapeamento = (c.mapeamento ?? []).map((m) => (m && (CAMPO_IDS as readonly string[]).includes(m) ? (m as CampoId) : null));
    const probs = problemasDoMapeamento(mapeamento, c.colunasFormula ?? []);
    if (probs.length) return erro(probs.join(" "));
    if (c.modoAbas === "mensal" && !c.abaModelo) return erro("No modo “uma aba por mês”, escolha a aba modelo.");
    if (c.comprovantesAtivo && c.fonte === "google" && !temEscopoDrive()) {
      return erro("Para guardar comprovantes no Google Drive, clique primeiro em “Autorizar Google Drive”.");
    }
    if (c.pastaComprovantes && !/^[^/\\]{1,60}$/.test(c.pastaComprovantes.trim())) {
      return erro("Nome da pasta de comprovantes inválido (sem barras, até 60 caracteres).");
    }
    const final: ConfigPlanilha = {
      ...configPadrao(),
      ...c,
      mapeamento,
      obrigatorios: (c.obrigatorios ?? configPadrao().obrigatorios).filter((x) => (CAMPO_IDS as readonly string[]).includes(x)),
      linhaCabecalho: Math.max(1, Math.floor(Number(c.linhaCabecalho) || 1)),
      diasMaximos: Math.max(1, Math.floor(Number(c.diasMaximos) || 180)),
      comprovantesAtivo: !!c.comprovantesAtivo,
      pastaComprovantes: (c.pastaComprovantes || "Notas").trim(),
      aprovarVerdesAutomaticamente: !!c.aprovarVerdesAutomaticamente,
    };
    salvarConfigPlanilha(final);
    limparCachePlanilha();
    registrarEvento("config_planilha", { aba: final.aba, colunas: mapeamento.filter(Boolean).length }, undefined, usuariaAtual() ?? undefined);
    return ok({ config: final });
  } catch (e) {
    return respostaDeErro(e);
  }
}
