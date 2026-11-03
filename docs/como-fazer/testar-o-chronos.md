# Como testar o Chronos

Há três níveis: testes **offline** (rápidos, sem rede), **avaliação do prompt** (usa o DeepSeek de verdade) e **testes ponta a ponta** pelo Telegram.

## 1. Testes offline

Executam os nós *Code* dos JSON exportados num ambiente n8n simulado (Todoist, Google e DeepSeek são mockados). Só precisam de Node 18+.

```bash
cd tests/fluxo-1b && npm install && npm test      # Fluxo 1b e utilitários
cd tests/fluxo-4  && npm install && npm test      # Fluxos 2, 3, 4 e utilitários
```

O que cobrem:

- **`tests/fluxo-1b`** — árvore do Todoist e orçamento de tokens, ordem do prompt, validação dos ids devolvidos pela IA (ids inventados nunca causam erro), subtarefas e limite de aninhamento, falha parcial de subtarefas, pendências/botões, eventos (dia inteiro, agenda sem correspondência), tarefa × evento, fuso e idioma pelo `.env` e a verificação de que **nenhum workflow versionado contém dado pessoal, segredo ou id de instância**.
- **`tests/fluxo-4`** — janela da semana, dia inteiro (`end` exclusivo), eventos multi-dia/recorrentes/cancelados/recusados, divisão em mensagens (com resposta da IA válida, inválida e erro), seleção de agendas (Fluxos 2 e 4), fuso/idioma nos Fluxos 2, 3 e utilitários.

## 2. Avaliação do prompt (manual, usa a API real)

Roda 25 mensagens genéricas contra o DeepSeek e confere destino, pai, subtarefas e tipo (tarefa × evento). Gasta tokens, por isso não roda no `npm test`.

```bash
cd tests/fluxo-1b
DEEPSEEK_API_KEY=... npm run avaliar
# opcional: mede tokens com a sua árvore real do Todoist
DEEPSEEK_API_KEY=... TODOIST_API_TOKEN=... node avaliacao.js --tree-real
```

Rode depois de qualquer mudança no prompt do *Montar prompt*.

## 3. Ponta a ponta pelo Telegram

Com o Chronos instalado, envie ao bot e confira:

| Envie | Esperado |
| --- | --- |
| `/ajuda` | ajuda de comandos + seu `chat_id` |
| `comprar leite amanhã` | tarefa na Entrada (ou subtarefa de uma “Lista de Compras”), data de amanhã, horário livre encaixado |
| `dentista sexta às 15h na clínica Sorriso` | evento 15:00–16:00 na agenda escolhida, local preenchido, link do Google; nada no Todoist |
| `aniversário da Ana dia 2` | evento de dia inteiro |
| `Tarefa: ligar para o Carlos às 12h` | **tarefa** com prazo 12h (horário em tarefa é prazo, não evento) |
| `organizar o aniversário do João no sábado: reservar o salão, mandar os convites e encomendar o bolo` | tarefa com título curto + 3 subtarefas reais |
| `comprar parafusos, subtarefa de Montar estante` | “✅ Subtarefa criada ↳ dentro de Montar estante” |
| subtarefa de uma tarefa **inexistente** | tarefa criada na **Entrada** com aviso “não consegui identificar qual seria a tarefa-pai” |
| subtarefa ambígua (2+ tarefas parecidas) | pergunta com botões; sem resposta em 30 min, cria sem tarefa-pai e avisa |
| `/edit Montar estante \| mudar prazo pra sexta` | confirmação com “📅 Prazo: … → sex …”; nome inexistente → “não encontrei” |
| `/hoje` | resumo com 📅 Agenda, tarefas de hoje, atrasadas, 3 sugestões; botões funcionam |
| `/semana` | agenda de segunda a domingo da semana atual |

### Várias mensagens acumuladas (processamento um a um)

1. `docker compose stop n8n`.
2. Mande 3 mensagens ao bot (por exemplo: “comprar pão amanhã”, “dentista sexta 15h”, “ler capítulo 5 até sexta”).
3. `docker compose start n8n`.
4. Em ~1 min chegam as 3 confirmações, **na ordem**. Em *Executions* do Fluxo 1 há uma execução com o loop *Um update por vez* rodando 3 vezes e 3 execuções do Fluxo 1b.

### Simular outra semana (Fluxo 4)

O item de entrada do Fluxo 4 aceita `ref_date` (`AAAA-MM-DD`): no editor, use *pin data* com `{ "ref_date": "2026-10-26" }` e execute.
