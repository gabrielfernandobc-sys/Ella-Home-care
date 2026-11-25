import { ok } from "@/lib/servidor/http";
import { testarPlanilha } from "@/lib/servidor/verificacao";

/** Só lê a planilha configurada (abas e quantidade de linhas). */
export async function POST() {
  return ok(await testarPlanilha());
}
