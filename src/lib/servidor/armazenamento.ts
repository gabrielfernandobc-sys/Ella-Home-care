/** Guarda os arquivos enviados em data/uploads/AAAA-MM/ (só neste computador). */
import fs from "node:fs";
import path from "node:path";
import { pastaDados } from "./db";

const EXTENSOES: Record<string, string> = {
  pdf: ".pdf",
  png: ".png",
  jpeg: ".jpg",
  heic: ".heic",
  webp: ".webp",
  gif: ".gif",
  xml: ".xml",
  desconhecido: ".bin",
};

export function pastaUploads(): string {
  return path.join(pastaDados(), "uploads");
}

export function caminhoPara(hash: string, tipo: string, sufixo = ""): string {
  const d = new Date();
  const pasta = path.join(pastaUploads(), `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`);
  fs.mkdirSync(pasta, { recursive: true });
  return path.join(pasta, `${hash}${sufixo}${sufixo ? ".jpg" : EXTENSOES[tipo] ?? ".bin"}`);
}

export function salvarBytes(caminho: string, bytes: Uint8Array) {
  if (!fs.existsSync(caminho)) fs.writeFileSync(caminho, bytes);
}

/** Garante que o caminho está dentro da pasta de uploads (evita leitura de outros arquivos). */
export function caminhoSeguro(caminho: string | null): string | null {
  if (!caminho) return null;
  const real = path.resolve(caminho);
  return real.startsWith(path.resolve(pastaUploads()) + path.sep) && fs.existsSync(real) ? real : null;
}

export const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  xml: "text/plain; charset=utf-8",
};
