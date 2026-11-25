import { PlanilhaGoogle } from "../planilha/google";
import type { AdaptadorPlanilha } from "../planilha/tipos";
import type { ConfigPlanilha } from "./config";
import { PlanilhaDemo } from "./demo";
import { clienteAutenticado } from "./google-auth";

export function adaptadorPara(cfg: Pick<ConfigPlanilha, "fonte" | "planilhaId">): AdaptadorPlanilha {
  if (cfg.fonte === "demo") return PlanilhaDemo.carregar();
  return new PlanilhaGoogle(clienteAutenticado(), cfg.planilhaId);
}

/** Traduz erros do Google para mensagens simples. */
export function mensagemErroPlanilha(e: unknown): string {
  const err = e as { code?: number; status?: number; message?: string; response?: { status?: number } };
  const status = err?.response?.status ?? err?.status ?? err?.code;
  if (status === 401) return "Sua sessão do Google expirou. Clique em “Entrar com Google” de novo.";
  if (status === 403) return "Sua conta Google não tem permissão para editar esta planilha.";
  if (status === 404) return "Planilha não encontrada. Confira o link.";
  if (status === 429) return "O Google pediu uma pausa (muitas operações). Aguarde 1 minuto e tente de novo.";
  if (typeof status === "number" && status >= 500) return "O Google Sheets está instável agora. Tente de novo em instantes.";
  return err?.message ?? "Erro ao acessar a planilha.";
}
