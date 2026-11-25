/**
 * Planilha em memória que imita o comportamento do Google Sheets nas operações
 * que o app usa. Serve para os testes automatizados e para o "modo demonstração".
 */
import { copiarFormula, deslocarParaExclusao, deslocarParaInsercao } from "./formulas";
import type { AdaptadorPlanilha, Celula, Grade, OpEstrutura } from "./tipos";

export type Valor = string | number;

export interface EstadoPlanilha {
  localidade: string;
  abas: { titulo: string; celulas: Valor[][] }[];
}

export class PlanilhaMemoria implements AdaptadorPlanilha {
  constructor(public estado: EstadoPlanilha) {}

  static de(abas: Record<string, Valor[][]>, localidade = "pt_BR"): PlanilhaMemoria {
    return new PlanilhaMemoria({
      localidade,
      abas: Object.entries(abas).map(([titulo, celulas]) => ({ titulo, celulas: celulas.map((l) => [...l]) })),
    });
  }

  private aba(titulo: string) {
    const a = this.estado.abas.find((x) => x.titulo === titulo);
    if (!a) throw new Error(`Aba "${titulo}" não existe`);
    return a;
  }

  async localidade() {
    return this.estado.localidade;
  }

  async listarAbas() {
    return this.estado.abas.map((a) => a.titulo);
  }

  /** Avaliação mínima: SOMA/SUM de intervalos e multiplicação/soma simples entre células. */
  private avaliar(celulas: Valor[][], f: string, profundidade = 0): string {
    if (profundidade > 5) return "#REF!";
    const valorDe = (ref: string): number => {
      const m = ref.replace(/\$/g, "").match(/^([A-Z]+)(\d+)$/);
      if (!m) return NaN;
      let col = 0;
      for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
      const v = celulas[Number(m[2]) - 1]?.[col - 1];
      if (typeof v === "string" && v.startsWith("=")) return Number(this.avaliar(celulas, v, profundidade + 1));
      const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };
    const soma = f.match(/^=\s*(?:SOMA|SUM)\(\s*(\$?[A-Z]+\$?\d+)\s*:\s*(\$?[A-Z]+\$?\d+)\s*\)$/i);
    if (soma) {
      const [, a, b] = soma;
      const col = a.replace(/[\d$]/g, "");
      const ini = Number(a.replace(/\D/g, ""));
      const fim = Number(b.replace(/\D/g, ""));
      let t = 0;
      for (let r = ini; r <= fim; r++) t += valorDe(`${col}${r}`) || 0;
      return String(Math.round(t * 100) / 100);
    }
    const bin = f.match(/^=\s*(\$?[A-Z]+\$?\d+)\s*([*+\-/])\s*(\$?[A-Z]+\$?\d+)\s*$/);
    if (bin) {
      const x = valorDe(bin[1]);
      const y = valorDe(bin[3]);
      const r = bin[2] === "*" ? x * y : bin[2] === "+" ? x + y : bin[2] === "-" ? x - y : x / y;
      return String(Math.round(r * 100) / 100);
    }
    return "";
  }

  async lerGrade(titulo: string): Promise<Grade> {
    const { celulas } = this.aba(titulo);
    // Como o Google: linhas vazias no fim não são devolvidas.
    let fim = celulas.length;
    while (fim > 0 && (celulas[fim - 1] ?? []).every((v) => v === "" || v === undefined || v === null)) fim--;
    const formulas = celulas.slice(0, fim).map((l) => (l ?? []).map((v) => (v === undefined ? "" : String(v))));
    const valores = celulas
      .slice(0, fim)
      .map((l) =>
        (l ?? []).map((v) =>
          typeof v === "string" && v.startsWith("=") ? this.avaliar(celulas, v) : v === undefined ? "" : String(v),
        ),
      );
    return { formulas, valores };
  }

  private ajustarTodas(fn: (f: string) => string) {
    for (const a of this.estado.abas)
      for (const l of a.celulas)
        for (let c = 0; c < (l?.length ?? 0); c++) {
          const v = l[c];
          if (typeof v === "string" && v.startsWith("=")) l[c] = fn(v);
        }
  }

  async aplicar(titulo: string, ops: OpEstrutura[]) {
    const aba = this.aba(titulo);
    for (const op of ops) {
      if (op.tipo === "inserir") {
        // Como no Google, referências a linhas a partir do ponto de inserção descem.
        const so = aba;
        for (const l of so.celulas)
          for (let c = 0; c < (l?.length ?? 0); c++) {
            const v = l[c];
            if (typeof v === "string" && v.startsWith("=")) l[c] = deslocarParaInsercao(v, op.indice + 1, op.quantidade);
          }
        while (aba.celulas.length < op.indice) aba.celulas.push([]);
        aba.celulas.splice(op.indice, 0, ...Array.from({ length: op.quantidade }, () => [] as Valor[]));
      } else if (op.tipo === "copiarFormula") {
        const f = aba.celulas[op.origem]?.[op.coluna];
        if (typeof f !== "string" || !f.startsWith("=")) continue;
        for (let r = op.destinoInicio; r <= op.destinoFim; r++) {
          aba.celulas[r] = aba.celulas[r] ?? [];
          aba.celulas[r][op.coluna] = copiarFormula(f, r - op.origem);
        }
      }
      // "copiar" (formato/validação) e "estenderFiltro" não têm efeito visível na memória.
    }
  }

  async escrever(titulo: string, celulas: Celula[]) {
    const aba = this.aba(titulo);
    for (const cel of celulas) {
      while (aba.celulas.length <= cel.linha) aba.celulas.push([]);
      const linha = aba.celulas[cel.linha];
      while (linha.length < cel.coluna) linha.push("");
      let v = cel.valor;
      if (typeof v === "string" && v.startsWith("'")) v = v.slice(1);
      else if (typeof v === "string" && /^-?\d+([.,]\d+)?$/.test(v)) v = Number(v.replace(",", "."));
      linha[cel.coluna] = v;
    }
  }

  async excluirLinhas(titulo: string, linhas: number[]) {
    const aba = this.aba(titulo);
    const ord = [...new Set(linhas)].sort((a, b) => b - a);
    for (const r of ord) aba.celulas.splice(r, 1);
    const excluidas1 = linhas.map((r) => r + 1);
    this.ajustarTodas((f) => deslocarParaExclusao(f, excluidas1));
  }

  async duplicarAba(modelo: string, novoNome: string) {
    const m = this.aba(modelo);
    if (this.estado.abas.some((a) => a.titulo === novoNome)) throw new Error("Aba já existe");
    this.estado.abas.push({ titulo: novoNome, celulas: m.celulas.map((l) => [...(l ?? [])]) });
  }
}
