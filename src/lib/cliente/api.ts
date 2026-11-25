/** Chamadas do navegador para o servidor local. */
export async function api<T>(caminho: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
  const r = await fetch(caminho, {
    method: opcoes.metodo ?? (opcoes.corpo === undefined ? "GET" : "POST"),
    headers: opcoes.corpo === undefined ? undefined : { "Content-Type": "application/json" },
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    cache: "no-store",
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((dados as { erro?: string }).erro || `Erro ${r.status}`);
  return dados as T;
}

/** Envia um arquivo com barra de progresso. */
export function enviarArquivo(
  loteId: string,
  arquivo: File,
  nome: string,
  aoProgredir: (fracao: number) => void,
): Promise<{ id: string; status: string; erro: string | null }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("nome", nome);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/lotes/${loteId}/arquivos`);
    xhr.upload.onprogress = (e) => e.lengthComputable && aoProgredir(e.loaded / e.total);
    xhr.onload = () => {
      let dados: { erro?: string } = {};
      try {
        dados = JSON.parse(xhr.responseText);
      } catch {
        /* resposta vazia */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(dados as never);
      else reject(new Error(dados.erro || `Erro ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Falha de conexão com o app. Ele ainda está aberto?"));
    xhr.send(form);
  });
}
