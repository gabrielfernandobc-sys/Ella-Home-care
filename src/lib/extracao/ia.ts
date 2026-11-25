/**
 * Leitura por IA (Claude, com visão) para fotos, prints, PDFs escaneados e PDFs com texto.
 * A resposta é JSON estruturado e validado pelo schema (Zod).
 * O que é enviado: só o conteúdo do documento (imagem, PDF ou texto já mascarado).
 * O nome do arquivo e dados da planilha NÃO são enviados.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { RespostaExtracaoSchema, type RespostaExtracao } from "./schema";

export class ErroIA extends Error {
  constructor(
    message: string,
    public readonly tentarDeNovo = false,
  ) {
    super(message);
  }
}

export type EntradaIA =
  | { tipo: "imagem"; base64: string; mime: "image/jpeg" | "image/png" }
  | { tipo: "pdf"; base64: string }
  | { tipo: "texto"; texto: string; origem: "pdf" | "xml" };

const INSTRUCOES = `Você lê documentos de compra brasileiros (NF-e/DANFE, NFC-e, cupons fiscais, recibos, pedidos, boletos e prints de tela de sistemas, e-mails ou WhatsApp) e devolve os dados para uma planilha de controle de compras (medicamentos, materiais de consumo, limpeza, escritório).

Regras obrigatórias:
1. NUNCA invente nem estime valores. Se um campo não aparece ou não dá para ler, use null e confiança "baixa".
2. Valores em reais como número (1.234,56 -> 1234.56). Copie exatamente o que está escrito; não recalcule.
3. Datas no formato AAAA-MM-DD. Documentos brasileiros usam DD/MM/AAAA.
4. Fornecedor é quem VENDEU (emitente), nunca o comprador/destinatário. CNPJ é o do fornecedor.
5. Liste TODOS os itens visíveis, um por linha da tabela do documento, na ordem em que aparecem. Em prints com tabela ou lista, extraia todas as linhas visíveis.
6. Se o arquivo tiver mais de um documento de compra (ex.: um print com vários pedidos), devolva um documento para cada.
7. PRIVACIDADE: nunca extraia dados pessoais de pacientes ou pessoas físicas — nome de paciente, CPF, RG, prontuário, cartão SUS, endereço, telefone, leito. Não coloque esses dados em nenhum campo, nem em observações. Se o destinatário for pessoa física, ignore-o.
8. Confiança por campo: "alta" = lido com clareza; "media" = legível com alguma dúvida (borrado, cortado, deduzido do contexto); "baixa" = muito incerto ou ausente.
9. Categoria de cada item: "medicamento", "material de consumo" (luvas, seringas, gazes, curativos, máscaras...), "limpeza", "escritório" ou "outros".
10. "observacoes": só informação útil para o controle de compras (ex.: "nota de devolução", "pedido ainda não faturado"). Nunca dados pessoais.
11. Se o arquivo estiver ilegível ou não for um documento de compra, responda legivel=false, documentos vazio e explique em "aviso" em português simples.`;

let cliente: Anthropic | null = null;
function obterCliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ErroIA(
      "A chave da IA não está configurada. Notas em XML funcionam sem ela; para fotos, prints e PDFs, siga o README (Passo 3).",
    );
  }
  cliente ??= new Anthropic({ maxRetries: 4, timeout: 5 * 60 * 1000 });
  return cliente;
}

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function extrairComIA(entrada: EntradaIA): Promise<RespostaExtracao> {
  const client = obterCliente();
  const modelo = process.env.CLAUDE_MODEL || "claude-opus-5-5";

  const blocoDocumento: Anthropic.Beta.BetaContentBlockParam =
    entrada.tipo === "imagem"
      ? { type: "image", source: { type: "base64", media_type: entrada.mime, data: entrada.base64 } }
      : entrada.tipo === "pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: entrada.base64 } }
        : {
            type: "text",
            text: `Texto extraído de um ${entrada.origem === "pdf" ? "PDF" : "XML"} (dados pessoais já foram removidos):\n<documento>\n${entrada.texto}\n</documento>`,
          };

  let resposta;
  try {
    resposta = await client.beta.messages.parse({
      model: modelo,
      max_tokens: 20000,
      // Se o modelo recusar por política, a API tenta automaticamente um modelo alternativo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: INSTRUCOES,
      output_config: { effort: "medium", format: betaZodOutputFormat(RespostaExtracaoSchema) },
      messages: [
        {
          role: "user",
          content: [blocoDocumento, { type: "text", text: "Extraia os dados de compra deste documento." }],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      throw new ErroIA("A chave da IA foi recusada. Confira o ANTHROPIC_API_KEY no arquivo .env.");
    }
    if (e instanceof Anthropic.PermissionDeniedError) {
      throw new ErroIA("A conta da IA não tem permissão para este modelo. Confira o CLAUDE_MODEL no .env.");
    }
    if (e instanceof Anthropic.BadRequestError) {
      throw new ErroIA("A IA não aceitou este arquivo (formato ou tamanho). Tente uma foto ou PDF menor.");
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new ErroIA("Limite de uso da IA atingido. Aguarde alguns minutos e tente de novo.", true);
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw new ErroIA("Sem conexão com a IA. Verifique a internet.", true);
    }
    if (e instanceof Anthropic.APIError) {
      throw new ErroIA(`A IA está indisponível no momento (erro ${e.status ?? "?"}). Tente de novo.`, true);
    }
    throw e;
  }

  if (resposta.stop_reason === "refusal") {
    throw new ErroIA("A IA se recusou a ler este arquivo. Lance-o manualmente.");
  }
  if (resposta.stop_reason === "max_tokens") {
    throw new ErroIA("O documento tem itens demais para uma leitura só. Divida o print/PDF em partes menores.");
  }
  const dados = resposta.parsed_output;
  if (!dados) throw new ErroIA("A IA devolveu uma resposta incompleta. Tente de novo.", true);
  return RespostaExtracaoSchema.parse(dados);
}
