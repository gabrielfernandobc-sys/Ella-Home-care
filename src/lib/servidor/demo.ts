/**
 * Planilha de demonstração: uma planilha fictícia guardada em data/demo-planilha.json.
 * Permite testar o app inteiro sem conta Google.
 */
import fs from "node:fs";
import path from "node:path";
import { PLANILHA_MODELO } from "../exemplos/ficticios";
import { PlanilhaMemoria, type EstadoPlanilha } from "../planilha/memoria";
import type { Celula, OpEstrutura } from "../planilha/tipos";
import { pastaDados } from "./db";

export const ID_DEMO = "demonstracao";

const arquivo = () => path.join(pastaDados(), "demo-planilha.json");

export function estadoInicialDemo(): EstadoPlanilha {
  return {
    localidade: "pt_BR",
    abas: [
      { titulo: "Compras", celulas: PLANILHA_MODELO.map((l) => [...l]) },
      { titulo: "Modelo", celulas: [PLANILHA_MODELO[0].slice(), ["TOTAL", "", "", "", "", "", "", "", "", "=SOMA(J2:J2)", "", "", ""]] },
    ],
  };
}

export class PlanilhaDemo extends PlanilhaMemoria {
  static carregar(): PlanilhaDemo {
    try {
      return new PlanilhaDemo(JSON.parse(fs.readFileSync(arquivo(), "utf8")));
    } catch {
      const p = new PlanilhaDemo(estadoInicialDemo());
      p.salvar();
      return p;
    }
  }

  static reiniciar(): PlanilhaDemo {
    const p = new PlanilhaDemo(estadoInicialDemo());
    p.salvar();
    return p;
  }

  salvar() {
    fs.mkdirSync(pastaDados(), { recursive: true });
    fs.writeFileSync(arquivo(), JSON.stringify(this.estado, null, 1));
  }

  async aplicar(aba: string, ops: OpEstrutura[]) {
    await super.aplicar(aba, ops);
    this.salvar();
  }
  async escrever(aba: string, celulas: Celula[]) {
    await super.escrever(aba, celulas);
    this.salvar();
  }
  async excluirLinhas(aba: string, linhas: number[]) {
    await super.excluirLinhas(aba, linhas);
    this.salvar();
  }
  async duplicarAba(modelo: string, novoNome: string) {
    await super.duplicarAba(modelo, novoNome);
    this.salvar();
  }
}
