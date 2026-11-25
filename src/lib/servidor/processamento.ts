/**
 * Processamento de cada arquivo: extração -> linhas -> de/para -> validação -> duplicatas.
 * Um erro num arquivo nunca trava o lote: o arquivo fica com status "erro" e os demais seguem.
 */
import fs from "node:fs";
import { nomeAbaMensal } from "../abas";
import { CAMPO_POR_ID, type CampoId, type ValoresLinha } from "../campos";
import { chavesDaPlanilha, chavesDocumento, explicarChave, hashArquivo, hashLinha } from "../duplicatas";
import { extrairArquivo, ErroExtracao } from "../extracao";
import { detectarTipo, gerarPrevia } from "../extracao/imagem";
import { aplicarDePara, camposDoDocumento, documentoParaLinhas } from "../linhas";
import { corDaLinha, validarDocumento, type Problema } from "../validacao";
import { adaptadorPara } from "./adaptador";
import { caminhoPara, salvarBytes } from "./armazenamento";
import { lerConfigPlanilha, type ConfigPlanilha } from "./config";
import { agora, transacao } from "./db";
import * as repo from "./repositorio";

// ---------------- Recebimento ----------------

export interface Recebido {
  arquivo: repo.Arquivo;
  /** true quando o mesmo arquivo já foi lançado ou já está neste lote */
  duplicado: boolean;
}

export async function receberArquivo(loteId: string, nome: string, bytes: Uint8Array): Promise<Recebido> {
  const hash = hashArquivo(bytes);
  const tipo = detectarTipo(bytes, nome);
  const anteriores = repo.arquivosComHash(hash);
  let duplicadoDe: repo.Arquivo | null = null;
  let motivo: string | null = null;
  const noLote = anteriores.find((a) => a.lote_id === loteId);
  const lanc = repo.lancamentoDoHashArquivo(hash);
  if (noLote) {
    duplicadoDe = noLote;
    motivo = `Este mesmo arquivo já está neste lote (“${noLote.nome}”).`;
  } else if (lanc) {
    duplicadoDe = anteriores[0] ?? null;
    motivo = `Este mesmo arquivo já foi lançado em ${new Date(lanc.criado_em).toLocaleDateString("pt-BR")} (lote ${lanc.lote_id}).`;
  }

  const caminho = caminhoPara(hash, tipo);
  salvarBytes(caminho, bytes);
  let previa: string | null = null;
  if (tipo === "heic") {
    try {
      const p = caminhoPara(hash, tipo, ".previa");
      if (!fs.existsSync(p)) fs.writeFileSync(p, await gerarPrevia(bytes, tipo));
      previa = p;
    } catch {
      previa = null;
    }
  }

  const arquivo: repo.Arquivo = {
    id: repo.id(),
    lote_id: loteId,
    nome: nome.slice(0, 200),
    tamanho: bytes.length,
    hash,
    tipo,
    caminho,
    previa,
    status: motivo ? "duplicado" : "na_fila",
    metodo: null,
    erro: motivo,
    duplicado_de: duplicadoDe?.id ?? null,
    tentativas: 0,
    criado_em: agora(),
    processado_em: null,
    apagado_em: null,
  };
  repo.inserirArquivo(arquivo);
  return { arquivo, duplicado: !!motivo };
}

// ---------------- Processamento ----------------

const MAX_TENTATIVAS = 3;

export async function processarArquivo(arquivoId: string, reenfileirar: (id: string, atrasoMs: number) => void) {
  const arq = repo.obterArquivo(arquivoId);
  if (!arq || (arq.status !== "na_fila" && arq.status !== "processando")) return;
  const cfg = lerConfigPlanilha();
  repo.atualizarArquivo(arq.id, { status: "processando", tentativas: arq.tentativas + 1, erro: null });

  try {
    if (!arq.caminho || !fs.existsSync(arq.caminho)) throw new ErroExtracao("O arquivo não está mais neste computador.");
    const bytes = fs.readFileSync(arq.caminho);
    const r = await extrairArquivo(bytes, arq.nome);
    const granularidade = cfg?.granularidade ?? "item";
    const tabela = repo.tabelaDePara();

    const docIds: string[] = [];
    transacao(() => {
      repo.excluirDadosDoArquivo(arq.id); // reprocessamento: começa do zero
      r.documentos.forEach((doc, indice) => {
        const docId = repo.id();
        const chaves = chavesDocumento(camposDoDocumento(doc).valores);
        repo.inserirDocumento({
          id: docId,
          arquivo_id: arq.id,
          lote_id: arq.lote_id,
          indice,
          dados: doc,
          chaves,
          frete: doc.valor_frete,
          desconto: doc.valor_desconto,
          criado_em: agora(),
        });
        docIds.push(docId);
        documentoParaLinhas(doc, { granularidade, arquivo: arq.nome, loteId: arq.lote_id }).forEach((g, i) => {
          const { valores, aplicados } = aplicarDePara(g.valores, tabela);
          for (const a of aplicados) repo.registrarUsoDePara(a.campo, a.de);
          repo.inserirLinha({
            id: repo.id(),
            lote_id: arq.lote_id,
            documento_id: docId,
            arquivo_id: arq.id,
            indice: i,
            valores,
            originais: g.valores,
            confianca: g.confianca,
            depara: aplicados,
            problemas: [],
            cor: "amarelo",
            duplicada: false,
            motivo_duplicata: null,
            aprovada: false,
            forcada: false,
            editada: false,
            hash: hashLinha(chaves, i, arq.hash),
            lancada: false,
          });
        });
      });
    });

    await reavaliarDocumentos(docIds);
    repo.atualizarArquivo(arq.id, {
      status: "pronto",
      metodo: r.metodo,
      erro: r.aviso && r.aviso.length < 300 ? r.aviso : null,
      processado_em: agora(),
    });
  } catch (e) {
    const tentativas = arq.tentativas + 1;
    if (e instanceof ErroExtracao && e.tentarDeNovo && tentativas < MAX_TENTATIVAS) {
      repo.atualizarArquivo(arq.id, { status: "na_fila", erro: `${e.message} (nova tentativa em instantes)` });
      reenfileirar(arq.id, 15_000 * tentativas);
      return;
    }
    // Nunca registra conteúdo do documento: só a mensagem de erro.
    const msg =
      e instanceof ErroExtracao
        ? e.message
        : "Erro inesperado ao ler este arquivo. Tente “Ler de novo” ou lance-o manualmente.";
    if (!(e instanceof ErroExtracao)) console.error(`[processamento] arquivo ${arq.id}:`, (e as Error)?.message);
    repo.atualizarArquivo(arq.id, { status: "erro", erro: msg, processado_em: agora() });
  }
}

// ---------------- Comparação com a planilha (cache curto) ----------------

type Cache = { chaves: Set<string>; em: number };
const cachePlanilha = new Map<string, Cache>();
const TTL = 2 * 60 * 1000;

export function limparCachePlanilha() {
  cachePlanilha.clear();
}

async function chavesNaAba(cfg: ConfigPlanilha, aba: string): Promise<Set<string> | null> {
  const k = `${cfg.planilhaId}::${aba}`;
  const c = cachePlanilha.get(k);
  if (c && Date.now() - c.em < TTL) return c.chaves;
  const adaptador = adaptadorPara(cfg);
  const abas = await adaptador.listarAbas();
  if (!abas.includes(aba)) {
    const vazio = new Set<string>();
    cachePlanilha.set(k, { chaves: vazio, em: Date.now() });
    return vazio;
  }
  const grade = await adaptador.lerGrade(aba);
  const chaves = chavesDaPlanilha(grade, cfg.mapeamento, cfg.linhaCabecalho);
  cachePlanilha.set(k, { chaves, em: Date.now() });
  return chaves;
}

export function abaDestino(cfg: ConfigPlanilha, valores: ValoresLinha): string | null {
  if (cfg.modoAbas === "unica") return cfg.aba;
  return nomeAbaMensal(cfg.padraoNomeAba, valores.data_emissao as string);
}

// ---------------- Reavaliação (validação + duplicatas) ----------------

/** Recalcula cor, problemas e duplicatas das linhas não lançadas dos documentos indicados. */
export async function reavaliarDocumentos(docIds: string[]) {
  const cfg = lerConfigPlanilha();
  const lancados = repo.hashesLancados();
  for (const docId of docIds) {
    const doc = repo.obterDocumento(docId);
    if (!doc) continue;
    const linhas = repo.linhasDoDocumento(docId);
    if (!linhas.length || linhas.every((l) => l.lancada)) continue;
    const arq = repo.obterArquivo(doc.arquivo_id);
    const lote = repo.obterLote(doc.lote_id);
    const v0 = linhas[0].valores;
    const chaves = chavesDocumento(v0);
    repo.atualizarChavesDocumento(docId, chaves);

    // 1) Duplicata de algo já lançado (idempotência) ou de outro documento
    let motivo: string | null = null;
    const hashes = linhas.map((l) => hashLinha(chaves, l.indice, arq?.hash ?? ""));
    const jaLancado = hashes.map((h) => lancados.get(h)).find(Boolean);
    if (jaLancado) {
      motivo = `Já lançada em ${new Date(jaLancado.criado_em).toLocaleDateString("pt-BR")} (lote ${jaLancado.lote_id}).`;
    }
    if (!motivo) {
      for (const outro of repo.documentosComChaves(chaves, docId)) {
        const comum = outro.chaves.find((k) => chaves.includes(k))!;
        const mesmoLoteAntes =
          outro.lote_id === doc.lote_id && (outro.criado_em < doc.criado_em || (outro.criado_em === doc.criado_em && outro.id < doc.id));
        if (mesmoLoteAntes && outro.arquivo_id !== doc.arquivo_id) {
          motivo = `Repetida neste lote: igual ao arquivo “${outro.arquivo_nome}” (${explicarChave(comum)}).`;
          break;
        }
        if (outro.lote_id !== doc.lote_id && repo.documentoTemLancamento(outro.id)) {
          motivo = `Já lançada antes, no lote ${outro.lote_id} (${explicarChave(comum)}).`;
          break;
        }
      }
    }

    // 2) Duplicata do que já está na planilha
    const extras: Problema[] = [];
    if (!motivo && cfg && cfg.mapeamento.length) {
      const aba = abaDestino(cfg, v0);
      if (aba) {
        try {
          const naPlanilha = await chavesNaAba(cfg, aba);
          const comum = chaves.find((k) => naPlanilha?.has(k));
          if (comum) motivo = `Já está na planilha, aba “${aba}” (${explicarChave(comum)}).`;
        } catch {
          extras.push({ nivel: "aviso", mensagem: "Não consegui comparar com a planilha agora (sem conexão?). Confira se já não foi lançada." });
        }
      }
    }
    if (!cfg) extras.push({ nivel: "aviso", mensagem: "Planilha ainda não conectada: não deu para checar duplicatas na planilha." });

    // 3) Validações
    const mapeados = (cfg?.mapeamento.filter(Boolean) ?? []) as CampoId[];
    const problemas = validarDocumento(
      linhas.map((l) => ({ valores: l.valores, confianca: l.confianca })),
      { frete: doc.frete, desconto: doc.desconto },
      {
        obrigatorios: (cfg?.obrigatorios ?? []).filter((c) => !mapeados.length || mapeados.includes(c)),
        camposMapeados: mapeados,
        diasMaximos: cfg?.diasMaximos ?? 180,
        mesReferencia: lote?.mes_referencia ?? null,
        granularidade: cfg?.granularidade ?? "item",
      },
    );
    if (cfg?.modoAbas === "mensal" && !abaDestino(cfg, v0)) {
      extras.push({
        campo: "data_emissao",
        nivel: "erro",
        mensagem: "Sem data válida: não dá para escolher a aba do mês. Preencha a data.",
      });
    }

    linhas.forEach((l, i) => {
      if (l.lancada) return;
      const p = [...extras, ...problemas[i]];
      if (l.depara.length) {
        p.push({
          nivel: "aviso",
          mensagem: `Corrigido automaticamente: ${l.depara.map((d) => `“${d.de}” → “${d.para}”`).join(", ")}. Confira.`,
        });
      }
      const duplicada = !!motivo;
      const cor = corDaLinha(p, duplicada);
      repo.atualizarLinha(l.id, {
        problemas: p,
        cor,
        duplicada,
        motivo_duplicata: motivo,
        hash: hashes[i],
        // Linha que virou vermelha perde a aprovação (a menos que a usuária tenha forçado).
        aprovada: l.aprovada && (cor !== "vermelho" || l.forcada),
      });
    });
  }
}

// ---------------- Edição pela usuária ----------------

export async function editarLinha(linhaId: string, novos: ValoresLinha) {
  const linha = repo.obterLinha(linhaId);
  if (!linha) throw new Error("Linha não encontrada.");
  if (linha.lancada) throw new Error("Esta linha já foi lançada. Para mudar, desfaça o lote.");
  const irmas = repo.linhasDoDocumento(linha.documento_id);
  for (const [campo, valor] of Object.entries(novos) as [CampoId, string | number | null][]) {
    if (!(campo in CAMPO_POR_ID) || CAMPO_POR_ID[campo].nivel === "app") continue;
    const limpo = typeof valor === "string" ? valor.trim() || null : valor;
    // Campos da nota (data, fornecedor, CNPJ...) valem para todos os itens da mesma nota.
    const alvo = CAMPO_POR_ID[campo].nivel === "nota" ? irmas : [linha];
    for (const l of alvo) {
      if (l.lancada) continue;
      const atual = repo.obterLinha(l.id)!;
      const antes = atual.valores[campo];
      if (antes === limpo) continue;
      atual.valores[campo] = limpo;
      // Aprendizado de/para: o texto original lido -> o que a usuária escreveu.
      const original = atual.originais[campo];
      if (typeof original === "string" && typeof limpo === "string") repo.salvarDePara(campo, original, limpo);
      // Valor conferido pela usuária: a dúvida de leitura deixa de valer.
      atual.confianca[campo] = "alta";
      repo.atualizarLinha(l.id, {
        valores: atual.valores,
        confianca: atual.confianca,
        editada: true,
        depara: atual.depara.filter((d) => d.campo !== campo),
      });
    }
  }
  await reavaliarDocumentos([linha.documento_id]);
  return repo.obterLinha(linhaId);
}
