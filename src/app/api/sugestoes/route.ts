import type { CampoId } from "@/lib/campos";
import { adaptadorPara } from "@/lib/servidor/adaptador";
import { lerConfigPlanilha } from "@/lib/servidor/config";
import { ok } from "@/lib/servidor/http";
import { valoresConhecidos } from "@/lib/servidor/repositorio";

const CAMPOS: CampoId[] = ["fornecedor", "descricao", "unidade", "categoria", "centro_custo", "forma_pagamento"];

type Cache = { em: number; dados: Record<string, string[]> };
const g = globalThis as { __comprasSugestoes?: Cache };

/** Autocomplete: valores que já existem na planilha + correções da usuária. */
export async function GET() {
  if (g.__comprasSugestoes && Date.now() - g.__comprasSugestoes.em < 5 * 60 * 1000) return ok(g.__comprasSugestoes.dados);
  const dados: Record<string, Set<string>> = Object.fromEntries(CAMPOS.map((c) => [c, new Set<string>()]));
  for (const c of CAMPOS) for (const v of valoresConhecidos(c)) dados[c].add(v);
  const cfg = lerConfigPlanilha();
  if (cfg && cfg.modoAbas === "unica") {
    try {
      const grade = await adaptadorPara(cfg).lerGrade(cfg.aba);
      for (const c of CAMPOS) {
        const col = cfg.mapeamento.indexOf(c);
        if (col < 0) continue;
        for (let r = cfg.linhaCabecalho; r < grade.valores.length; r++) {
          const v = String(grade.valores[r]?.[col] ?? "").trim();
          if (v && v.length < 200 && !/^total/i.test(v)) dados[c].add(v);
        }
      }
    } catch {
      /* sem conexão: usa só o histórico local */
    }
  }
  const final = Object.fromEntries(
    Object.entries(dados).map(([k, s]) => [k, [...s].sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, 2000)]),
  );
  g.__comprasSugestoes = { em: Date.now(), dados: final };
  return ok(final);
}
