/** Prepara fotos e prints para a IA: converte HEIC, corrige rotação e reduz o tamanho. */
import heicConvert from "heic-convert";
import sharp from "sharp";

export type TipoArquivo = "xml" | "pdf" | "png" | "jpeg" | "heic" | "webp" | "gif" | "desconhecido";

/** Detecta o tipo pelo conteúdo (não confia só na extensão). */
export function detectarTipo(conteudo: Uint8Array, nome: string): TipoArquivo {
  const b = conteudo;
  const ascii = (ini: number, fim: number) => String.fromCharCode(...b.slice(ini, fim));
  if (b.length >= 4 && ascii(0, 4) === "%PDF") return "pdf";
  if (b.length >= 8 && b[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && ascii(4, 8) === "ftyp" && /heic|heix|hevc|mif1|msf1|heim|heis/.test(ascii(8, 12))) return "heic";
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (b.length >= 6 && ascii(0, 3) === "GIF") return "gif";
  const inicio = new TextDecoder("utf-8", { fatal: false })
    .decode(b.slice(0, 200))
    .replace(/^﻿/, "")
    .trimStart();
  if (inicio.startsWith("<")) return "xml";
  if (/\.xml$/i.test(nome)) return "xml";
  return "desconhecido";
}

export interface ImagemPreparada {
  dados: Buffer;
  mime: "image/jpeg" | "image/png";
}

const LADO_MAXIMO = 2000;
const TAMANHO_MAXIMO = 3_500_000; // bytes; a API aceita até 5 MB por imagem

export async function prepararImagem(conteudo: Uint8Array, tipo: TipoArquivo): Promise<ImagemPreparada> {
  let entrada: Buffer = Buffer.from(conteudo);
  if (tipo === "heic") {
    const convertido = await heicConvert({ buffer: entrada as unknown as ArrayBufferLike, format: "JPEG", quality: 0.9 });
    entrada = Buffer.from(convertido as ArrayBuffer);
  }
  const base = sharp(entrada, { failOn: "none" })
    .rotate()
    .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true });
  // Prints (PNG) costumam ter texto fino: mantém PNG se couber; fotos vão em JPEG.
  if (tipo === "png") {
    const png = await base.clone().png({ compressionLevel: 9 }).toBuffer();
    if (png.length <= TAMANHO_MAXIMO) return { dados: png, mime: "image/png" };
  }
  let qualidade = 85;
  let jpg = await base.clone().jpeg({ quality: qualidade, mozjpeg: true }).toBuffer();
  while (jpg.length > TAMANHO_MAXIMO && qualidade > 40) {
    qualidade -= 15;
    jpg = await base.clone().jpeg({ quality: qualidade, mozjpeg: true }).toBuffer();
  }
  return { dados: jpg, mime: "image/jpeg" };
}

/** Miniatura para a tela de revisão (necessária para HEIC, que o navegador não abre). */
export async function gerarPrevia(conteudo: Uint8Array, tipo: TipoArquivo): Promise<Buffer> {
  const img = await prepararImagem(conteudo, tipo);
  return sharp(img.dados).resize({ width: 1400, withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
}
