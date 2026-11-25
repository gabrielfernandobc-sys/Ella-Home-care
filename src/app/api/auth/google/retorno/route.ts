import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { concluirLogin } from "@/lib/servidor/google-auth";
import { registrarEvento } from "@/lib/servidor/db";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const esperado = jar.get("oauth_estado")?.value;
  jar.delete("oauth_estado");
  const estado = req.nextUrl.searchParams.get("state");
  const codigo = req.nextUrl.searchParams.get("code");
  const destino = new URL("/configurar", req.nextUrl.origin);
  if (req.nextUrl.searchParams.get("error")) {
    destino.searchParams.set("erro", "Login cancelado.");
    return Response.redirect(destino);
  }
  if (!esperado || !estado || estado !== esperado || !codigo) {
    destino.searchParams.set("erro", "Não foi possível confirmar o login. Tente de novo.");
    return Response.redirect(destino);
  }
  try {
    const email = await concluirLogin(codigo);
    registrarEvento("login_google", {}, undefined, email ?? undefined);
    destino.searchParams.set("google", "ok");
  } catch (e) {
    destino.searchParams.set("erro", (e as Error).message || "Falha no login com Google.");
  }
  return Response.redirect(destino);
}
