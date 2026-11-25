/**
 * Onde os comprovantes (arquivos originais) são guardados quando a opção está ligada.
 * Google Drive no uso normal; uma pasta local no modo demonstração; memória nos testes.
 */
export interface ArquivoComprovante {
  nome: string;
  mime: string;
  bytes: Uint8Array;
  /** Pasta do mês, AAAA-MM */
  mes: string;
}

export interface ArmazemComprovantes {
  /** Envia o arquivo para <pasta>/<AAAA-MM>/ e devolve o identificador e o link. */
  enviar(arquivo: ArquivoComprovante): Promise<{ id: string; link: string }>;
}

export const MIME_COMPROVANTE: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  heic: "image/heic",
  webp: "image/webp",
  gif: "image/gif",
  xml: "application/xml",
};
