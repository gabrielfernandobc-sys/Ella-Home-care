import { ok } from "@/lib/servidor/http";
import { verificarConfiguracao } from "@/lib/servidor/verificacao";

export async function GET() {
  return ok(verificarConfiguracao());
}
