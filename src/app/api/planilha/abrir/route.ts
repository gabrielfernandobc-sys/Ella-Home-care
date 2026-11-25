import { idDaPlanilha, PlanilhaGoogle } from "@/lib/planilha/google";
import { ID_DEMO, PlanilhaDemo } from "@/lib/servidor/demo";
import { clienteAutenticado } from "@/lib/servidor/google-auth";
import { erro, lerJson, ok, respostaDeErro } from "@/lib/servidor/http";

/** Abre a planilha (pelo link) e lista as abas. */
export async function POST(req: Request) {
  try {
    const corpo = await lerJson<{ link?: string; fonte?: "google" | "demo" }>(req);
    if (corpo.fonte === "demo") {
      const p = PlanilhaDemo.carregar();
      return ok({ fonte: "demo", planilhaId: ID_DEMO, nome: "Planilha de demonstração (fictícia)", abas: await p.listarAbas() });
    }
    const id = idDaPlanilha(corpo.link ?? "");
    if (!id) return erro("Link inválido. Copie o endereço da planilha na barra do navegador (começa com https://docs.google.com/spreadsheets/).");
    const p = new PlanilhaGoogle(clienteAutenticado(), id);
    const abas = await p.listarAbas();
    return ok({ fonte: "google", planilhaId: id, nome: await p.titulo(), abas });
  } catch (e) {
    return respostaDeErro(e);
  }
}
