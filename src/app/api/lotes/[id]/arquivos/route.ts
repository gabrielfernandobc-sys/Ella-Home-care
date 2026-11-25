import { fila } from "@/lib/servidor/fila";
import { erro, ok, respostaDeErro } from "@/lib/servidor/http";
import { receberArquivo } from "@/lib/servidor/processamento";
import { obterLote } from "@/lib/servidor/repositorio";

const LIMITE = 30 * 1024 * 1024; // 30 MB por arquivo

/** Recebe UM arquivo por pedido (o navegador envia vários em paralelo, com progresso individual). */
export async function POST(req: Request, ctx: RouteContext<"/api/lotes/[id]/arquivos">) {
  try {
    const { id } = await ctx.params;
    const lote = obterLote(id);
    if (!lote) return erro("Lote não encontrado.", 404);
    if (lote.status === "lancado") return erro("Este lote já foi lançado. Crie um novo lote para mais arquivos.");
    const form = await req.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) return erro("Nenhum arquivo recebido.");
    if (arquivo.size === 0) return erro("Arquivo vazio.");
    if (arquivo.size > LIMITE) return erro("Arquivo maior que 30 MB. Divida o PDF ou reduza a foto.");
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const nome = (form.get("nome") as string | null) || arquivo.name || "arquivo";
    const r = await receberArquivo(id, nome, bytes);
    if (!r.duplicado) fila().adicionar(r.arquivo.id);
    return ok({ id: r.arquivo.id, status: r.arquivo.status, erro: r.arquivo.erro }, 201);
  } catch (e) {
    return respostaDeErro(e);
  }
}
