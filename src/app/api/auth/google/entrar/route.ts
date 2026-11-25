import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { googleConfigurado, urlDeLogin } from "@/lib/servidor/google-auth";

export async function GET() {
  if (!googleConfigurado()) redirect("/?erro=google-nao-configurado");
  const estado = randomBytes(24).toString("hex");
  (await cookies()).set("oauth_estado", estado, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  redirect(urlDeLogin(estado));
}
