# Exemplos fictícios

Todos os arquivos desta pasta foram **inventados** para testar o app sem usar dados reais. Nenhum fornecedor, CNPJ, nota ou valor é real. Os CNPJs foram gerados só para passar na validação do dígito verificador; qualquer coincidência com uma empresa real é acidental.

| Arquivo | O que testa | Resultado esperado na revisão |
|---|---|---|
| `notas-xml/nfe-1-1201.xml` | NF-e com frete | 🟢 3 itens, lidos direto do XML (sem IA) |
| `notas-xml/nfe-2-88342.xml` | NF-e com desconto | 🟢 3 itens (medicamentos) |
| `notas-xml/nfe-3-455.xml` | NF-e de limpeza | 🟢 2 itens |
| `notas-xml/nfe-soma-errada.xml` | Total da nota diferente da soma dos itens | 🟡 "A soma dos itens… é diferente do total da nota" |
| `pdf/danfe-ficticia-farmacia.pdf` | PDF com texto. É a mesma nota do `nfe-2`, então serve para testar duplicata. Tem um "paciente" fictício que deve ser ignorado | 🔴 duplicata se enviado junto com o XML da nota 88342 (precisa da chave da IA) |
| `prints/print-pedido-whatsapp.png` | Print de pedido em conversa | Itens do pedido (precisa da chave da IA) |
| `prints/print-sistema-compras.png` | Print de tela de sistema | Itens da NF 2290 (precisa da chave da IA) |
| `planilha-modelo.xlsx` | Planilha modelo: cabeçalho, 3 linhas, coluna com fórmula e linha de TOTAL, mais uma aba "Modelo" vazia | Importe no Google Sheets para testar com uma planilha de verdade |

Enviar `nfe-1-1201.xml` duas vezes no mesmo lote mostra o aviso de arquivo repetido.

Para gerar de novo: `npm run exemplos`.
Para um teste de volume com 100 XMLs fictícios: `npm run exemplos -- --lote-grande 100` (os arquivos vão para `data/lote-grande/`).
