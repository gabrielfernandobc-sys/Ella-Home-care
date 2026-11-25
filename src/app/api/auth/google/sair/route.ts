import { sair } from "@/lib/servidor/google-auth";
import { ok } from "@/lib/servidor/http";

export async function POST() {
  await sair();
  return ok({ ok: true });
}
