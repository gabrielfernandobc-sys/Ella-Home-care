/**
 * Detecção de duplicatas:
 * - pelo hash do arquivo (mesmo arquivo enviado de novo);
 * - pela chave de acesso da NF-e (44 dígitos);
 * - por CNPJ + número, CNPJ + data + valor, ou fornecedor + número + data;
 * - comparando com as linhas que já estão na planilha.
 */
import { createHash } from "node:crypto";
import type { ValoresLinha } from "./campos";
import { chaveAcessoValida, chaveCnpj } from "./cnpj";
import type { Mapeamento } from "./mapeamento";
import type { Grade } from "./planilha/tipos";
import { apenasDigitos, centavos, normalizar, parseData, parseNumero } from "./texto";

export function hashArquivo(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

const numeroLimpo = (n: unknown) => apenasDigitos(n as string).replace(/^0+/, "");

const SUFIXOS_EMPRESA = new Set(["ltda", "me", "epp", "eireli", "sa", "s", "a", "cia", "mei", "ss"]);

/**
 * Parte "estável" do nome do fornecedor: sem sufixos (Ltda, ME, S/A…), só as duas primeiras palavras.
 * "FARMACIA BETA FICTICIA LTDA" e "Farmácia Beta" -> "farmacia beta".
 */
export function nomeBaseFornecedor(nome: unknown): string {
  return normalizar(nome as string)
    .split(" ")
    .filter((t) => t && !SUFIXOS_EMPRESA.has(t))
    .slice(0, 2)
    .join(" ");
}

/** Chaves que identificam um documento. Dois documentos com qualquer chave em comum são duplicados. */
export function chavesDocumento(v: ValoresLinha): string[] {
  const chaves: string[] = [];
  const chave = apenasDigitos(v.chave_acesso as string);
  if (chave && chaveAcessoValida(chave)) chaves.push(`nfe:${chave}`);
  const cnpj = chaveCnpj(v.cnpj as string);
  const numero = numeroLimpo(v.numero_nota);
  const data = parseData(v.data_emissao);
  const total = parseNumero(v.total_nota);
  const forn = normalizar(v.fornecedor as string);
  const fornBase = nomeBaseFornecedor(v.fornecedor);
  if (cnpj && numero) chaves.push(`cnpj-num:${cnpj}|${numero}`);
  if (cnpj && data && total !== null) chaves.push(`cnpj-data-valor:${cnpj}|${data}|${centavos(total)}`);
  if (forn && numero && data) chaves.push(`forn-num-data:${forn}|${numero}|${data}`);
  // Prints sem CNPJ e sem número: fornecedor (nome base) + data + valor.
  if (fornBase && data && total !== null && total !== 0) chaves.push(`forn-data-valor:${fornBase}|${data}|${centavos(total)}`);
  return chaves;
}

/** Explica em português qual chave bateu. */
export function explicarChave(chave: string): string {
  if (chave.startsWith("nfe:")) return "mesma chave de acesso da NF-e";
  if (chave.startsWith("cnpj-num:")) return "mesmo CNPJ e número de nota";
  if (chave.startsWith("cnpj-data-valor:")) return "mesmo CNPJ, data e valor";
  if (chave.startsWith("forn-num-data:")) return "mesmo fornecedor, número e data";
  if (chave.startsWith("forn-data-valor:")) return "mesmo fornecedor, data e valor — possível duplicata";
  return "mesmos dados";
}

/**
 * Lê as linhas existentes da aba e devolve as chaves de documento que já estão lá.
 * Quando a planilha tem uma linha por item e não tem a coluna "Total da nota", soma os itens
 * de cada nota (mesmo fornecedor/CNPJ, data e — se houver — número e arquivo) para comparar o valor.
 */
export function chavesDaPlanilha(grade: Grade, mapeamento: Mapeamento, linhaCabecalho: number): Set<string> {
  const chaves = new Set<string>();
  const col = (campo: string) => mapeamento.indexOf(campo as never);
  const cols = {
    chave_acesso: col("chave_acesso"),
    cnpj: col("cnpj"),
    numero_nota: col("numero_nota"),
    data_emissao: col("data_emissao"),
    total_nota: col("total_nota"),
    fornecedor: col("fornecedor"),
  };
  const colItem = col("valor_total_item");
  // Sem coluna de total do item (ex.: ela é uma fórmula), usa quantidade x unitário.
  const colQtd = col("quantidade");
  const colUnit = col("valor_unitario");
  const valorItem = (linha: string[]): number | null => {
    if (colItem >= 0) return parseNumero(linha[colItem]);
    const q = parseNumero(linha[colQtd]);
    const u = parseNumero(linha[colUnit]);
    return q !== null && u !== null ? Math.round(q * u * 100) / 100 : null;
  };
  const temValorItem = colItem >= 0 || (colQtd >= 0 && colUnit >= 0);
  const colArquivo = col("arquivo_origem");
  const grupos = new Map<string, { v: ValoresLinha; soma: number; completo: boolean }>();
  for (let r = linhaCabecalho; r < grade.valores.length; r++) {
    const linha = grade.valores[r] ?? [];
    const v: ValoresLinha = {};
    for (const [campo, c] of Object.entries(cols)) {
      if (c >= 0) v[campo as keyof ValoresLinha] = linha[c] ?? null;
    }
    for (const k of chavesDocumento(v)) chaves.add(k);

    const data = parseData(v.data_emissao);
    const quem = chaveCnpj(v.cnpj as string) || nomeBaseFornecedor(v.fornecedor);
    if (temValorItem && data && quem) {
      const g = [quem, data, numeroLimpo(v.numero_nota), colArquivo >= 0 ? String(linha[colArquivo] ?? "") : ""].join("|");
      const atual = grupos.get(g) ?? { v: { ...v, total_nota: null }, soma: 0, completo: true };
      const valor = valorItem(linha);
      if (valor === null) atual.completo = false;
      else atual.soma += valor;
      grupos.set(g, atual);
    }
  }
  for (const g of grupos.values()) {
    if (!g.completo) continue;
    for (const k of chavesDocumento({ ...g.v, total_nota: Math.round(g.soma * 100) / 100 })) chaves.add(k);
  }
  return chaves;
}

/** Hash estável de uma linha a lançar (documento + posição do item) para garantir idempotência. */
export function hashLinha(chavesDoc: string[], indiceItem: number, hashArq: string): string {
  const prioridade = ["nfe:", "cnpj-num:", "forn-num-data:", "cnpj-data-valor:", "forn-data-valor:"];
  const base =
    prioridade.map((p) => chavesDoc.find((k) => k.startsWith(p))).find(Boolean) ?? `arquivo:${hashArq}`;
  return createHash("sha256").update(`${base}#${indiceItem}`).digest("hex").slice(0, 32);
}
