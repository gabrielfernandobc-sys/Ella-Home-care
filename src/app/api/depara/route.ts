import { lerJson, ok, respostaDeErro } from "@/lib/servidor/http";
import { excluirDePara, listarDePara } from "@/lib/servidor/repositorio";

export async function GET() {
  return ok({ itens: listarDePara() });
}

export async function DELETE(req: Request) {
  try {
    const c = await lerJson<{ campo: string; base?: string; de: string }>(req);
    excluirDePara(c.campo, c.base ?? c.campo, c.de);
    return ok({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
