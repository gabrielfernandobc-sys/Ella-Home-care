/** Tela "Verificar configuração": teste da IA com o print fictício (IA simulada aqui) e nada de segredo exposto. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RespostaExtracao } from "@/lib/extracao/schema";

process.env.DADOS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "compras-verif-"));
process.env.ANTHROPIC_API_KEY = "chave-ficticia-para-teste";
process.env.GOOGLE_CLIENT_ID = "id-ficticio";
process.env.GOOGLE_CLIENT_SECRET = "segredo-ficticio";

const conf = { descricao: "alta", quantidade: "alta", unidade: "alta", valor_unitario: "alta", valor_total: "alta", categoria: "alta" } as const;
let resposta: RespostaExtracao;
vi.mock("@/lib/extracao/ia", () => ({
  iaConfigurada: () => true,
  ErroIA: class extends Error {},
  extrairComIA: vi.fn(async () => resposta),
}));

const doc = (total: number) => ({
  legivel: true,
  aviso: null,
  documentos: [
    {
      tipo_documento: "outro" as const,
      data_emissao: "2026-11-21",
      fornecedor: "Papelaria Gama Demonstração ME",
      cnpj: null,
      numero_nota: "2290",
      chave_acesso: null,
      total_nota: total,
      valor_frete: null,
      valor_desconto: null,
      forma_pagamento: null,
      centro_custo: null,
      observacoes: null,
      itens: [
        { descricao: "Caneta esferográfica azul cx/50", quantidade: 2, unidade: null, valor_unitario: 42, valor_total: 84, categoria: "escritório" as const, confianca: conf },
        { descricao: "Papel A4 75g resma 500fl", quantidade: 10, unidade: null, valor_unitario: 27.9, valor_total: 279, categoria: "escritório" as const, confianca: conf },
      ],
      confianca: { data_emissao: "alta", fornecedor: "alta", cnpj: "baixa", numero_nota: "alta", total_nota: "alta", forma_pagamento: "baixa" } as const,
    },
  ],
});

describe("verificar configuração", () => {
  it("mostra o que está configurado sem expor nenhum segredo", async () => {
    const { verificarConfiguracao } = await import("@/lib/servidor/verificacao");
    const v = verificarConfiguracao();
    expect(v.google.configurado).toBe(true);
    expect(v.ia.configurada).toBe(true);
    expect(v.google.enderecoRetorno).toMatch(/^http:\/\/localhost:\d+\/api\/auth\/google\/retorno$/);
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/segredo-ficticio|chave-ficticia|id-ficticio/);
  });

  it("confere a leitura da IA com o que o print de exemplo realmente contém", async () => {
    const { testarIA } = await import("@/lib/servidor/verificacao");
    resposta = doc(363);
    const ok = await testarIA();
    expect(ok.ok).toBe(true);
    expect(ok.conferencia!.every((c) => c.ok)).toBe(true);
    resposta = doc(336); // leitura errada do total
    const errado = await testarIA();
    expect(errado.conferencia!.find((c) => c.campo === "Total")!.ok).toBe(false);
    expect(errado.mensagem).toMatch(/Acertou 6 de 7/);
  });
});
