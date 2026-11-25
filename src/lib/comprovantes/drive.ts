/**
 * Comprovantes no Google Drive, com o escopo mínimo "drive.file": o app só enxerga
 * e cria os arquivos e pastas que ele mesmo criou (nunca o resto do Drive).
 * Estrutura: <pasta>/<AAAA-MM>/<arquivo>. Os IDs das pastas ficam em cache local.
 */
import { Readable } from "node:stream";
import { drive, type drive_v3 } from "@googleapis/drive";
import type { OAuth2Client } from "google-auth-library";
import type { ArmazemComprovantes, ArquivoComprovante } from "./tipos";

const PASTA = "application/vnd.google-apps.folder";

export interface CachePastas {
  ler(): Record<string, string>;
  salvar(c: Record<string, string>): void;
}

const aspas = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export class ComprovantesDrive implements ArmazemComprovantes {
  private api: drive_v3.Drive;

  constructor(
    auth: OAuth2Client,
    private pastaRaiz: string,
    private cache: CachePastas,
  ) {
    this.api = drive({ version: "v3", auth });
  }

  private async pastaExiste(id: string): Promise<boolean> {
    try {
      const r = await this.api.files.get({ fileId: id, fields: "id, trashed, mimeType" });
      return !r.data.trashed && r.data.mimeType === PASTA;
    } catch {
      return false;
    }
  }

  /** Acha (entre as pastas criadas pelo app) ou cria a pasta "nome" dentro de "pai". */
  private async garantirPasta(caminho: string, nome: string, pai: string): Promise<string> {
    const cache = this.cache.ler();
    if (cache[caminho] && (await this.pastaExiste(cache[caminho]))) return cache[caminho];
    const lista = await this.api.files.list({
      q: `mimeType = '${PASTA}' and name = '${aspas(nome)}' and '${aspas(pai)}' in parents and trashed = false`,
      fields: "files(id)",
      spaces: "drive",
      pageSize: 1,
    });
    let id = lista.data.files?.[0]?.id ?? null;
    if (!id) {
      const criada = await this.api.files.create({
        requestBody: { name: nome, mimeType: PASTA, parents: [pai] },
        fields: "id",
      });
      id = criada.data.id!;
    }
    this.cache.salvar({ ...this.cache.ler(), [caminho]: id });
    return id;
  }

  async enviar(a: ArquivoComprovante) {
    const raiz = await this.garantirPasta(this.pastaRaiz, this.pastaRaiz, "root");
    const mes = await this.garantirPasta(`${this.pastaRaiz}/${a.mes}`, a.mes, raiz);
    const r = await this.api.files.create({
      requestBody: { name: a.nome, parents: [mes], description: "Comprovante guardado pelo Compras Express" },
      media: { mimeType: a.mime, body: Readable.from(Buffer.from(a.bytes)) },
      fields: "id, webViewLink",
    });
    if (!r.data.id || !r.data.webViewLink) throw new Error("O Google Drive não devolveu o link do arquivo.");
    return { id: r.data.id, link: r.data.webViewLink };
  }
}
