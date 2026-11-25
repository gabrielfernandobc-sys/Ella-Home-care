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
