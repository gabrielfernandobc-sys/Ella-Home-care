// Junta a lógica e o servidor num único arquivo para colar no Apps Script (apps-script/dist).
import fs from "node:fs";
import path from "node:path";

const raiz = path.join(import.meta.dirname, "..");
const src = path.join(raiz, "apps-script/src");
const dist = path.join(raiz, "apps-script/dist");

export function gerarCodigo() {
  const aviso =
    "// Compras Express — versão gratuita para celular.\n" +
    "// ARQUIVO GERADO por `npm run apps-script`. Copie TUDO e cole no arquivo Código.gs do Apps Script.\n\n";
  return aviso + fs.readFileSync(path.join(src, "Logica.js"), "utf8") + "\n\n" + fs.readFileSync(path.join(src, "Servidor.js"), "utf8");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, "Codigo.gs"), gerarCodigo());
  fs.copyFileSync(path.join(src, "Index.html"), path.join(dist, "Index.html"));
  console.log("Gerado: apps-script/dist/Codigo.gs e apps-script/dist/Index.html");
}
