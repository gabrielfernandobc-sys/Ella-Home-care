"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso, Botao, Carregando, Selo } from "@/components/ui";
import type { CampoId } from "@/lib/campos";
import { api } from "@/lib/cliente/api";
import { AreaEnvio } from "./AreaEnvio";
import { Tabela } from "./Tabela";
import type { ArquivoTela, LinhaTela, LoteTela } from "./tipos";

interface Resultado {
  lancadas: number;
  puladas: number;
  abas: { aba: string; linhas: number[] }[];
  alertas: string[];
}

const METODO: Record<string, string> = {
  xml: "XML lido direto",
  pdf_texto: "texto do PDF",
  visao: "leitura por imagem",
};

const STATUS: Record<ArquivoTela["status"], { texto: string; cor: "verde" | "amarelo" | "vermelho" | "cinza" | "azul" }> = {
  na_fila: { texto: "na fila", cor: "cinza" },
  processando: { texto: "lendo…", cor: "azul" },
  pronto: { texto: "lido", cor: "verde" },
  erro: { texto: "não foi lido", cor: "vermelho" },
  duplicado: { texto: "repetido", cor: "vermelho" },
};

function Visualizador({ arquivo }: { arquivo: ArquivoTela | null }) {
  if (!arquivo) return <p className="text-slate-500 p-4">Clique numa linha para ver o documento original aqui.</p>;
  if (arquivo.apagado) return <p className="text-slate-500 p-4">O arquivo original já foi apagado deste computador.</p>;
  const url = `/api/arquivos/${arquivo.id}`;
  const imagem = ["png", "jpeg", "heic", "webp", "gif"].includes(arquivo.tipo ?? "");
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200">
        <span className="font-medium truncate" title={arquivo.nome}>
          {arquivo.nome}
          {arquivo.metodo && <span className="ml-2 text-xs text-slate-500">({METODO[arquivo.metodo] ?? arquivo.metodo})</span>}
        </span>
        <a href={url} target="_blank" rel="noreferrer" className="text-sm underline text-blue-800 whitespace-nowrap">
          Abrir em nova aba
        </a>
      </div>
      <div className="flex-1 overflow-auto bg-slate-100">
        {imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Documento ${arquivo.nome}`} className="max-w-full mx-auto" />
        ) : (
          <iframe src={url} title={`Documento ${arquivo.nome}`} className="w-full h-full min-h-[65vh] bg-white" />
        )}
      </div>
    </div>
  );
}

export default function PaginaLote() {
  const { id } = useParams<{ id: string }>();
  const [dados, setDados] = useState<LoteTela | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [soConferir, setSoConferir] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [sugestoes, setSugestoes] = useState<Record<string, string[]>>({});

  const carregar = useCallback(async () => {
    try {
      const d = await api<LoteTela>(`/api/lotes/${id}`);
      setDados(d);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
    api<Record<string, string[]>>("/api/sugestoes").then(setSugestoes).catch(() => undefined);
  }, [carregar]);

  // Atualiza enquanto há arquivos sendo lidos.
  const lendo = (dados?.progresso.naFila ?? 0) + (dados?.progresso.processando ?? 0) > 0;
  useEffect(() => {
    if (!lendo) return;
    const t = setInterval(carregar, 1500);
    return () => clearInterval(t);
  }, [lendo, carregar]);

  const arquivos = useMemo(() => new Map((dados?.arquivos ?? []).map((a) => [a.id, a])), [dados]);
  const linhasVisiveis = useMemo(
    () => (dados?.linhas ?? []).filter((l) => !soConferir || (!l.lancada && l.cor !== "verde")),
    [dados, soConferir],
  );
  const arquivoAberto = selecionado ? arquivos.get(selecionado) ?? null : null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selecionado && dados?.linhas.length) setSelecionado(dados.linhas[0].arquivoId);
  }, [dados, selecionado]);

  async function salvarCelula(linha: LinhaTela, campo: CampoId, valor: string | number | null) {
    try {
      await api(`/api/linhas/${linha.id}`, { metodo: "PATCH", corpo: { valores: { [campo]: valor } } });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function aprovar(linha: LinhaTela, aprovada: boolean, forcar = false) {
    try {
      await api(`/api/linhas/${linha.id}`, { metodo: "PATCH", corpo: { aprovada, forcar } });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function aprovarVerdes() {
    setOcupado(true);
    try {
      await api(`/api/lotes/${id}/aprovar-verdes`, { corpo: {} });
      await carregar();
    } finally {
      setOcupado(false);
    }
  }

  async function lancar() {
    if (!dados) return;
    const n = dados.resumo.aprovadas;
    if (!confirm(`Lançar ${n} linha(s) aprovada(s) na planilha “${dados.planilha?.nome}”?\n\nAs linhas entram no fim da tabela. Nada existente é apagado.`)) return;
    setOcupado(true);
    setResultado(null);
    try {
      const r = await api<Resultado>(`/api/lotes/${id}/lancar`, { corpo: {} });
      setResultado(r);
      await carregar();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function lerDeNovo(arquivoId: string) {
    try {
      await api(`/api/arquivos/${arquivoId}/reprocessar`, { corpo: {} });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (!dados) return erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando />;
  const { progresso, resumo } = dados;
  const lidos = progresso.prontos + progresso.erros + progresso.duplicados;
  const problemaArquivos = dados.arquivos.filter((a) => a.status === "erro" || a.status === "duplicado");
  const lancado = dados.lote.status === "lancado";
  const faltam = dados.linhas.filter((l) => !l.lancada).length;

  return (
    <div className="space-y-4 pb-28">
      <datalist id="sugestoes-fornecedor">{sugestoes.fornecedor?.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="sugestoes-descricao">{sugestoes.descricao?.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="sugestoes-unidade">{sugestoes.unidade?.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="sugestoes-categoria">
        {["medicamento", "material de consumo", "limpeza", "escritório", "outros", ...(sugestoes.categoria ?? [])]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
      <datalist id="sugestoes-centro_custo">{sugestoes.centro_custo?.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="sugestoes-forma_pagamento">{sugestoes.forma_pagamento?.map((s) => <option key={s} value={s} />)}</datalist>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/" className="underline">
              Início
            </Link>{" "}
            › Lote
          </p>
          <h1 className="text-2xl font-bold">
            Lote <span className="font-mono">{dados.lote.id}</span>
          </h1>
          <p className="text-slate-600">
            Destino: <b>{dados.planilha?.nome ?? "planilha não configurada"}</b> — {dados.planilha?.aba}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Selo cor="verde">🟢 {resumo.verde} tudo certo</Selo>
          <Selo cor="amarelo">🟡 {resumo.amarelo} conferir</Selo>
          <Selo cor="vermelho">🔴 {resumo.vermelho} erro/duplicata</Selo>
          {resumo.lancadas > 0 && <Selo cor="azul">✓ {resumo.lancadas} lançadas</Selo>}
        </div>
      </div>

      {erro && (
        <Aviso tipo="erro">
          {erro}{" "}
          <button className="underline ml-2" onClick={() => setErro(null)}>
            fechar
          </button>
        </Aviso>
      )}
      {resultado && (
        <Aviso tipo={resultado.lancadas ? "ok" : "atencao"}>
          <p className="font-semibold text-lg">
            {resultado.lancadas ? `✓ ${resultado.lancadas} linha(s) lançada(s) na planilha.` : "Nenhuma linha nova foi lançada."}
          </p>
          {resultado.abas.map((a) => (
            <p key={a.aba}>
              Aba “{a.aba}”: linhas {a.linhas[0]} a {a.linhas[a.linhas.length - 1]}.
            </p>
          ))}
          {resultado.puladas > 0 && <p>{resultado.puladas} linha(s) já estavam lançadas e não foram gravadas de novo.</p>}
          {resultado.alertas.map((a, i) => (
            <p key={i}>⚠️ {a}</p>
          ))}
        </Aviso>
      )}

      {dados.planilha?.aprovarVerdesAutomaticamente && faltam > 0 && (
        <Aviso tipo="info">
          As linhas verdes já chegam aprovadas (marcadas com “auto”). Confira as amarelas e vermelhas e, quando quiser, clique em “Lançar
          na planilha”. Para desligar, vá em Planilha → Passo 5.
        </Aviso>
      )}

      {!lancado && <AreaEnvio loteId={id} desativado={!dados.planilha} aoEnviar={carregar} />}

      {progresso.total > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex justify-between text-sm mb-1">
            <span>
              {lidos} de {progresso.total} arquivo(s) lido(s)
              {progresso.processando > 0 && ` · lendo ${progresso.processando} agora`}
              {progresso.naFila > 0 && ` · ${progresso.naFila} na fila`}
            </span>
            {progresso.erros + progresso.duplicados > 0 && (
              <span className="text-red-800">{progresso.erros + progresso.duplicados} com problema</span>
            )}
          </div>
          <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${(lidos / Math.max(1, progresso.total)) * 100}%` }} />
          </div>
        </div>
      )}

      {problemaArquivos.length > 0 && (
        <details open className="bg-white border border-red-200 rounded-xl p-3">
          <summary className="font-semibold text-red-900 cursor-pointer">
            Arquivos que não entraram na revisão ({problemaArquivos.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {problemaArquivos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2">
                <Selo cor={STATUS[a.status].cor}>{STATUS[a.status].texto}</Selo>
                <button className="underline" onClick={() => setSelecionado(a.id)}>
                  {a.nome}
                </button>
                <span className="text-sm text-slate-700">{a.erro}</span>
                {a.status === "erro" && (
                  <button className="text-sm underline text-blue-800" onClick={() => lerDeNovo(a.id)}>
                    Ler de novo
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {dados.linhas.length > 0 && (
        <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(380px,38%)] gap-4">
          <div className="space-y-2 min-w-0">
            <label className="inline-flex items-center gap-2 text-base">
              <input type="checkbox" className="w-5 h-5" checked={soConferir} onChange={(e) => setSoConferir(e.target.checked)} />
              Mostrar só o que precisa conferir
            </label>
            {linhasVisiveis.length === 0 ? (
              <Aviso tipo="ok">Nada para conferir. 🎉</Aviso>
            ) : (
              <Tabela
                linhas={linhasVisiveis}
                campos={dados.campos}
                arquivos={arquivos}
                selecionado={selecionado}
                aoSelecionar={setSelecionado}
                aoSalvar={salvarCelula}
                aoAprovar={aprovar}
              />
            )}
            <p className="text-sm text-slate-500">
              Dica: clique numa célula para corrigir. A correção é lembrada e aplicada sozinha nos próximos lotes. Bordas amarelas =
              leitura incerta.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden xl:sticky xl:top-4 h-[75vh]">
            <Visualizador arquivo={arquivoAberto} />
          </div>
        </div>
      )}

      {dados.arquivos.length > 0 && arquivoAberto === null && dados.linhas.length === 0 && !lendo && (
        <Aviso tipo="atencao">Nenhuma linha foi lida ainda. Confira os arquivos com problema acima.</Aviso>
      )}

      {faltam > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-slate-300 shadow-lg">
          <div className="mx-auto max-w-[1600px] px-4 py-3 flex flex-wrap items-center gap-3">
            <Botao variante="secundario" onClick={aprovarVerdes} disabled={ocupado || resumo.verde === 0}>
              ✓ Aprovar todos os verdes
            </Botao>
            <span className="text-slate-700">
              <b>{resumo.aprovadas}</b> linha(s) aprovada(s) para lançar
              {lendo && " · aguarde terminar a leitura"}
            </span>
            <div className="flex-1" />
            <Botao grande variante="sucesso" onClick={lancar} disabled={ocupado || resumo.aprovadas === 0 || lendo}>
              {ocupado ? "Lançando…" : `📥 Lançar na planilha (${resumo.aprovadas})`}
            </Botao>
          </div>
        </div>
      )}
      {lancado && (
        <Aviso tipo="info">
          Este lote já foi lançado{faltam > 0 ? ` (${faltam} linha(s) ainda não lançada(s) — aprove e lance quando quiser)` : ""}. Para
          mais notas, <Link href="/" className="underline">comece um novo lote</Link>. Errou algo? Use “Desfazer último lote” na tela inicial.
        </Aviso>
      )}
    </div>
  );
}
