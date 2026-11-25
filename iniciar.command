#!/bin/bash
# Compras Express — dois cliques para abrir no Mac.
cd "$(dirname "$0")" || exit 1

echo ""
echo "  =============================================="
echo "     Compras Express - iniciando..."
echo "  =============================================="
echo ""

# ---- 1. Node.js ------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "  Instalando o Node.js com o Homebrew..."
    brew install node@22 && brew link --overwrite --force node@22
  fi
fi
if ! command -v node >/dev/null 2>&1; then
  echo "  O Node.js não está instalado."
  echo "  Baixe e instale a versão \"LTS\" em https://nodejs.org e depois"
  echo "  dê dois cliques neste arquivo de novo."
  open "https://nodejs.org"
  read -r -p "  Aperte Enter para fechar."
  exit 1
fi
MAIOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAIOR" -lt 22 ]; then
  echo "  Seu Node.js é antigo. Instale a versão LTS mais nova em https://nodejs.org"
  open "https://nodejs.org"
  read -r -p "  Aperte Enter para fechar."
  exit 1
fi

# ---- 2. Arquivo de configuração ---------------------------------------
if [ ! -f ".env" ]; then
  cp ".env.example" ".env"
  echo "  Criei o arquivo de configuração \".env\"."
  echo "  Vou abri-lo no TextEdit: preencha as chaves seguindo o README, salve e feche."
  echo "  (Para só testar no modo demonstração, pode fechar sem preencher.)"
  open -W -e ".env"
fi

# ---- 3. Dependências e montagem (só quando precisa) -------------------
if [ ! -d "node_modules/next" ]; then
  echo "  Instalando os componentes do app (só na primeira vez, pode levar alguns minutos)..."
  npm ci --no-audit --no-fund || { echo "  Falha ao instalar. Verifique a internet."; read -r -p "  Enter para fechar."; exit 1; }
  rm -f ".next/BUILD_ID"
fi
if [ ! -f ".next/BUILD_ID" ]; then
  echo "  Preparando o app (só na primeira vez ou após atualização)..."
  npm run build || { echo "  Falha ao preparar o app."; read -r -p "  Enter para fechar."; exit 1; }
fi

# ---- 4. Abrir -----------------------------------------------------------
echo ""
echo "  Abrindo o navegador... Deixe esta janela aberta enquanto usa o app."
echo ""
npm start
