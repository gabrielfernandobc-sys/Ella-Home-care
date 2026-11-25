import { CAMPO_POR_ID, type CampoId } from "../campos";
import { formatarCnpj } from "../cnpj";
import { dataParaBR, parseData, parseNumero } from "../texto";

export interface ValorCelula {
  valor: string | number;
  tipo: "texto" | "numero" | "data";
}

/**
 * Converte um valor do app para o que será gravado na célula.
 * - Datas: DD/MM/AAAA em planilhas pt_BR, AAAA-MM-DD nas demais (gravadas como data).
 * - Números: number (a formatação da coluna é preservada).
 * - Textos: gravados literalmente — "=SOMA(...)", "1/2" ou "10%" nunca viram fórmula, data ou número,
 *   e zeros à esquerda e chaves de 44 dígitos são preservados.
 */
export function valorParaCelula(
  campo: CampoId,
  valor: string | number | null | undefined,
  localidade = "pt_BR",
): ValorCelula | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const def = CAMPO_POR_ID[campo];
  if (def.tipo === "data") {
    const iso = parseData(valor);
    if (!iso) return { valor: textoLimpo(String(valor)), tipo: "texto" };
    return { valor: localidade.toLowerCase().startsWith("pt") ? dataParaBR(iso) : iso, tipo: "data" };
  }
  if (def.tipo === "moeda" || def.tipo === "numero") {
    const n = parseNumero(valor);
    return n === null ? { valor: textoLimpo(String(valor)), tipo: "texto" } : { valor: n, tipo: "numero" };
  }
  if (campo === "cnpj") return { valor: textoLimpo(formatarCnpj(String(valor))), tipo: "texto" };
  const t = textoLimpo(String(valor));
  return t ? { valor: t, tipo: "texto" } : null;
}

export function textoLimpo(s: string): string {
  const t = s.replace(/[\r\n\t]+/g, " ").replace(/[\u0000-\u001f]/g, "").trim();
  // Um texto que começa com "=" seria confundido com fórmula ao reler a planilha.
  return t.startsWith("=") ? "'" + t : t;
}

/** Número de série de data das planilhas (dias desde 30/12/1899). */
export function serialDeData(iso: string): number {
  return Math.round((Date.parse(iso + "T00:00:00Z") - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/**
 * O valor lido da célula (modo "fórmula", em que datas aparecem como número de série)
 * corresponde ao que o app escreveu? Usado para conferir a gravação e antes de desfazer.
 */
export function confere(escrito: string | number, lido: string | null | undefined): boolean {
  const l = (lido ?? "").toString().trim();
  if (typeof escrito === "number") {
    const n = Number(l);
    return l !== "" && Number.isFinite(n) && Math.abs(n - escrito) < 0.005;
  }
  const e = escrito;
  if (e.trim() === l) return true;
  const iso = parseData(e);
  if (iso && /^\d+(\.\d+)?$/.test(l)) return Math.floor(Number(l)) === serialDeData(iso);
  return false;
}
