/**
 * Comprovantes (Fase 2): antes de lançar, o arquivo original de cada linha aprovada vai para
 * <pasta>/<AAAA-MM> (Google Drive, ou pasta local na demonstração) e o link entra na coluna
 * "Comprovante". Cada arquivo é enviado uma vez só (o link fica guardado pelo hash do arquivo).
 */
import fs from "node:fs";
import path from "node:path";
import { ComprovantesDrive } from "../comprovantes/drive";
import { ComprovantesLocal } from "../comprovantes/local";
import { MIME_COMPROVANTE, type ArmazemComprovantes } from "../comprovantes/tipos";
import { parseData } from "../texto";
import type { ConfigPlanilha } from "./config";
import { lerConfig, pastaDados, salvarConfig } from "./db";
import { clienteAutenticado, temEscopoDrive } from "./google-auth";
import * as repo from "./repositorio";

type G = { __comprasArmazemTeste?: ArmazemComprovantes | null };

/** Só para testes automatizados: troca o armazém por um simulado. */
export function definirArmazemParaTestes(a: ArmazemComprovantes | null) {
  (globalThis as G).__comprasArmazemTeste = a;
}

export function armazemPara(cfg: ConfigPlanilha): ArmazemComprovantes {
  const teste = (globalThis as G).__comprasArmazemTeste;
  if (teste) return teste;
  const pasta = (cfg.pastaComprovantes || "Notas").trim() || "Notas";
  if (cfg.fonte === "demo") return new ComprovantesLocal(path.join(pastaDados(), "comprovantes-demo"), pasta);
  if (!temEscopoDrive()) {
    throw new Error("Para guardar comprovantes, autorize o Google Drive em “Planilha” → Comprovantes.");
  }
  return new ComprovantesDrive(clienteAutenticado(), pasta, {
    ler: () => lerConfig<Record<string, string>>("drive_pastas") ?? {},
    salvar: (c) => salvarConfig("drive_pastas", c),
  });
}

/** Pasta do mês: pela data da nota; sem data, pelo mês do lote. */
export function mesDoComprovante(dataNota: unknown, criadoEm: string): string {
  const iso = parseData(dataNota) ?? criadoEm.slice(0, 10);
  return iso.slice(0, 7);
}

/** Garante que o arquivo está guardado e devolve o link. */
export async function garantirComprovante(
  armazem: ArmazemComprovantes,
  arquivo: repo.Arquivo,
  dataNota: unknown,
): Promise<string> {
  if (arquivo.comprovante_link) return arquivo.comprovante_link;
  const existente = repo.comprovanteDoHash(arquivo.hash);
  if (existente) {
    repo.atualizarArquivo(arquivo.id, { comprovante_id: existente.id, comprovante_link: existente.link });
    return existente.link;
  }
  if (!arquivo.caminho || !fs.existsSync(arquivo.caminho)) {
    throw new Error(`O arquivo “${arquivo.nome}” não está mais neste computador para ser guardado como comprovante.`);
  }
  const r = await armazem.enviar({
    nome: arquivo.nome,
    mime: MIME_COMPROVANTE[arquivo.tipo ?? ""] ?? "application/octet-stream",
    bytes: fs.readFileSync(arquivo.caminho),
    mes: mesDoComprovante(dataNota, arquivo.criado_em),
  });
  repo.atualizarArquivo(arquivo.id, { comprovante_id: r.id, comprovante_link: r.link });
  return r.link;
}
