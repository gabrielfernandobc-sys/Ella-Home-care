import type { ValoresLinha } from "@/lib/campos";
import { erro, lerJson, ok, respostaDeErro } from "@/lib/servidor/http";
import { editarLinha } from "@/lib/servidor/processamento";
import * as repo from "@/lib/servidor/repositorio";

/** Edita valores e/ou aprova a linha. Vermelhas só podem ser aprovadas com "forcar". */
export async function PATCH(req: Request, ctx: RouteContext<"/api/linhas/[id]">) {
  try {
    const { id } = await ctx.params;
    const c = await lerJson<{ valores?: ValoresLinha; aprovada?: boolean; forcar?: boolean }>(req);
    let linha = repo.obterLinha(id);
    if (!linha) return erro("Linha não encontrada.", 404);
    if (linha.lancada) return erro("Esta linha já foi lançada.");
    if (c.valores && Object.keys(c.valores).length) linha = await editarLinha(id, c.valores);
    if (!linha) return erro("Linha não encontrada.", 404);
    if (typeof c.aprovada === "boolean") {
      if (c.aprovada && linha.cor === "vermelho" && !c.forcar) {
        return erro("Esta linha está vermelha (erro ou duplicata). Corrija ou use “Lançar mesmo assim”.");
      }
      repo.atualizarLinha(id, { aprovada: c.aprovada, forcada: c.aprovada && linha.cor === "vermelho" && !!c.forcar });
    }
    return ok({ linha: repo.obterLinha(id) });
  } catch (e) {
    return respostaDeErro(e);
  }
}
