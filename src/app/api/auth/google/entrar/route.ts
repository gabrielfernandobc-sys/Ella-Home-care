import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { googleConfigurado, urlDeLogin } from "@/lib/servidor/google-auth";

export async function GET(req: NextRequest) {
  if (!googleConfigurado()) redirect("/?erro=google-nao-configurado");
  const estado = randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set("oauth_estado", estado, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  // Para onde voltar depois do login (só telas do próprio app).
  const voltar = req.nextUrl.searchParams.get("voltar");
  jar.set("oauth_voltar", voltar === "/verificar" ? "/verificar" : "/configurar", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  redirect(urlDeLogin(estado, req.nextUrl.searchParams.get("drive") === "1"));
}
