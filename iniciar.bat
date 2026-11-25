@echo off
chcp 65001 >nul
title Compras Express
cd /d "%~dp0"

echo.
echo  ==============================================
echo     Compras Express - iniciando...
echo  ==============================================
echo.

REM ---- 1. Node.js -------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo  O Node.js nao esta instalado. Tentando instalar com o winget...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  if errorlevel 1 (
    echo.
    echo  Nao consegui instalar sozinho.
    echo  Baixe e instale a versao "LTS" em https://nodejs.org e depois
    echo  de dois cliques neste arquivo de novo.
    start https://nodejs.org
    pause
    exit /b 1
  )
  echo.
  echo  Node.js instalado. FECHE esta janela e de dois cliques em iniciar.bat de novo.
  pause
  exit /b 0
)

for /f "tokens=1 delims=." %%v in ('node -p "process.versions.node"') do set NODEMAIOR=%%v
if %NODEMAIOR% LSS 22 (
  echo  Seu Node.js e antigo. Instale a versao LTS mais nova em https://nodejs.org
  start https://nodejs.org
  pause
  exit /b 1
)

REM ---- 2. Arquivo de configuracao ----------------------------------
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo  Criei o arquivo de configuracao ".env".
  echo  Vou abri-lo no Bloco de Notas: preencha as chaves seguindo o README,
  echo  salve, feche o Bloco de Notas e volte aqui.
  echo  Para so testar no modo demonstracao, pode fechar sem preencher.
  notepad ".env"
)

REM ---- 3. Dependencias e montagem (so quando precisa) -------------
if not exist "node_modules\next" (
  echo  Instalando os componentes do app - so na primeira vez, pode levar alguns minutos...
  call npm ci --no-audit --no-fund
  if errorlevel 1 (
    echo  Falha ao instalar. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
  if exist ".next\BUILD_ID" del ".next\BUILD_ID"
)

if not exist ".next\BUILD_ID" (
  echo  Preparando o app - so na primeira vez ou apos atualizacao...
  call npm run build
  if errorlevel 1 (
    echo  Falha ao preparar o app.
    pause
    exit /b 1
  )
)

REM ---- 4. Abrir ------------------------------------------------------
echo.
echo  Abrindo o navegador... Deixe esta janela aberta enquanto usa o app.
echo.
call npm start
pause
