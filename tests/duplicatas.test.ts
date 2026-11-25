import { describe, expect, it } from "vitest";
import { completarChaveAcesso, completarCnpj, formatarCnpj } from "@/lib/cnpj";
import { chavesDaPlanilha, chavesDocumento, hashArquivo, hashLinha, nomeBaseFornecedor } from "@/lib/duplicatas";

const CNPJ = formatarCnpj(completarCnpj("445556660001"));
const CHAVE = completarChaveAcesso("3526114455566600010055001000004567100000009");

describe("chavesDocumento", () => {
  it("usa a chave de acesso quando válida", () => {
    expect(chavesDocumento({ chave_acesso: CHAVE })).toContain(`nfe:${CHAVE}`);
    expect(chavesDocumento({ chave_acesso: "123" })).toEqual([]);
  });

  it("ignora zeros à esquerda e pontuação do número e do CNPJ", () => {
    const a = chavesDocumento({ cnpj: CNPJ, numero_nota: "000123" });
    const b = chavesDocumento({ cnpj: CNPJ.replace(/\D/g, ""), numero_nota: "123" });
    expect(a).toEqual(b);
  });

  it("CNPJ + data + valor identifica a mesma compra mesmo sem número", () => {
    const a = chavesDocumento({ cnpj: CNPJ, data_emissao: "20/11/2026", total_nota: "1.234,50" });
    const b = chavesDocumento({ cnpj: CNPJ, data_emissao: "2026-11-20", total_nota: 1234.5 });
    expect(a.length).toBe(1);
    expect(a).toEqual(b);
  });
});

describe("chavesDaPlanilha", () => {
  it("encontra notas que já estão na planilha", () => {
    const grade = {
      formulas: [],
      valores: [
        ["Data", "Fornecedor", "CNPJ", "Nº NF", "Descrição", "Valor Total"],
        ["20/11/2026", "Fornecedor Fictício", CNPJ, "123", "Luva", "R$ 20,00"],
      ],
    };
    const mapa = ["data_emissao", "fornecedor", "cnpj", "numero_nota", "descricao", "valor_total_item"] as const;
    const chaves = chavesDaPlanilha(grade, [...mapa], 1);
    const nova = chavesDocumento({ cnpj: CNPJ, numero_nota: "0123", data_emissao: "2026-11-20" });
    expect(nova.some((k) => chaves.has(k))).toBe(true);
  });
});

describe("hashes", () => {
  it("o mesmo arquivo gera o mesmo hash", () => {
    const a = new TextEncoder().encode("conteúdo fictício");
    expect(hashArquivo(a)).toBe(hashArquivo(new TextEncoder().encode("conteúdo fictício")));
    expect(hashArquivo(a)).not.toBe(hashArquivo(new TextEncoder().encode("outro")));
  });
  it("hash da linha é estável e prioriza a chave de acesso", () => {
    const k = chavesDocumento({ chave_acesso: CHAVE, cnpj: CNPJ, numero_nota: "4567" });
    expect(hashLinha(k, 0, "x")).toBe(hashLinha([...k].reverse(), 0, "y"));
    expect(hashLinha(k, 0, "x")).not.toBe(hashLinha(k, 1, "x"));
  });
});

describe("deduplicação avançada", () => {
  it("fornecedor + data + valor pega o mesmo print escrito de formas diferentes", () => {
    const a = chavesDocumento({ fornecedor: "FARMACIA BETA FICTICIA LTDA", data_emissao: "2026-11-05", total_nota: 90 });
    const b = chavesDocumento({ fornecedor: "Farmácia Beta", data_emissao: "05/11/2026", total_nota: "90,00" });
    expect(a.some((k) => b.includes(k))).toBe(true);
    expect(nomeBaseFornecedor("Papelaria Gama Demonstração ME")).toBe("papelaria gama");
    expect(nomeBaseFornecedor("ALFA S/A")).toBe("alfa");
  });

  it("soma os itens de cada nota da planilha quando não há coluna de total da nota", () => {
    const grade = {
      formulas: [],
      valores: [
        ["Data", "Fornecedor", "Descrição", "Qtd", "Unitário", "Total"],
        ["05/11/2026", "Farmácia Beta", "Dipirona", "20", "4,50", "=fórmula"],
        ["05/11/2026", "Farmácia Beta", "Paracetamol", "15", "6,20", "=fórmula"],
        ["06/11/2026", "Papelaria Gama", "Caneta", "1", "2,00", ""],
      ],
    };
    // A coluna "Total" é fórmula (não mapeada): usa quantidade x unitário.
    const mapa = ["data_emissao", "fornecedor", "descricao", "quantidade", "valor_unitario", null];
    const chaves = chavesDaPlanilha(grade, mapa as never, 1);
    const nota = chavesDocumento({ fornecedor: "FARMACIA BETA FICTICIA LTDA", data_emissao: "2026-11-05", total_nota: 183 });
    expect(nota.some((k) => chaves.has(k))).toBe(true);
    const outra = chavesDocumento({ fornecedor: "Farmácia Beta", data_emissao: "2026-11-05", total_nota: 90 });
    expect(outra.some((k) => chaves.has(k))).toBe(false);
  });

  it("PDF salvo de novo tem a mesma assinatura de texto", async () => {
    const { assinaturaTexto } = await import("@/lib/extracao/pdf");
    const texto = "DANFE ".repeat(10) + "EMITENTE FICTICIO 1.234,56 ".repeat(10);
    expect(assinaturaTexto(`--- Página 1 ---\n${texto}`)).toBe(assinaturaTexto(`--- Página 1 ---\n  ${texto.toLowerCase()}  `));
    expect(assinaturaTexto("curto")).toBeNull();
  });
});
