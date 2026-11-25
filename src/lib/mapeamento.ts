import { CAMPO_IDS, type CampoId, type Granularidade } from "./campos";
import { normalizar } from "./texto";

/** Mapeamento salvo: índice da coluna (0 = A) -> campo, ou null quando a coluna não é preenchida pelo app. */
export type Mapeamento = (CampoId | null)[];

const SINONIMOS_BASE: Record<CampoId, string[]> = {
  data_emissao: [
    "data",
    "data compra",
    "data da compra",
    "data emissao",
    "data de emissao",
    "emissao",
    "dt",
    "dt emissao",
    "data nf",
    "data da nota",
  ],
  fornecedor: [
    "fornecedor",
    "empresa",
    "loja",
    "razao social",
    "emitente",
    "farmacia",
    "distribuidora",
    "nome fornecedor",
    "nome do fornecedor",
  ],
  cnpj: ["cnpj", "cnpj fornecedor", "cnpj do fornecedor", "cnpj cpf", "cpf cnpj"],
  numero_nota: [
    "n nf",
    "no nf",
    "num nf",
    "numero nf",
    "nf",
    "nfe",
    "nota",
    "nota fiscal",
    "n nota",
    "numero da nota",
    "numero nota",
    "n da nota",
    "numero nota fiscal",
    "n nota fiscal",
  ],
  chave_acesso: ["chave", "chave de acesso", "chave nfe", "chave acesso", "chave da nota"],
  descricao: [
    "descricao",
    "descricao do item",
    "descricao produto",
    "descricao do produto",
    "item",
    "produto",
    "material",
    "medicamento",
    "insumo",
    "especificacao",
  ],
  categoria: ["categoria", "tipo", "classificacao", "grupo"],
  quantidade: ["qtd", "qtde", "quant", "quantidade", "qt"],
  unidade: ["un", "und", "unid", "unidade", "unidade de medida", "medida", "embalagem"],
  valor_unitario: [
    "valor unitario",
    "vl unit",
    "vlr unit",
    "vl unitario",
    "vlr unitario",
    "preco unitario",
    "unitario",
    "preco",
    "valor unit",
    "v unit",
    "preco unit",
  ],
  valor_total_item: [
    "valor total",
    "vl total",
    "vlr total",
    "total",
    "valor",
    "total item",
    "total do item",
    "valor do item",
    "subtotal",
  ],
  total_nota: [
    "total da nota",
    "total nf",
    "total nota",
    "valor da nota",
    "valor nota",
    "valor nf",
    "valor total da nota",
    "total da nf",
  ],
  forma_pagamento: [
    "forma de pagamento",
    "forma pagamento",
    "pagamento",
    "forma pgto",
    "pgto",
    "condicao de pagamento",
    "meio de pagamento",
  ],
  centro_custo: [
    "setor",
    "centro de custo",
    "centro custo",
    "cc",
    "departamento",
    "unidade solicitante",
    "area",
  ],
  observacoes: ["obs", "observacao", "observacoes", "comentario", "comentarios"],
  arquivo_origem: [
    "arquivo",
    "arquivo de origem",
    "origem",
    "documento de origem",
    "fonte",
    "arquivo origem",
  ],
  id_lote: ["lote", "id lote", "id do lote", "lote id", "id lancamento", "lancamento"],
  comprovante: ["comprovante", "link", "link do comprovante", "link comprovante", "anexo", "link da nota", "drive"],
};

function sinonimos(granularidade: Granularidade): Record<CampoId, string[]> {
  if (granularidade === "item") return SINONIMOS_BASE;
  // Uma linha por nota: "Valor", "Total" e "Valor total" são o total da nota.
  const genericos = ["valor total", "vl total", "vlr total", "total", "valor"];
  return {
    ...SINONIMOS_BASE,
    valor_total_item: SINONIMOS_BASE.valor_total_item.filter((s) => !genericos.includes(s)),
    total_nota: [...SINONIMOS_BASE.total_nota, ...genericos],
  };
}

/** Pontuação de quão bem um cabeçalho combina com um campo (0 = nada). */
export function pontuar(cabecalho: string, campo: CampoId, granularidade: Granularidade = "item"): number {
  const h = normalizar(cabecalho);
  if (!h) return 0;
  const tokensH = new Set(h.split(" "));
  let melhor = 0;
  for (const s of sinonimos(granularidade)[campo]) {
    if (h === s) return 100;
    const tokensS = s.split(" ");
    if (tokensS.every((t) => tokensH.has(t))) {
      // Sinônimos mais longos (mais específicos) valem mais; cabeçalhos com muitas palavras a mais valem menos.
      const extra = tokensH.size - tokensS.length;
      melhor = Math.max(melhor, 50 + s.length - extra * 3);
    }
  }
  return melhor;
}

export interface OpcoesMapeamento {
  granularidade: Granularidade;
  /** Colunas com fórmula: nunca recebem mapeamento. */
  colunasFormula?: number[];
}

/** Propõe "campo -> coluna" a partir do cabeçalho. Cada campo vai para no máximo uma coluna. */
export function proporMapeamento(cabecalhos: string[], opcoes: OpcoesMapeamento): Mapeamento {
  const formula = new Set(opcoes.colunasFormula ?? []);
  const candidatos: { col: number; campo: CampoId; nota: number }[] = [];
  cabecalhos.forEach((cab, col) => {
    if (formula.has(col)) return;
    for (const campo of CAMPO_IDS) {
      const nota = pontuar(cab, campo, opcoes.granularidade);
      if (nota > 0) candidatos.push({ col, campo, nota });
    }
  });
  candidatos.sort((a, b) => b.nota - a.nota || a.col - b.col);
  const resultado: Mapeamento = cabecalhos.map(() => null);
  const usados = new Set<CampoId>();
  for (const c of candidatos) {
    if (resultado[c.col] !== null || usados.has(c.campo)) continue;
    resultado[c.col] = c.campo;
    usados.add(c.campo);
  }
  return resultado;
}

/** Descobre a linha do cabeçalho (1 = primeira) olhando as primeiras linhas da aba. */
export function detectarLinhaCabecalho(valores: string[][], granularidade: Granularidade = "item"): number {
  let melhorLinha = -1;
  let melhorNota = 0;
  const limite = Math.min(valores.length, 15);
  for (let r = 0; r < limite; r++) {
    const linha = valores[r] ?? [];
    let nota = 0;
    for (const cel of linha) {
      if (!cel) continue;
      if (CAMPO_IDS.some((campo) => pontuar(cel, campo, granularidade) > 0)) nota++;
    }
    if (nota > melhorNota) {
      melhorNota = nota;
      melhorLinha = r;
    }
  }
  if (melhorLinha >= 0 && melhorNota >= 2) return melhorLinha + 1;
  const primeira = valores.findIndex((l) => (l ?? []).filter((c) => c && String(c).trim()).length >= 2);
  return primeira >= 0 ? primeira + 1 : 1;
}

/** Validação do mapeamento salvo. Retorna mensagens para a usuária. */
export function problemasDoMapeamento(map: Mapeamento, colunasFormula: number[]): string[] {
  const msgs: string[] = [];
  const vistos = new Map<CampoId, number>();
  map.forEach((campo, col) => {
    if (!campo) return;
    if (colunasFormula.includes(col)) msgs.push(`A coluna ${letraColuna(col)} tem fórmula e não pode receber dados.`);
    if (vistos.has(campo)) msgs.push(`O campo "${campo}" está em duas colunas (${letraColuna(vistos.get(campo)!)} e ${letraColuna(col)}).`);
    vistos.set(campo, col);
  });
  if (!map.some((c) => c === "descricao" || c === "valor_total_item" || c === "total_nota")) {
    msgs.push("Escolha pelo menos a coluna da descrição ou do valor.");
  }
  return msgs;
}

export function letraColuna(indice: number): string {
  let s = "";
  let n = indice + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function indiceColuna(letras: string): number {
  let n = 0;
  for (const ch of letras.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
