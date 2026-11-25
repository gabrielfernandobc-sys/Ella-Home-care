/**
 * Escolhe o melhor caminho para cada arquivo:
 * XML de NF-e -> leitura direta (sem IA)
 * PDF com texto -> texto (mascarado) para a IA
 * PDF escaneado, foto ou print -> IA com visão
 */
import { categoriaPorTexto } from "./categoria";
import { extrairComIA, ErroIA, iaConfigurada } from "./ia";
import { detectarTipo, prepararImagem, type TipoArquivo } from "./imagem";
import { ehXmlNfe, ErroXml, lerXmlNfe } from "./nfe-xml";
import { lerTextoPdf } from "./pdf";
import { limparDocumento, mascarar } from "./privacidade";
import type { DocumentoExtraido, MetodoExtracao } from "./schema";

export interface ResultadoExtracao {
  tipo: TipoArquivo;
  metodo: MetodoExtracao;
  documentos: DocumentoExtraido[];
  aviso: string | null;
}

export class ErroExtracao extends Error {
  constructor(
    message: string,
    public readonly tentarDeNovo = false,
  ) {
    super(message);
  }
}

const LIMITE_TEXTO = 150_000; // caracteres

function completarCategorias(doc: DocumentoExtraido): DocumentoExtraido {
  return {
    ...doc,
    itens: doc.itens.map((i) => {
      if (i.categoria) return i;
      const sug = categoriaPorTexto(i.descricao);
      return sug
        ? { ...i, categoria: sug.categoria, confianca: { ...i.confianca, categoria: sug.confianca } }
        : { ...i, categoria: "outros", confianca: { ...i.confianca, categoria: "baixa" } };
    }),
  };
}

export async function extrairArquivo(conteudo: Uint8Array, nome: string): Promise<ResultadoExtracao> {
  const tipo = detectarTipo(conteudo, nome);
  try {
    if (tipo === "xml") {
      const texto = new TextDecoder("utf-8").decode(conteudo);
      if (ehXmlNfe(texto)) {
        return { tipo, metodo: "xml", documentos: [lerXmlNfe(texto)], aviso: null };
      }
      // Outro XML (ex.: NFS-e de prefeitura): o texto mascarado vai para a IA.
      const r = await extrairComIA({ tipo: "texto", texto: mascarar(texto).slice(0, LIMITE_TEXTO), origem: "xml" });
      return finalizar(tipo, "pdf_texto", r);
    }
    if (tipo === "pdf") {
      const pdf = await lerTextoPdf(conteudo).catch(() => null);
      if (pdf?.temTexto && pdf.texto.length <= LIMITE_TEXTO) {
        const r = await extrairComIA({ tipo: "texto", texto: mascarar(pdf.texto), origem: "pdf" });
        return finalizar(tipo, "pdf_texto", r);
      }
      const r = await extrairComIA({ tipo: "pdf", base64: Buffer.from(conteudo).toString("base64") });
      return finalizar(tipo, "visao", r);
    }
    if (tipo === "png" || tipo === "jpeg" || tipo === "heic" || tipo === "webp" || tipo === "gif") {
      if (!iaConfigurada()) await extrairComIA({ tipo: "texto", texto: "", origem: "pdf" }); // lança o erro da chave
      const img = await prepararImagem(conteudo, tipo).catch(() => {
        throw new ErroExtracao("Não consegui abrir esta imagem (arquivo corrompido ou formato não suportado).");
      });
      const r = await extrairComIA({ tipo: "imagem", base64: img.dados.toString("base64"), mime: img.mime });
      return finalizar(tipo, "visao", r);
    }
  } catch (e) {
    if (e instanceof ErroIA) throw new ErroExtracao(e.message, e.tentarDeNovo);
    if (e instanceof ErroXml) throw new ErroExtracao(e.message);
    throw e;
  }
  throw new ErroExtracao("Tipo de arquivo não reconhecido. Envie PDF, JPG, PNG, HEIC ou XML.");
}

function finalizar(
  tipo: TipoArquivo,
  metodo: MetodoExtracao,
  r: { legivel: boolean; aviso: string | null; documentos: DocumentoExtraido[] },
): ResultadoExtracao {
  if (!r.legivel || r.documentos.length === 0) {
    throw new ErroExtracao(r.aviso || "Não consegui ler um documento de compra neste arquivo.");
  }
  return {
    tipo,
    metodo,
    documentos: r.documentos.map((d) => completarCategorias(limparDocumento(d))),
    aviso: r.aviso,
  };
}
