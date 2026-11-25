import { CAMPO_POR_ID, type CampoId } from "../campos";
import { formatarCnpj } from "../cnpj";
import { dataParaBR, parseData, parseNumero } from "../texto";

/**
 * Converte um valor do app para o que será "digitado" na célula.
 * - Datas: DD/MM/AAAA em planilhas pt_BR, AAAA-MM-DD nas demais.
 * - Números: number (a formatação da coluna é preservada).
 * - Textos que começam com = + - @ ganham apóstrofo para nunca virarem fórmula.
 * - Sequências longas de dígitos (chave de acesso) ganham apóstrofo para não virarem notação científica.
 */
export function valorParaCelula(
  campo: CampoId,
  valor: string | number | null | undefined,
  localidade = "pt_BR",
): string | number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const def = CAMPO_POR_ID[campo];
  if (def.tipo === "data") {
    const iso = parseData(valor);
    if (!iso) return textoSeguro(String(valor));
    return localidade.toLowerCase().startsWith("pt") ? dataParaBR(iso) : iso;
  }
  if (def.tipo === "moeda" || def.tipo === "numero") {
    const n = parseNumero(valor);
    return n === null ? textoSeguro(String(valor)) : n;
  }
  if (campo === "cnpj") return textoSeguro(formatarCnpj(String(valor)));
  return textoSeguro(String(valor));
}

export function textoSeguro(s: string): string {
  const t = s.replace(/[\r\n\t]+/g, " ").trim();
  if (/^[=+\-@]/.test(t)) return "'" + t;
  if (/^\d{16,}$/.test(t)) return "'" + t;
  if (/^0\d+$/.test(t)) return "'" + t; // preserva zeros à esquerda
  return t;
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
  const e = escrito.startsWith("'") ? escrito.slice(1) : escrito;
  if (e.trim() === l) return true;
  const iso = parseData(e);
  if (iso && /^\d+(\.\d+)?$/.test(l)) return Math.floor(Number(l)) === serialDeData(iso);
  return false;
}
