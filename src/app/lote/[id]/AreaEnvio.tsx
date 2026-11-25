"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enviarArquivo } from "@/lib/cliente/api";
import type { Envio } from "./tipos";

const ACEITOS = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.xml,application/pdf,image/*,text/xml,application/xml";
const SIMULTANEOS = 3;

/** Arrastar e soltar, escolher vários arquivos ou colar print com Ctrl+V. */
export function AreaEnvio({ loteId, desativado, aoEnviar }: { loteId: string; desativado: boolean; aoEnviar: () => void }) {
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const fila = useRef<{ chave: string; arquivo: File; nome: string }[]>([]);
  const ativos = useRef(0);

  const atualizar = (chave: string, p: Partial<Envio>) =>
    setEnvios((lista) => lista.map((e) => (e.chave === chave ? { ...e, ...p } : e)));

  const aoEnviarRef = useRef(aoEnviar);
  useEffect(() => {
    aoEnviarRef.current = aoEnviar;
  }, [aoEnviar]);

  /** Até 3 envios ao mesmo tempo; cada "trabalhador" pega o próximo arquivo da fila. */
  const bombear = useCallback(() => {
    const trabalhar = async () => {
      while (fila.current.length) {
        const item = fila.current.shift()!;
        atualizar(item.chave, { estado: "enviando" });
        try {
          await enviarArquivo(loteId, item.arquivo, item.nome, (f) => atualizar(item.chave, { progresso: f }));
          atualizar(item.chave, { estado: "enviado", progresso: 1 });
        } catch (e) {
          atualizar(item.chave, { estado: "erro", erro: (e as Error).message });
        }
        aoEnviarRef.current();
      }
      ativos.current--;
    };
    while (ativos.current < SIMULTANEOS && fila.current.length) {
      ativos.current++;
      void trabalhar();
    }
  }, [loteId]);

  const adicionar = useCallback(
    (arquivos: File[]) => {
      if (desativado || !arquivos.length) return;
      const novos = arquivos.map((arquivo, i) => {
        const nome =
          arquivo.name && arquivo.name !== "image.png"
            ? arquivo.name
            : `print-colado-${new Date().toLocaleTimeString("pt-BR").replace(/:/g, "")}-${i + 1}.png`;
        return { chave: `${Date.now()}-${Math.random()}`, arquivo, nome };
      });
      setEnvios((l) => [...l, ...novos.map((n) => ({ chave: n.chave, nome: n.nome, progresso: 0, estado: "aguardando" as const }))]);
      fila.current.push(...novos);
      bombear();
    },
    [bombear, desativado],
  );

  // Ctrl+V com print copiado
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA")) return;
      const arquivos = [...(e.clipboardData?.files ?? [])];
      if (arquivos.length) {
        e.preventDefault();
        adicionar(arquivos);
      }
    };
    window.addEventListener("paste", colar);
    return () => window.removeEventListener("paste", colar);
  }, [adicionar]);

  const pendentes = envios.filter((e) => e.estado === "aguardando" || e.estado === "enviando");
  const comErro = envios.filter((e) => e.estado === "erro");

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => !desativado && entrada.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && entrada.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          adicionar([...e.dataTransfer.files]);
        }}
        className={`border-3 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
          desativado ? "opacity-50 cursor-not-allowed border-slate-300" : arrastando ? "border-blue-600 bg-blue-50" : "border-slate-300 bg-white hover:bg-slate-50"
        }`}
      >
        <p className="text-2xl font-semibold">📂 Arraste as notas e prints para cá</p>
        <p className="text-slate-600 mt-1">
          ou <span className="underline text-blue-800">clique para escolher</span> vários arquivos · ou copie um print e aperte{" "}
          <kbd className="px-1.5 py-0.5 border rounded bg-slate-100">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 border rounded bg-slate-100">V</kbd>
        </p>
        <p className="text-sm text-slate-500 mt-1">PDF, JPG, PNG, HEIC (iPhone) e XML de NF-e</p>
        <input
          ref={entrada}
          type="file"
          multiple
          accept={ACEITOS}
          className="hidden"
          onChange={(e) => {
            adicionar([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {pendentes.length > 0 && (
        <p className="mt-2 text-blue-900">
          Enviando {pendentes.length} arquivo(s)…{" "}
          {pendentes
            .filter((p) => p.estado === "enviando")
            .map((p) => `${p.nome} (${Math.round(p.progresso * 100)}%)`)
            .join(" · ")}
        </p>
      )}
      {comErro.length > 0 && (
        <ul className="mt-2 text-red-800 text-sm">
          {comErro.map((e) => (
            <li key={e.chave}>
              ✗ {e.nome}: {e.erro}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
