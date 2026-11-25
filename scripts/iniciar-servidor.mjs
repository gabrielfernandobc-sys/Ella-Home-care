/**
 * Inicia o app só neste computador (127.0.0.1) e abre o navegador quando estiver pronto.
 * Usado por "npm start", iniciar.bat e iniciar.command.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(raiz);

// Lê a PORTA do .env (o Next também lê o .env sozinho para o resto).
let porta = Number(process.env.PORTA) || 3000;
try {
  const env = fs.readFileSync(path.join(raiz, ".env"), "utf8");
  const m = env.match(/^\s*PORTA\s*=\s*(\d+)/m);
  if (m) porta = Number(m[1]);
} catch {
  /* sem .env: usa 3000 */
}

const url = `http://localhost:${porta}`;
const next = path.join(raiz, "node_modules", "next", "dist", "bin", "next");
const filho = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", String(porta)], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORTA: String(porta),
    NODE_ENV: "production",
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--disable-warning=ExperimentalWarning"].filter(Boolean).join(" "),
  },
});

function abrirNavegador() {
  if (process.env.NAO_ABRIR_NAVEGADOR) return;
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => undefined).unref();
}

async function esperarPronto() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/estado`);
      if (r.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

esperarPronto().then((ok) => {
  if (ok) {
    console.log(`\n  ✅ Compras Express aberto em ${url}`);
    console.log("  Deixe esta janela aberta enquanto usa o app. Para fechar, feche esta janela.\n");
    abrirNavegador();
  } else {
    console.log(`\n  ⚠️  O app demorou para abrir. Tente acessar ${url} no navegador.\n`);
  }
});

for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => filho.kill(sinal));
filho.on("exit", (codigo) => process.exit(codigo ?? 0));
