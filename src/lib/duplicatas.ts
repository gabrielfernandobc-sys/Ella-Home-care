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
  if (cnpj && numero) chaves.push(`cnpj-num:${cnpj}|${numero}`);
  if (cnpj && data && total !== null) chaves.push(`cnpj-data-valor:${cnpj}|${data}|${centavos(total)}`);
  if (forn && numero && data) chaves.push(`forn-num-data:${forn}|${numero}|${data}`);
  return chaves;
}

/** Explica em português qual chave bateu. */
export function explicarChave(chave: string): string {
  if (chave.startsWith("nfe:")) return "mesma chave de acesso da NF-e";
  if (chave.startsWith("cnpj-num:")) return "mesmo CNPJ e número de nota";
  if (chave.startsWith("cnpj-data-valor:")) return "mesmo CNPJ, data e valor";
  if (chave.startsWith("forn-num-data:")) return "mesmo fornecedor, número e data";
  return "mesmos dados";
}

/** Lê as linhas existentes da aba e devolve as chaves de documento que já estão lá. */
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
  for (let r = linhaCabecalho; r < grade.valores.length; r++) {
    const linha = grade.valores[r] ?? [];
    const v: ValoresLinha = {};
    for (const [campo, c] of Object.entries(cols)) {
      if (c >= 0) v[campo as keyof ValoresLinha] = linha[c] ?? null;
    }
    for (const k of chavesDocumento(v)) chaves.add(k);
  }
  return chaves;
}

/** Hash estável de uma linha a lançar (documento + posição do item) para garantir idempotência. */
export function hashLinha(chavesDoc: string[], indiceItem: number, hashArq: string): string {
  const prioridade = ["nfe:", "cnpj-num:", "forn-num-data:", "cnpj-data-valor:"];
  const base =
    prioridade.map((p) => chavesDoc.find((k) => k.startsWith(p))).find(Boolean) ?? `arquivo:${hashArq}`;
  return createHash("sha256").update(`${base}#${indiceItem}`).digest("hex").slice(0, 32);
}
