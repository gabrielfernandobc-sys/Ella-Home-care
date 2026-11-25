/**
 * Dados 100% INVENTADOS para testes e demonstração.
 * Nenhum fornecedor, CNPJ, nota ou valor aqui é real. Os CNPJs foram gerados
 * só para passar na validação do dígito verificador; qualquer coincidência
 * com uma empresa real é acidental.
 */
import { completarChaveAcesso, completarCnpj } from "../cnpj";

export interface ItemFicticio {
  descricao: string;
  ncm: string;
  unidade: string;
  quantidade: number;
  unitario: number;
}

export interface NotaFicticia {
  numero: string;
  data: string; // AAAA-MM-DD
  fornecedor: string;
  cnpj: string; // 14 dígitos
  uf: string;
  itens: ItemFicticio[];
  frete?: number;
  desconto?: number;
  pagamento: string; // código tPag
  modelo?: "55" | "65";
}

export const FORNECEDORES = {
  alfa: { nome: "Distribuidora Hospitalar Alfa Exemplo Ltda", cnpj: completarCnpj("112223330001"), uf: "35" },
  beta: { nome: "Farmácia Beta Fictícia Ltda", cnpj: completarCnpj("223334440001"), uf: "35" },
  gama: { nome: "Papelaria Gama Demonstração ME", cnpj: completarCnpj("334445550001"), uf: "33" },
  delta: { nome: "Delta Produtos de Limpeza Teste Ltda", cnpj: completarCnpj("445556660001"), uf: "31" },
};

export const NOTAS: NotaFicticia[] = [
  {
    numero: "1201",
    data: "2026-11-03",
    fornecedor: FORNECEDORES.alfa.nome,
    cnpj: FORNECEDORES.alfa.cnpj,
    uf: FORNECEDORES.alfa.uf,
    pagamento: "15",
    frete: 12.5,
    itens: [
      { descricao: "LUVA PROCED LATEX M C/100", ncm: "40151900", unidade: "CX", quantidade: 10, unitario: 32.9 },
      { descricao: "SERINGA DESC 5ML S/AGULHA", ncm: "90183119", unidade: "UN", quantidade: 200, unitario: 0.38 },
      { descricao: "GAZE ESTERIL 7,5X7,5 PCT C/10", ncm: "30059090", unidade: "PCT", quantidade: 50, unitario: 1.75 },
    ],
  },
  {
    numero: "88342",
    data: "2026-11-05",
    fornecedor: FORNECEDORES.beta.nome,
    cnpj: FORNECEDORES.beta.cnpj,
    uf: FORNECEDORES.beta.uf,
    pagamento: "17",
    desconto: 3,
    itens: [
      { descricao: "DIPIRONA 500MG C/10 CP", ncm: "30049099", unidade: "CX", quantidade: 20, unitario: 4.5 },
      { descricao: "PARACETAMOL 750MG C/20 CP", ncm: "30049099", unidade: "CX", quantidade: 15, unitario: 6.2 },
      { descricao: "SORO FISIOLOGICO 0,9% 500ML", ncm: "30049099", unidade: "FR", quantidade: 24, unitario: 5.1 },
    ],
  },
  {
    numero: "455",
    data: "2026-11-10",
    fornecedor: FORNECEDORES.delta.nome,
    cnpj: FORNECEDORES.delta.cnpj,
    uf: FORNECEDORES.delta.uf,
    pagamento: "03",
    itens: [
      { descricao: "AGUA SANITARIA 5L", ncm: "28289011", unidade: "GL", quantidade: 6, unitario: 14.9 },
      { descricao: "DETERGENTE NEUTRO 500ML", ncm: "34022000", unidade: "UN", quantidade: 24, unitario: 2.35 },
    ],
  },
];

export const totalItens = (n: NotaFicticia) =>
  Math.round(n.itens.reduce((s, i) => s + Math.round(i.quantidade * i.unitario * 100), 0)) / 100;

export const totalNota = (n: NotaFicticia) =>
  Math.round((totalItens(n) + (n.frete ?? 0) - (n.desconto ?? 0)) * 100) / 100;

export function chaveDaNota(n: NotaFicticia): string {
  const [a, m] = n.data.split("-");
  const base =
    n.uf +
    a.slice(2) +
    m +
    n.cnpj +
    (n.modelo ?? "55") +
    "001" +
    n.numero.padStart(9, "0") +
    "1" +
    n.numero.padStart(8, "0");
  return completarChaveAcesso(base);
}

const f2 = (v: number) => v.toFixed(2);

/** Monta um XML de NF-e fictício no layout 4.00 (só os campos que o app lê). */
export function montarXmlNfe(n: NotaFicticia): string {
  const chave = chaveDaNota(n);
  const dets = n.itens
    .map(
      (i, k) => `
      <det nItem="${k + 1}">
        <prod>
          <cProd>${1000 + k}</cProd>
          <xProd>${i.descricao}</xProd>
          <NCM>${i.ncm}</NCM>
          <CFOP>5102</CFOP>
          <uCom>${i.unidade}</uCom>
          <qCom>${i.quantidade.toFixed(4)}</qCom>
          <vUnCom>${i.unitario.toFixed(10)}</vUnCom>
          <vProd>${f2(Math.round(i.quantidade * i.unitario * 100) / 100)}</vProd>
        </prod>
      </det>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide>
        <cUF>${n.uf}</cUF>
        <mod>${n.modelo ?? "55"}</mod>
        <serie>1</serie>
        <nNF>${n.numero}</nNF>
        <dhEmi>${n.data}T10:15:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>${n.cnpj}</CNPJ>
        <xNome>${n.fornecedor}</xNome>
      </emit>
      <dest>
        <CNPJ>00000000000000</CNPJ>
        <xNome>DESTINATARIO FICTICIO</xNome>
      </dest>${dets}
      <total>
        <ICMSTot>
          <vProd>${f2(totalItens(n))}</vProd>
          <vFrete>${f2(n.frete ?? 0)}</vFrete>
          <vDesc>${f2(n.desconto ?? 0)}</vDesc>
          <vNF>${f2(totalNota(n))}</vNF>
        </ICMSTot>
      </total>
      <pag><detPag><tPag>${n.pagamento}</tPag><vPag>${f2(totalNota(n))}</vPag></detPag></pag>
      <infAdic><infCpl>Paciente: NOME FICTICIO - nao deve ser lido</infCpl></infAdic>
    </infNFe>
  </NFe>
  <protNFe versao="4.00"><infProt><chNFe>${chave}</chNFe></infProt></protNFe>
</nfeProc>
`;
}

/** Planilha modelo (cabeçalho + 3 linhas fictícias + totais). */
export const PLANILHA_MODELO: (string | number)[][] = [
  [
    "Data",
    "Fornecedor",
    "CNPJ",
    "Nº NF",
    "Descrição",
    "Categoria",
    "Qtd",
    "Un",
    "Valor Unitário",
    "Valor Total",
    "Setor",
    "Arquivo de origem",
    "Lote",
    "Comprovante",
  ],
  ["28/10/2026", "Papelaria Gama Demonstração ME", "33.444.555/0001-" + completarCnpj("334445550001").slice(12), 310, "Papel A4 75g resma", "escritório", 5, "RS", 27.9, "=G2*I2", "Administração", "exemplo-1.pdf", "exemplo", ""],
  ["29/10/2026", "Farmácia Beta Fictícia Ltda", "22.333.444/0001-" + completarCnpj("223334440001").slice(12), 88100, "Dipirona 500 mg", "medicamento", 10, "CX", 4.5, "=G3*I3", "Enfermagem", "exemplo-2.xml", "exemplo", ""],
  ["30/10/2026", "Distribuidora Hospitalar Alfa Exemplo Ltda", "11.222.333/0001-" + completarCnpj("112223330001").slice(12), 1190, "Luva de procedimento M", "material de consumo", 4, "CX", 32.9, "=G4*I4", "Enfermagem", "exemplo-3.jpg", "exemplo", ""],
  ["TOTAL", "", "", "", "", "", "", "", "", "=SOMA(J2:J4)", "", "", "", ""],
];
