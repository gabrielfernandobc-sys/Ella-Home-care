# 📱 Compras Express no celular — versão gratuita

Funciona **dentro da sua planilha do Google**. Não precisa de computador ligado, servidor, Google Cloud nem chave de IA.
**Custo: zero.** Instala uma vez (uns 10 minutos, pelo computador) e depois é só usar no celular.

## Como ele lê as notas (sem IA paga)

| Arquivo | Como é lido | Precisão |
|---|---|---|
| **XML da NF-e** | lido direto | 100% — tudo verde |
| **PDF da nota (DANFE)** | reconhecimento de texto gratuito do Google Drive | CNPJ e número saem da chave de acesso (exatos); itens só entram se *quantidade × valor = total* |
| **Foto ou print** | o mesmo reconhecimento de texto | o que não dá para conferir fica **vazio e amarelo** para você completar |

O app **nunca inventa valor**: se não conseguiu ler com certeza, deixa em branco e avisa.
Dica: sempre que o fornecedor mandar o **XML**, prefira ele.

## Instalar (uma vez, pelo computador)

1. Abra a sua planilha de compras no Google Planilhas.
2. Menu **Extensões → Apps Script**. Abre uma página nova.
3. No arquivo **Código.gs**, apague o que estiver lá. Abra o arquivo
   [`apps-script/dist/Codigo.gs`](dist/Codigo.gs) aqui no GitHub, clique em **Copiar** (ícone de duas folhas, em cima à direita)
   e cole no Código.gs.
4. Clique no **+** ao lado de "Arquivos" → **HTML**. Dê o nome **`Index`** (exatamente assim, sem ".html").
   Apague o conteúdo e cole o arquivo [`apps-script/dist/Index.html`](dist/Index.html).
5. À esquerda, em **Serviços**, clique no **+**, escolha **Drive API** e clique em **Adicionar**.
   *(É o que permite ler fotos e PDFs. Sem ele, só XML funciona.)*
6. Clique em **Salvar** (ícone de disquete).
7. Clique em **Implantar → Nova implantação**. Na engrenagem, escolha **App da Web**.
   - Executar como: **Eu**
   - Quem pode acessar: **Somente eu**
   - Clique em **Implantar**.
8. O Google vai pedir autorização: **Autorizar acesso** → escolha sua conta → se aparecer "O Google não verificou este app",
   clique em **Avançado → Acessar Compras Express (não seguro)** → **Permitir**.
   *(O aviso aparece porque o app é seu, feito por você — não é de outra empresa. Ele só acessa esta planilha e cria
   documentos temporários de leitura, que apaga na hora.)*
9. Copie o **link do App da Web** que aparece no final.

## Colocar no celular

1. Mande o link para você mesma (WhatsApp, e-mail) e abra no celular, **logada na mesma conta Google**.
2. Adicione à tela inicial:
   - **Android (Chrome):** menu ⋮ → **Adicionar à tela inicial**.
   - **iPhone (Safari):** botão de compartilhar → **Adicionar à Tela de Início**.
3. Pronto: vira um ícone, como um aplicativo.

Esqueceu o link? Na planilha, menu **Compras Express → Link para abrir no celular**.
No computador, dá para usar direto: **Compras Express → Abrir aqui**.

## Usar

1. **Primeira vez:** escolha a aba das compras e confira o que vai em cada coluna (o app sugere). Colunas com fórmula
   não são mexidas.
2. **📷 Tirar foto** ou **📁 Escolher arquivos** (pode vários: fotos, prints, PDFs, XMLs).
3. Confira cada linha:
   - 🟢 **verde** — conferiu tudo;
   - 🟡 **amarelo** — complete ou confira os campos destacados;
   - 🔴 **vermelho** — tem erro ou já está na planilha. Só entra com **Lançar mesmo assim**.
4. Marque **Conferi, pode lançar** e toque em **Lançar na planilha**.

As linhas novas entram **depois da última compra** (antes da linha de totais, se houver, e a soma é ajustada).
Nada do que já existe é apagado ou mudado. Mandou a mesma nota duas vezes? O app avisa e não duplica.

Errou? **Histórico → Desfazer o último lote** apaga só as linhas que o app criou — e só se ninguém mexeu nelas depois.

Quando você corrige um nome de produto ou fornecedor, o app aprende e corrige sozinho da próxima vez (sempre avisando).

## Privacidade

- Tudo fica na **sua conta Google**: planilha, abas ocultas do app (`CE_Pendentes`, `CE_Registro`, `CE_DePara`) e o
  documento temporário de leitura, que é apagado logo depois.
- Nada é enviado para empresas de IA.
- CPF e nome de paciente que apareçam na nota são apagados do texto antes de qualquer coisa ser guardada. O destinatário
  da NF-e e as informações complementares nem são lidos.

## Atualizar para uma versão nova

Repita os passos 3 e 4 (colar de novo os dois arquivos), salve e vá em **Implantar → Gerenciar implantações → ✏️ editar →
Versão: Nova versão → Implantar**. O link continua o mesmo.

## Problemas comuns

- **"Falta ativar o serviço Drive API"** → passo 5 da instalação.
- **"Não consegui ler texto neste arquivo"** → foto tremida, escura ou torta. Tire de novo, de frente, com luz.
- **Pede para fazer login no celular** → abra o link com a **mesma conta Google** dona da planilha.
- **"Lançar" demora** → o Google leva alguns segundos; não feche a tela até aparecer a mensagem verde.

---

### Para quem desenvolve

- Código-fonte em `apps-script/src` (`Logica.js` é pura e testada no Node; `Servidor.js` usa os serviços do Google).
- `npm run apps-script` gera `apps-script/dist` (sempre rode e commite junto; um teste confere).
- `tests/apps-script.test.ts` (leitura) e `tests/apps-script-servidor.test.ts` (fluxo completo numa planilha simulada).
