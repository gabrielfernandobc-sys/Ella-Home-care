import { PlanilhaDemo } from "@/lib/servidor/demo";
import { ok } from "@/lib/servidor/http";
import { limparCachePlanilha } from "@/lib/servidor/processamento";

/** Mostra a planilha de demonstração (fictícia). */
export async function GET() {
  const p = PlanilhaDemo.carregar();
  const abas = await Promise.all(
    (await p.listarAbas()).map(async (titulo) => ({ titulo, ...(await p.lerGrade(titulo)) })),
  );
  return ok({ abas });
}

/** Volta a planilha de demonstração ao estado inicial. */
export async function POST() {
  PlanilhaDemo.reiniciar();
  limparCachePlanilha();
  return ok({ ok: true });
}
