import { describe, expect, it } from "vitest";
import { chaveAcessoValida, cnpjValido, completarChaveAcesso, completarCnpj, formatarCnpj } from "@/lib/cnpj";
import { parseData, parseNumero } from "@/lib/texto";
import { corDaLinha, validarDocumento, type OpcoesValidacao } from "@/lib/validacao";

// CNPJ fictício gerado só para teste (base inventada + dígitos calculados).
const CNPJ_OK = formatarCnpj(completarCnpj("112223330001"));

const opcoes: OpcoesValidacao = {
  hoje: "2026-11-25",
  obrigatorios: ["data_emissao", "fornecedor", "descricao", "valor_total_item"],
  granularidade: "item",
};

const linha = (valores: Record<string, unknown>, confianca: Record<string, string> = {}) => ({
  valores: {
    data_emissao: "2026-11-20",
    fornecedor: "Fornecedor Fictício Ltda",
    cnpj: CNPJ_OK,
    descricao: "Luva de procedimento M",
    quantidade: 2,
    valor_unitario: 10,
    valor_total_item: 20,
    total_nota: 20,
    ...valores,
  } as never,
  confianca: confianca as never,
});

describe("CNPJ e chave de acesso", () => {
  it("valida dígito verificador do CNPJ", () => {
    expect(cnpjValido(CNPJ_OK)).toBe(true);
    expect(cnpjValido("11.222.333/0001-00")).toBe(false);
    expect(cnpjValido("00.000.000/0000-00")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
  });
  it("aceita o CNPJ alfanumérico (2026)", () => {
    // Exemplo publicado pela Receita Federal para o novo formato.
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
  });
  it("valida a chave de acesso de 44 dígitos", () => {
    const chave = completarChaveAcesso("3526111122233300019955001000000123100000001");
    expect(chaveAcessoValida(chave)).toBe(true);
    expect(chaveAcessoValida(chave.slice(0, 43) + ((Number(chave[43]) + 1) % 10))).toBe(false);
  });
});

describe("números e datas no padrão brasileiro", () => {
  it("lê valores em reais", () => {
    expect(parseNumero("1.234,56")).toBe(1234.56);
    expect(parseNumero("R$ 12,50")).toBe(12.5);
    expect(parseNumero("12.5")).toBe(12.5);
    expect(parseNumero("1.234")).toBe(1234);
    expect(parseNumero("0.500")).toBe(0.5);
    expect(parseNumero("abc")).toBeNull();
  });
  it("lê datas", () => {
    expect(parseData("25/11/2026")).toBe("2026-11-25");
    expect(parseData("2026-11-25T10:00:00-03:00")).toBe("2026-11-25");
    expect(parseData("31/02/2026")).toBeNull();
    expect(parseData("5/1/26")).toBe("2026-01-05");
  });
});

describe("validarDocumento", () => {
  it("documento correto fica verde", () => {
    const [p] = validarDocumento([linha({})], {}, opcoes);
    expect(p).toEqual([]);
    expect(corDaLinha(p, false)).toBe("verde");
  });

  it("soma dos itens diferente do total da nota fica amarelo", () => {
    const res = validarDocumento([linha({ total_nota: 50 }), linha({ total_nota: 50 })], {}, opcoes);
    expect(res[0].some((x) => /soma dos itens/i.test(x.mensagem))).toBe(true);
    expect(corDaLinha(res[0], false)).toBe("amarelo");
  });

  it("considera frete e desconto na soma", () => {
    const res = validarDocumento([linha({ total_nota: 25 })], { frete: 7, desconto: 2 }, opcoes);
    expect(res[0]).toEqual([]);
  });

  it("quantidade x unitário diferente do total do item fica amarelo", () => {
    const [p] = validarDocumento([linha({ quantidade: 3, total_nota: 20 })], {}, opcoes);
    expect(p.some((x) => /Quantidade × unitário/.test(x.mensagem))).toBe(true);
  });

  it("CNPJ inválido e data futura ficam vermelho", () => {
    const [p] = validarDocumento([linha({ cnpj: "11.222.333/0001-00", data_emissao: "2027-01-10" })], {}, opcoes);
    expect(p.filter((x) => x.nivel === "erro")).toHaveLength(2);
    expect(corDaLinha(p, false)).toBe("vermelho");
  });

  it("data muito antiga ou fora do mês esperado vira aviso", () => {
    const [p] = validarDocumento([linha({ data_emissao: "2025-01-10" })], {}, { ...opcoes, mesReferencia: "2026-11" });
    expect(p.filter((x) => x.campo === "data_emissao")).toHaveLength(2);
  });

  it("campo obrigatório vazio vira aviso (nunca inventa valor)", () => {
    const [p] = validarDocumento([linha({ fornecedor: null })], {}, opcoes);
    expect(p.some((x) => x.mensagem === "Falta: Fornecedor.")).toBe(true);
    expect(corDaLinha(p, false)).toBe("amarelo");
  });

  it("leitura incerta da IA vira aviso só nos campos mapeados", () => {
    const l = linha({}, { valor_unitario: "media", observacoes: "baixa" });
    l.valores = { ...(l.valores as object), observacoes: "texto" } as never;
    const [p] = validarDocumento([l], {}, { ...opcoes, camposMapeados: ["valor_unitario", "descricao"] });
    expect(p.map((x) => x.mensagem)).toEqual(["Leitura incerta: Valor unitário."]);
  });

  it("duplicata sempre fica vermelha", () => {
    expect(corDaLinha([], true)).toBe("vermelho");
  });
});
