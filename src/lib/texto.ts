/** Utilidades de texto, números e datas no padrão brasileiro. */

export function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Minúsculas, sem acento, sem pontuação e com espaços simples. */
export function normalizar(s: string | null | undefined): string {
  if (!s) return "";
  return semAcentos(String(s))
    .toLowerCase()
    .replace(/[º°ª]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function apenasDigitos(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s).replace(/\D/g, "");
}

/**
 * Converte "1.234,56", "1234,56", "1234.56", "R$ 12,50" em número.
 * Retorna null quando não dá para ter certeza.
 */
export function parseNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  if (!s) return null;
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // O último separador é o decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (temVirgula) {
    if ((s.match(/,/g) || []).length > 1) return null;
    s = s.replace(",", ".");
  } else if (temPonto) {
    const partes = s.split(".");
    // "1.234" (milhar) x "12.5" (decimal): 3 dígitos após um único ponto = milhar no padrão BR.
    if (partes.length > 2) s = partes.join("");
    else if (partes[1].length === 3 && partes[0].length <= 3 && partes[0] !== "0") s = partes.join("");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

export function centavos(n: number): number {
  return Math.round(n * 100);
}

export function arredondar(n: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

/** Aceita AAAA-MM-DD, DD/MM/AAAA, DD/MM/AA, DD-MM-AAAA, ISO com hora. Retorna AAAA-MM-DD ou null. */
export function parseData(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim();
  let a: number, m: number, d: number;
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (r) {
    a = +r[1];
    m = +r[2];
    d = +r[3];
  } else {
    r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (!r) return null;
    d = +r[1];
    m = +r[2];
    a = +r[3];
    if (r[3].length === 2) a += 2000;
    else if (r[3].length === 3) return null;
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 1900 || a > 2999) return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // ex.: 31/02
  return `${a.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${d.toString().padStart(2, "0")}`;
}

export function dataParaBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const r = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return r ? `${r[3]}/${r[2]}/${r[1]}` : iso;
}

export function formatarMoeda(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Hoje no fuso local, AAAA-MM-DD. */
export function hojeISO(agora: Date = new Date()): string {
  const a = agora.getFullYear();
  const m = (agora.getMonth() + 1).toString().padStart(2, "0");
  const d = agora.getDate().toString().padStart(2, "0");
  return `${a}-${m}-${d}`;
}

export function diasEntre(isoA: string, isoB: string): number {
  const a = Date.parse(isoA + "T00:00:00Z");
  const b = Date.parse(isoB + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}
