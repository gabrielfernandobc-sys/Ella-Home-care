# CLAUDE.md — Compras Express

@AGENTS.md

## Objetivo

App web **local** (roda em `127.0.0.1`, sem hospedagem) que elimina a digitação manual de notas fiscais e prints numa
planilha recorrente de controle de compras (medicamentos, materiais de consumo etc.). A usuária final **não é técnica**:
toda a interface é em português do Brasil, com botões grandes e textos sem jargão. Ela só confere e aprova.

Fluxo: conectar planilha (uma vez) → enviar arquivos em lote → extrair (XML direto / PDF texto / IA com visão) →
validar → detectar duplicatas → revisar (verde/amarelo/vermelho) → lançar só o aprovado → rastrear/desfazer.

## Regras inegociáveis (nunca quebrar; todo PR deve preservá-las)

1. **Nunca inventar valor.** Ilegível ou ausente = vazio + amarelo. Nada de estimar ou recalcular valor lido.
2. **Nunca gravar sem aprovação** da usuária. Vermelho só com "Lançar mesmo assim" explícito.
3. **Nunca apagar nem sobrescrever** dados existentes da planilha. Só acrescentar linhas (planejador em
   `src/lib/planilha/planejador.ts`). Colunas com fórmula nunca recebem valor. A única exclusão permitida é
   "Desfazer último lote", e só de linhas criadas pelo app que ainda conferem com o que foi gravado.
4. **Idempotência:** reenviar o mesmo arquivo/lote gera 0 linhas novas (hash do arquivo + hash da linha em `lancamentos`).
5. **Rastreabilidade:** todo valor lançado tem arquivo de origem e ID do lote (tabela `lancamentos`).
6. **Erro em um arquivo não trava o lote.**
7. **Nada passa em silêncio:** todo problema vira aviso (amarelo) ou erro (vermelho).
8. **LGPD:** nunca extrair/guardar/lançar dados de pacientes (nome, CPF, prontuário, cartão SUS). Mascarar antes de
   enviar à IA (`src/lib/extracao/privacidade.ts`). Nunca registrar conteúdo de documentos em logs.
9. **Opções da fase 2 nunca contornam as regras acima:** "aprovar verdes automaticamente" só marca a caixinha
   (lançar exige o clique da usuária) e vem desligada; comprovantes são guardados ANTES de gravar na planilha
   (falhou = nada é lançado); o de/para por aproximação nunca troca números, unidades, tamanhos ou negações, e
   fornecedor só é corrigido por CNPJ ou texto exato.
10. **Repositório público:** nenhum dado real, nome de instituição, e-mail, chave ou segredo no código, testes ou exemplos.
   Exemplos são 100% fictícios (`src/lib/exemplos/ficticios.ts`, `exemplos/`). Segredos só no `.env` local.

## Stack

- Next.js 16 (App Router; `proxy.ts` em vez de middleware) + TypeScript + Tailwind v4. Antes de mexer em APIs do Next,
  leia `node_modules/next/dist/docs/` (versão nova, diferente do que você conhece).
- SQLite via `node:sqlite` (Node ≥ 22.13), arquivo em `data/compras.db`.
- Google Sheets API v4 (`@googleapis/sheets` + `google-auth-library`), OAuth com retorno em
  `http://localhost:PORTA/api/auth/google/retorno`. Escopos: `openid email spreadsheets`; `drive.file` (via
  `@googleapis/drive`) só é pedido quando a usuária liga os comprovantes — nunca peça escopos mais amplos.
- Claude API (`@anthropic-ai/sdk`), modelo em `CLAUDE_MODEL` (padrão `claude-opus-5-5`), saída estruturada com
  `betaZodOutputFormat` + Zod, fallback de recusa no servidor (`fallbacks: "default"`).
- Imagens: `sharp` + `heic-convert`. PDF: `unpdf`. XML: `fast-xml-parser` (sem DOCTYPE).
- Testes: Vitest. CI: GitHub Actions (lint, tipos, testes, build, gitleaks).

## Comandos

```bash
npm ci                 # instalar
npm run dev            # desenvolvimento (127.0.0.1:3000)
npm test               # testes (vitest)
npm run lint           # eslint
npm run typecheck      # gera os tipos de rota do Next (next typegen) e roda tsc --noEmit
npm run build          # build de produção
npm start              # produção local; abre o navegador (NAO_ABRIR_NAVEGADOR=1 para não abrir)
npm run exemplos       # regera /exemplos (fictícios)
```

Antes de cada commit: `npm run lint && npm run typecheck && npm test`.

## Convenções

- **Português** em nomes de domínio (funções, variáveis, mensagens, commits). Termos técnicos de bibliotecas ficam em inglês.
- Mensagens para a usuária: frases curtas, sem jargão, dizendo o que fazer.
- Lógica pura em `src/lib/*` (testável, sem I/O); I/O em `src/lib/servidor/*` e `src/lib/planilha/google.ts`.
- Toda planilha é acessada pela interface `AdaptadorPlanilha` (`src/lib/planilha/tipos.ts`). Testes usam `PlanilhaMemoria`.
- Toda regra nova de validação, duplicata ou escrita na planilha precisa de teste em `tests/`.
- Mudança no banco = nova migração no fim de `MIGRACOES` (`src/lib/servidor/db.ts`); nunca edite uma migração já publicada.
- Testes que precisam da IA usam `vi.mock("@/lib/extracao/ia")` (ver `tests/dedup-arquivos.test.ts`); comprovantes usam
  `definirArmazemParaTestes`. Nenhum teste chama serviços externos.
- Textos são gravados em modo RAW (nunca viram fórmula); datas/fórmulas em USER_ENTERED.
- Um commit por etapa, mensagem clara em português. Uma branch por fase (`fase-1-mvp`, `fase-2`, `fase-3`) e PR ao fim de cada uma.
- Nunca commitar `.env`, `data/`, credenciais, planilhas ou notas reais (o `.gitignore` bloqueia; não force).
