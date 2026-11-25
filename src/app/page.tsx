"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Cartao, Carregando, Selo } from "@/components/ui";
import { api } from "@/lib/cliente/api";

interface Estado {
  googleConfigurado: boolean;
  googleConectado: boolean;
  email: string | null;
  iaConfigurada: boolean;
  planilha: { fonte: string; nome: string; aba: string; modoAbas: string; colunasMapeadas: number; granularidade: string } | null;
  ultimoLoteLancado: string | null;
  retencaoDias: number;
}

interface LoteResumo {
  id: string;
  criado_em: string;
  status: string;
  arquivos: number;
  linhas: number;
  lancadas: number;
}

function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Inicio() {
  const router = useRouter();
  const params = useSearchParams();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [lotes, setLotes] = useState<LoteResumo[]>([]);
  const [mes, setMes] = useState<string>("");
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(
    params.get("erro") === "google-nao-configurado"
      ? { tipo: "erro", texto: "O login com Google ainda não foi configurado. Veja a Ajuda, passo 2." }
      : null,
  );

  const carregar = useCallback(async () => {
    const [e, l] = await Promise.all([api<Estado>("/api/estado"), api<{ lotes: LoteResumo[] }>("/api/lotes")]);
    setEstado(e);
    setLotes(l.lotes);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar().catch((e) => setMensagem({ tipo: "erro", texto: e.message }));
  }, [carregar]);

  async function novoLote() {
    setOcupado(true);
    try {
      const { lote } = await api<{ lote: { id: string } }>("/api/lotes", { corpo: { mesReferencia: mes || null } });
      router.push(`/lote/${lote.id}`);
    } catch (e) {
      setMensagem({ tipo: "erro", texto: (e as Error).message });
      setOcupado(false);
    }
  }

  async function desfazer() {
    if (!estado?.ultimoLoteLancado) return;
    if (!confirm(`Desfazer o lote ${estado.ultimoLoteLancado}?\n\nSó as linhas que este lote criou serão removidas da planilha.`)) return;
    setOcupado(true);
    try {
      const r = await api<{ loteId: string; removidas: number }>("/api/lotes/desfazer", { corpo: {} });
      setMensagem({ tipo: "ok", texto: `Pronto: ${r.removidas} linha(s) do lote ${r.loteId} foram removidas da planilha.` });
      await carregar();
    } catch (e) {
      setMensagem({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return <Carregando />;
  const pronto = !!estado.planilha && estado.planilha.colunasMapeadas > 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Olá! Vamos lançar as compras?</h1>
        <p className="text-slate-600 mt-1">
          Envie as notas e prints, confira o que o app leu e clique em lançar. Nada vai para a planilha sem a sua aprovação.
        </p>
      </div>

      {mensagem && <Aviso tipo={mensagem.tipo === "ok" ? "ok" : "erro"}>{mensagem.texto}</Aviso>}

      <div className="grid md:grid-cols-3 gap-4">
        <Cartao titulo="1. Conta Google">
          {estado.planilha?.fonte === "demo" ? (
            <p>
              <Selo cor="azul">Modo demonstração</Selo>
              <br />
              <span className="text-sm text-slate-600">Usando uma planilha fictícia, sem Google.</span>
            </p>
          ) : estado.googleConectado ? (
            <p>
              <Selo cor="verde">✓ Conectada</Selo>
              <br />
              <span className="text-sm text-slate-600 break-all">{estado.email}</span>
            </p>
          ) : estado.googleConfigurado ? (
            <a href="/api/auth/google/entrar">
              <Botao>Entrar com Google</Botao>
            </a>
          ) : (
            <p className="text-sm">
              <Selo cor="amarelo">Falta configurar</Selo>
              <br />
              Veja a <Link href="/ajuda" className="underline">Ajuda, passo 2</Link>. Enquanto isso, dá para testar no modo demonstração.
            </p>
          )}
        </Cartao>

        <Cartao titulo="2. Planilha">
          {estado.planilha ? (
            <div className="space-y-2">
              <p className="font-medium break-words">{estado.planilha.nome}</p>
              <p className="text-sm text-slate-600">
                {estado.planilha.modoAbas === "mensal" ? "Uma aba por mês" : `Aba “${estado.planilha.aba}”`} ·{" "}
                {estado.planilha.granularidade === "item" ? "uma linha por item" : "uma linha por nota"} ·{" "}
                {estado.planilha.colunasMapeadas} colunas
              </p>
              <Link href="/configurar">
                <Botao variante="secundario">Alterar</Botao>
              </Link>
            </div>
          ) : (
            <Link href="/configurar">
              <Botao>Conectar planilha</Botao>
            </Link>
          )}
        </Cartao>

        <Cartao titulo="3. Leitura por IA">
          {estado.iaConfigurada ? (
            <Selo cor="verde">✓ Pronta</Selo>
          ) : (
            <p className="text-sm">
              <Selo cor="amarelo">Sem chave</Selo>
              <br />
              Notas em XML funcionam. Para fotos, prints e PDFs, veja a <Link href="/ajuda" className="underline">Ajuda, passo 3</Link>.
            </p>
          )}
        </Cartao>
      </div>

      <Cartao>
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold">Novo lote</h2>
            <p className="text-slate-600">Um lote é o conjunto de notas que você recebeu hoje.</p>
            <label className="block mt-3 text-sm">
              Mês das compras (opcional — avisa se alguma nota for de outro mês):
              <select
                className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 bg-white"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              >
                <option value="">Não verificar</option>
                {[0, 1, 2].map((k) => {
                  const d = new Date();
                  d.setDate(1);
                  d.setMonth(d.getMonth() - k);
                  const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                  return (
                    <option key={v} value={v}>
                      {d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                      {v === mesAtual() ? " (este mês)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          <Botao grande onClick={novoLote} disabled={ocupado || !pronto} title={pronto ? "" : "Conecte a planilha primeiro"}>
            ➕ Começar novo lote
          </Botao>
        </div>
        {!pronto && <p className="mt-3 text-amber-800">Antes, conecte a planilha (passo 2).</p>}
      </Cartao>

      <Cartao titulo="Últimos lotes">
        {lotes.length === 0 ? (
          <p className="text-slate-600">Nenhum lote ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lotes.slice(0, 8).map((l) => (
              <li key={l.id} className="py-2 flex flex-wrap items-center gap-3">
                <Link href={`/lote/${l.id}`} className="font-mono text-blue-800 underline">
                  {l.id}
                </Link>
                <span className="text-sm text-slate-600">{new Date(l.criado_em).toLocaleString("pt-BR")}</span>
                <span className="text-sm">
                  {l.arquivos} arquivo(s) · {l.linhas} linha(s)
                </span>
                {l.status === "lancado" && <Selo cor="verde">{l.lancadas} lançada(s)</Selo>}
                {l.status === "desfeito" && <Selo cor="cinza">desfeito</Selo>}
                {l.status === "aberto" && <Selo cor="azul">em revisão</Selo>}
              </li>
            ))}
          </ul>
        )}
        {estado.ultimoLoteLancado && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Botao variante="secundario" onClick={desfazer} disabled={ocupado}>
              ↩️ Desfazer último lote ({estado.ultimoLoteLancado})
            </Botao>
            <p className="text-sm text-slate-500 mt-1">Remove da planilha só as linhas criadas por esse lote.</p>
          </div>
        )}
      </Cartao>
    </div>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Inicio />
    </Suspense>
  );
}
