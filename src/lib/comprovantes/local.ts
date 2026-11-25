/** Comprovantes do modo demonstração: uma pasta neste computador (data/comprovantes-demo/<pasta>/<AAAA-MM>/). */
import fs from "node:fs";
import path from "node:path";
import type { ArmazemComprovantes, ArquivoComprovante } from "./tipos";

export class ComprovantesLocal implements ArmazemComprovantes {
  constructor(
    private base: string,
    private pastaRaiz: string,
  ) {}

  async enviar(a: ArquivoComprovante) {
    const seguro = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 150) || "arquivo";
    const pasta = path.join(this.base, seguro(this.pastaRaiz), seguro(a.mes));
    fs.mkdirSync(pasta, { recursive: true });
    let destino = path.join(pasta, seguro(a.nome));
    for (let i = 2; fs.existsSync(destino); i++) {
      const ext = path.extname(a.nome);
      destino = path.join(pasta, `${seguro(path.basename(a.nome, ext))} (${i})${ext}`);
    }
    fs.writeFileSync(destino, a.bytes);
    const rel = path.relative(this.base, destino).split(path.sep).join("/");
    return { id: rel, link: `demo://${rel}` };
  }
}
