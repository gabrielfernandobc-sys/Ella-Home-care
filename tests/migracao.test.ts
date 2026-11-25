/** Quem já usa a Fase 1 não pode perder as correções (de/para) ao atualizar. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

describe("migração do banco da fase 1 para a fase 2", () => {
  it("preserva as regras de/para existentes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "compras-migracao-"));
    const arquivo = path.join(dir, "compras.db");
    // Banco exatamente como a fase 1 deixava (só a migração 1 aplicada).
    const { MIGRACOES } = await import("@/lib/servidor/db");
    const antigo = new DatabaseSync(arquivo);
    antigo.exec("CREATE TABLE _migracoes (versao INTEGER PRIMARY KEY); INSERT INTO _migracoes VALUES (1);");
    antigo.exec(MIGRACOES[0]);
    antigo.exec(
      "INSERT INTO depara VALUES ('descricao', 'dipirona 500mg c 10 cp', 'Dipirona 500 mg', '2026-11-01T00:00:00Z', 3);",
    );
    antigo.close();

    process.env.DB_ARQUIVO = arquivo;
    process.env.DADOS_DIR = dir;
    const { regrasDePara, listarDePara } = await import("@/lib/servidor/repositorio");
    expect(regrasDePara()).toEqual([
      { campo: "descricao", base: "descricao", de: "dipirona 500mg c 10 cp", para: "Dipirona 500 mg", origem: "usuaria", confirmacoes: 0 },
    ]);
    expect(listarDePara()[0].usos).toBe(3);
  });
});
