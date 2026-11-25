/**
 * Fila em memória com concorrência limitada. Ao reiniciar o app, arquivos que
 * estavam na fila ou em processamento voltam para a fila automaticamente.
 */
import { processarArquivo } from "./processamento";
import * as repo from "./repositorio";

class Fila {
  private pendentes: string[] = [];
  private emAndamento = new Set<string>();

  constructor(private concorrencia: number) {}

  adicionar(arquivoId: string, atrasoMs = 0) {
    if (atrasoMs > 0) {
      setTimeout(() => this.adicionar(arquivoId), atrasoMs).unref?.();
      return;
    }
    if (this.emAndamento.has(arquivoId) || this.pendentes.includes(arquivoId)) return;
    this.pendentes.push(arquivoId);
    this.bombear();
  }

  private bombear() {
    while (this.emAndamento.size < this.concorrencia && this.pendentes.length) {
      const idArq = this.pendentes.shift()!;
      this.emAndamento.add(idArq);
      processarArquivo(idArq, (i, atraso) => this.adicionar(i, atraso))
        .catch((e) => console.error("[fila] falha inesperada:", (e as Error)?.message))
        .finally(() => {
          this.emAndamento.delete(idArq);
          this.bombear();
        });
    }
  }

  estado() {
    return { processando: this.emAndamento.size, aguardando: this.pendentes.length };
  }
}

type G = { __comprasFila?: Fila };

export function fila(): Fila {
  const g = globalThis as G;
  if (!g.__comprasFila) {
    const n = Number(process.env.CONCORRENCIA_IA || 5);
    g.__comprasFila = new Fila(Number.isInteger(n) && n > 0 && n <= 20 ? n : 5);
    for (const a of repo.arquivosPendentes()) {
      repo.atualizarArquivo(a.id, { status: "na_fila" });
      g.__comprasFila.adicionar(a.id);
    }
  }
  return g.__comprasFila;
}
