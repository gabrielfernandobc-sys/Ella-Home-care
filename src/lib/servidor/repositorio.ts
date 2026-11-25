/** Acesso aos dados locais: lotes, arquivos, documentos, linhas, de/para. */
import { randomUUID } from "node:crypto";
import type { CampoId, ConfiancaLinha, ValoresLinha } from "../campos";
import { chaveDePara, type DeParaAplicado, type RegraDePara } from "../depara";
import type { Cor, Problema } from "../validacao";
import { agora, db } from "./db";

export type StatusArquivo = "na_fila" | "processando" | "pronto" | "erro" | "duplicado";

export interface Lote {
  id: string;
  criado_em: string;
  usuaria: string | null;
  mes_referencia: string | null;
  status: "aberto" | "lancado" | "desfeito";
  lancado_em: string | null;
  desfeito_em: string | null;
}

export interface Arquivo {
  id: string;
  lote_id: string;
  nome: string;
  tamanho: number;
  hash: string;
  tipo: string | null;
  caminho: string | null;
  previa: string | null;
  status: StatusArquivo;
  metodo: string | null;
  erro: string | null;
  duplicado_de: string | null;
  tentativas: number;
  criado_em: string;
  processado_em: string | null;
  apagado_em: string | null;
  /** "txt:<sha256>" (PDF com texto) ou "img:<assinatura visual>" (imagens) */
  assinatura: string | null;
  comprovante_id?: string | null;
  comprovante_link?: string | null;
}

export interface Documento {
  id: string;
  arquivo_id: string;
  lote_id: string;
  indice: number;
  chaves: string[];
  frete: number | null;
  desconto: number | null;
  criado_em: string;
}

export interface Linha {
  id: string;
  lote_id: string;
  documento_id: string;
  arquivo_id: string;
  indice: number;
  valores: ValoresLinha;
  originais: ValoresLinha;
  confianca: ConfiancaLinha;
  depara: DeParaAplicado[];
  problemas: Problema[];
  cor: Cor;
  duplicada: boolean;
  motivo_duplicata: string | null;
  aprovada: boolean;
  forcada: boolean;
  editada: boolean;
  hash: string;
  lancada: boolean;
}

type LinhaBruta = Omit<
  Linha,
  "valores" | "originais" | "confianca" | "depara" | "problemas" | "duplicada" | "aprovada" | "forcada" | "editada" | "lancada"
> & {
  valores: string;
  originais: string;
  confianca: string;
  depara: string;
  problemas: string;
  duplicada: number;
  aprovada: number;
  forcada: number;
  editada: number;
  lancada: number;
};

function linhaDeBruta(r: LinhaBruta): Linha {
  return {
    ...r,
    valores: JSON.parse(r.valores),
    originais: JSON.parse(r.originais),
    confianca: JSON.parse(r.confianca),
    depara: JSON.parse(r.depara),
    problemas: JSON.parse(r.problemas),
    duplicada: !!r.duplicada,
    aprovada: !!r.aprovada,
    forcada: !!r.forcada,
    editada: !!r.editada,
    lancada: !!r.lancada,
  };
}

/** ID curto e legível para lotes: L-AAAAMMDD-HHMM-xxxx */
export function novoIdLote(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `L-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${randomUUID().slice(0, 4)}`;
}

export const id = () => randomUUID();

// ---------- Lotes ----------

export function criarLote(usuaria: string | null, mesReferencia: string | null): Lote {
  const lote: Lote = {
    id: novoIdLote(),
    criado_em: agora(),
    usuaria,
    mes_referencia: mesReferencia,
    status: "aberto",
    lancado_em: null,
    desfeito_em: null,
  };
  db()
    .prepare("INSERT INTO lotes (id, criado_em, usuaria, mes_referencia, status) VALUES (?, ?, ?, ?, ?)")
    .run(lote.id, lote.criado_em, usuaria, mesReferencia, "aberto");
  return lote;
}

export function obterLote(loteId: string): Lote | null {
  return (db().prepare("SELECT * FROM lotes WHERE id = ?").get(loteId) as Lote | undefined) ?? null;
}

export function listarLotes(limite = 50) {
  return db()
    .prepare(
      `SELECT l.*,
        (SELECT COUNT(*) FROM arquivos a WHERE a.lote_id = l.id) AS arquivos,
        (SELECT COUNT(*) FROM linhas x WHERE x.lote_id = l.id) AS linhas,
        (SELECT COUNT(*) FROM lancamentos c WHERE c.lote_id = l.id AND c.desfeito_em IS NULL) AS lancadas
       FROM lotes l ORDER BY l.criado_em DESC LIMIT ?`,
    )
    .all(limite) as unknown as (Lote & { arquivos: number; linhas: number; lancadas: number })[];
}

export function atualizarLote(loteId: string, campos: Partial<Pick<Lote, "status" | "lancado_em" | "desfeito_em" | "mes_referencia">>) {
  const chaves = Object.keys(campos);
  if (!chaves.length) return;
  db()
    .prepare(`UPDATE lotes SET ${chaves.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...(Object.values(campos) as (string | null)[]), loteId);
}

// ---------- Arquivos ----------

export function inserirArquivo(a: Omit<Arquivo, "tentativas" | "processado_em" | "apagado_em">) {
  db()
    .prepare(
      `INSERT INTO arquivos (id, lote_id, nome, tamanho, hash, tipo, caminho, previa, status, metodo, erro, duplicado_de, criado_em, assinatura)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      a.id,
      a.lote_id,
      a.nome,
      a.tamanho,
      a.hash,
      a.tipo,
      a.caminho,
      a.previa,
      a.status,
      a.metodo,
      a.erro,
      a.duplicado_de,
      a.criado_em,
      a.assinatura,
    );
}

export function obterArquivo(arquivoId: string): Arquivo | null {
  return (db().prepare("SELECT * FROM arquivos WHERE id = ?").get(arquivoId) as Arquivo | undefined) ?? null;
}

export function arquivosDoLote(loteId: string): Arquivo[] {
  return db().prepare("SELECT * FROM arquivos WHERE lote_id = ? ORDER BY criado_em, id").all(loteId) as unknown as Arquivo[];
}

export function arquivosComHash(hash: string): Arquivo[] {
  return db().prepare("SELECT * FROM arquivos WHERE hash = ? ORDER BY criado_em").all(hash) as unknown as Arquivo[];
}

export function atualizarArquivo(arquivoId: string, campos: Partial<Arquivo>) {
  const chaves = Object.keys(campos);
  if (!chaves.length) return;
  db()
    .prepare(`UPDATE arquivos SET ${chaves.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...(Object.values(campos) as (string | number | null)[]), arquivoId);
}

export function arquivosComAssinatura(assinatura: string): Arquivo[] {
  return db().prepare("SELECT * FROM arquivos WHERE assinatura = ? ORDER BY criado_em").all(assinatura) as unknown as Arquivo[];
}

/** Imagens recebidas (para procurar prints salvos de novo). */
export function arquivosDeImagem(exceto: string, limite = 3000) {
  return db()
    .prepare(
      "SELECT id, lote_id, nome, hash, assinatura, criado_em FROM arquivos WHERE assinatura LIKE 'img:%' AND id != ? ORDER BY criado_em DESC LIMIT ?",
    )
    .all(exceto, limite) as { id: string; lote_id: string; nome: string; hash: string; assinatura: string; criado_em: string }[];
}

/** Valores (da primeira linha) de cada documento lido de um arquivo. */
export function valoresDosDocumentosDoArquivo(arquivoId: string): ValoresLinha[] {
  return (
    db().prepare("SELECT valores FROM linhas WHERE arquivo_id = ? AND indice = 0").all(arquivoId) as { valores: string }[]
  ).map((r) => JSON.parse(r.valores));
}

/** Link de comprovante já enviado para um arquivo com este mesmo conteúdo (evita enviar duas vezes). */
export function comprovanteDoHash(hash: string): { id: string; link: string } | null {
  const r = db()
    .prepare("SELECT comprovante_id AS id, comprovante_link AS link FROM arquivos WHERE hash = ? AND comprovante_link IS NOT NULL LIMIT 1")
    .get(hash) as { id: string; link: string } | undefined;
  return r ?? null;
}

export function arquivosPendentes(): Arquivo[] {
  return db()
    .prepare("SELECT * FROM arquivos WHERE status IN ('na_fila', 'processando') ORDER BY criado_em")
    .all() as unknown as Arquivo[];
}

/** Lançamento ativo (não desfeito) de um arquivo com este hash. */
export function lancamentoDoHashArquivo(hash: string): { lote_id: string; criado_em: string } | null {
  return (
    (db()
      .prepare("SELECT lote_id, criado_em FROM lancamentos WHERE arquivo_hash = ? AND desfeito_em IS NULL LIMIT 1")
      .get(hash) as { lote_id: string; criado_em: string } | undefined) ?? null
  );
}

// ---------- Documentos e linhas ----------

export function inserirDocumento(d: Documento & { dados: unknown }) {
  db()
    .prepare(
      "INSERT INTO documentos (id, arquivo_id, lote_id, indice, dados, chaves, frete, desconto, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(d.id, d.arquivo_id, d.lote_id, d.indice, JSON.stringify(d.dados), JSON.stringify(d.chaves), d.frete, d.desconto, d.criado_em);
}

export function obterDocumento(docId: string): Documento | null {
  const r = db().prepare("SELECT id, arquivo_id, lote_id, indice, chaves, frete, desconto, criado_em FROM documentos WHERE id = ?").get(docId) as
    | (Omit<Documento, "chaves"> & { chaves: string })
    | undefined;
  return r ? { ...r, chaves: JSON.parse(r.chaves) } : null;
}

export function documentosDoLote(loteId: string): Documento[] {
  const rs = db()
    .prepare("SELECT id, arquivo_id, lote_id, indice, chaves, frete, desconto, criado_em FROM documentos WHERE lote_id = ? ORDER BY criado_em, indice")
    .all(loteId) as (Omit<Documento, "chaves"> & { chaves: string })[];
  return rs.map((r) => ({ ...r, chaves: JSON.parse(r.chaves) }));
}

export function atualizarChavesDocumento(docId: string, chaves: string[]) {
  db().prepare("UPDATE documentos SET chaves = ? WHERE id = ?").run(JSON.stringify(chaves), docId);
}

/** Documentos de outros arquivos que compartilham alguma chave. */
export function documentosComChaves(chaves: string[], exceto: string) {
  if (!chaves.length) return [];
  const rs = db()
    .prepare(
      `SELECT d.id, d.lote_id, d.arquivo_id, d.criado_em, d.chaves, a.nome AS arquivo_nome
       FROM documentos d JOIN arquivos a ON a.id = d.arquivo_id
       WHERE d.id != ? AND EXISTS (SELECT 1 FROM json_each(d.chaves) j WHERE j.value IN (${chaves.map(() => "?").join(",")}))`,
    )
    .all(exceto, ...chaves) as { id: string; lote_id: string; arquivo_id: string; criado_em: string; chaves: string; arquivo_nome: string }[];
  return rs.map((r) => ({ ...r, chaves: JSON.parse(r.chaves) as string[] }));
}

export function documentoTemLancamento(docId: string): boolean {
  return !!db()
    .prepare(
      "SELECT 1 FROM lancamentos c JOIN linhas l ON l.id = c.linha_id WHERE l.documento_id = ? AND c.desfeito_em IS NULL LIMIT 1",
    )
    .get(docId);
}

export function inserirLinha(l: Linha) {
  db()
    .prepare(
      `INSERT INTO linhas (id, lote_id, documento_id, arquivo_id, indice, valores, originais, confianca, depara, problemas, cor,
        duplicada, motivo_duplicata, aprovada, forcada, editada, hash, lancada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      l.id,
      l.lote_id,
      l.documento_id,
      l.arquivo_id,
      l.indice,
      JSON.stringify(l.valores),
      JSON.stringify(l.originais),
      JSON.stringify(l.confianca),
      JSON.stringify(l.depara),
      JSON.stringify(l.problemas),
      l.cor,
      l.duplicada ? 1 : 0,
      l.motivo_duplicata,
      l.aprovada ? 1 : 0,
      l.forcada ? 1 : 0,
      l.editada ? 1 : 0,
      l.hash,
      l.lancada ? 1 : 0,
    );
}

export function obterLinha(linhaId: string): Linha | null {
  const r = db().prepare("SELECT * FROM linhas WHERE id = ?").get(linhaId) as LinhaBruta | undefined;
  return r ? linhaDeBruta(r) : null;
}

export function linhasDoDocumento(docId: string): Linha[] {
  return (db().prepare("SELECT * FROM linhas WHERE documento_id = ? ORDER BY indice").all(docId) as unknown as LinhaBruta[]).map(
    linhaDeBruta,
  );
}

export function linhasDoLote(loteId: string): Linha[] {
  return (
    db()
      .prepare(
        `SELECT l.* FROM linhas l JOIN documentos d ON d.id = l.documento_id JOIN arquivos a ON a.id = l.arquivo_id
         WHERE l.lote_id = ? ORDER BY a.criado_em, a.id, d.indice, l.indice`,
      )
      .all(loteId) as unknown as LinhaBruta[]
  ).map(linhaDeBruta);
}

export function atualizarLinha(
  linhaId: string,
  campos: Partial<
    Pick<
      Linha,
      "valores" | "confianca" | "problemas" | "cor" | "duplicada" | "motivo_duplicata" | "aprovada" | "forcada" | "editada" | "hash" | "lancada" | "depara"
    >
  >,
) {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(campos)) {
    sets.push(`${k} = ?`);
    if (typeof v === "boolean") vals.push(v ? 1 : 0);
    else if (v !== null && typeof v === "object") vals.push(JSON.stringify(v));
    else vals.push(v as string | number | null);
  }
  if (!sets.length) return;
  db().prepare(`UPDATE linhas SET ${sets.join(", ")} WHERE id = ?`).run(...vals, linhaId);
}

export function excluirDadosDoArquivo(arquivoId: string) {
  db().prepare("DELETE FROM linhas WHERE arquivo_id = ? AND lancada = 0").run(arquivoId);
  db()
    .prepare("DELETE FROM documentos WHERE arquivo_id = ? AND id NOT IN (SELECT documento_id FROM linhas WHERE arquivo_id = ?)")
    .run(arquivoId, arquivoId);
}

// ---------- Lançamentos ----------

export function hashesLancados(): Map<string, { lote_id: string; criado_em: string }> {
  const rs = db()
    .prepare("SELECT hash, lote_id, criado_em FROM lancamentos WHERE desfeito_em IS NULL")
    .all() as { hash: string; lote_id: string; criado_em: string }[];
  return new Map(rs.map((r) => [r.hash, { lote_id: r.lote_id, criado_em: r.criado_em }]));
}

export interface Lancamento {
  id: number;
  lote_id: string;
  linha_id: string;
  hash: string;
  arquivo_nome: string | null;
  arquivo_hash: string | null;
  planilha_id: string;
  aba: string;
  numero_linha: number;
  celulas: { coluna: number; valor: string | number }[];
  criado_em: string;
  usuaria: string | null;
  desfeito_em: string | null;
}

export function inserirLancamento(l: Omit<Lancamento, "id" | "desfeito_em">) {
  db()
    .prepare(
      `INSERT INTO lancamentos (lote_id, linha_id, hash, arquivo_nome, arquivo_hash, planilha_id, aba, numero_linha, celulas, criado_em, usuaria)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(l.lote_id, l.linha_id, l.hash, l.arquivo_nome, l.arquivo_hash, l.planilha_id, l.aba, l.numero_linha, JSON.stringify(l.celulas), l.criado_em, l.usuaria);
}

export function lancamentosAtivosDoLote(loteId: string): Lancamento[] {
  const rs = db()
    .prepare("SELECT * FROM lancamentos WHERE lote_id = ? AND desfeito_em IS NULL ORDER BY id")
    .all(loteId) as (Omit<Lancamento, "celulas"> & { celulas: string })[];
  return rs.map((r) => ({ ...r, celulas: JSON.parse(r.celulas) }));
}

export function marcarLancamentosDesfeitos(loteId: string, momento: string) {
  db().prepare("UPDATE lancamentos SET desfeito_em = ? WHERE lote_id = ? AND desfeito_em IS NULL").run(momento, loteId);
}

export function ultimoLoteLancado(): string | null {
  const r = db()
    .prepare("SELECT lote_id FROM lancamentos WHERE desfeito_em IS NULL ORDER BY id DESC LIMIT 1")
    .get() as { lote_id: string } | undefined;
  return r?.lote_id ?? null;
}

// ---------- De/para ----------

export function regrasDePara(): RegraDePara[] {
  return db().prepare("SELECT campo, base, de, para, origem, confirmacoes FROM depara").all() as unknown as RegraDePara[];
}

/**
 * Salva (ou atualiza) uma regra. Se o "para" mudar, as confirmações voltam a zero.
 * Regras aprendidas da planilha nunca substituem uma regra ensinada pela usuária.
 */
export function salvarRegraDePara(
  campo: CampoId,
  base: CampoId,
  deTexto: unknown,
  para: string,
  origem: "usuaria" | "planilha" = "usuaria",
) {
  const chave = chaveDePara(base, deTexto);
  const destino = para.trim();
  if (!chave || !destino) return;
  if (base === campo && chaveDePara(campo, destino) === chave) return; // nada a corrigir
  const existente = db()
    .prepare("SELECT para, origem FROM depara WHERE campo = ? AND base = ? AND de = ?")
    .get(campo, base, chave) as { para: string; origem: string } | undefined;
  if (existente && origem === "planilha" && existente.origem === "usuaria") return;
  if (existente && existente.para === destino) return;
  db()
    .prepare(
      `INSERT INTO depara (campo, base, de, para, origem, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(campo, base, de) DO UPDATE SET para = excluded.para, origem = excluded.origem,
         confirmacoes = 0, atualizado_em = excluded.atualizado_em`,
    )
    .run(campo, base, chave, destino, origem, agora(), agora());
}

type ChaveRegra = { campo: CampoId; base: CampoId; de: string };

export function registrarUsoDePara(r: ChaveRegra) {
  db().prepare("UPDATE depara SET usos = usos + 1 WHERE campo = ? AND base = ? AND de = ?").run(r.campo, r.base, r.de);
}

/** A linha foi lançada sem a usuária mudar o valor corrigido: a regra ganha uma confirmação. */
export function confirmarDePara(r: ChaveRegra) {
  db().prepare("UPDATE depara SET confirmacoes = confirmacoes + 1 WHERE campo = ? AND base = ? AND de = ?").run(r.campo, r.base, r.de);
}

export function listarDePara() {
  return db()
    .prepare("SELECT campo, base, de, para, origem, usos, confirmacoes, criado_em FROM depara ORDER BY campo, base, de")
    .all() as unknown as (RegraDePara & { usos: number; criado_em: string })[];
}

export function excluirDePara(campo: string, base: string, de: string) {
  db().prepare("DELETE FROM depara WHERE campo = ? AND base = ? AND de = ?").run(campo, base, de);
}

export function valoresConhecidos(campo: CampoId, limite = 500): string[] {
  const rs = db()
    .prepare(
      `SELECT DISTINCT json_extract(valores, '$.' || ?) AS v FROM linhas WHERE lancada = 1 AND v IS NOT NULL LIMIT ?`,
    )
    .all(campo, limite) as { v: string }[];
  const deParas = db().prepare("SELECT DISTINCT para AS v FROM depara WHERE campo = ?").all(campo) as { v: string }[];
  return [...new Set([...rs, ...deParas].map((r) => String(r.v)).filter(Boolean))];
}
