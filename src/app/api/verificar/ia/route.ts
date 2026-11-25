import { registrarEvento } from "@/lib/servidor/db";
import { ok } from "@/lib/servidor/http";
import { testarIA } from "@/lib/servidor/verificacao";

/** Lê o print FICTÍCIO de exemplo com a IA, para testar a chave real. */
export async function POST() {
  const r = await testarIA();
  registrarEvento("verificar_ia", { ok: r.ok, segundos: r.segundos });
  return ok(r);
}
