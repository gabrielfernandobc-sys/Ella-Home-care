"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Aviso, Botao, Cartao, Carregando, Selo } from "@/components/ui";
import { nomeAbaMensal, PADROES_ABA } from "@/lib/abas";
import { CAMPOS, type CampoId, type Granularidade } from "@/lib/campos";
import { api } from "@/lib/cliente/api";
import { letraColuna, problemasDoMapeamento } from "@/lib/mapeamento";
import type { ConfigPlanilha } from "@/lib/servidor/config";

interface Estado {
  googleConfigurado: boolean;
  googleConectado: boolean;
  email: string | null;
  driveAutorizado: boolean;
}
interface PlanilhaAberta {
  fonte: "google" | "demo";
  planilhaId: string;
  nome: string;
  abas: string[];
}
interface Cabecalho {
  linhaCabecalho: number;
  cabecalhos: string[];
  colunasFormula: number[];
  proposta: (CampoId | null)[];
  amostra: string[][];
  totalLinhasDados: number;
  temTotais: boolean;
  mapeamentoSalvo: boolean;
}

function Configurar() {
  const params = useSearchParams();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [link, setLink] = useState("");
  const [planilha, setPlanilha] = useState<PlanilhaAberta | null>(null);
  const [granularidade, setGranularidade] = useState<Granularidade>("item");
  const [modoAbas, setModoAbas] = useState<"unica" | "mensal">("unica");
  const [aba, setAba] = useState("");
  const [abaModelo, setAbaModelo] = useState("");
  const [padrao, setPadrao] = useState("{MES} {AAAA}");
  const [linhaCab, setLinhaCab] = useState<number | "">("");
  const [cab, setCab] = useState<Cabecalho | null>(null);
  const [mapa, setMapa] = useState<(CampoId | null)[]>([]);
  const [obrigatorios, setObrigatorios] = useState<CampoId[]>(["data_emissao", "fornecedor", "descricao", "valor_total_item"]);
  const [diasMaximos, setDiasMaximos] = useState(180);
  const [comprovantesAtivo, setComprovantesAtivo] = useState(false);
  const [pastaComprovantes, setPastaComprovantes] = useState("Notas");
  const [aprovarVerdesAuto, setAprovarVerdesAuto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "info"; texto: string } | null>(
    params.get("erro") ? { tipo: "erro", texto: params.get("erro")! } : params.get("google") ? { tipo: "ok", texto: "Conta Google conectada! Agora cole o link da planilha." } : null,
  );

  useEffect(() => {
    (async () => {
      const [e, c] = await Promise.all([api<Estado>("/api/estado"), api<{ config: ConfigPlanilha | null }>("/api/planilha/config")]);
      setEstado(e);
      const cfg = c.config;
      if (!cfg) return;
      setGranularidade(cfg.granularidade);
      setModoAbas(cfg.modoAbas);
      setAba(cfg.aba);
      setAbaModelo(cfg.abaModelo ?? "");
      setPadrao(cfg.padraoNomeAba);
      setLinhaCab(cfg.linhaCabecalho);
      setObrigatorios(cfg.obrigatorios);
      setDiasMaximos(cfg.diasMaximos);
      setComprovantesAtivo(!!cfg.comprovantesAtivo);
      setPastaComprovantes(cfg.pastaComprovantes || "Notas");
      setAprovarVerdesAuto(!!cfg.aprovarVerdesAutomaticamente);
      setMapa(cfg.mapeamento);
      if (cfg.fonte === "google") setLink(`https://docs.google.com/spreadsheets/d/${cfg.planilhaId}/edit`);
      try {
        const p = await api<PlanilhaAberta>("/api/planilha/abrir", {
          corpo: cfg.fonte === "demo" ? { fonte: "demo" } : { link: cfg.planilhaId },
        });
        setPlanilha(p);
      } catch {
        /* sem conexão: mostra o que está salvo */
      }
    })().catch((e) => setMsg({ tipo: "erro", texto: e.message }));
  }, []);

  async function abrir(fonte: "google" | "demo") {
    setOcupado(true);
    setMsg(null);
    setCab(null);
    try {
      const p = await api<PlanilhaAberta>("/api/planilha/abrir", { corpo: fonte === "demo" ? { fonte: "demo" } : { link } });
      setPlanilha(p);
      if (!p.abas.includes(aba)) setAba(p.abas[0] ?? "");
      if (!p.abas.includes(abaModelo)) setAbaModelo(p.abas.find((a) => /modelo/i.test(a)) ?? p.abas[0] ?? "");
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  const abaReferencia = modoAbas === "mensal" ? abaModelo : aba;

  async function lerCabecalho(forcarLinha?: number) {
    if (!planilha || !abaReferencia) return;
    setOcupado(true);
    setMsg(null);
    try {
      const r = await api<Cabecalho>("/api/planilha/cabecalho", {
        corpo: {
          fonte: planilha.fonte,
          planilhaId: planilha.planilhaId,
          aba: abaReferencia,
          linhaCabecalho: forcarLinha ?? (linhaCab || undefined),
          granularidade,
        },
      });
      setCab(r);
      setLinhaCab(r.linhaCabecalho);
      setMapa(r.proposta);
      if (!r.cabecalhos.some(Boolean)) setMsg({ tipo: "erro", texto: "Não encontrei o cabeçalho nessa linha. Ajuste o número da linha do cabeçalho." });
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  async function salvar() {
    if (!planilha || !cab) return;
    setOcupado(true);
    setMsg(null);
    try {
      await api("/api/planilha/config", {
        metodo: "PUT",
        corpo: {
          fonte: planilha.fonte,
          planilhaId: planilha.planilhaId,
          planilhaNome: planilha.nome,
          modoAbas,
          aba: abaReferencia,
          abaModelo: modoAbas === "mensal" ? abaModelo : null,
          padraoNomeAba: padrao,
          linhaCabecalho: cab.linhaCabecalho,
          granularidade,
          cabecalhos: cab.cabecalhos,
          mapeamento: mapa,
          colunasFormula: cab.colunasFormula,
          obrigatorios,
          diasMaximos,
          comprovantesAtivo,
          pastaComprovantes,
          aprovarVerdesAutomaticamente: aprovarVerdesAuto,
        },
      });
      setMsg({ tipo: "ok", texto: "Configuração salva! Ela vale para todos os próximos lotes." });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setMsg({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return <Carregando />;
  const problemas = cab ? problemasDoMapeamento(mapa, cab.colunasFormula) : [];
  const exemploAba = nomeAbaMensal(padrao, new Date().toISOString().slice(0, 10));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Conectar a planilha</h1>
      <p className="text-slate-600">
        Você faz isso uma vez. Os dados sempre entram nesta mesma planilha, no fim da tabela — nada é apagado.
      </p>
      {msg && (
        <Aviso tipo={msg.tipo === "ok" ? "ok" : msg.tipo === "erro" ? "erro" : "info"}>
          {msg.texto}
          {msg.tipo === "ok" && msg.texto.startsWith("Configuração salva") && (
            <>
              {" "}
              <Link href="/" className="underline font-semibold">
                Voltar ao início
              </Link>
            </>
          )}
        </Aviso>
      )}

      <Cartao titulo="Passo 1 — Qual planilha?">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">Minha planilha no Google Sheets</h3>
            {!estado.googleConfigurado ? (
              <p className="text-sm">
                O login com Google ainda não foi configurado neste computador. Veja a{" "}
                <Link href="/ajuda" className="underline">
                  Ajuda, passo 2
                </Link>
                .
              </p>
            ) : !estado.googleConectado ? (
              <a href="/api/auth/google/entrar">
                <Botao>Entrar com Google</Botao>
              </a>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Conectada como <b>{estado.email}</b>.{" "}
                  <button
                    className="underline"
                    onClick={async () => {
                      await api("/api/auth/google/sair", { corpo: {} });
                      location.reload();
                    }}
                  >
                    Sair
                  </button>
                </p>
                <label className="block text-sm">
                  Cole aqui o link da planilha (copie da barra de endereço do navegador):
                  <input
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2"
                    placeholder="https://docs.google.com/spreadsheets/d/…"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                  />
                </label>
                <Botao onClick={() => abrir("google")} disabled={ocupado || !link}>
                  Abrir planilha
                </Botao>
              </>
            )}
          </div>
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold">Planilha de demonstração</h3>
            <p className="text-sm text-slate-600">Uma planilha fictícia, só neste computador, para testar sem medo.</p>
            <Botao variante="secundario" onClick={() => abrir("demo")} disabled={ocupado}>
              Usar demonstração
            </Botao>
          </div>
        </div>
        {planilha && (
          <p className="mt-4">
            <Selo cor="verde">✓ Aberta</Selo> <b>{planilha.nome}</b> — {planilha.abas.length} aba(s)
          </p>
        )}
      </Cartao>

      {planilha && (
        <Cartao titulo="Passo 2 — Como a planilha é organizada?">
          <div className="grid md:grid-cols-2 gap-6">
            <fieldset className="space-y-2">
              <legend className="font-semibold mb-1">Cada linha da planilha é…</legend>
              <label className="flex gap-2 items-start">
                <input type="radio" checked={granularidade === "item"} onChange={() => setGranularidade("item")} className="mt-1.5" />
                <span>
                  <b>Um item</b> da nota (ex.: luvas numa linha, seringas em outra)
                </span>
              </label>
              <label className="flex gap-2 items-start">
                <input type="radio" checked={granularidade === "nota"} onChange={() => setGranularidade("nota")} className="mt-1.5" />
                <span>
                  <b>Uma nota inteira</b> (uma linha com o total)
                </span>
              </label>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="font-semibold mb-1">As abas são…</legend>
              <label className="flex gap-2 items-start">
                <input type="radio" checked={modoAbas === "unica"} onChange={() => setModoAbas("unica")} className="mt-1.5" />
                <span>
                  <b>Uma aba só</b>, que vai crescendo
                </span>
              </label>
              <label className="flex gap-2 items-start">
                <input type="radio" checked={modoAbas === "mensal"} onChange={() => setModoAbas("mensal")} className="mt-1.5" />
                <span>
                  <b>Uma aba por mês</b> (o app escolhe pela data da nota)
                </span>
              </label>
            </fieldset>
          </div>

          <div className="mt-5 grid md:grid-cols-2 gap-4">
            {modoAbas === "unica" ? (
              <label className="block">
                Aba onde as compras são lançadas:
                <select className="block mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 bg-white" value={aba} onChange={(e) => setAba(e.target.value)}>
                  {planilha.abas.map((a) => (
                    <option key={a}>{a}</option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label className="block">
                  Aba modelo (vazia, só com o cabeçalho):
                  <select
                    className="block mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    value={abaModelo}
                    onChange={(e) => setAbaModelo(e.target.value)}
                  >
                    {planilha.abas.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-500">Quando o mês ainda não tem aba, o app copia esta.</span>
                </label>
                <label className="block">
                  Nome das abas mensais:
                  <select
                    className="block mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 bg-white"
                    value={padrao}
                    onChange={(e) => setPadrao(e.target.value)}
                  >
                    {PADROES_ABA.map((p) => (
                      <option key={p} value={p}>
                        {nomeAbaMensal(p, new Date().toISOString().slice(0, 10))}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-500">Este mês: “{exemploAba}”</span>
                </label>
              </>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              Linha do cabeçalho (deixe vazio para descobrir sozinho):
              <input
                type="number"
                min={1}
                className="block mt-1 w-28 border border-slate-300 rounded-lg px-3 py-2"
                value={linhaCab}
                onChange={(e) => setLinhaCab(e.target.value ? Number(e.target.value) : "")}
              />
            </label>
            <Botao onClick={() => lerCabecalho()} disabled={ocupado || !abaReferencia}>
              Ler colunas da planilha
            </Botao>
          </div>
        </Cartao>
      )}

      {cab && (
        <Cartao titulo="Passo 3 — Confira as colunas">
          <p className="text-slate-600 mb-3">
            O app sugeriu o que vai em cada coluna. Ajuste se precisar. Colunas com fórmula ficam bloqueadas (🔒) e nunca são
            alteradas.
            {cab.mapeamentoSalvo && " (Mostrando o mapeamento que você já salvou.)"}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 text-sm text-slate-600">
                  <th className="py-2 pr-3">Coluna</th>
                  <th className="py-2 pr-3">Cabeçalho na planilha</th>
                  <th className="py-2 pr-3">Exemplo</th>
                  <th className="py-2">O app preenche com</th>
                </tr>
              </thead>
              <tbody>
                {cab.cabecalhos.map((h, col) => {
                  const formula = cab.colunasFormula.includes(col);
                  return (
                    <tr key={col} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-mono">{letraColuna(col)}</td>
                      <td className="py-2 pr-3 font-medium">{h || <span className="text-slate-400">(vazio)</span>}</td>
                      <td className="py-2 pr-3 text-sm text-slate-600 max-w-56 truncate">
                        {cab.amostra
                          .map((l) => l[col])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join(" · ")}
                      </td>
                      <td className="py-2">
                        {formula ? (
                          <span className="text-slate-600">🔒 Fórmula — o app não escreve aqui</span>
                        ) : (
                          <select
                            className={`border rounded-lg px-2 py-1.5 bg-white w-full max-w-72 ${mapa[col] ? "border-blue-400" : "border-slate-300"}`}
                            value={mapa[col] ?? ""}
                            onChange={(e) => {
                              const novo = [...mapa];
                              while (novo.length < cab.cabecalhos.length) novo.push(null);
                              novo[col] = (e.target.value || null) as CampoId | null;
                              setMapa(novo);
                            }}
                          >
                            <option value="">— não preencher —</option>
                            {CAMPOS.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.rotulo}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-600 mt-3">
            {cab.totalLinhasDados} linha(s) com dados encontradas
            {cab.temTotais ? " · linha de totais encontrada (as novas linhas entram antes dela)" : ""}.
          </p>
          {problemas.length > 0 && (
            <div className="mt-3">
              <Aviso tipo="atencao">{problemas.join(" ")}</Aviso>
            </div>
          )}
        </Cartao>
      )}

      {cab && (
        <Cartao titulo="Passo 4 — Conferências">
          <p className="mb-2">Se algum destes campos vier vazio, a linha fica amarela para você conferir:</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {CAMPOS.filter((c) => c.nivel !== "app" && mapa.includes(c.id)).map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={obrigatorios.includes(c.id)}
                  onChange={(e) => setObrigatorios(e.target.checked ? [...obrigatorios, c.id] : obrigatorios.filter((x) => x !== c.id))}
                />
                {c.rotulo}
              </label>
            ))}
          </div>
          <label className="block mt-4">
            Avisar quando a nota for mais antiga que
            <input
              type="number"
              min={1}
              className="mx-2 w-24 border border-slate-300 rounded-lg px-3 py-1.5"
              value={diasMaximos}
              onChange={(e) => setDiasMaximos(Number(e.target.value) || 180)}
            />
            dias.
          </label>
        </Cartao>
      )}

      {cab && (
        <Cartao titulo="Passo 5 — Opções (pode deixar como está)">
          <div className="space-y-6">
            <div>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="w-5 h-5 mt-1"
                  checked={comprovantesAtivo}
                  onChange={(e) => setComprovantesAtivo(e.target.checked)}
                />
                <span>
                  <b>Guardar os comprovantes no Google Drive</b>
                  <br />
                  <span className="text-slate-600 text-sm">
                    Ao lançar, o arquivo original de cada nota vai para a pasta <b>{pastaComprovantes || "Notas"}/AAAA-MM</b> (pelo mês da
                    nota) e o link entra na coluna “Comprovante”. O arquivo vai inteiro para o seu Drive.
                    {planilha?.fonte === "demo" && " Na demonstração, os arquivos vão para uma pasta deste computador."}
                  </span>
                </span>
              </label>
              {comprovantesAtivo && (
                <div className="ml-8 mt-3 space-y-3">
                  <label className="block text-sm">
                    Nome da pasta principal:
                    <input
                      className="block mt-1 w-60 border border-slate-300 rounded-lg px-3 py-1.5"
                      value={pastaComprovantes}
                      maxLength={60}
                      onChange={(e) => setPastaComprovantes(e.target.value)}
                    />
                  </label>
                  {!mapa.includes("comprovante") && (
                    <Aviso tipo="atencao">
                      A planilha não tem uma coluna para o link. Crie uma coluna “Comprovante” na planilha e clique em “Ler colunas da
                      planilha” de novo.
                    </Aviso>
                  )}
                  {planilha?.fonte === "google" &&
                    (estado.driveAutorizado ? (
                      <p className="text-sm">
                        <Selo cor="verde">✓ Google Drive autorizado</Selo> (só os arquivos criados por este app)
                      </p>
                    ) : (
                      <div className="space-y-1">
                        <a href="/api/auth/google/entrar?drive=1">
                          <Botao variante="secundario">Autorizar Google Drive</Botao>
                        </a>
                        <p className="text-sm text-slate-600">
                          O app pede acesso só aos arquivos que ele mesmo criar — ele não vê o resto do seu Drive. Depois de autorizar,
                          volte aqui e salve.
                        </p>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="w-5 h-5 mt-1"
                  checked={aprovarVerdesAuto}
                  onChange={(e) => setAprovarVerdesAuto(e.target.checked)}
                />
                <span>
                  <b>Aprovar automaticamente as linhas verdes</b>
                  <br />
                  <span className="text-slate-600 text-sm">
                    As linhas em que tudo conferiu já chegam aprovadas. Você ainda revisa as amarelas e vermelhas e é você quem clica em
                    “Lançar na planilha” — nada é gravado sozinho. Recomendado só depois de algumas semanas de uso.
                  </span>
                </span>
              </label>
            </div>
          </div>
          <div className="mt-6">
            <Botao grande variante="sucesso" onClick={salvar} disabled={ocupado || problemas.length > 0}>
              ✓ Salvar configuração
            </Botao>
          </div>
        </Cartao>
      )}
    </div>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Carregando />}>
      <Configurar />
    </Suspense>
  );
}
