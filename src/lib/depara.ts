/**
 * Tabela de/para: correções que a usuária ensinou (ou que o app aprendeu da planilha).
 *
 * Tipos de regra:
 * - "exato":     o texto lido (normalizado) é igual ao "de" da regra;
 * - "parecido":  o texto é muito parecido E tem exatamente os mesmos números e tamanhos
 *                (ex.: nunca transforma "500 mg" em "1 g", nem luva "M" em luva "G");
 * - "cnpj":      o nome do fornecedor vem do CNPJ (aprendido da planilha ou de correções);
 * - "descricao": a categoria vem da descrição do item.
 *
 * Uma regra fica "confiável" depois de confirmada CONFIRMACOES_PARA_CONFIAR vezes
 * (a linha foi lançada sem a usuária mudar o valor corrigido). Regras confiáveis não
 * deixam a linha amarela; as demais sempre pedem conferência.
 */
import type { CampoId, ValoresLinha } from "./campos";
import { chaveCnpj } from "./cnpj";
import { normalizar } from "./texto";

export const CONFIRMACOES_PARA_CONFIAR = 2;
export const SIMILARIDADE_MINIMA = 0.72;

/** Campos em que a usuária pode ensinar um "de -> para". */
export const CAMPOS_DEPARA: CampoId[] = ["fornecedor", "descricao", "unidade", "forma_pagamento", "centro_custo", "categoria"];

export type TipoAplicacao = "exato" | "parecido" | "cnpj" | "descricao";

export interface RegraDePara {
  /** campo corrigido */
  campo: CampoId;
  /** campo usado como chave (o próprio campo, "cnpj" ou "descricao") */
  base: CampoId;
  /** chave normalizada */
  de: string;
  para: string;
  origem: "usuaria" | "planilha";
  confirmacoes: number;
}

export interface DeParaAplicado {
  campo: CampoId;
  /** valor como veio do documento */
  de: string;
  para: string;
  tipo: TipoAplicacao;
  regra: { campo: CampoId; base: CampoId; de: string };
  confiavel: boolean;
  /** para regras "parecido": o texto da regra que foi considerado parecido */
  referencia?: string;
}

/** Chave usada nas regras: texto normalizado (CNPJ: só os caracteres do CNPJ). */
export function chaveDePara(base: CampoId, valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return base === "cnpj" ? chaveCnpj(String(valor)) : normalizar(String(valor));
}

const UNIDADES = new Set(["mg", "g", "mcg", "ug", "ml", "l", "kg", "ui", "cm", "mm", "m", "un", "cp", "caps", "cps", "amp", "fr"]);
const TAMANHOS = new Set(["pp", "p", "m", "g", "gg", "xg", "xgg", "eg", "egg", "rn"]);
/** Grafias diferentes da mesma unidade/palavra. */
const SINONIMOS: Record<string, string> = { comp: "cp", cpr: "cp", comprimido: "cp", comprimidos: "cp", cap: "caps", capsula: "caps", capsulas: "caps", s: "sem", c: "com" };
/** Palavras que mudam o sentido: precisam aparecer igualmente nos dois textos. */
const NEGACOES = new Set(["nao", "sem", "livre", "isento", "isenta"]);

/** Separa números de letras: "500mg" -> "500 mg"; "25x7" -> "25 x 7". */
function separar(chave: string): string[] {
  return chave
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((t) => SINONIMOS[t] ?? t);
}

/**
 * O que NUNCA pode ser diferente entre dois textos "parecidos":
 * cada número com a sua unidade (500 mg, 5 ml, 10 cp) e os tamanhos (P, M, G, GG).
 */
function assinatura(chave: string): string {
  const t = separar(chave);
  const numeros: string[] = [];
  const tamanhos: string[] = [];
  t.forEach((tok, i) => {
    if (/^\d+$/.test(tok)) {
      const unidade = UNIDADES.has(t[i + 1]) ? t[i + 1] : "";
      numeros.push(`${Number(tok)}${unidade}`);
    } else if (TAMANHOS.has(tok) && !/^\d+$/.test(t[i - 1] ?? "")) {
      tamanhos.push(tok);
    }
  });
  const negacoes = t.filter((tok) => NEGACOES.has(tok)).sort();
  return `${numeros.sort().join(",")}|${tamanhos.sort().join(",")}|${negacoes.join(",")}`;
}

function trigramas(s: string): Map<string, number> {
  const t = ` ${s} `;
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 2; i++) {
    const g = t.slice(i, i + 3);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Coeficiente de Dice sobre trigramas de caracteres (0 a 1). */
export function similaridade(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigramas(a);
  const tb = trigramas(b);
  let comum = 0;
  let total = 0;
  for (const [g, n] of ta) {
    comum += Math.min(n, tb.get(g) ?? 0);
    total += n;
  }
  for (const n of tb.values()) total += n;
  return (2 * comum) / total;
}

/** Os dois textos podem ser o mesmo produto/fornecedor escrito de outro jeito? */
export function parecidos(a: string, b: string): number {
  if (assinatura(a) !== assinatura(b)) return 0;
  const ta = separar(a);
  const tb = separar(b);
  // A primeira palavra (nome do produto) precisa ser a mesma.
  if (ta[0] !== tb[0]) return 0;
  // Toda palavra do texto mais curto precisa estar no outro, inteira ou abreviada ("proced" ~ "procedimento").
  const [curto, longo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const palavra = (x: string) => x.length >= 4 && !/\d/.test(x);
  const cobre = curto.filter(palavra).every((x) => longo.some((y) => palavra(y) && (y.startsWith(x) || x.startsWith(y))));
  if (!cobre) return 0;
  return similaridade(ta.join(" "), tb.join(" "));
}

const confiavel = (r: RegraDePara) => r.confirmacoes >= CONFIRMACOES_PARA_CONFIAR;

export class TabelaDePara {
  private exatas = new Map<string, RegraDePara>();
  private porCampo = new Map<CampoId, RegraDePara[]>();

  constructor(regras: RegraDePara[] = []) {
    for (const r of regras) {
      this.exatas.set(`${r.campo}|${r.base}|${r.de}`, r);
      if (r.base === r.campo) this.porCampo.set(r.campo, [...(this.porCampo.get(r.campo) ?? []), r]);
    }
  }

  get tamanho() {
    return this.exatas.size;
  }

  private buscar(campo: CampoId, base: CampoId, chave: string) {
    return chave ? this.exatas.get(`${campo}|${base}|${chave}`) : undefined;
  }

  private aplicarRegra(
    novo: ValoresLinha,
    aplicados: DeParaAplicado[],
    campo: CampoId,
    original: string,
    r: RegraDePara,
    tipo: TipoAplicacao,
    referencia?: string,
  ) {
    if (r.para === novo[campo]) return;
    novo[campo] = r.para;
    aplicados.push({
      campo,
      de: original,
      para: r.para,
      tipo,
      regra: { campo: r.campo, base: r.base, de: r.de },
      // Regra "parecida" nunca é confiável: sempre pede conferência.
      confiavel: tipo !== "parecido" && confiavel(r),
      ...(referencia ? { referencia } : {}),
    });
  }

  aplicar(valores: ValoresLinha): { valores: ValoresLinha; aplicados: DeParaAplicado[] } {
    const novo: ValoresLinha = { ...valores };
    const aplicados: DeParaAplicado[] = [];
    for (const campo of CAMPOS_DEPARA) {
      const atual = novo[campo];
      // 1) Fornecedor pelo CNPJ (mais seguro que pelo nome)
      if (campo === "fornecedor") {
        const r = this.buscar("fornecedor", "cnpj", chaveDePara("cnpj", novo.cnpj));
        if (r) {
          this.aplicarRegra(novo, aplicados, campo, String(atual ?? ""), r, "cnpj");
          continue;
        }
      }
      // 2) Categoria pela descrição (a original e a já corrigida)
      if (campo === "categoria") {
        const r =
          this.buscar("categoria", "descricao", chaveDePara("descricao", valores.descricao)) ??
          this.buscar("categoria", "descricao", chaveDePara("descricao", novo.descricao));
        if (r) {
          this.aplicarRegra(novo, aplicados, campo, String(atual ?? ""), r, "descricao");
          continue;
        }
      }
      if (typeof atual !== "string" || !atual.trim()) continue;
      const chave = chaveDePara(campo, atual);
      // 3) Mesmo texto
      const exata = this.buscar(campo, campo, chave);
      if (exata) {
        this.aplicarRegra(novo, aplicados, campo, atual, exata, "exato");
        continue;
      }
      // 4) Texto parecido: só na descrição (fornecedor é reconhecido pelo CNPJ, nunca por aproximação)
      if (campo === "descricao") {
        let melhor: { r: RegraDePara; nota: number } | null = null;
        for (const r of this.porCampo.get(campo) ?? []) {
          const nota = parecidos(chave, r.de);
          if (nota >= SIMILARIDADE_MINIMA && (!melhor || nota > melhor.nota)) melhor = { r, nota };
        }
        if (melhor) this.aplicarRegra(novo, aplicados, campo, atual, melhor.r, "parecido", melhor.r.de);
      }
    }
    return { valores: novo, aplicados };
  }
}

/** Texto curto explicando a correção, para a tela de revisão. */
export function explicarDePara(a: DeParaAplicado): string {
  const base = `“${a.de || "(vazio)"}” → “${a.para}”`;
  if (a.tipo === "cnpj") return `${base} (nome usado para este CNPJ)`;
  if (a.tipo === "descricao") return `categoria “${a.para}” (usada antes para este item)`;
  if (a.tipo === "parecido") return `${base} (parecido com um item que você já corrigiu)`;
  return base;
}

/**
 * Aprende "CNPJ -> nome do fornecedor" a partir das linhas da planilha:
 * para cada CNPJ, o nome mais usado.
 */
export function fornecedoresPorCnpj(linhas: { cnpj: unknown; fornecedor: unknown }[]): Map<string, string> {
  const contagem = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    const cnpj = chaveDePara("cnpj", l.cnpj);
    const nome = typeof l.fornecedor === "string" ? l.fornecedor.trim() : "";
    if (cnpj.length !== 14 || !nome) continue;
    const m = contagem.get(cnpj) ?? new Map<string, number>();
    m.set(nome, (m.get(nome) ?? 0) + 1);
    contagem.set(cnpj, m);
  }
  const out = new Map<string, string>();
  for (const [cnpj, nomes] of contagem) {
    out.set(cnpj, [...nomes.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  }
  return out;
}
