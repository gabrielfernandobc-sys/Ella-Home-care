/** Roda uma vez quando o servidor local inicia: retoma a fila e agenda a limpeza de arquivos antigos. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { fila } = await import("./lib/servidor/fila");
  const { agendarLimpeza } = await import("./lib/servidor/limpeza");
  try {
    fila();
    agendarLimpeza();
  } catch (e) {
    console.error("[inicio]", (e as Error).message);
  }
}
