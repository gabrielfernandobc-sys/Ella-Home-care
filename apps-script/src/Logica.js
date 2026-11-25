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
