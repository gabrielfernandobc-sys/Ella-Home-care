/**
 * Banco SQLite local (arquivo data/compras.db). Usa o SQLite embutido no Node (node:sqlite),
 * sem instalar nada a mais. Nada aqui sai do computador.
 */
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function pastaDados(): string {
  return path.resolve(process.env.DADOS_DIR || path.join(process.cwd(), "data"));
}

const MIGRACOES: string[] = [
  `
  CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS lotes (
    id TEXT PRIMARY KEY,
    criado_em TEXT NOT NULL,
    usuaria TEXT,
    mes_referencia TEXT,
    status TEXT NOT NULL DEFAULT 'aberto',
    lancado_em TEXT,
    desfeito_em TEXT
  );

  CREATE TABLE IF NOT EXISTS arquivos (
    id TEXT PRIMARY KEY,
    lote_id TEXT NOT NULL REFERENCES lotes(id),
    nome TEXT NOT NULL,
    tamanho INTEGER NOT NULL,
    hash TEXT NOT NULL,
    tipo TEXT,
    caminho TEXT,
    previa TEXT,
    status TEXT NOT NULL DEFAULT 'na_fila',
    metodo TEXT,
    erro TEXT,
    duplicado_de TEXT,
    tentativas INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL,
    processado_em TEXT,
    apagado_em TEXT
  );
  CREATE INDEX IF NOT EXISTS arquivos_hash ON arquivos(hash);
  CREATE INDEX IF NOT EXISTS arquivos_lote ON arquivos(lote_id);

  CREATE TABLE IF NOT EXISTS documentos (
    id TEXT PRIMARY KEY,
    arquivo_id TEXT NOT NULL REFERENCES arquivos(id),
    lote_id TEXT NOT NULL,
    indice INTEGER NOT NULL,
    dados TEXT NOT NULL,
    chaves TEXT NOT NULL,
    frete REAL,
    desconto REAL,
    criado_em TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS documentos_lote ON documentos(lote_id);

  CREATE TABLE IF NOT EXISTS linhas (
    id TEXT PRIMARY KEY,
    lote_id TEXT NOT NULL,
    documento_id TEXT NOT NULL REFERENCES documentos(id),
    arquivo_id TEXT NOT NULL,
    indice INTEGER NOT NULL,
    valores TEXT NOT NULL,
    originais TEXT NOT NULL,
    confianca TEXT NOT NULL,
    depara TEXT NOT NULL DEFAULT '[]',
    problemas TEXT NOT NULL DEFAULT '[]',
    cor TEXT NOT NULL DEFAULT 'amarelo',
    duplicada INTEGER NOT NULL DEFAULT 0,
    motivo_duplicata TEXT,
    aprovada INTEGER NOT NULL DEFAULT 0,
    forcada INTEGER NOT NULL DEFAULT 0,
    editada INTEGER NOT NULL DEFAULT 0,
    hash TEXT NOT NULL,
    lancada INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS linhas_lote ON linhas(lote_id);
  CREATE INDEX IF NOT EXISTS linhas_documento ON linhas(documento_id);

  CREATE TABLE IF NOT EXISTS lancamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lote_id TEXT NOT NULL,
    linha_id TEXT NOT NULL,
    hash TEXT NOT NULL,
    arquivo_nome TEXT,
    arquivo_hash TEXT,
    planilha_id TEXT NOT NULL,
    aba TEXT NOT NULL,
    numero_linha INTEGER NOT NULL,
    celulas TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    usuaria TEXT,
    desfeito_em TEXT
  );
  CREATE INDEX IF NOT EXISTS lancamentos_hash ON lancamentos(hash);
  CREATE INDEX IF NOT EXISTS lancamentos_lote ON lancamentos(lote_id);
  CREATE INDEX IF NOT EXISTS lancamentos_arquivo ON lancamentos(arquivo_hash);

  CREATE TABLE IF NOT EXISTS depara (
    campo TEXT NOT NULL,
    de TEXT NOT NULL,
    para TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    usos INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (campo, de)
  );

  -- Registro de ações. NUNCA guarda conteúdo de documentos, só contagens, nomes de arquivo e números de linha.
  CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quando TEXT NOT NULL,
    usuaria TEXT,
    acao TEXT NOT NULL,
    lote_id TEXT,
    detalhe TEXT
  );
  `,
];

type Global = { __comprasDb?: DatabaseSync };

export function db(): DatabaseSync {
  const g = globalThis as Global;
  if (g.__comprasDb) return g.__comprasDb;
  const dir = pastaDados();
  fs.mkdirSync(dir, { recursive: true });
  const banco = new DatabaseSync(process.env.DB_ARQUIVO || path.join(dir, "compras.db"));
  banco.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  banco.exec("CREATE TABLE IF NOT EXISTS _migracoes (versao INTEGER PRIMARY KEY)");
  const feitas = new Set(
    (banco.prepare("SELECT versao FROM _migracoes").all() as { versao: number }[]).map((r) => r.versao),
  );
  MIGRACOES.forEach((sql, i) => {
    if (feitas.has(i + 1)) return;
    banco.exec("BEGIN");
    try {
      banco.exec(sql);
      banco.prepare("INSERT INTO _migracoes (versao) VALUES (?)").run(i + 1);
      banco.exec("COMMIT");
    } catch (e) {
      banco.exec("ROLLBACK");
      throw e;
    }
  });
  g.__comprasDb = banco;
  return banco;
}

/** Executa dentro de uma transação. */
export function transacao<T>(fn: () => T): T {
  const banco = db();
  banco.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    banco.exec("COMMIT");
    return r;
  } catch (e) {
    banco.exec("ROLLBACK");
    throw e;
  }
}

export function agora(): string {
  return new Date().toISOString();
}

export function lerConfig<T>(chave: string): T | null {
  const r = db().prepare("SELECT valor FROM config WHERE chave = ?").get(chave) as { valor: string } | undefined;
  return r ? (JSON.parse(r.valor) as T) : null;
}

export function salvarConfig(chave: string, valor: unknown): void {
  db()
    .prepare("INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
    .run(chave, JSON.stringify(valor));
}

export function apagarConfig(chave: string): void {
  db().prepare("DELETE FROM config WHERE chave = ?").run(chave);
}

export function registrarEvento(acao: string, detalhe: Record<string, unknown> = {}, loteId?: string, usuaria?: string) {
  db()
    .prepare("INSERT INTO eventos (quando, usuaria, acao, lote_id, detalhe) VALUES (?, ?, ?, ?, ?)")
    .run(agora(), usuaria ?? null, acao, loteId ?? null, JSON.stringify(detalhe));
}
