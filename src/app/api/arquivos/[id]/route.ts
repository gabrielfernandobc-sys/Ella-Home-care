import fs from "node:fs";
import { caminhoSeguro, MIME } from "@/lib/servidor/armazenamento";
import { erro } from "@/lib/servidor/http";
import { obterArquivo } from "@/lib/servidor/repositorio";

/** Mostra o documento original ao lado da tabela de revisão. */
export async function GET(_req: Request, ctx: RouteContext<"/api/arquivos/[id]">) {
  const { id } = await ctx.params;
  const a = obterArquivo(id);
  if (!a) return erro("Arquivo não encontrado.", 404);
  if (a.apagado_em) return erro("Este arquivo já foi apagado deste computador (prazo de guarda).", 410);
  const usarPrevia = a.tipo === "heic";
  const caminho = caminhoSeguro(usarPrevia ? a.previa : a.caminho);
  if (!caminho) return erro("Arquivo não está disponível.", 404);
  const tipo = usarPrevia ? "image/jpeg" : MIME[a.tipo ?? ""] ?? "application/octet-stream";
  return new Response(fs.readFileSync(caminho), {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Conteúdo enviado nunca executa scripts (o leitor de PDF do navegador não funciona em modo "sandbox").
      ...(tipo === "application/pdf" ? {} : { "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; sandbox" }),
    },
  });
}
