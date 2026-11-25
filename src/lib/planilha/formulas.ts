/**
 * Manipulação simples de referências A1 em fórmulas (ex.: "=SOMA(E2:E10)").
 * Usado para: detectar linha de totais, ajustar o fim do intervalo da soma
 * quando novas linhas entram acima dela, e simular a planilha nos testes.
 */
import { normalizar } from "../texto";

// Referência de célula: $A$1, A1, AB12. Não pode estar colada em letras/dígitos (evita LOG10, ATAN2...).
const REF = /(?<![A-Za-z0-9_.!'"])(\$?)([A-Z]{1,3})(\$?)(\d{1,7})(?![A-Za-z0-9_(])/g;

/** Aplica uma função a cada referência fora de textos entre aspas. */
function mapearRefs(
  formula: string,
  fn: (ref: { colAbs: string; col: string; linAbs: string; linha: number }) => string,
): string {
  if (!formula.startsWith("=")) return formula;
  // Separa trechos entre aspas para não mexer em textos.
  const partes = formula.split(/("(?:[^"]|"")*")/);
  return partes
    .map((p, i) =>
      i % 2 === 1
        ? p
        : p.replace(REF, (_m, colAbs, col, linAbs, lin) => fn({ colAbs, col, linAbs, linha: Number(lin) })),
    )
    .join("");
}

/** Inserção de linhas: referências a linhas >= aPartirDe (1 = primeira) descem "delta" linhas. */
export function deslocarParaInsercao(formula: string, aPartirDe: number, delta: number): string {
  return mapearRefs(formula, (r) => {
    const linha = r.linha >= aPartirDe ? r.linha + delta : r.linha;
    return `${r.colAbs}${r.col}${r.linAbs}${linha}`;
  });
}

/** Exclusão de linhas (números 1-based): referências abaixo sobem; referência a linha excluída vira a anterior. */
export function deslocarParaExclusao(formula: string, excluidas: number[]): string {
  const ord = [...excluidas].sort((a, b) => a - b);
  return mapearRefs(formula, (r) => {
    const antes = ord.filter((x) => x < r.linha).length;
    let linha = r.linha - antes;
    if (ord.includes(r.linha)) linha = Math.max(1, linha - 1);
    return `${r.colAbs}${r.col}${r.linAbs}${linha}`;
  });
}

/** Cópia de fórmula para outra linha: referências relativas (sem $ na linha) andam "delta" linhas. */
export function copiarFormula(formula: string, delta: number): string {
  return mapearRefs(formula, (r) => {
    const linha = r.linAbs ? r.linha : r.linha + delta;
    return `${r.colAbs}${r.col}${r.linAbs}${linha}`;
  });
}

const INTERVALO =
  /(?<![A-Za-z0-9_.!'"])(\$?[A-Z]{1,3}\$?)(\d{1,7})\s*:\s*(\$?[A-Z]{1,3}\$?)(\d{1,7})(?![A-Za-z0-9_(])/g;

export interface Intervalo {
  inicio: number;
  fim: number;
}

/** Intervalos verticais da fórmula (linhas 1-based). */
export function intervalos(formula: string): Intervalo[] {
  if (!formula.startsWith("=")) return [];
  const sem = formula.replace(/"(?:[^"]|"")*"/g, '""');
  const out: Intervalo[] = [];
  for (const m of sem.matchAll(INTERVALO)) {
    out.push({ inicio: Number(m[2]), fim: Number(m[4]) });
  }
  return out;
}

/**
 * Faz intervalos que terminavam exatamente em "fimAntigo" passarem a terminar em "fimNovo".
 * Ex.: "=SOMA(E2:E10)" com fimAntigo=10, fimNovo=13 -> "=SOMA(E2:E13)".
 */
export function estenderIntervalos(formula: string, fimAntigo: number, fimNovo: number): string {
  if (!formula.startsWith("=")) return formula;
  const partes = formula.split(/("(?:[^"]|"")*")/);
  return partes
    .map((p, i) =>
      i % 2 === 1
        ? p
        : p.replace(INTERVALO, (m, c1, l1, c2, l2) => {
            const ini = Number(l1);
            const fim = Number(l2);
            if (fim === fimAntigo && ini < fim) return `${c1}${l1}:${c2}${fimNovo}`;
            return m;
          }),
    )
    .join("");
}

const TEXTOS_TOTAL = new Set([
  "total",
  "totais",
  "total geral",
  "soma",
  "subtotal",
  "total do mes",
  "total mes",
  "total mensal",
  "total r",
]);

/**
 * É linha de totais? Sim quando tem um rótulo "Total" nas primeiras células
 * ou uma fórmula que soma um intervalo vertical de linhas acima dela.
 */
export function ehLinhaDeTotais(formulas: string[], numeroLinha: number): boolean {
  const naoVazias = formulas.map((f) => (f ?? "").toString()).filter((f) => f.trim() !== "");
  if (naoVazias.length === 0) return false;
  for (const cel of naoVazias.slice(0, 3)) {
    if (!cel.startsWith("=") && TEXTOS_TOTAL.has(normalizar(cel))) return true;
  }
  return formulas.some((f) => {
    if (!f || !String(f).startsWith("=")) return false;
    if (!/(SUM|SOMA|SUBTOTAL|SOMASE|SUMIF|SOMARPRODUTO|SUMPRODUCT)\s*\(/i.test(f)) return false;
    return intervalos(String(f)).some((iv) => iv.fim > iv.inicio && iv.fim < numeroLinha);
  });
}
