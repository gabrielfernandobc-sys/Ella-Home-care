/** Sugestão de categoria por NCM (XML) ou por palavras-chave da descrição. */
import type { Categoria, Confianca } from "../campos";
import { normalizar } from "../texto";

export interface Sugestao {
  categoria: Categoria;
  confianca: Confianca;
}

const NCM: [string, Categoria][] = [
  ["30", "medicamento"], // Capítulo 30: produtos farmacêuticos
  ["3005", "material de consumo"], // gazes, ataduras, curativos (mais específico que "30")
  ["3006", "material de consumo"],
  ["4015", "material de consumo"], // luvas de borracha
  ["392620", "material de consumo"],
  ["630790", "material de consumo"], // máscaras
  ["9018", "material de consumo"], // seringas, agulhas, cateteres
  ["9019", "material de consumo"],
  ["9025", "material de consumo"], // termômetros
  ["3401", "limpeza"],
  ["3402", "limpeza"],
  ["380894", "limpeza"],
  ["2828", "limpeza"],
  ["4818", "limpeza"],
  ["392321", "limpeza"], // sacos de lixo
  ["9603", "limpeza"], // vassouras, escovas
  ["4802", "escritório"],
  ["4820", "escritório"],
  ["4817", "escritório"],
  ["9608", "escritório"],
  ["9609", "escritório"],
  ["8443", "escritório"],
  ["3215", "escritório"],
  ["8305", "escritório"],
];

export function categoriaPorNcm(ncm: string | null | undefined): Sugestao | null {
  const n = (ncm ?? "").replace(/\D/g, "");
  if (n.length < 2) return null;
  // Prefixo mais longo vence.
  const achado = NCM.filter(([p]) => n.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0];
  return achado ? { categoria: achado[1], confianca: "alta" } : null;
}

const PALAVRAS: [Categoria, string[]][] = [
  [
    "material de consumo",
    [
      "luva", "seringa", "agulha", "gaze", "atadura", "esparadrapo", "mascara", "algodao", "sonda",
      "cateter", "curativo", "fralda", "equipo", "scalp", "coletor", "touca", "avental", "abaixador",
      "termometro", "micropore", "compressa", "lanceta", "fita glicemia", "tira reagente",
    ],
  ],
  [
    "medicamento",
    [
      "comprimido", "comp", "cp", "cps", "capsula", "caps", "ampola", "amp", "xarope", "gotas",
      "pomada", "injetavel", "solucao oral", "suspensao", "mg", "mcg", "dipirona", "paracetamol",
      "ibuprofeno", "amoxicilina", "insulina", "losartana", "omeprazol", "soro fisiologico",
      "cloreto de sodio", "metformina", "captopril", "dexametasona",
    ],
  ],
  [
    "limpeza",
    [
      "detergente", "desinfetante", "agua sanitaria", "sabao", "sabonete", "hipoclorito",
      "saco de lixo", "saco lixo", "papel toalha", "papel higienico", "limpador", "multiuso",
      "vassoura", "rodo", "pano de chao", "alcool 70", "alcool gel", "esponja", "lustra moveis",
    ],
  ],
  [
    "escritório",
    [
      "papel a4", "papel sulfite", "sulfite", "caneta", "lapis", "grampeador", "grampo", "clips",
      "envelope", "pasta", "toner", "cartucho", "etiqueta", "caderno", "borracha", "post it",
      "fita adesiva", "marca texto", "corretivo", "bloco de notas",
    ],
  ],
];

/** Abreviações curtas só contam como palavra inteira ("cp" não pode casar com "cpu"). */
const SO_PALAVRA_INTEIRA = new Set(["comp", "cp", "cps", "caps", "amp", "mg", "mcg", "rodo", "pasta"]);

export function categoriaPorTexto(descricao: string | null | undefined): Sugestao | null {
  const d = ` ${normalizar(descricao)} `;
  if (!d.trim()) return null;
  for (const [categoria, palavras] of PALAVRAS) {
    if (palavras.some((p) => d.includes(` ${p} `) || (!SO_PALAVRA_INTEIRA.has(p) && d.includes(` ${p}`)))) {
      return { categoria, confianca: "media" };
    }
  }
  // Dosagem numérica típica de medicamento: "500mg", "10 mg/ml"
  if (/\b\d+\s?(mg|mcg|ui)\b/.test(d)) return { categoria: "medicamento", confianca: "media" };
  return null;
}
