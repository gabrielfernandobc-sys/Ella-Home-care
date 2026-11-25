/** Adaptador para Google Sheets (API v4). Todas as escritas são aditivas. */
import { sheets, type sheets_v4 } from "@googleapis/sheets";
import type { OAuth2Client } from "google-auth-library";
import { letraColuna } from "../mapeamento";
import type { AdaptadorPlanilha, Celula, Grade, OpEstrutura } from "./tipos";

type InfoAba = {
  sheetId: number;
  titulo: string;
  linhas: number;
  colunas: number;
  filtro: sheets_v4.Schema$BasicFilter | null;
};

export const citarAba = (aba: string) => `'${aba.replace(/'/g, "''")}'`;

/** Extrai o ID de um link do Google Sheets (ou aceita o próprio ID). */
export function idDaPlanilha(linkOuId: string): string | null {
  const s = linkOuId.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  return null;
}

const comoTexto = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

export class PlanilhaGoogle implements AdaptadorPlanilha {
  private api: sheets_v4.Sheets;
  private meta: { titulo: string; localidade: string; abas: InfoAba[] } | null = null;

  constructor(
    auth: OAuth2Client,
    public readonly planilhaId: string,
  ) {
    this.api = sheets({ version: "v4", auth });
  }

  async carregarMeta(forcar = false) {
    if (this.meta && !forcar) return this.meta;
    const r = await this.api.spreadsheets.get({
      spreadsheetId: this.planilhaId,
      fields: "properties(title,locale),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),basicFilter)",
    });
    this.meta = {
      titulo: r.data.properties?.title ?? "",
      localidade: r.data.properties?.locale ?? "pt_BR",
      abas: (r.data.sheets ?? []).map((s) => ({
        sheetId: s.properties?.sheetId ?? 0,
        titulo: s.properties?.title ?? "",
        linhas: s.properties?.gridProperties?.rowCount ?? 1000,
        colunas: s.properties?.gridProperties?.columnCount ?? 26,
        filtro: s.basicFilter ?? null,
      })),
    };
    return this.meta;
  }

  async titulo() {
    return (await this.carregarMeta()).titulo;
  }

  private async aba(titulo: string): Promise<InfoAba> {
    const meta = await this.carregarMeta();
    const a = meta.abas.find((x) => x.titulo === titulo);
    if (!a) throw new Error(`A aba "${titulo}" não existe nesta planilha.`);
    return a;
  }

  async localidade() {
    return (await this.carregarMeta()).localidade;
  }

  async listarAbas() {
    return (await this.carregarMeta(true)).abas.map((a) => a.titulo);
  }

  async lerGrade(aba: string): Promise<Grade> {
    const r = await this.api.spreadsheets.values.batchGet({
      spreadsheetId: this.planilhaId,
      ranges: [citarAba(aba)],
      valueRenderOption: "FORMULA",
      dateTimeRenderOption: "SERIAL_NUMBER",
      majorDimension: "ROWS",
    });
    const f = await this.api.spreadsheets.values.batchGet({
      spreadsheetId: this.planilhaId,
      ranges: [citarAba(aba)],
      valueRenderOption: "FORMATTED_VALUE",
      majorDimension: "ROWS",
    });
    const conv = (rows: unknown[][] | null | undefined) => (rows ?? []).map((l) => (l ?? []).map(comoTexto));
    return { formulas: conv(r.data.valueRanges?.[0]?.values), valores: conv(f.data.valueRanges?.[0]?.values) };
  }

  async aplicar(titulo: string, ops: OpEstrutura[]) {
    const aba = await this.aba(titulo);
    const reqs: sheets_v4.Schema$Request[] = [];
    let linhas = aba.linhas;
    const extensoesFiltro: { fimAntigo: number; quantidade: number }[] = [];
    for (const op of ops) {
      if (op.tipo === "inserir") {
        if (op.indice >= linhas) {
          if (op.indice > linhas) {
            reqs.push({ appendDimension: { sheetId: aba.sheetId, dimension: "ROWS", length: op.indice - linhas } });
            linhas = op.indice;
          }
          reqs.push({ appendDimension: { sheetId: aba.sheetId, dimension: "ROWS", length: op.quantidade } });
        } else {
          reqs.push({
            insertDimension: {
              range: { sheetId: aba.sheetId, dimension: "ROWS", startIndex: op.indice, endIndex: op.indice + op.quantidade },
              inheritFromBefore: op.indice > 0,
            },
          });
        }
        linhas += op.quantidade;
      } else if (op.tipo === "copiar" || op.tipo === "copiarFormula") {
        const colIni = op.tipo === "copiarFormula" ? op.coluna : 0;
        const colFim = op.tipo === "copiarFormula" ? op.coluna + 1 : aba.colunas;
        reqs.push({
          copyPaste: {
            source: { sheetId: aba.sheetId, startRowIndex: op.origem, endRowIndex: op.origem + 1, startColumnIndex: colIni, endColumnIndex: colFim },
            destination: {
              sheetId: aba.sheetId,
              startRowIndex: op.destinoInicio,
              endRowIndex: op.destinoFim + 1,
              startColumnIndex: colIni,
              endColumnIndex: colFim,
            },
            pasteType:
              op.tipo === "copiarFormula" ? "PASTE_FORMULA" : op.modo === "formato" ? "PASTE_FORMAT" : "PASTE_DATA_VALIDATION",
          },
        });
      } else if (op.tipo === "estenderFiltro") {
        extensoesFiltro.push(op);
      }
    }
    if (reqs.length) {
      await this.api.spreadsheets.batchUpdate({ spreadsheetId: this.planilhaId, requestBody: { requests: reqs } });
    }
    // Filtro: atualização separada e opcional (se falhar, os dados já estão certos).
    for (const ext of extensoesFiltro) {
      const fim = aba.filtro?.range?.endRowIndex;
      if (!aba.filtro || fim === undefined || fim === null || fim !== ext.fimAntigo) continue;
      const { range, sortSpecs, filterSpecs, criteria } = aba.filtro;
      await this.api.spreadsheets
        .batchUpdate({
          spreadsheetId: this.planilhaId,
          requestBody: {
            requests: [
              {
                setBasicFilter: {
                  filter: {
                    range: { ...range, endRowIndex: fim + ext.quantidade },
                    sortSpecs,
                    ...(filterSpecs?.length ? { filterSpecs } : criteria ? { criteria } : {}),
                  },
                },
              },
            ],
          },
        })
        .catch(() => undefined);
    }
    await this.carregarMeta(true);
  }

  async escrever(aba: string, celulas: Celula[]) {
    // Textos e números: RAW (gravados literalmente). Datas e fórmulas: como se fossem digitados.
    await this.escreverModo(aba, celulas.filter((c) => c.tipo === "texto" || c.tipo === "numero"), "RAW");
    await this.escreverModo(aba, celulas.filter((c) => c.tipo === "data" || c.tipo === "formula"), "USER_ENTERED");
  }

  private async escreverModo(aba: string, celulas: Celula[], modo: "RAW" | "USER_ENTERED") {
    if (!celulas.length) return;
    const porLinha = new Map<number, Celula[]>();
    for (const c of celulas) porLinha.set(c.linha, [...(porLinha.get(c.linha) ?? []), c]);
    const data: sheets_v4.Schema$ValueRange[] = [];
    for (const [linha, cels] of porLinha) {
      const min = Math.min(...cels.map((c) => c.coluna));
      const max = Math.max(...cels.map((c) => c.coluna));
      // null = "não mexer nesta célula"
      const valores: (string | number | null)[] = Array.from({ length: max - min + 1 }, () => null);
      for (const c of cels) valores[c.coluna - min] = c.valor;
      data.push({
        range: `${citarAba(aba)}!${letraColuna(min)}${linha + 1}:${letraColuna(max)}${linha + 1}`,
        values: [valores],
      });
    }
    await this.api.spreadsheets.values.batchUpdate({
      spreadsheetId: this.planilhaId,
      requestBody: { valueInputOption: modo, data },
    });
  }

  async excluirLinhas(titulo: string, linhas: number[]) {
    if (!linhas.length) return;
    const aba = await this.aba(titulo);
    const ord = [...new Set(linhas)].sort((a, b) => b - a);
    // Junta linhas vizinhas em intervalos; exclui de baixo para cima.
    const intervalos: [number, number][] = [];
    for (const r of ord) {
      const ult = intervalos[intervalos.length - 1];
      if (ult && ult[0] === r + 1) ult[0] = r;
      else intervalos.push([r, r + 1]);
    }
    await this.api.spreadsheets.batchUpdate({
      spreadsheetId: this.planilhaId,
      requestBody: {
        requests: intervalos.map(([ini, fim]) => ({
          deleteDimension: { range: { sheetId: aba.sheetId, dimension: "ROWS", startIndex: ini, endIndex: fim } },
        })),
      },
    });
    await this.carregarMeta(true);
  }

  async duplicarAba(modelo: string, novoNome: string) {
    const aba = await this.aba(modelo);
    const meta = await this.carregarMeta();
    await this.api.spreadsheets.batchUpdate({
      spreadsheetId: this.planilhaId,
      requestBody: {
        requests: [{ duplicateSheet: { sourceSheetId: aba.sheetId, insertSheetIndex: meta.abas.length, newSheetName: novoNome } }],
      },
    });
    await this.carregarMeta(true);
  }
}
