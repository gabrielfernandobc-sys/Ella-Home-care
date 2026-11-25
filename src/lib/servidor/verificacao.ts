/**
 * Tela "Verificar configuração": confere, com as credenciais reais, se o app está pronto para usar.
 * Nunca devolve o valor de nenhuma chave — só se ela está preenchida.
 * O teste da IA lê um print FICTÍCIO da pasta exemplos/ (nada real é enviado).
 * O teste da planilha só LÊ (lista as abas e conta as linhas).
 */
import fs from "node:fs";
import path from "node:path";
import { extrairArquivo, ErroExtracao } from "../extracao";
import { iaConfigurada } from "../extracao/ia";
import { analisarAba } from "../planilha/planejador";
import { adaptadorPara, mensagemErroPlanilha } from "./adaptador";
import { lerConfigPlanilha } from "./config";
import { pastaDados } from "./db";
import { enderecoRetorno, googleConfigurado, sessaoGoogle, temEscopoDrive } from "./google-auth";

export interface Verificacao {
  node: { versao: string; ok: boolean };
  pastaDados: { ok: boolean };
  google: { configurado: boolean; enderecoRetorno: string; conectado: boolean; email: string | null; drive: boolean };
  ia: { configurada: boolean; modelo: string };
  planilha: { configurada: boolean; fonte: string | null; nome: string | null };
}

export function verificarConfiguracao(): Verificacao {
  const [maior, menor] = process.versions.node.split(".").map(Number);
  let pastaOk = false;
  try {
    fs.mkdirSync(pastaDados(), { recursive: true });
    fs.accessSync(pastaDados(), fs.constants.W_OK);
    pastaOk = true;
  } catch {
    pastaOk = false;
  }
  const sessao = sessaoGoogle();
  const cfg = lerConfigPlanilha();
  return {
    node: { versao: process.versions.node, ok: maior > 22 || (maior === 22 && menor >= 13) },
    pastaDados: { ok: pastaOk },
    google: {
      configurado: googleConfigurado(),
      enderecoRetorno: enderecoRetorno(),
      conectado: !!sessao,
      email: sessao?.email ?? null,
      drive: temEscopoDrive(),
    },
    ia: { configurada: iaConfigurada(), modelo: process.env.CLAUDE_MODEL || "claude-opus-5-5" },
    planilha: { configurada: !!cfg?.mapeamento.some(Boolean), fonte: cfg?.fonte ?? null, nome: cfg?.planilhaNome ?? null },
  };
}

/** O que o print fictício de exemplo contém (para conferir a leitura da IA). */
export const ESPERADO_PRINT = {
  arquivo: "exemplos/prints/print-sistema-compras.png",
  fornecedor: "Papelaria Gama Demonstração ME",
  numero: "2290",
  data: "2026-11-21",
  total: 363,
  itens: [
    { descricao: "Caneta esferográfica azul cx/50", quantidade: 2, total: 84 },
    { descricao: "Papel A4 75g resma 500fl", quantidade: 10, total: 279 },
  ],
};

export interface ResultadoTesteIA {
  ok: boolean;
  segundos: number;
  mensagem: string;
  lido?: {
    fornecedor: string | null;
    numero: string | null;
    data: string | null;
    total: number | null;
    itens: { descricao: string | null; quantidade: number | null; total: number | null }[];
  };
  conferencia?: { campo: string; esperado: string; lido: string; ok: boolean }[];
}

const moeda = (n: number | null | undefined) =>
  n === null || n === undefined ? "(vazio)" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function testarIA(): Promise<ResultadoTesteIA> {
  const inicio = Date.now();
  const caminho = path.join(process.cwd(), ESPERADO_PRINT.arquivo);
  if (!fs.existsSync(caminho)) {
    return { ok: false, segundos: 0, mensagem: "Não achei o print de exemplo na pasta exemplos/. Baixe o app completo de novo." };
  }
  try {
    const r = await extrairArquivo(fs.readFileSync(caminho), path.basename(caminho));
    const d = r.documentos[0];
    const lido = {
      fornecedor: d?.fornecedor ?? null,
      numero: d?.numero_nota ?? null,
      data: d?.data_emissao ?? null,
      total: d?.total_nota ?? null,
      itens: (d?.itens ?? []).map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, total: i.valor_total })),
    };
    const norm = (s: string | null) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
    const conferencia = [
      { campo: "Fornecedor", esperado: ESPERADO_PRINT.fornecedor, lido: lido.fornecedor ?? "(vazio)", ok: norm(lido.fornecedor) === norm(ESPERADO_PRINT.fornecedor) },
      { campo: "Número da nota", esperado: ESPERADO_PRINT.numero, lido: lido.numero ?? "(vazio)", ok: (lido.numero ?? "").replace(/\D/g, "") === ESPERADO_PRINT.numero },
      { campo: "Data", esperado: "21/11/2026", lido: lido.data ? lido.data.split("-").reverse().join("/") : "(vazio)", ok: lido.data === ESPERADO_PRINT.data },
      { campo: "Total", esperado: moeda(ESPERADO_PRINT.total), lido: moeda(lido.total), ok: lido.total === ESPERADO_PRINT.total },
      { campo: "Quantidade de itens", esperado: String(ESPERADO_PRINT.itens.length), lido: String(lido.itens.length), ok: lido.itens.length === ESPERADO_PRINT.itens.length },
      ...ESPERADO_PRINT.itens.map((e, i) => ({
        campo: `Item ${i + 1}: valor`,
        esperado: moeda(e.total),
        lido: moeda(lido.itens[i]?.total),
        ok: lido.itens[i]?.total === e.total,
      })),
    ];
    const acertos = conferencia.filter((c) => c.ok).length;
    return {
      ok: true,
      segundos: Math.round((Date.now() - inicio) / 100) / 10,
      mensagem: `A IA respondeu. Acertou ${acertos} de ${conferencia.length} conferências no print de exemplo.`,
      lido,
      conferencia,
    };
  } catch (e) {
    const msg = e instanceof ErroExtracao ? e.message : "Erro inesperado ao chamar a IA.";
    return { ok: false, segundos: Math.round((Date.now() - inicio) / 100) / 10, mensagem: msg };
  }
}

export interface ResultadoTestePlanilha {
  ok: boolean;
  mensagem: string;
  abas?: string[];
  linhasComDados?: number;
}

/** Só lê: lista as abas e conta as linhas com dados da aba configurada. */
export async function testarPlanilha(): Promise<ResultadoTestePlanilha> {
  const cfg = lerConfigPlanilha();
  if (!cfg) return { ok: false, mensagem: "A planilha ainda não foi configurada (menu Planilha)." };
  try {
    const adaptador = adaptadorPara(cfg);
    const abas = await adaptador.listarAbas();
    if (!abas.includes(cfg.aba)) {
      return { ok: false, abas, mensagem: `A aba “${cfg.aba}” não existe mais na planilha. Configure de novo em Planilha.` };
    }
    const grade = await adaptador.lerGrade(cfg.aba);
    const linhas = analisarAba(grade, cfg.linhaCabecalho).totalLinhasDados;
    return { ok: true, abas, linhasComDados: linhas, mensagem: `Planilha “${cfg.planilhaNome}” aberta: ${abas.length} aba(s), ${linhas} linha(s) com dados na aba “${cfg.aba}”.` };
  } catch (e) {
    return { ok: false, mensagem: mensagemErroPlanilha(e) };
  }
}
