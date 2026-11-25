/**
 * LGPD: apaga do computador os arquivos enviados e os dados extraídos depois de N dias
 * (RETENCAO_DIAS, padrão 30). Ficam só: nome e hash do arquivo (para detectar
 * duplicatas) e o registro do que foi lançado (para rastrear e desfazer).
 */
import fs from "node:fs";
import { agora, db, registrarEvento } from "./db";

export function diasDeRetencao(): number {
  const n = Number(process.env.RETENCAO_DIAS || 30);
  return Number.isFinite(n) && n >= 1 ? n : 30;
}

export function limparAntigos(): { arquivos: number } {
  const limite = new Date(Date.now() - diasDeRetencao() * 86_400_000).toISOString();
  const antigos = db()
    .prepare("SELECT id, caminho, previa FROM arquivos WHERE criado_em < ? AND apagado_em IS NULL")
    .all(limite) as { id: string; caminho: string | null; previa: string | null }[];
  for (const a of antigos) {
    for (const c of [a.caminho, a.previa]) {
      if (!c) continue;
      try {
        fs.unlinkSync(c);
      } catch {
        /* já não existe */
      }
    }
    db().prepare("UPDATE arquivos SET apagado_em = ?, caminho = NULL, previa = NULL WHERE id = ?").run(agora(), a.id);
  }
  // Dados extraídos de lotes antigos (o que foi lançado continua registrado em "lancamentos").
  db()
    .prepare(
      `DELETE FROM linhas WHERE lote_id IN (SELECT id FROM lotes WHERE criado_em < ?)`,
    )
    .run(limite);
  db().prepare(`DELETE FROM documentos WHERE lote_id IN (SELECT id FROM lotes WHERE criado_em < ?)`).run(limite);
  if (antigos.length) registrarEvento("limpeza", { arquivos: antigos.length, dias: diasDeRetencao() });
  return { arquivos: antigos.length };
}

type G = { __comprasLimpeza?: NodeJS.Timeout };

export function agendarLimpeza() {
  const g = globalThis as G;
  if (g.__comprasLimpeza) return;
  const rodar = () => {
    try {
      limparAntigos();
    } catch (e) {
      console.error("[limpeza]", (e as Error).message);
    }
  };
  rodar();
  g.__comprasLimpeza = setInterval(rodar, 6 * 60 * 60 * 1000);
  g.__comprasLimpeza.unref?.();
}
