import { ok, respostaDeErro, usuariaAtual } from "@/lib/servidor/http";
import { lancarLote } from "@/lib/servidor/lancamento";

export async function POST(_req: Request, ctx: RouteContext<"/api/lotes/[id]/lancar">) {
  try {
    const { id } = await ctx.params;
    return ok(await lancarLote(id, usuariaAtual()));
  } catch (e) {
    return respostaDeErro(e);
  }
}
