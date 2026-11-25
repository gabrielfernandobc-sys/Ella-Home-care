import { CAMPO_POR_ID, type CampoId } from "@/lib/campos";
import { lerConfigPlanilha } from "@/lib/servidor/config";
import { fila } from "@/lib/servidor/fila";
import { erro, ok } from "@/lib/servidor/http";
import * as repo from "@/lib/servidor/repositorio";

export async function GET(_req: Request, ctx: RouteContext<"/api/lotes/[id]">) {
  const { id } = await ctx.params;
  const lote = repo.obterLote(id);
  if (!lote) return erro("Lote não encontrado.", 404);
  fila(); // garante que a fila está ativa
  const cfg = lerConfigPlanilha();
  const arquivos = repo.arquivosDoLote(id).map((a) => ({
    id: a.id,
    nome: a.nome,
    tamanho: a.tamanho,
    tipo: a.tipo,
    status: a.status,
    metodo: a.metodo,
    erro: a.erro,
    temPrevia: !!(a.previa || a.caminho),
    apagado: !!a.apagado_em,
  }));
  const linhas = repo.linhasDoLote(id).map((l) => ({
    id: l.id,
    arquivoId: l.arquivo_id,
    documentoId: l.documento_id,
    indice: l.indice,
    valores: l.valores,
    confianca: l.confianca,
    problemas: l.problemas,
    cor: l.cor,
    duplicada: l.duplicada,
    motivoDuplicata: l.motivo_duplicata,
    aprovada: l.aprovada,
    forcada: l.forcada,
    editada: l.editada,
    lancada: l.lancada,
  }));
  const contar = (f: (x: (typeof arquivos)[number]) => boolean) => arquivos.filter(f).length;
  const campos = ((cfg?.mapeamento.filter(Boolean) as CampoId[]) ?? []).filter(
    (c) => c !== "id_lote" && c !== "arquivo_origem",
  );
  return ok({
    lote,
    arquivos,
    linhas,
    campos: (campos.length ? campos : (["data_emissao", "fornecedor", "descricao", "quantidade", "valor_unitario", "valor_total_item"] as CampoId[])).map(
      (c) => ({ id: c, rotulo: CAMPO_POR_ID[c].rotulo, tipo: CAMPO_POR_ID[c].tipo, nivel: CAMPO_POR_ID[c].nivel }),
    ),
    progresso: {
      total: arquivos.length,
      naFila: contar((a) => a.status === "na_fila"),
      processando: contar((a) => a.status === "processando"),
      prontos: contar((a) => a.status === "pronto"),
      erros: contar((a) => a.status === "erro"),
      duplicados: contar((a) => a.status === "duplicado"),
    },
    resumo: {
      verde: linhas.filter((l) => l.cor === "verde").length,
      amarelo: linhas.filter((l) => l.cor === "amarelo").length,
      vermelho: linhas.filter((l) => l.cor === "vermelho").length,
      aprovadas: linhas.filter((l) => l.aprovada && !l.lancada).length,
      lancadas: linhas.filter((l) => l.lancada).length,
    },
    planilha: cfg ? { nome: cfg.planilhaNome, aba: cfg.modoAbas === "mensal" ? `uma aba por mês (${cfg.padraoNomeAba})` : cfg.aba, fonte: cfg.fonte } : null,
  });
}
