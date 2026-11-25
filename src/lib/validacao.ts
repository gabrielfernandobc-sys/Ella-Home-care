/**
 * Validações automáticas. Regra de ouro: nada errado passa em silêncio.
 * - "erro" deixa a linha vermelha (não é lançada sem ação da usuária);
 * - "aviso" deixa a linha amarela (precisa conferir).
 */
import { CAMPO_POR_ID, type CampoId, type ConfiancaLinha, type Granularidade, type ValoresLinha } from "./campos";
import { chaveAcessoValida, cnpjValido } from "./cnpj";
import { dataParaBR, diasEntre, formatarMoeda, hojeISO, parseData, parseNumero } from "./texto";

export interface Problema {
  campo?: CampoId;
  /** "info" é só uma nota (não muda a cor da linha) */
  nivel: "erro" | "aviso" | "info";
  mensagem: string;
}

export type Cor = "verde" | "amarelo" | "vermelho";

export interface OpcoesValidacao {
  hoje?: string; // AAAA-MM-DD
  /** Datas mais antigas que isso viram aviso. */
  diasMaximos?: number;
  /** Se informado (AAAA-MM), datas fora deste mês viram aviso. */
  mesReferencia?: string | null;
  obrigatorios: CampoId[];
  /** Só os campos mapeados na planilha geram aviso de leitura incerta. Vazio = todos. */
  camposMapeados?: CampoId[];
  granularidade: Granularidade;
}

export interface LinhaParaValidar {
  valores: ValoresLinha;
  confianca: ConfiancaLinha;
}

const num = (v: unknown) => parseNumero(v);

/** Valida as linhas de um mesmo documento (nota). Retorna os problemas de cada linha. */
export function validarDocumento(
  linhas: LinhaParaValidar[],
  extras: { frete?: number | null; desconto?: number | null },
  opcoes: OpcoesValidacao,
): Problema[][] {
  const hoje = opcoes.hoje ?? hojeISO();
  const doc: Problema[] = [];
  const primeira = linhas[0]?.valores ?? {};

  // CNPJ
  const cnpj = primeira.cnpj ? String(primeira.cnpj) : "";
  if (cnpj && !cnpjValido(cnpj)) {
    doc.push({ campo: "cnpj", nivel: "erro", mensagem: `CNPJ ${cnpj} é inválido (dígito verificador não confere).` });
  }

  // Chave de acesso
  const chave = primeira.chave_acesso ? String(primeira.chave_acesso) : "";
  if (chave && !chaveAcessoValida(chave)) {
    doc.push({ campo: "chave_acesso", nivel: "aviso", mensagem: "Chave de acesso com dígito verificador inválido." });
  }

  // Data plausível
  const dataBruta = primeira.data_emissao;
  const data = parseData(dataBruta);
  if (dataBruta && !data) {
    doc.push({ campo: "data_emissao", nivel: "aviso", mensagem: `Data "${dataBruta}" não foi entendida.` });
  } else if (data) {
    if (data > hoje) {
      doc.push({ campo: "data_emissao", nivel: "erro", mensagem: `Data no futuro (${dataParaBR(data)}).` });
    } else if (diasEntre(data, hoje) > (opcoes.diasMaximos ?? 180)) {
      doc.push({
        campo: "data_emissao",
        nivel: "aviso",
        mensagem: `Data antiga (${dataParaBR(data)}). Confira se é deste período.`,
      });
    }
    if (opcoes.mesReferencia && !data.startsWith(opcoes.mesReferencia)) {
      const [a, m] = opcoes.mesReferencia.split("-");
      doc.push({
        campo: "data_emissao",
        nivel: "aviso",
        mensagem: `Data ${dataParaBR(data)} fora do mês esperado (${m}/${a}).`,
      });
    }
  }

  // Soma dos itens = total da nota
  const total = num(primeira.total_nota);
  if (opcoes.granularidade === "item" && total !== null && linhas.length > 0) {
    const valoresItens = linhas.map((l) => num(l.valores.valor_total_item));
    if (valoresItens.every((v) => v !== null)) {
      const soma = (valoresItens as number[]).reduce((a, b) => a + b, 0);
      const ajustado = soma + (extras.frete ?? 0) - (extras.desconto ?? 0);
      const tolerancia = Math.max(0.05, linhas.length * 0.01);
      if (Math.abs(ajustado - total) > tolerancia) {
        doc.push({
          campo: "total_nota",
          nivel: "aviso",
          mensagem: `A soma dos itens (${formatarMoeda(ajustado)}) é diferente do total da nota (${formatarMoeda(total)}).`,
        });
      }
    }
  }

  return linhas.map((l) => [...doc, ...validarLinha(l, opcoes)]);
}

export function validarLinha(linha: LinhaParaValidar, opcoes: OpcoesValidacao): Problema[] {
  const p: Problema[] = [];
  const v = linha.valores;

  // Campos obrigatórios
  for (const campo of opcoes.obrigatorios) {
    const valor = v[campo];
    if (valor === null || valor === undefined || String(valor).trim() === "") {
      p.push({ campo, nivel: "aviso", mensagem: `Falta: ${CAMPO_POR_ID[campo].rotulo}.` });
    }
  }

  // Quantidade x unitário = total do item
  const q = num(v.quantidade);
  const u = num(v.valor_unitario);
  const t = num(v.valor_total_item);
  if (q !== null && u !== null && t !== null) {
    const esperado = q * u;
    if (Math.abs(esperado - t) > Math.max(0.02, Math.abs(t) * 0.005)) {
      p.push({
        campo: "valor_total_item",
        nivel: "aviso",
        mensagem: `Quantidade × unitário (${formatarMoeda(esperado)}) não bate com o total do item (${formatarMoeda(t)}).`,
      });
    }
  }
  if (q !== null && q <= 0) p.push({ campo: "quantidade", nivel: "aviso", mensagem: "Quantidade zerada ou negativa." });
  for (const campo of ["valor_unitario", "valor_total_item", "total_nota"] as CampoId[]) {
    const n = num(v[campo]);
    if (n !== null && n < 0) p.push({ campo, nivel: "aviso", mensagem: `${CAMPO_POR_ID[campo].rotulo} negativo.` });
  }
  for (const campo of ["quantidade", "valor_unitario", "valor_total_item", "total_nota"] as CampoId[]) {
    const bruto = v[campo];
    if (bruto !== null && bruto !== undefined && bruto !== "" && num(bruto) === null) {
      p.push({ campo, nivel: "aviso", mensagem: `${CAMPO_POR_ID[campo].rotulo} não é um número.` });
    }
  }

  // Leitura incerta
  const relevantes = opcoes.camposMapeados?.length ? new Set(opcoes.camposMapeados) : null;
  for (const [campo, conf] of Object.entries(linha.confianca) as [CampoId, string][]) {
    if (conf === "alta") continue;
    if (relevantes && !relevantes.has(campo)) continue;
    const valor = v[campo];
    if (valor === null || valor === undefined || valor === "") continue; // vazio já é tratado como "Falta"
    p.push({ campo, nivel: "aviso", mensagem: `Leitura incerta: ${CAMPO_POR_ID[campo].rotulo}.` });
  }
  return p;
}

export function corDaLinha(problemas: Problema[], duplicada: boolean): Cor {
  if (duplicada || problemas.some((x) => x.nivel === "erro")) return "vermelho";
  if (problemas.some((x) => x.nivel === "aviso")) return "amarelo";
  return "verde";
}
