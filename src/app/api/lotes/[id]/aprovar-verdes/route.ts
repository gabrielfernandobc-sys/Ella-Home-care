import { db, registrarEvento } from "@/lib/servidor/db";
import { ok, usuariaAtual } from "@/lib/servidor/http";

export async function POST(_req: Request, ctx: RouteContext<"/api/lotes/[id]/aprovar-verdes">) {
  const { id } = await ctx.params;
  const r = db()
    .prepare("UPDATE linhas SET aprovada = 1 WHERE lote_id = ? AND cor = 'verde' AND lancada = 0 AND aprovada = 0")
    .run(id);
  registrarEvento("aprovar_verdes", { linhas: Number(r.changes) }, id, usuariaAtual() ?? undefined);
  return ok({ aprovadas: Number(r.changes) });
}
