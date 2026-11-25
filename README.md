# 🧾 Compras Express

Lance notas fiscais e prints de compras na **mesma planilha de controle de sempre** em minutos, e não em horas.

Você arrasta as notas (PDF, foto, XML ou print). O app lê os dados e mostra tudo numa tabela para você **conferir e aprovar**. Depois, com um clique, ele acrescenta as linhas no fim da sua planilha do Google, **sem apagar nem mudar nada do que já está lá**.

> O app roda **só no seu computador**: ele não fica na internet e não precisa de servidor.

---

## Sumário

1. [O que o app faz](#o-que-o-app-faz)
2. [Antes de começar](#antes-de-começar)
3. [Passo 1: baixar o app](#passo-1-baixar-o-app)
4. [Passo 2: Google Cloud (login e planilha)](#passo-2-google-cloud-login-e-planilha)
5. [Passo 3: chave da IA](#passo-3-chave-da-ia)
6. [Passo 4: abrir o app](#passo-4-abrir-o-app)
7. [Passo 5: conectar a planilha](#passo-5-conectar-a-planilha)
8. [Como usar no dia a dia](#como-usar-no-dia-a-dia)
9. [Testar sem conta Google (modo demonstração)](#testar-sem-conta-google-modo-demonstração)
10. [Privacidade: o que sai do computador](#privacidade-o-que-sai-do-computador)
11. [Problemas comuns](#problemas-comuns)
12. [Para quem desenvolve](#para-quem-desenvolve)

---

## O que o app faz

- **Recebe vários arquivos de uma vez:** arrastar e soltar, escolher vários, ou colar um print com **Ctrl+V**. Aceita PDF, JPG, PNG, HEIC (foto de iPhone) e XML de NF-e.
- **Lê os dados:**
  - XML de NF-e é lido direto, sem IA, com 100% de precisão;
  - PDF com texto tem o texto extraído primeiro;
  - fotos, prints e PDFs escaneados são lidos por IA com visão.
- **Confere sozinho:**
  - soma dos itens contra o total da nota;
  - quantidade × unitário contra o total do item;
  - CNPJ válido, data plausível e campos obrigatórios preenchidos.
- **Detecta duplicatas** pela chave de acesso da NF-e, pelo CNPJ + número + data + valor, pelo arquivo repetido e comparando com o que já está na planilha.
- **Tela de revisão** com o documento original ao lado e três cores:
  - 🟢 tudo certo;
  - 🟡 conferir;
  - 🔴 erro ou duplicata.
- **Aprende com você:** se você corrige "DIPIRONA 500MG C/10 CP" para "Dipirona 500 mg", nos próximos lotes a correção é aplicada sozinha. A linha fica amarela para você confirmar.
- **Lança na planilha** só as linhas aprovadas:
  - no fim da tabela, antes da linha de totais;
  - preserva fórmulas, formatação, filtros e validação de dados;
  - estende a soma da linha de totais para incluir as linhas novas.
- **Rastreia tudo:** cada linha guarda o arquivo de origem e o ID do lote. Errou? **"Desfazer último lote"** remove só as linhas daquele lote.

### Regras que o app nunca quebra

- Nunca inventa valor: o que não dá para ler fica vazio e amarelo.
- Nunca grava sem a sua aprovação.
- Nunca apaga nem sobrescreve dados da planilha. Só acrescenta linhas.
- Enviar o mesmo arquivo ou o mesmo lote de novo **não duplica linhas**.
- Erro em um arquivo não trava os outros.

---

## Antes de começar

Você vai precisar de:

- um computador com **Windows 10/11** ou **macOS**;
- a **planilha de controle no Google Sheets** (a versão atual não grava em Excel; veja [Fases](#fases));
- uma **conta Google** com permissão para editar essa planilha;
- uma **conta na Anthropic** (a empresa da IA Claude) com créditos, só se for ler fotos, prints e PDFs. Notas em XML funcionam sem isso.

A configuração inicial leva uns 30 minutos e é feita **uma vez só**. Se puder, peça ajuda a alguém de TI nessa primeira vez. Depois, é só dar dois cliques para abrir.

---

## Passo 1: baixar o app

1. Na página do projeto no GitHub, clique no botão verde **Code** e depois em **Download ZIP**.
2. Abra o ZIP e **extraia** a pasta para um lugar fácil, por exemplo `Documentos\Compras Express`.
3. Pronto. Não mova a pasta de lugar depois (é nela que ficam os seus dados).

---

## Passo 2: Google Cloud (login e planilha)

Isto cria a "chave" que permite ao app entrar na sua conta Google e editar a planilha. É gratuito.

1. Acesse **https://console.cloud.google.com** e entre com sua conta Google.
2. No topo, clique no seletor de projetos e depois em **Novo projeto**. Dê o nome `Compras Express` e clique em **Criar**. Confira se o projeto novo está selecionado no topo.
3. **Ative a API do Google Sheets:** menu ☰ → **APIs e serviços** → **Biblioteca**. Procure por **Google Sheets API**, abra e clique em **Ativar**.
4. **Configure a tela de consentimento:** menu ☰ → **APIs e serviços** → **Tela de permissão OAuth** (pode aparecer como **Google Auth Platform**).
   - Clique em **Começar**.
   - Nome do app: `Compras Express`. E-mail de suporte: o seu.
   - Público: **Externo**.
   - Dados de contato: o seu e-mail. Aceite os termos e clique em **Criar**.
   - Em **Público** (ou "Usuários de teste"), clique em **Adicionar usuários** e coloque **o seu e-mail** (e o de quem mais for usar).
5. **Crie as credenciais:** vá em **Clientes** (ou **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**).
   - Tipo de aplicativo: **Aplicativo da Web**.
   - Nome: `Compras Express local`.
   - Em **URIs de redirecionamento autorizados**, clique em **Adicionar URI** e cole exatamente:

     ```
     http://localhost:3000/api/auth/google/retorno
     ```

   - Clique em **Criar**.
6. Vai aparecer o **ID do cliente** e a **Chave secreta do cliente**. Guarde as duas para o [Passo 4](#passo-4-abrir-o-app).

> **Sobre o login expirar:** enquanto o app do Google estiver em modo **"Teste"**, o Google pede para entrar de novo a cada 7 dias. Isso é normal. Para não precisar, vá em **Público** e clique em **Publicar app**. O Google vai mostrar "app não verificado" no login; como o app é seu, clique em **Avançado** e depois em **Acessar Compras Express**.

**Permissões que o app pede:** só o seu e-mail (para registrar quem lançou) e acesso às planilhas (`spreadsheets`). Ele **não** pede acesso ao Gmail nem ao resto do Drive.

---

## Passo 3: chave da IA

Só é necessária para ler **fotos, prints e PDFs**. XML de NF-e funciona sem ela.

1. Acesse **https://console.anthropic.com** e crie uma conta.
2. Em **Billing** (cobrança), adicione créditos. O custo costuma ser de alguns centavos de dólar por documento lido; XML não custa nada.
3. Em **API Keys**, clique em **Create Key**, dê o nome `Compras Express` e **copie a chave** (começa com `sk-ant-`). Ela só aparece uma vez.

> ⚠️ **Nunca** mande essa chave por e-mail ou WhatsApp, nem a coloque no GitHub. Se ela vazar, apague-a no console da Anthropic na hora (**API Keys** → **Delete**) e crie outra.

---

## Passo 4: abrir o app

### Windows

1. Dê **dois cliques** em **`iniciar.bat`**, na pasta do app.
   - Se aparecer "O Windows protegeu o computador", clique em **Mais informações** e depois em **Executar assim mesmo**.
2. Se o computador não tiver o **Node.js**, o script tenta instalar sozinho. Se ele pedir, feche a janela e dê dois cliques de novo. Se não conseguir instalar, baixe a versão **LTS** em https://nodejs.org.
3. Na primeira vez, abre o **Bloco de Notas** com o arquivo `.env`. Preencha:

   ```
   GOOGLE_CLIENT_ID=cole aqui o ID do cliente (passo 2)
   GOOGLE_CLIENT_SECRET=cole aqui a chave secreta do cliente (passo 2)
   ANTHROPIC_API_KEY=cole aqui a chave da IA (passo 3)
   ```

   Salve (**Ctrl+S**) e feche o Bloco de Notas.
4. Na primeira vez, a preparação leva alguns minutos. Depois o navegador abre sozinho em **http://localhost:3000**.
5. **Deixe a janela preta aberta** enquanto usa o app. Para encerrar, feche essa janela.

### Mac

1. Na primeira vez, clique com o **botão direito** em **`iniciar.command`**, escolha **Abrir** e confirme. Nas próximas vezes, basta dar dois cliques.
   - Se o Mac disser que o arquivo não pode ser aberto, abra o **Terminal**, digite `bash ` (com espaço), arraste o arquivo `iniciar.command` para a janela do Terminal e aperte Enter.
2. O resto é igual ao Windows. O arquivo `.env` abre no **TextEdit**.

> Quer mudar algo no `.env` depois? Abra o arquivo `.env` da pasta do app com o Bloco de Notas (Windows) ou o TextEdit (Mac), altere, salve e reabra o app.

---

## Passo 5: conectar a planilha

No app, vá em **Planilha**:

1. Clique em **Entrar com Google** e autorize.
2. Cole o **link da planilha** (copie da barra de endereço do navegador) e clique em **Abrir planilha**.
3. Responda como a planilha é organizada:
   - **uma linha por item** ou **uma linha por nota**;
   - **uma aba só**, ou **uma aba por mês**. No modo mensal, escolha a aba modelo, vazia e só com o cabeçalho. O app copia essa aba quando o mês ainda não existe.
4. Clique em **Ler colunas da planilha**. O app sugere o que vai em cada coluna. Confira, ajuste se precisar e clique em **Salvar configuração**.

Colunas com **fórmula** aparecem com 🔒 e nunca recebem dados. Para cada linha nova, o app copia a fórmula da linha de cima.

**Dica:** se a planilha tiver colunas **"Arquivo de origem"** e **"Lote"**, cada linha lançada fica rastreável até o documento. Vale a pena criar essas duas colunas.

---

## Como usar no dia a dia

1. Abra o app (dois cliques em `iniciar`).
2. Clique em **Começar novo lote**.
3. Arraste **todas** as notas e prints de uma vez, ou cole prints com **Ctrl+V**.
4. Espere a barra azul terminar. Arquivos que não puderam ser lidos aparecem em vermelho no topo, com o motivo.
5. Clique em **Aprovar todos os verdes**.
6. Marque **Mostrar só o que precisa conferir**. Para cada linha amarela ou vermelha, olhe o documento ao lado, corrija a célula se precisar e marque a caixinha de aprovar.
7. Clique em **Lançar na planilha**. O app informa em quais linhas os dados entraram.
8. Errou? Na tela inicial, clique em **Desfazer último lote**. Por segurança, ele só desfaz se as linhas continuarem exatamente como foram gravadas.

---

## Testar sem conta Google (modo demonstração)

Dá para testar tudo antes de configurar o Google:

1. Abra o app e vá em **Planilha** → **Usar demonstração** → **Ler colunas da planilha** → **Salvar configuração**.
2. Comece um lote e arraste os arquivos da pasta **`exemplos/`**. Todos são fictícios.
3. Em **Histórico**, você vê como a planilha de demonstração ficou. O botão **Recomeçar demonstração** volta ao estado inicial.

A pasta `exemplos/` também tem uma **`planilha-modelo.xlsx`** fictícia. Para criar uma planilha de teste no Google, use **Arquivo** → **Importar** no Google Sheets.

---

## Privacidade: o que sai do computador

| O quê | Para onde | Quando |
|---|---|---|
| Linhas aprovadas | **Sua planilha no Google** (sua conta) | Quando você clica em "Lançar" |
| Leitura da planilha (para achar duplicatas e sugerir nomes) | Google, só leitura | Durante a revisão |
| Imagem do print/foto ou PDF escaneado | **Anthropic (IA Claude)**, para ler os dados | Ao processar o arquivo |
| Texto de PDFs com texto, já **sem CPF e nome de paciente** | **Anthropic (IA Claude)** | Ao processar o arquivo |
| XML de NF-e | **Não sai do computador** (lido localmente) | Nunca |

- O **nome do arquivo não é enviado** à IA.
- O app **nunca guarda nem lança** nome, CPF, prontuário ou cartão SUS de pacientes. Ele apaga esses dados do texto antes de enviar e filtra a resposta da IA. O destinatário e as "informações complementares" da NF-e nunca são lidos.
- **Fica só no computador**, na pasta `data/` do app:
  - os arquivos enviados, apagados automaticamente após **30 dias** (configurável em `RETENCAO_DIAS` no `.env`);
  - o histórico de lotes;
  - as correções que o app aprendeu.
- Os registros de ações guardam só contagens, nomes de arquivo e números de linha. **Nunca o conteúdo dos documentos.**
- O app só abre em `localhost`. Ninguém de fora, nem da mesma rede, consegue acessá-lo.
- Sobre o uso de dados pela Anthropic, veja a política em https://www.anthropic.com/legal/commercial-terms.

---

## Problemas comuns

| Problema | O que fazer |
|---|---|
| "Erro 400: redirect_uri_mismatch" no login | No Google Cloud, a URI de redirecionamento precisa ser exatamente `http://localhost:3000/api/auth/google/retorno`. Se mudou a `PORTA` no `.env`, troque o `3000` também. |
| "Acesso bloqueado" / "app não verificado" | Confira se seu e-mail está em **Usuários de teste** (passo 2.4). |
| Pede login de novo toda semana | É o modo "Teste" do Google. Veja a nota no fim do [Passo 2](#passo-2-google-cloud-login-e-planilha). |
| "A chave da IA não está configurada" | Preencha `ANTHROPIC_API_KEY` no `.env` e reabra o app. |
| "Limite de uso da IA atingido" | Aguarde alguns minutos ou diminua `CONCORRENCIA_IA` no `.env`. Confira se há créditos na conta da Anthropic. |
| A porta 3000 está ocupada | Mude `PORTA=3001` no `.env` e ajuste a URI de redirecionamento no Google Cloud. |
| Atualizei o app e nada mudou | Apague a pasta `.next` dentro da pasta do app e abra de novo. |
| "Nada foi desfeito" ao desfazer | Alguém editou as linhas lançadas na planilha. Por segurança o app não apaga; corrija manualmente. |

---

## Para quem desenvolve

**Stack:**

- Next.js 16 + TypeScript + Tailwind, rodando em `127.0.0.1`, com as rotas de API no próprio app;
- SQLite embutido do Node (`node:sqlite`, Node ≥ 22.13), sem dependência nativa extra;
- Google Sheets API v4 com OAuth (escopos `openid email spreadsheets`);
- API do Claude com visão e saída estruturada validada por Zod (`@anthropic-ai/sdk`);
- `sharp` + `heic-convert` para imagens e `unpdf` para texto de PDF;
- Vitest para os testes.

```bash
npm ci              # instalar
npm run dev         # desenvolvimento em http://localhost:3000
npm test            # testes automatizados
npm run lint        # lint
npm run typecheck   # checagem de tipos
npm run build && npm start   # produção local (abre o navegador)
npm run exemplos    # regera os arquivos fictícios de /exemplos
npm run exemplos -- --lote-grande 100   # 100 XMLs fictícios em data/lote-grande (teste de volume)
```

**Estrutura:**

```
src/lib/campos.ts            campos que o app extrai/lança
src/lib/mapeamento.ts        proposta "cabeçalho -> campo"
src/lib/validacao.ts         validações (soma, CNPJ, data, obrigatórios)
src/lib/duplicatas.ts        chaves de duplicata e hashes (idempotência)
src/lib/planilha/            planejador "acrescentar sem sobrescrever", Google Sheets e planilha em memória
src/lib/extracao/            XML NF-e, PDF, imagem, IA, privacidade
src/lib/servidor/            banco, fila, processamento, lançar/desfazer, OAuth
src/app/                     telas e rotas /api
tests/                       testes (mapeamento, validações, duplicatas, acréscimo, fluxo completo)
exemplos/                    arquivos 100% fictícios
```

**CI:** cada pull request roda lint, tipos, testes, build e **gitleaks** (verificação de segredos em todo o histórico).

### Fases

- **Fase 1 (MVP, esta versão):** conectar planilha, enviar em lote, extrair, validar, detectar duplicatas, revisar, lançar, rastrear e desfazer.
- **Fase 2:** aprendizado do de/para com aproximação, deduplicação avançada, pasta de comprovantes no Drive (`Notas/AAAA-MM`) com link na planilha, e o modo "aprovar verdes automaticamente" (desligado por padrão).
- **Fase 3:** resumo mensal por categoria e fornecedor, alerta de preço fora do padrão e exportação de relatório.
- **Excel (.xlsx / OneDrive):** previsto. A lógica de mapeamento e acréscimo já é separada da planilha (interface `AdaptadorPlanilha`), para receber um adaptador de Excel.

---

## Licença

[MIT](LICENSE). Todos os dados de exemplo são inventados.
