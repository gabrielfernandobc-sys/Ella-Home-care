"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Botao, Cartao, Carregando, Selo } from "@/components/ui";
import { CAMPO_POR_ID, type CampoId } from "@/lib/campos";
import { CONFIRMACOES_PARA_CONFIAR } from "@/lib/depara";
import { api } from "@/lib/cliente/api";
import { letraColuna } from "@/lib/mapeamento";

interface LoteResumo {
  id: string;
  criado_em: string;
  usuaria: string | null;
  status: string;
  lancado_em: string | null;
  desfeito_em: string | null;
  arquivos: number;
  linhas: number;
  lancadas: number;
}
interface DePara {
  campo: CampoId;
  base: CampoId;
  de: string;
  para: string;
  origem: "usuaria" | "planilha";
  usos: number;
  confirmacoes: number;
}
interface AbaDemo {
  titulo: string;
  valores: string[][];
}

export default function Historico() {
  const [lotes, setLotes] = useState<LoteResumo[] | null>(null);
  const [depara, setDepara] = useState<DePara[]>([]);
  const [demo, setDemo] = useState<AbaDemo[] | null>(null);
  const [fonte, setFonte] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [l, d, e] = await Promise.all([
      api<{ lotes: LoteResumo[] }>("/api/lotes"),
      api<{ itens: DePara[] }>("/api/depara"),
      api<{ planilha: { fonte: string } | null }>("/api/estado"),
    ]);
    setLotes(l.lotes);
    setDepara(d.itens);
    setFonte(e.planilha?.fonte ?? null);
    if (e.planilha?.fonte === "demo") setDemo((await api<{ abas: AbaDemo[] }>("/api/demo")).abas);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar().catch((e) => setErro(e.message));
  }, [carregar]);

  if (!lotes) return erro ? <Aviso tipo="erro">{erro}</Aviso> : <Carregando />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Histórico</h1>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Cartao titulo="Lotes">
        {lotes.length === 0 ? (
          <p className="text-slate-600">Nenhum lote ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-600">
                  <th className="py-2 pr-3">Lote</th>
                  <th className="py-2 pr-3">Criado em</th>
                  <th className="py-2 pr-3">Por</th>
                  <th className="py-2 pr-3">Arquivos</th>
                  <th className="py-2 pr-3">Linhas</th>
                  <th className="py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {lotes.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3">
                      <Link href={`/lote/${l.id}`} className="font-mono underline text-blue-800">
                        {l.id}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{new Date(l.criado_em).toLocaleString("pt-BR")}</td>
                    <td className="py-2 pr-3 break-all">{l.usuaria ?? "—"}</td>
                    <td className="py-2 pr-3">{l.arquivos}</td>
                    <td className="py-2 pr-3">{l.linhas}</td>
                    <td className="py-2">
                      {l.status === "lancado" && (
                        <Selo cor="verde">
                          {l.lancadas} lançada(s) em {new Date(l.lancado_em!).toLocaleDateString("pt-BR")}
                        </Selo>
                      )}
                      {l.status === "desfeito" && <Selo cor="cinza">desfeito em {new Date(l.desfeito_em!).toLocaleDateString("pt-BR")}</Selo>}
                      {l.status === "aberto" && <Selo cor="azul">em revisão</Selo>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao titulo="Correções que o app aprendeu (de → para)">
        <p className="text-sm text-slate-600 mb-3">
          Quando você corrige um texto na revisão, o app lembra e aplica nos próximos lotes. Ele também aprende com a planilha o nome
          que você usa para cada fornecedor (pelo CNPJ). Nas primeiras vezes a linha fica amarela para você conferir; depois de{" "}
          {CONFIRMACOES_PARA_CONFIAR} lançamentos sem mudança, a correção passa a ser aplicada sem pedir conferência.
        </p>
        {depara.length === 0 ? (
          <p className="text-slate-600">Nenhuma correção ainda.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-slate-600">
                <th className="py-2 pr-3">Corrige</th>
                <th className="py-2 pr-3">Quando</th>
                <th className="py-2 pr-3">Vira</th>
                <th className="py-2 pr-3">Aprendido com</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2 pr-3">Usos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {depara.map((d) => (
                <tr key={`${d.campo}|${d.base}|${d.de}`} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{CAMPO_POR_ID[d.campo]?.rotulo ?? d.campo}</td>
                  <td className="py-2 pr-3 text-xs">
                    {d.base === d.campo ? "texto lido " : d.base === "cnpj" ? "CNPJ " : "descrição "}
                    <span className="font-mono">“{d.de}”</span>
                  </td>
                  <td className="py-2 pr-3 font-medium">{d.para}</td>
                  <td className="py-2 pr-3">{d.origem === "planilha" ? "a planilha" : "suas correções"}</td>
                  <td className="py-2 pr-3">
                    {d.confirmacoes >= CONFIRMACOES_PARA_CONFIAR ? (
                      <Selo cor="verde">confiável</Selo>
                    ) : (
                      <Selo cor="amarelo">
                        conferindo ({d.confirmacoes}/{CONFIRMACOES_PARA_CONFIAR})
                      </Selo>
                    )}
                  </td>
                  <td className="py-2 pr-3">{d.usos}</td>
                  <td className="py-2 text-right">
                    <button
                      className="text-red-800 underline"
                      onClick={async () => {
                        await api("/api/depara", { metodo: "DELETE", corpo: { campo: d.campo, base: d.base, de: d.de } });
                        carregar();
                      }}
                    >
                      Esquecer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Cartao>

      {fonte === "demo" && demo && (
        <Cartao titulo="Planilha de demonstração (fictícia)">
          <div className="mb-3">
            <Botao
              variante="secundario"
              onClick={async () => {
                if (!confirm("Voltar a planilha de demonstração ao estado inicial?")) return;
                await api("/api/demo", { corpo: {} });
                carregar();
              }}
            >
              Recomeçar demonstração
            </Botao>
          </div>
          {demo.map((aba) => (
            <div key={aba.titulo} className="mb-6">
              <h3 className="font-semibold mb-1">Aba “{aba.titulo}”</h3>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse">
                  <tbody>
                    <tr>
                      <td />
                      {(aba.valores[0] ?? []).map((_, c) => (
                        <td key={c} className="px-2 text-center text-slate-500 font-mono">
                          {letraColuna(c)}
                        </td>
                      ))}
                    </tr>
                    {aba.valores.map((l, r) => (
                      <tr key={r} className={r === 0 ? "font-bold bg-slate-100" : ""}>
                        <td className="pr-2 text-slate-500 font-mono">{r + 1}</td>
                        {l.map((v, c) => (
                          <td key={c} className="border border-slate-200 px-2 py-1 whitespace-nowrap">
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </Cartao>
      )}
    </div>
  );
}
