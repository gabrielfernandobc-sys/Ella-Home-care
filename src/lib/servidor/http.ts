import { ErroLancamento } from "./lancamento";
import { ErroPlanilha } from "../planilha/acrescentar";
import { mensagemErroPlanilha } from "./adaptador";
import { sessaoGoogle } from "./google-auth";
import { lerConfigPlanilha } from "./config";

export function ok(dados: unknown, status = 200) {
  return Response.json(dados, { status, headers: { "Cache-Control": "no-store" } });
}

export function erro(mensagem: string, status = 400) {
  return Response.json({ erro: mensagem }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Converte qualquer erro numa resposta com mensagem simples (sem vazar detalhes internos). */
export function respostaDeErro(e: unknown) {
  if (e instanceof ErroLancamento || e instanceof ErroPlanilha) return erro(e.message, 409);
  const err = e as { response?: { status?: number }; code?: number };
  if (err?.response?.status || typeof err?.code === "number") return erro(mensagemErroPlanilha(e), 502);
  if (e instanceof Error) return erro(e.message, 400);
  return erro("Erro inesperado.", 500);
}

export function usuariaAtual(): string | null {
  const cfg = lerConfigPlanilha();
  if (cfg?.fonte === "demo") return "demonstração";
  return sessaoGoogle()?.email ?? null;
}

export async function lerJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new Error("Pedido inválido.");
  }
}
