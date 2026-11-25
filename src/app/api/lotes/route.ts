import { registrarEvento } from "@/lib/servidor/db";
import { lerJson, ok, respostaDeErro, usuariaAtual } from "@/lib/servidor/http";
import { criarLote, listarLotes } from "@/lib/servidor/repositorio";

export async function GET() {
  return ok({ lotes: listarLotes() });
}

export async function POST(req: Request) {
  try {
    const c = await lerJson<{ mesReferencia?: string | null }>(req).catch(() => ({}) as { mesReferencia?: string });
    const mes = c.mesReferencia && /^\d{4}-\d{2}$/.test(c.mesReferencia) ? c.mesReferencia : null;
    const usuaria = usuariaAtual();
    const lote = criarLote(usuaria, mes);
    registrarEvento("criar_lote", {}, lote.id, usuaria ?? undefined);
    return ok({ lote }, 201);
  } catch (e) {
    return respostaDeErro(e);
  }
}
