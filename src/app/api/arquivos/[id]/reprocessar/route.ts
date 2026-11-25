import { fila } from "@/lib/servidor/fila";
import { erro, ok } from "@/lib/servidor/http";
import { atualizarArquivo, obterArquivo } from "@/lib/servidor/repositorio";

/** "Ler de novo": volta o arquivo para a fila (linhas já lançadas não são mexidas). */
export async function POST(_req: Request, ctx: RouteContext<"/api/arquivos/[id]/reprocessar">) {
  const { id } = await ctx.params;
  const a = obterArquivo(id);
  if (!a) return erro("Arquivo não encontrado.", 404);
  if (a.apagado_em) return erro("Este arquivo já foi apagado deste computador.");
  if (a.status === "processando" || a.status === "na_fila") return erro("O arquivo já está sendo lido.");
  if (a.status === "duplicado") return erro("Arquivo repetido não é lido de novo.");
  atualizarArquivo(id, { status: "na_fila", erro: null, tentativas: 0 });
  fila().adicionar(id);
  return ok({ ok: true });
}
