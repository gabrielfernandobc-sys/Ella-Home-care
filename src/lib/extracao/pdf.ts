/** PDF: tenta ler o texto primeiro. Só PDFs escaneados (sem texto) vão para a leitura por imagem. */
import { extractText, getDocumentProxy } from "unpdf";

export interface TextoPdf {
  paginas: number;
  texto: string;
  temTexto: boolean;
}

export async function lerTextoPdf(conteudo: Uint8Array): Promise<TextoPdf> {
  const pdf = await getDocumentProxy(new Uint8Array(conteudo));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const paginas = Array.isArray(text) ? text : [text];
  const texto = paginas.map((t, i) => `--- Página ${i + 1} ---\n${t}`).join("\n\n");
  const caracteres = paginas.join("").replace(/\s/g, "").length;
  // Heurística: pelo menos ~80 caracteres úteis por página e algum número (valores, datas).
  const temTexto = caracteres >= 80 * Math.max(1, totalPages) * 0.5 && /\d/.test(texto);
  return { paginas: totalPages, texto, temTexto };
}
