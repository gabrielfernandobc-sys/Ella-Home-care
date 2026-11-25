/**
 * Segurança local:
 * - só responde quando acessado por localhost / 127.0.0.1 (bloqueia "DNS rebinding");
 * - pedidos que alteram dados precisam vir do próprio app (bloqueia sites de fora).
 */
import { NextResponse, type NextRequest } from "next/server";

const HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostname(h: string | null): string | null {
  if (!h) return null;
  try {
    return new URL(`http://${h}`).hostname;
  } catch {
    return null;
  }
}

export function proxy(req: NextRequest) {
  const host = hostname(req.headers.get("host"));
  if (!host || !HOSTS.has(host)) {
    return new NextResponse("Acesso permitido só neste computador (localhost).", { status: 403 });
  }
  const metodo = req.method.toUpperCase();
  if (req.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(metodo)) {
    const origem = req.headers.get("origin");
    const origemHost = origem ? hostname(origem.replace(/^https?:\/\//, "")) : null;
    if (!origemHost || !HOSTS.has(origemHost)) {
      return NextResponse.json({ erro: "Pedido bloqueado: origem desconhecida." }, { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
