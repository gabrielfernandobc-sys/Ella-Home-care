"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Cartao, Carregando, Selo } from "@/components/ui";
import { api } from "@/lib/cliente/api";
import type { ResultadoTesteIA, ResultadoTestePlanilha, Verificacao } from "@/lib/servidor/verificacao";

function Item({ ok, titulo, children }: { ok: boolean | null; titulo: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 py-3 border-b border-slate-100 last:border-0">
      <span className="text-xl leading-7" aria-hidden>
        {ok === null ? "⚪" : ok ? "✅" : "⚠️"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {titulo} <span className="sr-only">{ok === null ? "(não testado)" : ok ? "(ok)" : "(pendente)"}</span>
        </p>
        {children && <div className="text-slate-700 text-[0.95rem] mt-0.5 space-y-1">{children}</div>}
      </div>
    </li>
  );
}

function Verificar() {
  const params = useSearchParams();
  const [v, setV] = useState<Verificacao | null>(null);
  const [ia, setIa] = useState<ResultadoTesteIA | null>(null);
  const [planilha, setPlanilha] = useState<ResultadoTestePlanilha | null>(null);
  const [testando, setTestando] = useState<"ia" | "planilha" | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => setV(await api<Verificacao>("/api/verificar")), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function testarIA() {
    setTestando("ia");
    setIa(null);
    try {
      setIa(await api<ResultadoTesteIA>("/api/verificar/ia", { corpo: {} }));
    } finally {
      setTestando(null);
    }
  }

  async function testarPlanilha() {
    setTestando("planilha");
    setPlanilha(null);
    try {
      setPlanilha(await api<ResultadoTestePlanilha>("/api/verificar/planilha", { corpo: {} }));
    } finally {
      setTestando(null);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  if (!v) return <Carregando />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Verificar configuração</h1>
        <p className="text-slate-600 mt-1">
          Confira, com as suas chaves de verdade, se está tudo pronto. Nenhum teste grava nada na planilha.
        </p>
      </div>
      {params.get("google") === "ok" && <Aviso tipo="ok">Login com Google feito!</Aviso>}
      {params.get("erro") && <Aviso tipo="erro">{params.get("erro")}</Aviso>}

      <Cartao titulo="1. Este computador">
        <ul>
          <Item ok={v.node.ok} titulo={`Node.js ${v.node.versao}`}>
            {!v.node.ok && <p>Instale a versão LTS mais nova em nodejs.org e abra o app de novo.</p>}
          </Item>
          <Item ok={v.pastaDados.ok} titulo="Pasta de dados do app">
            {!v.pastaDados.ok && <p>O app não consegue gravar na pasta “data”. Mova a pasta do app para Documentos.</p>}
          </Item>
        </ul>
      </Cartao>

      <Cartao titulo="2. Login com Google">
        <ul>
          <Item ok={v.google.configurado} titulo="ID e chave do Google no arquivo .env">
            {!v.google.configurado && (
              <p>
                Falta preencher <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> no arquivo <code>.env</code> (README, passo 2) e
                abrir o app de novo.
              </p>
            )}
          </Item>
          <Item ok={null} titulo="Endereço de retorno para cadastrar no Google Cloud">
            <p>Em “URIs de redirecionamento autorizados”, cole exatamente:</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="bg-slate-100 rounded px-2 py-1 break-all select-all">{v.google.enderecoRetorno}</code>
              <button className="text-sm underline text-blue-800" onClick={() => copiar(v.google.enderecoRetorno)}>
                {copiado ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </Item>
          <Item ok={v.google.conectado} titulo={v.google.conectado ? `Conectada como ${v.google.email ?? "(sem e-mail)"}` : "Entrar com a conta Google"}>
            {v.google.configurado && !v.google.conectado && (
              <a href="/api/auth/google/entrar?voltar=/verificar">
                <Botao>Entrar com Google</Botao>
              </a>
            )}
            {v.google.conectado && (
              <p>
                Google Drive para comprovantes: {v.google.drive ? <Selo cor="verde">autorizado</Selo> : <Selo cor="cinza">não autorizado (só precisa se ligar os comprovantes)</Selo>}
              </p>
            )}
          </Item>
        </ul>
      </Cartao>

      <Cartao titulo="3. Planilha">
        <ul>
          <Item ok={planilha ? planilha.ok : v.planilha.configurada ? null : false} titulo={v.planilha.nome ?? "Nenhuma planilha configurada"}>
            {!v.planilha.configurada && (
              <p>
                Configure em <Link href="/configurar" className="underline">Planilha</Link>.
              </p>
            )}
            {v.planilha.fonte === "demo" && <p>Esta é a planilha de demonstração. Para o teste real, conecte a sua planilha do Google em Planilha.</p>}
            {planilha && <p>{planilha.mensagem}</p>}
            {v.planilha.configurada && (
              <Botao variante="secundario" onClick={testarPlanilha} disabled={testando !== null}>
                {testando === "planilha" ? "Lendo a planilha…" : "Testar acesso à planilha"}
              </Botao>
            )}
          </Item>
        </ul>
      </Cartao>

      <Cartao titulo="4. Leitura por IA">
        <ul>
          <Item ok={ia ? ia.ok : v.ia.configurada ? null : false} titulo="Chave da IA no arquivo .env">
            {!v.ia.configurada && (
              <p>
                Falta preencher <code>ANTHROPIC_API_KEY</code> no arquivo <code>.env</code> (README, passo 3) e abrir o app de novo. Notas em XML funcionam
                sem ela.
              </p>
            )}
            {v.ia.configurada && (
              <>
                <p>
                  O teste lê o print <b>fictício</b> de exemplo (“Sistema de Compras — NF 2290”) e compara com o que ele realmente contém. Custa alguns
                  centavos de dólar. Modelo: <code>{v.ia.modelo}</code>.
                </p>
                <Botao variante="secundario" onClick={testarIA} disabled={testando !== null}>
                  {testando === "ia" ? "A IA está lendo… (até 1 minuto)" : "Testar a IA com o print de exemplo"}
                </Botao>
              </>
            )}
            {ia && (
              <div className="mt-2 space-y-2">
                <Aviso tipo={ia.ok ? (ia.conferencia?.every((c) => c.ok) ? "ok" : "atencao") : "erro"}>
                  {ia.mensagem} {ia.segundos > 0 && <span className="text-sm">({ia.segundos.toLocaleString("pt-BR")} s)</span>}
                </Aviso>
                {ia.conferencia && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="border-b text-slate-600">
                          <th className="py-1.5 pr-3">Conferência</th>
                          <th className="py-1.5 pr-3">Esperado</th>
                          <th className="py-1.5 pr-3">A IA leu</th>
                          <th className="py-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {ia.conferencia.map((c) => (
                          <tr key={c.campo} className="border-b border-slate-100">
                            <td className="py-1.5 pr-3">{c.campo}</td>
                            <td className="py-1.5 pr-3">{c.esperado}</td>
                            <td className="py-1.5 pr-3">{c.lido}</td>
                            <td className="py-1.5">{c.ok ? "✅" : "⚠️"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Item>
        </ul>
      </Cartao>

      <p className="text-sm text-slate-500">
        Tudo certo? Volte ao <Link href="/" className="underline">Início</Link> e comece com um lote pequeno de notas reais.
      </p>
    </div>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Verificar />
    </Suspense>
  );
}
