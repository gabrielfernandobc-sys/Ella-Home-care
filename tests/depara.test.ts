import { describe, expect, it } from "vitest";
import { completarCnpj, formatarCnpj } from "@/lib/cnpj";
import {
  chaveDePara,
  CONFIRMACOES_PARA_CONFIAR,
  fornecedoresPorCnpj,
  parecidos,
  TabelaDePara,
  type RegraDePara,
} from "@/lib/depara";

const CNPJ = formatarCnpj(completarCnpj("556667770001"));

const regra = (r: Partial<RegraDePara> & Pick<RegraDePara, "campo" | "de" | "para">): RegraDePara => ({
  base: r.campo,
  origem: "usuaria",
  confirmacoes: 0,
  ...r,
  de: chaveDePara(r.base ?? r.campo, r.de),
});

describe("de/para exato", () => {
  const t = new TabelaDePara([regra({ campo: "descricao", de: "DIPIRONA 500MG C/10 CP", para: "Dipirona 500 mg" })]);
  it("aplica ignorando maiúsculas, acentos e pontuação", () => {
    const r = t.aplicar({ descricao: "Dipirona 500mg c/10 cp." });
    expect(r.valores.descricao).toBe("Dipirona 500 mg");
    expect(r.aplicados[0]).toMatchObject({ tipo: "exato", confiavel: false });
  });
  it("fica confiável depois de confirmada", () => {
    const t2 = new TabelaDePara([
      regra({ campo: "descricao", de: "DIPIRONA 500MG C/10 CP", para: "Dipirona 500 mg", confirmacoes: CONFIRMACOES_PARA_CONFIAR }),
    ]);
    expect(t2.aplicar({ descricao: "DIPIRONA 500MG C/10 CP" }).aplicados[0].confiavel).toBe(true);
  });
});

describe("de/para parecido", () => {
  const t = new TabelaDePara([
    regra({ campo: "descricao", de: "DIPIRONA 500MG C/10 CP", para: "Dipirona 500 mg" }),
    regra({ campo: "descricao", de: "LUVA PROCED LATEX M C/100", para: "Luva de procedimento M" }),
  ]);

  it("aplica em texto parecido com os mesmos números, e nunca como confiável", () => {
    const r = t.aplicar({ descricao: "DIPIRONA SODICA 500MG C/10 CP" });
    expect(r.valores.descricao).toBe("Dipirona 500 mg");
    expect(r.aplicados[0]).toMatchObject({ tipo: "parecido", confiavel: false });
  });

  it("aceita pequenas diferenças de escrita", () => {
    expect(t.aplicar({ descricao: "LUVA PROCEDIMENTO LATEX M C/100" }).valores.descricao).toBe("Luva de procedimento M");
  });

  it("NUNCA troca dosagem, quantidade ou tamanho", () => {
    expect(t.aplicar({ descricao: "DIPIRONA 1G C/10 CP" }).aplicados).toEqual([]);
    expect(t.aplicar({ descricao: "DIPIRONA 500MG C/20 CP" }).aplicados).toEqual([]);
    expect(t.aplicar({ descricao: "LUVA PROCED LATEX G C/100" }).aplicados).toEqual([]);
    expect(t.aplicar({ descricao: "LUVA PROCED LATEX M C/50" }).aplicados).toEqual([]);
  });

  it("tabela de casos: aproxima o que é o mesmo produto, recusa o que muda o sentido", () => {
    const c = (x: string) => chaveDePara("descricao", x);
    const iguais: [string, string][] = [
      ["DIPIRONA 500MG C/10 CP", "DIPIRONA SODICA 500MG C/10 CP"],
      ["DIPIRONA 500MG C/10 CP", "DIPIRONA 500 MG CX C/10 COMP"],
      ["SERINGA DESC 5ML S/AGULHA", "SERINGA DESCARTAVEL 5ML SEM AGULHA"],
      ["LUVA PROCED LATEX M C/100", "LUVA PROCEDIMENTO LATEX M C/100"],
    ];
    const diferentes: [string, string][] = [
      ["SERINGA DESC 5ML S/AGULHA", "SERINGA DESC 5ML C/AGULHA"],
      ["GAZE ESTERIL 7,5X7,5 PCT C/10", "GAZE NAO ESTERIL 7,5X7,5 PCT C/10"],
      ["DIPIRONA 500MG C/10 CP", "DIPIRONA 500MG C/10 CAPS"],
      ["SORO FISIOLOGICO 0,9% 500ML", "SORO GLICOSADO 5% 500ML"],
      ["AGULHA 25X7", "AGULHA 25X8"],
      ["LUVA NITRILICA M C/100", "LUVA LATEX M C/100"],
    ];
    for (const [a, b] of iguais) expect(parecidos(c(a), c(b)), `${a} ~ ${b}`).toBeGreaterThanOrEqual(0.72);
    for (const [a, b] of diferentes) expect(parecidos(c(a), c(b)), `${a} ~ ${b}`).toBe(0);
  });

  it("fornecedor nunca é corrigido por aproximação (só por CNPJ ou texto exato)", () => {
    const t2 = new TabelaDePara([regra({ campo: "fornecedor", de: "FARMACIA BETA FICTICIA LTDA", para: "Farmácia Beta" })]);
    expect(t2.aplicar({ fornecedor: "FARMACIA BETA FICTICIA LTDA ME" }).aplicados).toEqual([]);
    expect(t2.aplicar({ fornecedor: "Farmácia Beta Fictícia Ltda" }).valores.fornecedor).toBe("Farmácia Beta");
  });

  it("não confunde produtos diferentes", () => {
    expect(t.aplicar({ descricao: "PARACETAMOL 500MG C/10 CP" }).aplicados).toEqual([]);
    expect(parecidos(chaveDePara("descricao", "GAZE ESTERIL"), chaveDePara("descricao", "LUVA ESTERIL"))).toBe(0);
  });
});

describe("fornecedor pelo CNPJ e categoria pela descrição", () => {
  const t = new TabelaDePara([
    regra({ campo: "fornecedor", base: "cnpj", de: CNPJ, para: "Distribuidora Alfa", origem: "planilha" }),
    regra({ campo: "categoria", base: "descricao", de: "ALCOOL 70% 1L", para: "limpeza" }),
  ]);
  it("usa o nome do fornecedor que a planilha usa para o CNPJ", () => {
    const r = t.aplicar({ fornecedor: "DISTRIBUIDORA HOSPITALAR ALFA EXEMPLO LTDA", cnpj: CNPJ.replace(/\D/g, "") });
    expect(r.valores.fornecedor).toBe("Distribuidora Alfa");
    expect(r.aplicados[0].tipo).toBe("cnpj");
  });
  it("usa a categoria que a usuária escolheu antes para o item", () => {
    const r = t.aplicar({ descricao: "Álcool 70% 1L", categoria: "material de consumo" });
    expect(r.valores.categoria).toBe("limpeza");
    expect(r.aplicados[0].tipo).toBe("descricao");
  });
  it("não aplica nada sem regra", () => {
    expect(t.aplicar({ fornecedor: "Outro", cnpj: "", descricao: "x" }).aplicados).toEqual([]);
  });
});

describe("aprender com a planilha", () => {
  it("escolhe o nome mais usado para cada CNPJ", () => {
    const m = fornecedoresPorCnpj([
      { cnpj: CNPJ, fornecedor: "Distribuidora Alfa" },
      { cnpj: CNPJ, fornecedor: "Distribuidora Alfa" },
      { cnpj: CNPJ, fornecedor: "Alfa Ltda" },
      { cnpj: "123", fornecedor: "CNPJ inválido é ignorado" },
    ]);
    expect([...m.entries()]).toEqual([[CNPJ.replace(/\D/g, ""), "Distribuidora Alfa"]]);
  });
});
