import { ok, respostaDeErro, usuariaAtual } from "@/lib/servidor/http";
import { desfazerUltimoLote } from "@/lib/servidor/lancamento";

export async function POST() {
  try {
    return ok(await desfazerUltimoLote(usuariaAtual()));
  } catch (e) {
    return respostaDeErro(e);
  }
}
