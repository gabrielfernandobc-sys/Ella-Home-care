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
    const convertido = await heicConvert({ buffer: new Uint8Array(entrada), format: "JPEG", quality: 0.9 });
    entrada = Buffer.from(convertido);
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

/**
 * "Impressão digital" visual da imagem: em 32x32 tons de cinza (com leve desfoque), para cada
 * pixel, se o vizinho da direita é mais claro, mais escuro ou igual (zona morta de 4 níveis,
 * que ignora o ruído de compressão). Imagens iguais salvas de novo (JPEG, WhatsApp, reduzidas)
 * ficam com até ~5% de diferença; prints diferentes, bem acima disso.
 * ATENÇÃO: o mesmo layout com outro valor também fica parecido — por isso a assinatura visual
 * só indica duplicata quando os dados lidos não se contradizem (ver processamento).
 */
export async function assinaturaImagem(conteudo: Uint8Array, tipo: TipoArquivo): Promise<string> {
  let entrada: Buffer = Buffer.from(conteudo);
  if (tipo === "heic") {
    entrada = Buffer.from(await heicConvert({ buffer: new Uint8Array(entrada), format: "JPEG", quality: 0.9 }));
  }
  const n = 32;
  const zona = 4;
  const px = await sharp(entrada, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .greyscale()
    .blur(1)
    .resize(n + 1, n, { fit: "fill" })
    .raw()
    .toBuffer();
  let s = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = px[y * (n + 1) + x] - px[y * (n + 1) + x + 1];
      s += d > zona ? "1" : d < -zona ? "2" : "0";
    }
  }
  return s;
}

/** Fração (0 a 1) de posições diferentes entre duas assinaturas visuais. */
export function distanciaVisual(a: string, b: string): number {
  if (!a || a.length !== b.length) return 1;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d / a.length;
}

/** Até esta distância, duas imagens são consideradas "a mesma imagem salva de novo". */
export const DISTANCIA_VISUAL_MAXIMA = 0.08;
