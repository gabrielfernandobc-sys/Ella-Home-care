// Compras Express — versão gratuita para celular.
// ARQUIVO GERADO por `npm run apps-script`. Copie TUDO e cole no arquivo Código.gs do Apps Script.

/**
 * Compras Express — versão gratuita para celular (Google Apps Script).
 * LÓGICA PURA: roda igual no Apps Script e no Node (testes em tests/apps-script.test.ts).
 * Nada aqui acessa a planilha, o Drive ou a internet.
 *
 * Regras inegociáveis (as mesmas do app completo):
 * - nunca inventar valor: o que não dá para ler fica vazio e amarelo;
 * - nada é gravado sem aprovação; só acrescenta linhas; dá para desfazer o último lote.
 */

// ---------------------------------------------------------------- texto, números, datas

function ceNormalizar(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[º°ª]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function ceDigitos(s) {
  return s === null || s === undefined ? "" : String(s).replace(/\D/g, "");
}

/** "1.234,56" / "1234,56" / "1234.56" / "R$ 12,50" -> número; null se não der para ter certeza. */
function ceNumero(v) {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  var s = String(v).trim().replace(/R\$\s*/i, "").replace(/\s/g, "");
  var neg = false;
  if (s.charAt(0) === "-") {
    neg = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  var virg = s.indexOf(",") >= 0;
  var ponto = s.indexOf(".") >= 0;
  if (virg && ponto) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (virg) {
    if ((s.match(/,/g) || []).length > 1) return null;
    s = s.replace(",", ".");
  } else if (ponto) {
    var p = s.split(".");
    if (p.length > 2) s = p.join("");
    else if (p[1].length === 3 && p[0].length <= 3 && p[0] !== "0") s = p.join("");
  }
  var n = Number(s);
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

function ceArred(n, casas) {
  var f = Math.pow(10, casas === undefined ? 2 : casas);
  return Math.round(n * f) / f;
}

/** Aceita AAAA-MM-DD, DD/MM/AAAA, DD/MM/AA, DD.MM.AAAA. Devolve AAAA-MM-DD ou null. */
function ceData(v) {
  if (v === null || v === undefined || v === "") return null;
  if (Object.prototype.toString.call(v) === "[object Date]") {
    if (isNaN(v.getTime())) return null;
    return v.getFullYear() + "-" + ("0" + (v.getMonth() + 1)).slice(-2) + "-" + ("0" + v.getDate()).slice(-2);
  }
  var s = String(v).trim();
  var a, m, d, r;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) {
    a = +r[1];
    m = +r[2];
    d = +r[3];
  } else if ((r = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/))) {
    d = +r[1];
    m = +r[2];
    a = +r[3];
    if (r[3].length === 2) a += 2000;
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 1990 || a > 2999) return null;
  var dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return a + "-" + ("0" + m).slice(-2) + "-" + ("0" + d).slice(-2);
}

function ceDataBR(iso) {
  var r = iso ? String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return r ? r[3] + "/" + r[2] + "/" + r[1] : iso || "";
}

function ceMoeda(n) {
  if (n === null || n === undefined || !isFinite(n)) return "";
  var s = Math.abs(n).toFixed(2).split(".");
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (n < 0 ? "-" : "") + "R$ " + s[0] + "," + s[1];
}

// ---------------------------------------------------------------- CNPJ e chave de acesso

function ceCnpjValido(v) {
  var c = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  var vals = c.split("").map(function (ch) {
    return ch.charCodeAt(0) - 48;
  });
  function dv(base) {
    var peso = 2,
      soma = 0;
    for (var i = base.length - 1; i >= 0; i--) {
      soma += base[i] * peso;
      peso = peso === 9 ? 2 : peso + 1;
    }
    var r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  }
  var d1 = dv(vals.slice(0, 12));
  var d2 = dv(vals.slice(0, 12).concat([d1]));
  return d1 === vals[12] && d2 === vals[13];
}

function ceFormatarCnpj(v) {
  var c = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (c.length !== 14) return String(v || "").trim();
  return c.slice(0, 2) + "." + c.slice(2, 5) + "." + c.slice(5, 8) + "/" + c.slice(8, 12) + "-" + c.slice(12);
}

function ceChaveValida(chave) {
  var c = ceDigitos(chave);
  if (c.length !== 44) return false;
  var peso = 2,
    soma = 0;
  for (var i = 42; i >= 0; i--) {
    soma += Number(c[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  var r = soma % 11;
  return (r < 2 ? 0 : 11 - r) === Number(c[43]);
}

/** A chave de acesso traz CNPJ do emitente, modelo, série e número — leitura 100% confiável. */
function ceDadosDaChave(chave) {
  var c = ceDigitos(chave);
  if (!ceChaveValida(c)) return null;
  return {
    chave: c,
    anoMes: "20" + c.slice(2, 4) + "-" + c.slice(4, 6),
    cnpj: c.slice(6, 20),
    modelo: c.slice(20, 22),
    serie: String(Number(c.slice(22, 25))),
    numero: String(Number(c.slice(25, 34))),
  };
}

// ---------------------------------------------------------------- categoria

var CE_PALAVRAS = [
  ["material de consumo", ["luva", "seringa", "agulha", "gaze", "atadura", "esparadrapo", "mascara", "algodao", "sonda", "cateter", "curativo", "fralda", "equipo", "scalp", "coletor", "touca", "avental", "abaixador", "termometro", "micropore", "compressa", "lanceta"]],
  ["medicamento", ["comprimido", "capsula", "ampola", "xarope", "gotas", "pomada", "injetavel", "dipirona", "paracetamol", "ibuprofeno", "amoxicilina", "insulina", "losartana", "omeprazol", "soro fisiologico", "metformina", "captopril", "dexametasona"]],
  ["limpeza", ["detergente", "desinfetante", "agua sanitaria", "sabao", "sabonete", "hipoclorito", "saco de lixo", "saco lixo", "papel toalha", "papel higienico", "limpador", "multiuso", "vassoura", "alcool 70", "alcool gel", "esponja"]],
  ["escritório", ["papel a4", "sulfite", "caneta", "lapis", "grampeador", "grampo", "clips", "envelope", "toner", "cartucho", "etiqueta", "caderno", "borracha", "post it", "fita adesiva", "marca texto"]],
];

function ceCategoria(descricao, ncm) {
  var n = ceDigitos(ncm);
  if (n) {
    if (/^(3005|3006|4015|392620|630790|9018|9019|9025)/.test(n)) return "material de consumo";
    if (/^30/.test(n)) return "medicamento";
    if (/^(3401|3402|380894|2828|4818|392321|9603)/.test(n)) return "limpeza";
    if (/^(4802|4820|4817|9608|9609|8443|3215|8305)/.test(n)) return "escritório";
  }
  var d = " " + ceNormalizar(descricao) + " ";
  for (var i = 0; i < CE_PALAVRAS.length; i++) {
    var lista = CE_PALAVRAS[i][1];
    for (var j = 0; j < lista.length; j++) if (d.indexOf(" " + lista[j]) >= 0) return CE_PALAVRAS[i][0];
  }
  if (/\b\d+\s?(mg|mcg|ui)\b/.test(d)) return "medicamento";
  return null;
}

// ---------------------------------------------------------------- privacidade

/** Remove CPF, cartão SUS e nome de paciente de qualquer texto guardado. */
function ceMascarar(t) {
  if (!t) return t;
  return String(t)
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF removido]")
    .replace(/\b(paciente|prontu[aá]rio|leito|cart[aã]o\s+sus|cns)\b\s*[:\-]?\s*[^\n;|]*/gi, "$1: [removido]");
}

// ---------------------------------------------------------------- XML da NF-e (sem IA, 100% fiel)

function ceEntidades(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (_m, n) {
      return String.fromCharCode(Number(n));
    })
    .replace(/&amp;/g, "&");
}

function ceTag(xml, tag) {
  var r = new RegExp("<(?:\\w+:)?" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?" + tag + ">").exec(xml);
  return r ? ceEntidades(r[1].trim()) : null;
}

function ceBlocos(xml, tag) {
  var re = new RegExp("<(?:\\w+:)?" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?" + tag + ">", "g");
  var out = [],
    m;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

/** Lê o XML da NF-e/NFC-e. Destinatário e informações complementares NUNCA são lidos. */
function ceLerXml(texto) {
  if (/<!DOCTYPE|<!ENTITY/i.test(texto)) throw new Error("XML com estrutura não permitida.");
  if (!/<(?:\w+:)?infNFe[\s>]/.test(texto)) {
    if (/procEventoNFe|envEvento/.test(texto)) throw new Error("Este XML é de um evento (cancelamento ou correção), não de uma nota.");
    throw new Error("Este XML não é de uma NF-e.");
  }
  var inf = ceBlocos(texto, "infNFe")[0];
  var ide = ceTag(inf, "ide") || "";
  var emit = ceTag(inf, "emit") || "";
  var tot = ceTag(inf, "ICMSTot") || "";
  var idAttr = /<(?:\w+:)?infNFe[^>]*\sId="NFe(\d{44})"/.exec(texto);
  var chave = ceTag(texto, "chNFe") || (idAttr ? idAttr[1] : null);
  var num = function (b, t) {
    var v = ceTag(b, t);
    return v === null ? null : Number(v);
  };
  var itens = ceBlocos(inf, "det").map(function (det) {
    var p = ceTag(det, "prod") || "";
    var desc = ceTag(p, "xProd");
    return {
      descricao: desc,
      quantidade: num(p, "qCom"),
      unidade: ceTag(p, "uCom"),
      unitario: num(p, "vUnCom"),
      total: num(p, "vProd"),
      categoria: ceCategoria(desc, ceTag(p, "NCM")),
      certo: true,
    };
  });
  var acresc = ["vFrete", "vSeg", "vOutro", "vST", "vFCPST", "vIPI", "vIPIDevol", "vII"].reduce(function (s, t) {
    return s + (num(tot, t) || 0);
  }, 0);
  var cnpj = ceTag(emit, "CNPJ");
  return {
    origem: "xml",
    fornecedor: ceTag(emit, "xNome") || ceTag(emit, "xFant"),
    cnpj: cnpj ? ceFormatarCnpj(cnpj) : null,
    numero: ceTag(ide, "nNF"),
    data: ceData(ceTag(ide, "dhEmi") || ceTag(ide, "dEmi")),
    chave: chave,
    total: num(tot, "vNF"),
    acrescimos: ceArred(acresc),
    desconto: num(tot, "vDesc") || 0,
    itens: itens,
    incertos: [],
  };
}

// ---------------------------------------------------------------- texto de DANFE / print (OCR gratuito do Google Drive)

var CE_NUMERO_RE = /-?\d{1,3}(?:\.\d{3})*,\d{2,4}|-?\d+,\d{2,4}|-?\d+(?:\.\d{1,4})?/g;

/**
 * Lê o texto reconhecido (OCR) de um DANFE, cupom ou print.
 * Só aceita o que dá para conferir:
 * - chave de acesso com dígito verificador válido (dela saem CNPJ e número);
 * - CNPJ com dígito válido; data válida;
 * - total depois de um rótulo de total;
 * - item só se quantidade × unitário = total da linha.
 * O resto fica vazio e marcado para conferir (amarelo). Nunca inventa.
 */
function ceLerTexto(textoBruto) {
  var texto = ceMascarar(String(textoBruto || "").replace(/\r/g, ""));
  var linhas = texto
    .split("\n")
    .map(function (l) {
      return l.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);
  var incertos = [];

  // Chave de acesso: 44 dígitos, às vezes em grupos de 4.
  var chave = null;
  var candidatos = texto.match(/(?:\d[\s.]?){44}/g) || [];
  for (var i = 0; i < candidatos.length && !chave; i++) {
    var d = ceDigitos(candidatos[i]);
    for (var k = 0; k + 44 <= d.length && !chave; k++) if (ceChaveValida(d.slice(k, k + 44))) chave = d.slice(k, k + 44);
  }
  var daChave = chave ? ceDadosDaChave(chave) : null;

  // CNPJ: o da chave; senão o primeiro CNPJ válido (normalmente o do emitente vem primeiro).
  var cnpj = daChave ? daChave.cnpj : null;
  if (!cnpj) {
    var cs = texto.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || [];
    for (var j = 0; j < cs.length; j++)
      if (ceCnpjValido(cs[j])) {
        cnpj = ceDigitos(cs[j]);
        break;
      }
  }

  // Número da nota.
  var numero = daChave ? daChave.numero : null;
  if (!numero) {
    var rn = texto.match(/\b(?:N[º°o.]?\s*|NF-?e?\s*(?:N[º°o.]?)?\s*|NOTA\s+FISCAL\s*(?:N[º°o.]?)?\s*|PEDIDO\s*(?:N[º°o.]?)?\s*)(\d[\d.]{0,11})\b/i);
    if (rn) {
      numero = String(Number(ceDigitos(rn[1])));
      incertos.push("numero");
    }
  }

  // Data: perto de "emissão"; senão a primeira data válida.
  var data = null;
  var re = /(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/g,
    m;
  var emissao = texto.search(/emiss[aã]o/i);
  var datas = [];
  while ((m = re.exec(texto))) {
    var iso = ceData(m[1]);
    if (iso) datas.push({ iso: iso, pos: m.index });
  }
  if (datas.length) {
    if (emissao >= 0) {
      datas.sort(function (a, b) {
        return Math.abs(a.pos - emissao) - Math.abs(b.pos - emissao);
      });
    }
    data = datas[0].iso;
    if (emissao < 0 && datas.length > 1) incertos.push("data");
  }

  // Total: valor logo após um rótulo de total (preferindo "total da nota").
  var total = null;
  var rotulos = [/valor\s+total\s+da\s+nota/i, /total\s+da\s+nota/i, /valor\s+a\s+pagar/i, /total\s+do\s+pedido/i, /valor\s+total/i, /\btotal\b/i];
  for (var r = 0; r < rotulos.length && total === null; r++) {
    for (var li = 0; li < linhas.length && total === null; li++) {
      if (!rotulos[r].test(linhas[li])) continue;
      var resto = linhas[li].split(rotulos[r])[1] || "";
      var nums = (resto.match(CE_NUMERO_RE) || []).filter(function (x) {
        return x.indexOf(",") >= 0;
      });
      // Só "total da nota" pode ter o valor na linha de baixo (layout do DANFE); os outros, na mesma linha.
      if (!nums.length && r < 2 && li + 1 < linhas.length) {
        nums = (linhas[li + 1].match(CE_NUMERO_RE) || []).filter(function (x) {
          return x.indexOf(",") >= 0;
        });
      }
      if (nums.length) total = ceNumero(nums[0]);
    }
  }

  // Fornecedor: linha após "emitente"/"razão social", ou uma linha com Ltda/ME/EIRELI/S.A.
  var fornecedor = null;
  for (var f = 0; f < linhas.length && !fornecedor; f++) {
    var L = linhas[f];
    if (/^(emitente|raz[aã]o social|fornecedor)\s*:?\s*$/i.test(L) && linhas[f + 1]) fornecedor = linhas[f + 1];
    else if (/^(emitente|raz[aã]o social|fornecedor)\s*:\s*(.+)$/i.test(L)) fornecedor = L.replace(/^[^:]+:\s*/, "");
  }
  for (var g = 0; g < linhas.length && !fornecedor; g++) {
    if (/\b(ltda|eireli|me|epp|s\/?a)\b\.?/i.test(linhas[g]) && !/destinat|cliente|comprador/i.test(linhas[g]) && linhas[g].length < 90) {
      // Num título como "Sistema — Empresa X Ltda", fica só o pedaço com Ltda/ME/etc.
      var partes = linhas[g].replace(/^.*?:\s*/, "").split(/\s[—–-]\s|\s·\s|\|/);
      fornecedor = partes.filter(function (pt) { return /\b(ltda|eireli|me|epp|s\/?a)\b/i.test(pt); })[0] || partes[0];
    }
  }
  if (fornecedor) {
    fornecedor = fornecedor.replace(/\s*CNPJ.*$/i, "").trim();
    incertos.push("fornecedor");
  }

  // Itens: linhas que terminam com quantidade, unitário e total, e que CONFEREM (qtd × unit = total).
  var itens = [];
  for (var t = 0; t < linhas.length; t++) {
    var linha = linhas[t].replace(/R\$\s*/g, "");
    var ns = linha.match(CE_NUMERO_RE);
    if (!ns || ns.length < 3) continue;
    var tot = ceNumero(ns[ns.length - 1]);
    var unit = ceNumero(ns[ns.length - 2]);
    var qtd = ceNumero(ns[ns.length - 3]);
    if (tot === null || unit === null || qtd === null || qtd <= 0 || tot <= 0) continue;
    if (Math.abs(qtd * unit - tot) > Math.max(0.02, tot * 0.005)) continue;
    var pos = linha.lastIndexOf(ns[ns.length - 3]);
    var desc = linha
      .slice(0, pos)
      .replace(/\b(UN|UND|CX|PCT|FR|GL|KG|L|RS|PC|M)\b\s*$/i, function (u) {
        return " " + u;
      })
      .trim();
    var un = null;
    var mu = desc.match(/\s(UN|UND|CX|PCT|FR|GL|KG|L|RS|PC|M)$/i);
    if (mu) {
      un = mu[1].toUpperCase();
      desc = desc.slice(0, mu.index).trim();
    }
    desc = desc.replace(/^\d+\s+/, "").replace(/[|•·]+/g, " ").trim();
    if (desc.length < 3 || /total|subtotal|desconto|frete/i.test(desc)) continue;
    itens.push({ descricao: desc, quantidade: qtd, unidade: un, unitario: unit, total: tot, categoria: ceCategoria(desc, null), certo: true });
  }

  return {
    origem: "texto",
    fornecedor: fornecedor,
    cnpj: cnpj ? ceFormatarCnpj(cnpj) : null,
    numero: numero,
    data: data,
    chave: chave,
    total: total,
    acrescimos: 0,
    desconto: 0,
    itens: itens,
    incertos: incertos,
  };
}

// ---------------------------------------------------------------- linhas, validação e cores

var CE_CAMPOS = [
  ["data", "Data da compra"],
  ["fornecedor", "Fornecedor"],
  ["cnpj", "CNPJ"],
  ["numero", "Número da nota"],
  ["chave", "Chave de acesso"],
  ["descricao", "Descrição do item"],
  ["categoria", "Categoria"],
  ["quantidade", "Quantidade"],
  ["unidade", "Unidade"],
  ["unitario", "Valor unitário"],
  ["total_item", "Valor total do item"],
  ["total_nota", "Total da nota"],
  ["arquivo", "Arquivo de origem"],
  ["lote", "ID do lote"],
];

var CE_OBRIGATORIOS = ["data", "fornecedor", "descricao", "total_item"];

/** Uma linha por item (ou uma por nota). Campos que não foram lidos ficam null. */
function ceLinhasDoDocumento(doc, opcoes) {
  var base = {
    data: doc.data,
    fornecedor: doc.fornecedor,
    cnpj: doc.cnpj,
    numero: doc.numero,
    chave: doc.chave,
    total_nota: doc.total,
    arquivo: opcoes.arquivo,
    lote: opcoes.lote,
  };
  if (opcoes.granularidade === "nota") {
    var nomes = doc.itens.map(function (i) {
      return i.descricao;
    });
    return [
      Object.assign({}, base, {
        descricao: nomes.length ? nomes.slice(0, 3).join("; ") + (nomes.length > 3 ? " e mais " + (nomes.length - 3) : "") : null,
        categoria: doc.itens.length ? doc.itens[0].categoria : null,
        quantidade: null,
        unidade: null,
        unitario: null,
        total_item: doc.total,
      }),
    ];
  }
  if (!doc.itens.length) {
    return [Object.assign({}, base, { descricao: null, categoria: null, quantidade: null, unidade: null, unitario: null, total_item: null })];
  }
  return doc.itens.map(function (i) {
    return Object.assign({}, base, {
      descricao: i.descricao,
      categoria: i.categoria,
      quantidade: i.quantidade,
      unidade: i.unidade,
      unitario: i.unitario,
      total_item: i.total,
    });
  });
}

/**
 * Problemas de um documento (todas as linhas dele). nivel: "erro" (vermelho) ou "aviso" (amarelo).
 * opcoes: { hoje: "AAAA-MM-DD", granularidade, incertos: [campos], mapeados: [campos] }
 */
function ceValidar(linhas, doc, opcoes) {
  var hoje = opcoes.hoje;
  var mapeados = opcoes.mapeados || [];
  var usa = function (c) {
    return !mapeados.length || mapeados.indexOf(c) >= 0;
  };
  var probs = [];
  var p0 = linhas[0] || {};
  if (p0.cnpj && !ceCnpjValido(p0.cnpj)) probs.push({ nivel: "erro", campo: "cnpj", msg: "CNPJ inválido (dígito verificador não confere)." });
  if (p0.data && hoje && p0.data > hoje) probs.push({ nivel: "erro", campo: "data", msg: "Data no futuro (" + ceDataBR(p0.data) + ")." });
  if (opcoes.granularidade !== "nota" && p0.total_nota !== null && p0.total_nota !== undefined && linhas.length) {
    var valores = linhas.map(function (l) {
      return l.total_item;
    });
    if (valores.every(function (v) {
      return v !== null && v !== undefined;
    })) {
      var soma = valores.reduce(function (a, b) {
        return a + b;
      }, 0) + (doc.acrescimos || 0) - (doc.desconto || 0);
      if (Math.abs(soma - p0.total_nota) > Math.max(0.05, linhas.length * 0.01)) {
        probs.push({ nivel: "aviso", campo: "total_nota", msg: "A soma dos itens (" + ceMoeda(soma) + ") é diferente do total da nota (" + ceMoeda(p0.total_nota) + ")." });
      }
    }
  }
  (doc.incertos || []).forEach(function (c) {
    if (usa(c) && p0[c] !== null && p0[c] !== undefined && p0[c] !== "") {
      probs.push({ nivel: "aviso", campo: c, msg: "Lido do texto da imagem: confira " + ceRotulo(c).toLowerCase() + "." });
    }
  });
  return linhas.map(function (l) {
    var p = probs.slice();
    CE_OBRIGATORIOS.forEach(function (c) {
      if (usa(c) && (l[c] === null || l[c] === undefined || l[c] === "")) p.push({ nivel: "aviso", campo: c, msg: "Falta: " + ceRotulo(c) + "." });
    });
    if (l.quantidade != null && l.unitario != null && l.total_item != null && Math.abs(l.quantidade * l.unitario - l.total_item) > Math.max(0.02, Math.abs(l.total_item) * 0.005)) {
      p.push({ nivel: "aviso", campo: "total_item", msg: "Quantidade × unitário não bate com o total do item." });
    }
    return p;
  });
}

function ceRotulo(campo) {
  for (var i = 0; i < CE_CAMPOS.length; i++) if (CE_CAMPOS[i][0] === campo) return CE_CAMPOS[i][1];
  return campo;
}

/** "info" é só uma nota: não muda a cor. */
function ceCor(problemas, duplicada) {
  if (duplicada || problemas.some(function (p) { return p.nivel === "erro"; })) return "vermelho";
  return problemas.some(function (p) { return p.nivel === "aviso"; }) ? "amarelo" : "verde";
}

/** O valor que está na célula (como aparece na tela) é o que o app gravou? Usado antes de desfazer. */
function ceConfere(gravado, naTela) {
  var t = String(naTela === null || naTela === undefined ? "" : naTela).trim();
  if (gravado === null || gravado === undefined || gravado === "") return t === "";
  if (typeof gravado === "number") {
    var n = ceNumero(t.replace(/[^\d.,-]/g, ""));
    return n !== null && Math.abs(n - gravado) < 0.005;
  }
  var g = String(gravado);
  if (g.charAt(0) === "'") g = g.slice(1);
  var iso = ceData(g);
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(g)) return ceData(t) === iso || ceData(t.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, "$1/$2/20$3")) === iso;
  return g.trim() === t;
}

// ---------------------------------------------------------------- duplicatas

/** Chaves que identificam a mesma nota (qualquer uma em comum = duplicata). */
function ceChavesDocumento(l) {
  var out = [];
  var ch = ceDigitos(l.chave);
  if (ch && ceChaveValida(ch)) out.push("nfe:" + ch);
  var cnpj = String(l.cnpj || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  var num = ceDigitos(l.numero).replace(/^0+/, "");
  var data = ceData(l.data);
  var total = ceNumero(l.total_nota);
  if (cnpj && num) out.push("cnpj-num:" + cnpj + "|" + num);
  if (cnpj && data && total !== null) out.push("cnpj-data-valor:" + cnpj + "|" + data + "|" + Math.round(total * 100));
  var forn = ceNormalizar(l.fornecedor)
    .split(" ")
    .filter(function (t) {
      return t && ["ltda", "me", "epp", "eireli", "sa", "s", "a", "cia"].indexOf(t) < 0;
    })
    .slice(0, 2)
    .join(" ");
  if (forn && data && total) out.push("forn-data-valor:" + forn + "|" + data + "|" + Math.round(total * 100));
  return out;
}

function ceExplicarChave(k) {
  if (k.indexOf("nfe:") === 0) return "mesma chave de acesso";
  if (k.indexOf("cnpj-num:") === 0) return "mesmo CNPJ e número";
  if (k.indexOf("cnpj-data-valor:") === 0) return "mesmo CNPJ, data e valor";
  return "mesmo fornecedor, data e valor";
}

// ---------------------------------------------------------------- mapeamento de colunas

var CE_SINONIMOS = {
  data: ["data", "data compra", "data da compra", "data emissao", "data de emissao", "emissao", "dt", "dt emissao"],
  fornecedor: ["fornecedor", "empresa", "loja", "razao social", "emitente", "farmacia", "distribuidora"],
  cnpj: ["cnpj", "cnpj fornecedor", "cnpj do fornecedor", "cpf cnpj", "cnpj cpf"],
  numero: ["n nf", "no nf", "num nf", "numero nf", "nf", "nfe", "nota", "nota fiscal", "n nota", "numero da nota", "numero nota"],
  chave: ["chave", "chave de acesso", "chave nfe", "chave acesso"],
  descricao: ["descricao", "descricao do item", "item", "produto", "material", "medicamento", "insumo", "especificacao"],
  categoria: ["categoria", "tipo", "classificacao", "grupo"],
  quantidade: ["qtd", "qtde", "quant", "quantidade", "qt"],
  unidade: ["un", "und", "unid", "unidade", "unidade de medida", "embalagem"],
  unitario: ["valor unitario", "vl unit", "vlr unit", "vl unitario", "preco unitario", "unitario", "preco", "valor unit"],
  total_item: ["valor total", "vl total", "vlr total", "total", "valor", "total item", "valor do item", "subtotal"],
  total_nota: ["total da nota", "total nf", "total nota", "valor da nota", "valor nota", "valor nf"],
  arquivo: ["arquivo", "arquivo de origem", "origem", "documento de origem"],
  lote: ["lote", "id lote", "id do lote", "id lancamento"],
};

function cePontuar(cab, campo, granularidade) {
  var h = ceNormalizar(cab);
  if (!h) return 0;
  var sin = CE_SINONIMOS[campo].slice();
  var genericos = ["valor total", "vl total", "vlr total", "total", "valor"];
  if (granularidade === "nota") {
    if (campo === "total_item") sin = sin.filter(function (s) { return genericos.indexOf(s) < 0; });
    if (campo === "total_nota") sin = sin.concat(genericos);
  }
  var tokensH = h.split(" ");
  var melhor = 0;
  for (var i = 0; i < sin.length; i++) {
    if (h === sin[i]) return 100;
    var ts = sin[i].split(" ");
    if (ts.every(function (t) { return tokensH.indexOf(t) >= 0; })) melhor = Math.max(melhor, 50 + sin[i].length - (tokensH.length - ts.length) * 3);
  }
  return melhor;
}

/** Sugere "coluna -> campo". Colunas com fórmula nunca recebem campo. */
function ceProporMapeamento(cabecalhos, granularidade, colunasFormula) {
  var cands = [];
  cabecalhos.forEach(function (cab, col) {
    if ((colunasFormula || []).indexOf(col) >= 0) return;
    Object.keys(CE_SINONIMOS).forEach(function (campo) {
      var n = cePontuar(cab, campo, granularidade);
      if (n > 0) cands.push({ col: col, campo: campo, n: n });
    });
  });
  cands.sort(function (a, b) { return b.n - a.n || a.col - b.col; });
  var mapa = cabecalhos.map(function () { return null; });
  var usados = {};
  cands.forEach(function (c) {
    if (mapa[c.col] === null && !usados[c.campo]) {
      mapa[c.col] = c.campo;
      usados[c.campo] = true;
    }
  });
  return mapa;
}

function ceDetectarCabecalho(valores) {
  var melhor = -1, nota = 0;
  for (var r = 0; r < Math.min(valores.length, 15); r++) {
    var n = (valores[r] || []).filter(function (c) {
      return c && Object.keys(CE_SINONIMOS).some(function (campo) { return cePontuar(c, campo, "item") > 0; });
    }).length;
    if (n > nota) { nota = n; melhor = r; }
  }
  return melhor >= 0 && nota >= 2 ? melhor + 1 : 1;
}

// ---------------------------------------------------------------- onde acrescentar (nunca sobrescreve)

var CE_TEXTOS_TOTAL = ["total", "totais", "total geral", "soma", "subtotal", "total do mes", "total mes", "total mensal"];

function ceIntervalos(f) {
  var out = [], m;
  var re = /(\$?[A-Z]{1,3}\$?)(\d{1,7})\s*:\s*(\$?[A-Z]{1,3}\$?)(\d{1,7})/g;
  var s = String(f).replace(/"(?:[^"]|"")*"/g, '""');
  while ((m = re.exec(s))) out.push({ inicio: +m[2], fim: +m[4] });
  return out;
}

function ceEhTotais(formulasLinha, valoresLinha, numeroLinha) {
  for (var i = 0; i < Math.min(3, valoresLinha.length); i++) {
    var v = String(valoresLinha[i] || "");
    if (v && !String(formulasLinha[i] || "").startsWith("=") && CE_TEXTOS_TOTAL.indexOf(ceNormalizar(v)) >= 0) return true;
  }
  return formulasLinha.some(function (f) {
    f = String(f || "");
    return /^=.*(SUM|SOMA|SUBTOTAL)\s*\(/i.test(f) && ceIntervalos(f).some(function (iv) { return iv.fim > iv.inicio && iv.fim < numeroLinha; });
  });
}

/**
 * Analisa a aba (linhas 1-based). Devolve a última linha com dados, a linha de totais (se houver)
 * e as colunas com fórmula (0-based). As linhas novas entram logo depois da última com dados.
 */
function ceAnalisarAba(formulas, valores, linhaCabecalho) {
  var totais = null;
  for (var r = linhaCabecalho; r < formulas.length; r++) {
    if (ceEhTotais(formulas[r] || [], valores[r] || [], r + 1)) { totais = r + 1; break; }
  }
  var fim = totais ? totais - 1 : formulas.length;
  var colsFormula = [];
  for (var r2 = linhaCabecalho; r2 < fim; r2++) {
    (formulas[r2] || []).forEach(function (f, c) {
      if (String(f || "").startsWith("=") && colsFormula.indexOf(c) < 0) colsFormula.push(c);
    });
  }
  var ultima = linhaCabecalho;
  for (var r3 = linhaCabecalho; r3 < fim; r3++) {
    var temDado = (valores[r3] || []).some(function (v, c) {
      return colsFormula.indexOf(c) < 0 && v !== "" && v !== null && v !== undefined;
    });
    if (temDado) ultima = r3 + 1;
  }
  return { ultimaLinha: ultima, linhaTotais: totais, colunasFormula: colsFormula.sort(function (a, b) { return a - b; }) };
}

/** "=SOMA(J2:J10)" com fimAntigo 10 e fimNovo 13 -> "=SOMA(J2:J13)". */
function ceEstenderIntervalos(formula, fimAntigo, fimNovo) {
  return String(formula).replace(/(\$?[A-Z]{1,3}\$?)(\d{1,7})\s*:\s*(\$?[A-Z]{1,3}\$?)(\d{1,7})/g, function (m, c1, l1, c2, l2) {
    return +l2 === fimAntigo && +l1 <= +l2 ? c1 + l1 + ":" + c2 + fimNovo : m;
  });
}

/**
 * Valor que vai para a célula. Datas viram Date; números, number; texto que o Sheets poderia
 * transformar (fórmula, data, número, %) ganha apóstrofo para ficar como texto.
 */
function ceValorCelula(campo, v) {
  if (v === null || v === undefined || v === "") return "";
  if (campo === "data") {
    var iso = ceData(v);
    if (iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  }
  if (["quantidade", "unitario", "total_item", "total_nota"].indexOf(campo) >= 0) {
    var n = ceNumero(v);
    if (n !== null) return n;
  }
  var t = String(v).replace(/[\r\n\t]+/g, " ").trim();
  if (campo === "cnpj") t = ceFormatarCnpj(t);
  if (/^[=+\-@]/.test(t) || /^[\d.,/%\s-]+$/.test(t)) return "'" + t;
  return t;
}

if (typeof module !== "undefined") {
  module.exports = {
    ceNormalizar: ceNormalizar, ceNumero: ceNumero, ceData: ceData, ceDataBR: ceDataBR, ceMoeda: ceMoeda,
    ceCnpjValido: ceCnpjValido, ceFormatarCnpj: ceFormatarCnpj, ceChaveValida: ceChaveValida, ceDadosDaChave: ceDadosDaChave,
    ceCategoria: ceCategoria, ceMascarar: ceMascarar, ceLerXml: ceLerXml, ceLerTexto: ceLerTexto,
    ceLinhasDoDocumento: ceLinhasDoDocumento, ceValidar: ceValidar, ceCor: ceCor, ceChavesDocumento: ceChavesDocumento,
    ceExplicarChave: ceExplicarChave, ceProporMapeamento: ceProporMapeamento, ceDetectarCabecalho: ceDetectarCabecalho,
    ceAnalisarAba: ceAnalisarAba, ceConfere: ceConfere, ceEstenderIntervalos: ceEstenderIntervalos, ceValorCelula: ceValorCelula, CE_CAMPOS: CE_CAMPOS,
  };
}


/**
 * Compras Express — versão gratuita para celular. PARTE DO SERVIDOR (roda no Google Apps Script,
 * dentro da sua planilha). Nada sai da sua conta Google:
 * - XML da NF-e é lido direto;
 * - foto, print e PDF passam pelo reconhecimento de texto (OCR) gratuito do Google Drive, num
 *   documento temporário que é apagado na hora;
 * - a revisão fica numa aba oculta "CE_Pendentes"; o histórico dos lançamentos, em "CE_Registro".
 */

var CE_ABA_PENDENTES = "CE_Pendentes";
var CE_ABA_REGISTRO = "CE_Registro";
var CE_ABA_DEPARA = "CE_DePara";
var CE_COL_PEND = ["id", "lote", "arquivoId", "arquivo", "hash", "doc", "indice", "valores", "problemas", "cor", "duplicata", "aprovada", "forcada", "criado"];
var CE_COL_REG = ["lote", "quando", "usuario", "aba", "linha", "gravado", "chaves", "hash", "arquivo", "desfeito"];

// ---------------------------------------------------------------- entrada

function doGet() {
  return HtmlService.createHtmlOutputFromFile("Index")
    .setTitle("Compras Express")
    .addMetaTag("viewport", "width=device-width, initial-scale=1, viewport-fit=cover");
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Compras Express")
    .addItem("Abrir aqui", "ceAbrirAqui")
    .addItem("Link para abrir no celular", "ceMostrarLink")
    .addToUi();
}

function ceAbrirAqui() {
  var html = HtmlService.createHtmlOutputFromFile("Index").setWidth(1100).setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, "Compras Express");
}

function ceMostrarLink() {
  var url = ScriptApp.getService().getUrl();
  var ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert("O app ainda não foi publicado. Siga o passo “Implantar” do guia de instalação.");
    return;
  }
  ui.alert("Abra este link no navegador do celular e use “Adicionar à tela inicial”:\n\n" + url);
}

// ---------------------------------------------------------------- utilidades

function cePlanilha_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ceAbaInterna_(nome, colunas) {
  var ss = cePlanilha_();
  var sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1, colunas.length).setValues([colunas]);
    sh.hideSheet();
  }
  return sh;
}

function ceLerTabela_(nome, colunas) {
  var sh = ceAbaInterna_(nome, colunas);
  var n = sh.getLastRow();
  if (n < 2) return [];
  return sh
    .getRange(2, 1, n - 1, colunas.length)
    .getValues()
    .map(function (l, i) {
      var o = { _linha: i + 2 };
      colunas.forEach(function (c, j) {
        o[c] = l[j];
      });
      return o;
    });
}

function ceJson_(v, padrao) {
  try {
    return v ? JSON.parse(v) : padrao;
  } catch (e) {
    return padrao;
  }
}

function ceConfig_() {
  return ceJson_(PropertiesService.getDocumentProperties().getProperty("ce_config"), null);
}

function ceHoje_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function ceHash_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
    .map(function (b) {
      return ("0" + (b & 0xff).toString(16)).slice(-2);
    })
    .join("");
}

function ceNovoLote_() {
  return "L-" + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmm") + "-" + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------- estado e configuração

function ceEstado() {
  var cfg = ceConfig_();
  var pend = ceLerTabela_(CE_ABA_PENDENTES, CE_COL_PEND);
  var reg = ceLerTabela_(CE_ABA_REGISTRO, CE_COL_REG).filter(function (r) {
    return !r.desfeito;
  });
  return {
    configurado: !!(cfg && cfg.aba && cfg.mapeamento && cfg.mapeamento.some(Boolean)),
    config: cfg,
    abas: cePlanilha_()
      .getSheets()
      .map(function (s) {
        return s.getName();
      })
      .filter(function (n) {
        return n.indexOf("CE_") !== 0;
      }),
    planilha: cePlanilha_().getName(),
    pendentes: pend.length,
    ultimoLote: reg.length ? reg[reg.length - 1].lote : null,
    campos: CE_CAMPOS,
    url: ScriptApp.getService().getUrl() || null,
  };
}

/** Lê o cabeçalho da aba e sugere o que vai em cada coluna. */
function ceLerCabecalho(aba, granularidade) {
  var sh = cePlanilha_().getSheetByName(aba);
  if (!sh) throw new Error("A aba “" + aba + "” não existe.");
  var ult = Math.min(Math.max(sh.getLastRow(), 1), 400);
  var cols = Math.max(sh.getLastColumn(), 1);
  var vals = sh.getRange(1, 1, ult, cols).getDisplayValues();
  var forms = sh.getRange(1, 1, ult, cols).getFormulas();
  var linhaCab = ceDetectarCabecalho(vals);
  var comb = forms.map(function (l, r) {
    return l.map(function (f, c) {
      return f || vals[r][c];
    });
  });
  var analise = ceAnalisarAba(comb, vals, linhaCab);
  var cab = vals[linhaCab - 1].map(function (x) {
    return String(x).trim();
  });
  return {
    linhaCabecalho: linhaCab,
    cabecalhos: cab,
    colunasFormula: analise.colunasFormula,
    proposta: ceProporMapeamento(cab, granularidade || "item", analise.colunasFormula),
    linhasComDados: analise.ultimaLinha - linhaCab,
    temTotais: !!analise.linhaTotais,
  };
}

function ceSalvarConfig(cfg) {
  if (!cfg || !cfg.aba || !cfg.mapeamento || !cfg.mapeamento.some(Boolean)) throw new Error("Escolha a aba e pelo menos uma coluna.");
  var usados = {};
  cfg.mapeamento.forEach(function (c, i) {
    if (!c) return;
    if (usados[c]) throw new Error("O campo “" + ceRotulo(c) + "” está em duas colunas.");
    if ((cfg.colunasFormula || []).indexOf(i) >= 0) throw new Error("Uma coluna com fórmula não pode receber dados.");
    usados[c] = true;
  });
  PropertiesService.getDocumentProperties().setProperty("ce_config", JSON.stringify(cfg));
  return ceEstado();
}

// ---------------------------------------------------------------- leitura dos arquivos

function ceOcr_(blob) {
  var nome = "CE-temporario-" + Date.now();
  var arq;
  if (typeof Drive === "undefined") {
    throw new Error("Falta ativar o serviço “Drive API” no Apps Script (veja o guia de instalação).");
  }
  if (Drive.Files.create) {
    arq = Drive.Files.create({ name: nome, mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: "pt" });
  } else {
    arq = Drive.Files.insert({ title: nome, mimeType: blob.getContentType() }, blob, { ocr: true, ocrLanguage: "pt" });
  }
  try {
    return DocumentApp.openById(arq.id).getBody().getText();
  } finally {
    try {
      if (Drive.Files.remove) Drive.Files.remove(arq.id);
      else DriveApp.getFileById(arq.id).setTrashed(true);
    } catch (e) {
      DriveApp.getFileById(arq.id).setTrashed(true);
    }
  }
}

function ceDePara_() {
  var t = {};
  ceLerTabela_(CE_ABA_DEPARA, ["campo", "de", "para"]).forEach(function (r) {
    t[r.campo + "|" + r.de] = r.para;
  });
  return t;
}

/** Chaves de documentos que já estão na planilha (para achar duplicatas). */
function ceChavesNaPlanilha_(cfg) {
  var sh = cePlanilha_().getSheetByName(cfg.aba);
  var chaves = {};
  if (!sh || sh.getLastRow() <= cfg.linhaCabecalho) return chaves;
  var vals = sh.getRange(cfg.linhaCabecalho + 1, 1, sh.getLastRow() - cfg.linhaCabecalho, sh.getLastColumn()).getDisplayValues();
  vals.forEach(function (l) {
    var o = {};
    cfg.mapeamento.forEach(function (c, i) {
      if (c) o[c] = l[i];
    });
    ceChavesDocumento(o).forEach(function (k) {
      chaves[k] = true;
    });
  });
  return chaves;
}

/**
 * Recebe UM arquivo do celular (base64), lê e coloca as linhas na revisão.
 * Um arquivo com problema não atrapalha os outros: o erro volta só para ele.
 */
function ceProcessar(arq) {
  var cfg = ceConfig_();
  if (!cfg) return { ok: false, mensagem: "Configure a planilha primeiro." };
  try {
    var bytes = Utilities.base64Decode(arq.base64);
    var hash = ceHash_(bytes);
    var pend = ceLerTabela_(CE_ABA_PENDENTES, CE_COL_PEND);
    var reg = ceLerTabela_(CE_ABA_REGISTRO, CE_COL_REG).filter(function (r) {
      return !r.desfeito;
    });
    if (pend.some(function (p) { return p.hash === hash; })) return { ok: false, repetido: true, mensagem: "Este arquivo já está na revisão." };
    var jaLancado = reg.filter(function (r) { return r.hash === hash; })[0];
    if (jaLancado) return { ok: false, repetido: true, mensagem: "Este arquivo já foi lançado (lote " + jaLancado.lote + ")." };

    var nome = String(arq.nome || "arquivo").slice(0, 150);
    var ehXml = /\.xml$/i.test(nome) || /xml/.test(arq.mime || "");
    var doc;
    if (ehXml) {
      doc = ceLerXml(Utilities.newBlob(bytes).getDataAsString("UTF-8"));
    } else {
      var texto = ceOcr_(Utilities.newBlob(bytes, arq.mime || "image/jpeg", nome));
      if (!texto || texto.replace(/\s/g, "").length < 20) return { ok: false, mensagem: "Não consegui ler texto neste arquivo. Tire outra foto, mais nítida e de frente." };
      doc = ceLerTexto(texto);
    }

    var lote = arq.lote || "revisao";
    var arquivoId = Utilities.getUuid();
    var linhas = ceLinhasDoDocumento(doc, { granularidade: cfg.granularidade || "item", arquivo: nome, lote: lote });

    // De/para: o que você já corrigiu antes é aplicado (com aviso informativo).
    var dp = ceDePara_();
    var notas = [];
    linhas.forEach(function (l) {
      ["descricao", "fornecedor"].forEach(function (c) {
        var para = l[c] ? dp[c + "|" + ceNormalizar(l[c])] : null;
        if (para && para !== l[c]) {
          notas.push("“" + l[c] + "” → “" + para + "”");
          l["_orig_" + c] = l[c];
          l[c] = para;
        }
      });
    });

    // Duplicatas: na planilha, na revisão e no que já foi lançado.
    var chaves = ceChavesDocumento(linhas[0]);
    var naPlanilha = ceChavesNaPlanilha_(cfg);
    var outras = {};
    pend.forEach(function (p) {
      (ceJson_(p.doc, {}).chaves || []).forEach(function (k) { outras[k] = "revisão (" + p.arquivo + ")"; });
    });
    reg.forEach(function (r) { ceJson_(r.chaves, []).forEach(function (k) { outras[k] = "lote " + r.lote; }); });
    var duplicata = null;
    chaves.forEach(function (k) {
      if (duplicata) return;
      if (naPlanilha[k]) duplicata = "Já está na planilha (" + ceExplicarChave(k) + ").";
      else if (outras[k]) duplicata = "Repetida: " + outras[k] + " (" + ceExplicarChave(k) + ").";
    });

    var mapeados = cfg.mapeamento.filter(Boolean);
    var probs = ceValidar(linhas, doc, { hoje: ceHoje_(), granularidade: cfg.granularidade || "item", mapeados: mapeados });
    var sh = ceAbaInterna_(CE_ABA_PENDENTES, CE_COL_PEND);
    var docInfo = JSON.stringify({ chaves: chaves, acrescimos: doc.acrescimos, desconto: doc.desconto, incertos: doc.incertos, origem: doc.origem });
    var novas = linhas.map(function (l, i) {
      var p = probs[i].slice();
      if (notas.length) p.push({ nivel: "info", msg: "Corrigido pelo que você ensinou: " + notas.join(", ") + "." });
      return [Utilities.getUuid(), lote, arquivoId, nome, hash, docInfo, i, JSON.stringify(l), JSON.stringify(p), ceCor(p, !!duplicata), duplicata || "", false, false, new Date()];
    });
    sh.getRange(sh.getLastRow() + 1, 1, novas.length, CE_COL_PEND.length).setValues(novas);
    return {
      ok: true,
      linhas: novas.length,
      mensagem: (ehXml ? "XML lido" : "Texto reconhecido") + ": " + novas.length + " linha(s)" + (duplicata ? " — possível duplicata" : ""),
    };
  } catch (e) {
    return { ok: false, mensagem: e && e.message ? e.message : "Erro ao ler este arquivo." };
  }
}

// ---------------------------------------------------------------- revisão

function cePendentes() {
  return ceLerTabela_(CE_ABA_PENDENTES, CE_COL_PEND).map(function (p) {
    return {
      id: p.id,
      arquivoId: p.arquivoId,
      arquivo: p.arquivo,
      valores: ceJson_(p.valores, {}),
      problemas: ceJson_(p.problemas, []),
      cor: p.cor,
      duplicata: p.duplicata || null,
      aprovada: p.aprovada === true,
      forcada: p.forcada === true,
    };
  });
}

function ceRevalidarArquivo_(arquivoId) {
  var cfg = ceConfig_();
  var sh = ceAbaInterna_(CE_ABA_PENDENTES, CE_COL_PEND);
  var linhas = ceLerTabela_(CE_ABA_PENDENTES, CE_COL_PEND).filter(function (p) { return p.arquivoId === arquivoId; });
  if (!linhas.length) return;
  var info = ceJson_(linhas[0].doc, {});
  var vals = linhas.map(function (p) { return ceJson_(p.valores, {}); });
  var probs = ceValidar(vals, { acrescimos: info.acrescimos, desconto: info.desconto, incertos: info.incertos || [] }, {
    hoje: ceHoje_(),
    granularidade: cfg.granularidade || "item",
    mapeados: cfg.mapeamento.filter(Boolean),
  });
  linhas.forEach(function (p, i) {
    var cor = ceCor(probs[i], !!p.duplicata);
    var aprovada = p.aprovada === true && (cor !== "vermelho" || p.forcada === true);
    sh.getRange(p._linha, CE_COL_PEND.indexOf("problemas") + 1, 1, 2).setValues([[JSON.stringify(probs[i]), cor]]);
    sh.getRange(p._linha, CE_COL_PEND.indexOf("aprovada") + 1).setValue(aprovada);
  });
}

/** Edição de um campo. Campos da nota valem para todos os itens do mesmo arquivo. Ensina o de/para. */
function ceEditar(id, campo, valor) {
  var sh = ceAbaInterna_(CE_ABA_PENDENTES, CE_COL_PEND);
  var todas = ceLerTabela_(CE_ABA_PENDENTES, CE_COL_PEND);
  var alvo = todas.filter(function (p) { return p.id === id; })[0];
  if (!alvo) throw new Error("Linha não encontrada.");
  var daNota = ["data", "fornecedor", "cnpj", "numero", "chave", "total_nota"].indexOf(campo) >= 0;
  var num = ["quantidade", "unitario", "total_item", "total_nota"].indexOf(campo) >= 0;
  var limpo = valor === null || String(valor).trim() === "" ? null : num ? ceNumero(valor) : campo === "data" ? ceData(valor) || String(valor).trim() : String(valor).trim();
  todas
    .filter(function (p) { return daNota ? p.arquivoId === alvo.arquivoId : p.id === id; })
    .forEach(function (p) {
      var v = ceJson_(p.valores, {});
      var antes = v["_orig_" + campo] || v[campo];
      v[campo] = limpo;
      // Remove o aviso de "lido do texto da imagem" deste campo: a usuária conferiu.
      var info = ceJson_(p.doc, {});
      if (info.incertos) {
        info.incertos = info.incertos.filter(function (c) { return c !== campo; });
        sh.getRange(p._linha, CE_COL_PEND.indexOf("doc") + 1).setValue(JSON.stringify(info));
      }
      sh.getRange(p._linha, CE_COL_PEND.indexOf("valores") + 1).setValue(JSON.stringify(v));
      if (p.id === id && (campo === "descricao" || campo === "fornecedor") && antes && limpo && ceNormalizar(antes) !== ceNormalizar(limpo)) {
        ceAbaInterna_(CE_ABA_DEPARA, ["campo", "de", "para"]).appendRow([campo, ceNormalizar(antes), limpo]);
      }
    });
  ceRevalidarArquivo_(alvo.arquivoId);
  return cePendentes();
}

function ceAprovar(id, aprovada, forcar) {
  var sh = ceAbaInterna_(CE_ABA_PENDENTES, CE_COL_PEND);
  var p = ceLerTabela_(CE_ABA_PENDENTES, CE_COL_PEND).filter(function (x) { return x.id === id; })[0];
  if (!p) throw new Error("Linha não encontrada.");
  if (aprovada && p.cor === "vermelho" && !forcar) throw new Error("Linha vermelha: corrija ou use “Lançar mesmo assim”.");
  sh.getRange(p._linha, CE_COL_PEND.indexOf("aprovada") + 1, 1, 2).setValues([[!!aprovada, !!(aprovada && p.cor === "vermelho" && forcar)]]);
  return cePendentes();
}

function ceAprovarVerdes() {
  var sh = ceAbaInterna_(CE_ABA_PENDENTES, CE_COL_PEND);
  ceLerTabela_(CE_ABA_PENDENTES, CE_COL_PEND).forEach(function (p) {
    if (p.cor === "verde" && p.aprovada !== true) sh.getRange(p._linha, CE_COL_PEND.indexOf("aprovada") + 1).setValue(true);
  });
  return cePendentes();
}

/** Tira um arquivo da revisão (não mexe na planilha). */
function ceDescartarArquivo(arquivoId) {
  var sh = ceAbaInterna_(CE_ABA_PENDENTES, CE_COL_PEND);
  ceLerTabela_(CE_ABA_PENDENTES, CE_COL_PEND)
    .filter(function (p) { return p.arquivoId === arquivoId; })
    .map(function (p) { return p._linha; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (n) { sh.deleteRow(n); });
  return cePendentes();
}

// ---------------------------------------------------------------- lançar (só acrescenta) e desfazer

function ceLancar() {
  var trava = LockService.getDocumentLock();
  if (!trava.tryLock(20000)) throw new Error("Já há um lançamento em andamento. Aguarde.");
  try {
    var cfg = ceConfig_();
    var sh = cePlanilha_().getSheetByName(cfg.aba);
    if (!sh) throw new Error("A aba “" + cfg.aba + "” não existe mais. Configure de novo.");
    var shPend = ceAbaInterna_(CE_ABA_PENDENTES, CE_COL_PEND);
    var aprovadas = ceLerTabela_(CE_ABA_PENDENTES, CE_COL_PEND).filter(function (p) {
      return p.aprovada === true && (p.cor !== "vermelho" || p.forcada === true);
    });
    if (!aprovadas.length) return { lancadas: 0, mensagem: "Nenhuma linha aprovada." };

    var lote = ceNovoLote_();
    var n = aprovadas.length;
    var ultCol = Math.max(sh.getLastColumn(), cfg.mapeamento.length);
    var ultLin = Math.max(sh.getLastRow(), cfg.linhaCabecalho);
    var rng = sh.getRange(1, 1, ultLin, ultCol);
    var forms = rng.getFormulas();
    var vals = rng.getDisplayValues();
    var comb = forms.map(function (l, r) { return l.map(function (f, c) { return f || vals[r][c]; }); });
    var a = ceAnalisarAba(comb, vals, cfg.linhaCabecalho);
    var proibidas = (cfg.colunasFormula || []).concat(a.colunasFormula);
    var depois = a.ultimaLinha;

    // 1) Linhas novas logo depois da última com dados (antes dos totais), com o formato da linha de cima.
    sh.insertRowsAfter(depois, n);
    if (depois > cfg.linhaCabecalho) {
      var origem = sh.getRange(depois, 1, 1, ultCol);
      var destino = sh.getRange(depois + 1, 1, n, ultCol);
      origem.copyTo(destino, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
      origem.copyTo(destino, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      a.colunasFormula.forEach(function (c) {
        if (forms[depois - 1][c]) sh.getRange(depois, c + 1).copyTo(sh.getRange(depois + 1, c + 1, n, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
      });
    }

    // 2) Valores, coluna por coluna (nunca nas colunas com fórmula).
    var gravados = aprovadas.map(function () { return {}; });
    cfg.mapeamento.forEach(function (campo, c) {
      if (!campo || proibidas.indexOf(c) >= 0) return;
      var coluna = aprovadas.map(function (p, i) {
        var v = ceJson_(p.valores, {});
        if (campo === "lote") v.lote = lote;
        var cel = ceValorCelula(campo, v[campo]);
        gravados[i][c] = cel instanceof Date ? ceData(cel) : cel;
        return [cel];
      });
      sh.getRange(depois + 1, c + 1, n, 1).setValues(coluna);
    });

    // 3) A soma da linha de totais passa a incluir as linhas novas.
    if (a.linhaTotais && depois > cfg.linhaCabecalho) {
      var linTot = a.linhaTotais + n;
      var fTot = sh.getRange(linTot, 1, 1, ultCol).getFormulas()[0];
      fTot.forEach(function (f, c) {
        if (!f) return;
        var novo = ceEstenderIntervalos(f, depois, depois + n);
        if (novo !== f) sh.getRange(linTot, c + 1).setFormula(novo);
      });
    }

    // 4) Registro (para rastrear e desfazer) e limpeza da revisão.
    var shReg = ceAbaInterna_(CE_ABA_REGISTRO, CE_COL_REG);
    var usuario = Session.getActiveUser().getEmail() || "";
    var agora = new Date();
    var reg = aprovadas.map(function (p, i) {
      return [lote, agora, usuario, cfg.aba, depois + 1 + i, JSON.stringify(gravados[i]), JSON.stringify(ceJson_(p.doc, {}).chaves || []), p.hash, p.arquivo, ""];
    });
    shReg.getRange(shReg.getLastRow() + 1, 1, reg.length, CE_COL_REG.length).setValues(reg);
    aprovadas
      .map(function (p) { return p._linha; })
      .sort(function (x, y) { return y - x; })
      .forEach(function (l) { shPend.deleteRow(l); });
    SpreadsheetApp.flush();
    return { lancadas: n, lote: lote, mensagem: n + " linha(s) lançada(s) na aba “" + cfg.aba + "”, linhas " + (depois + 1) + " a " + (depois + n) + "." };
  } finally {
    trava.releaseLock();
  }
}

/** Remove da planilha SÓ as linhas do último lote, e só se ainda estão como foram gravadas. */
function ceDesfazer() {
  var trava = LockService.getDocumentLock();
  if (!trava.tryLock(20000)) throw new Error("Há outra operação em andamento. Aguarde.");
  try {
    var reg = ceLerTabela_(CE_ABA_REGISTRO, CE_COL_REG).filter(function (r) { return !r.desfeito; });
    if (!reg.length) return { removidas: 0, mensagem: "Não há lote para desfazer." };
    var lote = reg[reg.length - 1].lote;
    var doLote = reg.filter(function (r) { return r.lote === lote; });
    var sh = cePlanilha_().getSheetByName(doLote[0].aba);
    var ultCol = sh.getLastColumn();
    var tela = sh.getRange(1, 1, sh.getLastRow(), ultCol).getDisplayValues();
    var confere = function (linha, gravado) {
      var l = tela[linha - 1];
      if (!l) return false;
      return Object.keys(gravado).every(function (c) { return ceConfere(gravado[c], l[+c]); });
    };
    var usadas = {};
    var alvo = doLote.map(function (r) {
      var g = ceJson_(r.gravado, {});
      if (confere(r.linha, g) && !usadas[r.linha]) { usadas[r.linha] = true; return r.linha; }
      var achadas = [];
      for (var i = 1; i <= tela.length; i++) if (!usadas[i] && confere(i, g)) achadas.push(i);
      if (achadas.length === 1) { usadas[achadas[0]] = true; return achadas[0]; }
      return null;
    });
    if (alvo.some(function (x) { return x === null; })) {
      throw new Error("Por segurança, nada foi desfeito: alguma linha do lote foi alterada na planilha depois do lançamento. Corrija à mão.");
    }
    alvo.sort(function (x, y) { return y - x; }).forEach(function (l) { sh.deleteRow(l); });
    var shReg = ceAbaInterna_(CE_ABA_REGISTRO, CE_COL_REG);
    doLote.forEach(function (r) { shReg.getRange(r._linha, CE_COL_REG.indexOf("desfeito") + 1).setValue(new Date()); });
    return { removidas: alvo.length, mensagem: alvo.length + " linha(s) do lote " + lote + " removida(s) da planilha." };
  } finally {
    trava.releaseLock();
  }
}

function ceHistorico() {
  var lotes = {};
  ceLerTabela_(CE_ABA_REGISTRO, CE_COL_REG).forEach(function (r) {
    var l = (lotes[r.lote] = lotes[r.lote] || { lote: r.lote, quando: r.quando, linhas: 0, desfeito: !!r.desfeito, aba: r.aba });
    l.linhas++;
  });
  return Object.keys(lotes)
    .map(function (k) {
      var l = lotes[k];
      return { lote: l.lote, quando: Utilities.formatDate(new Date(l.quando), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"), linhas: l.linhas, desfeito: l.desfeito, aba: l.aba };
    })
    .reverse()
    .slice(0, 30);
}
