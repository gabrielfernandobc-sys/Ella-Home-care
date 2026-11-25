/**
 * Login com Google (OAuth) com redirecionamento para localhost.
 * Escopos mínimos: e-mail (para registrar quem lançou) e planilhas.
 * O token fica só no banco local (pasta data/, fora do Git).
 */
import { OAuth2Client, type Credentials } from "google-auth-library";
import { apagarConfig, lerConfig, salvarConfig } from "./db";
import { porta } from "./config";

export const ESCOPOS = ["openid", "email", "https://www.googleapis.com/auth/spreadsheets"];

export function googleConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function enderecoRetorno(): string {
  return `http://localhost:${porta()}/api/auth/google/retorno`;
}

function novoCliente(): OAuth2Client {
  if (!googleConfigurado()) {
    throw new Error("Login com Google não configurado: preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.");
  }
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: enderecoRetorno(),
  });
}

export function urlDeLogin(estado: string): string {
  return novoCliente().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ESCOPOS,
    state: estado,
    include_granted_scopes: false,
  });
}

interface SessaoGoogle {
  tokens: Credentials;
  email: string | null;
}

export async function concluirLogin(codigo: string): Promise<string | null> {
  const cliente = novoCliente();
  const { tokens } = await cliente.getToken(codigo);
  let email: string | null = null;
  if (tokens.id_token) {
    const ticket = await cliente.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    email = ticket.getPayload()?.email ?? null;
  }
  const escopos = (tokens.scope ?? "").split(" ");
  if (!escopos.includes("https://www.googleapis.com/auth/spreadsheets")) {
    throw new Error("A permissão para editar planilhas não foi concedida. Tente entrar de novo e marque a opção.");
  }
  salvarConfig("google", { tokens, email } satisfies SessaoGoogle);
  return email;
}

export function sessaoGoogle(): SessaoGoogle | null {
  return lerConfig<SessaoGoogle>("google");
}

/** Cliente autenticado; tokens renovados são salvos automaticamente. */
export function clienteAutenticado(): OAuth2Client {
  const sessao = sessaoGoogle();
  if (!sessao) throw new Error("Entre com sua conta Google primeiro.");
  const cliente = novoCliente();
  cliente.setCredentials(sessao.tokens);
  cliente.on("tokens", (novos) => {
    const atual = sessaoGoogle();
    salvarConfig("google", {
      email: atual?.email ?? null,
      tokens: { ...(atual?.tokens ?? {}), ...novos, refresh_token: novos.refresh_token ?? atual?.tokens.refresh_token },
    });
  });
  return cliente;
}

export async function sair(): Promise<void> {
  const sessao = sessaoGoogle();
  apagarConfig("google");
  const token = sessao?.tokens.refresh_token ?? sessao?.tokens.access_token;
  if (token && googleConfigurado()) {
    await novoCliente()
      .revokeToken(token)
      .catch(() => undefined);
  }
}
