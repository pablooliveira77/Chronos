# Melhoria — Agenda da Semana (Fluxo 4)

| Campo | Valor |
| --- | --- |
| Criada em | 2026-10-23 |
| **Executado em:** | **2026-10-23** — Fluxo 4 reescrito como agenda da semana (código + 15 testes offline passando). Importado, publicado e executado com sucesso no n8n real. |
| Fluxos afetados | Fluxo 4 (hoje "Métricas da semana"); novo comando `/semana` |

> **Instrução para o Claude Code:** se o campo **Executado em** acima estiver preenchido com
> uma data, esta melhoria **já foi implementada — não refaça**. Ao concluir a implementação
> (código + testes passando), preencha o campo com a data (AAAA-MM-DD) e uma linha de resumo
> do que foi feito. Se algo ficou de fora, registre na seção "Observações da execução" no fim.

---

## 1. Objetivo

Hoje o Fluxo 4 envia, na segunda cedo, um relatório **retrospectivo** da semana anterior
(métricas de tarefas). Essa informação foi considerada pouco efetiva.

A melhoria **substitui** esse relatório por um resumo **prospectivo**: a **agenda da semana
atual** (eventos do Google Calendar), de segunda 00:00 até a segunda seguinte 00:00
(equivale a "até domingo 23:59").

## 2. O que sai e o que entra

**Sai (remover do Fluxo 4):**
- Consultas ao Todoist de tarefas concluídas/criadas da semana anterior.
- Agregações e formatação das métricas (contagens por projeto, taxa de atraso etc.).

**Entra:**
- Leitura dos eventos das agendas do Google Calendar para a semana atual.
- Mensagem formatada por dia, com divisão automática em blocos quando passar do limite do Telegram.
- Disparo por comando `/semana`, além do agendamento de segunda.

**Fora de escopo (por enquanto):** tarefas do Todoist (nem do dia, nem atrasadas) não
aparecem nesta mensagem. Podem voltar numa melhoria futura.

## 3. Regras de negócio

### 3.1 Janela de tempo
- Início: **segunda-feira 00:00** da semana atual. Fim: **segunda-feira seguinte 00:00 (exclusivo)**.
- Fuso: `America/Sao_Paulo`. Calcular com Luxon (`startOf('week')`, que começa na segunda) e
  enviar `timeMin`/`timeMax` à API em RFC 3339 **com offset**.
- "Semana atual" é sempre a que contém a data de execução. Se rodar no domingo, é a semana que termina naquele dia.
- No `/semana`, a janela é a mesma (segunda 00:00 → segunda seguinte 00:00), mesmo que já seja quarta;
  os dias passados aparecem normalmente.

### 3.2 Fonte dos eventos
- **Reaproveitar** a lógica já existente no Fluxo 2: *Google: listar agendas → Selecionar agendas →*
  busca de eventos, trocando apenas `timeMin`/`timeMax`. Não duplicar a resolução de agendas;
  se possível, extrair para um sub-workflow compartilhado.
- Usar `singleEvents=true` e `orderBy=startTime` (expande recorrências em ocorrências).
- Ignorar eventos com `status = cancelled` e eventos que o próprio usuário recusou
  (`attendees[self=true].responseStatus = declined`).
- Nomes de agendas vêm da configuração/`calendarList` — **não hardcodar IDs ou nomes pessoais**
  (o projeto será publicado no GitHub).

### 3.3 Eventos de dia inteiro
- A API devolve `start.date`/`end.date` (sem hora) e o `end` é **exclusivo**
  (evento de um dia na segunda tem `end` na terça). Comparar por **data**, nunca por datetime.
- Exibir no topo do dia, antes dos eventos com horário, marcados como "Dia inteiro".

### 3.4 Eventos que atravessam mais de um dia
Estratégia **híbrida**: detalhes completos no **primeiro dia visível**, e uma **linha curta de
continuação** nos dias seguintes.

- **Dia em que o evento aparece primeiro na semana:** linha completa com início e fim
  (`• 09:00 Viagem ▶ até dom 01/11 16:00 (Agenda)`).
- **Dias intermediários:** `↳ Viagem (continua)`.
- **Último dia:** `↳ Viagem (termina 16:00)`.
- **Evento que começou antes de segunda:** na segunda, usar a linha completa indicando a origem
  (`↳ Viagem (desde dom 25/10, até seg 12:00)`) — o "primeiro dia visível" é a segunda.
- **Evento que termina depois do domingo:** no último dia visível, indicar que continua além
  (`↳ Viagem (continua até seg 02/11 08:00)`).
- Um dia que só tem linhas de continuação **não é "livre"**: não escrever "livre" nesse dia.
- Eventos multi-dia/dia inteiro **não contam** como conflito de horário com eventos com hora
  (relevante apenas se a detecção de conflitos for implementada no futuro).

Motivo: evita repetir o texto completo do evento em cada dia (economiza caracteres e leitura),
mas mantém cada dia "autocontido" — quem lê só o bloco de um dia sabe que há algo em andamento.

### 3.5 Eventos recorrentes
- Indicar com o ícone **🔁** logo após o título, sem texto adicional
  (`• 09:00–10:00 Reunião X 🔁 (Trabalho)`).
- Identificar por `recurringEventId` presente no evento expandido.

## 4. Formato da mensagem

Agrupado por dia, em ordem cronológica; dentro do dia: dia inteiro primeiro, depois por horário.
Cada linha: horário, título, 🔁 se recorrente, agenda de origem entre parênteses, local se houver.

Exemplo (semana 26/10 – 01/11):

```
📅 Sua semana (26/10 – 01/11)

Segunda 26/10
 • Dia inteiro: Feriado local (Pessoal)
 • 09:00–10:00 Reunião X 🔁 (Trabalho)
 • 19:30 Encontro Y (Casa) — Salão Z

Terça 27/10 — livre

Sexta 30/10
 • 09:00 Viagem ▶ até dom 01/11 16:00 (Pessoal)

Sábado 31/10
 ↳ Viagem (continua)

Domingo 01/11
 ↳ Viagem (termina 16:00)
```

- Semana sem nenhum compromisso: enviar uma única mensagem curta informando isso.
- Usar `parse_mode: HTML` e **escapar** `<`, `>` e `&` nos títulos/locais dos eventos.

## 5. Divisão em múltiplas mensagens (limite do Telegram)

Limite do Telegram: 4096 caracteres por mensagem. Usar margem de segurança (ex.: tratar 3800 como teto).

Regras:
1. **Nunca cortar no meio de um dia.** A divisão só pode acontecer **entre blocos de dias**.
2. Se a mensagem completa couber no teto, enviar como uma só.
3. Se não couber, dividir em 2 (ou mais) blocos, cada um com cabeçalho próprio
   (ex.: `📅 Sua semana (1/2)`, `(2/2)`), sempre começando em um dia inteiro.

**Papel do DeepSeek:** ler o texto completo e **decidir onde dividir** (quais dias vão em cada bloco,
equilibrando o tamanho). Para evitar que o modelo altere ou perca conteúdo:
- O DeepSeek retorna **apenas os pontos de divisão** (ex.: JSON com o primeiro dia de cada bloco),
  **nunca o texto reescrito**.
- O **código monta os blocos** a partir do texto original usando esses pontos.
- **Validação obrigatória:** a concatenação dos blocos deve ser idêntica ao texto original e cada
  bloco ≤ teto. Se a validação falhar (ou o DeepSeek der erro/timeout), usar **divisão
  determinística** por dia como fallback — o relatório nunca deve deixar de ser enviado.
- Só chamar o DeepSeek quando a mensagem **exceder o teto**; caso contrário, não gastar chamada.

## 6. Disparo

- **Agendado:** manter o Schedule Trigger de segunda cedo já existente no Fluxo 4 (mesmo horário atual).
- **Sob demanda:** comando `/semana` no Telegram (mesmo padrão do `/hoje`), sempre devolvendo a
  semana atual (segunda 00:00 → segunda seguinte 00:00).
- Limitação conhecida: o Schedule Trigger do n8n **não roda retroativamente** se o PC/Docker
  estiver desligado na segunda cedo — o `/semana` é a forma de recuperar o relatório.

## 7. Critérios de aceite

- [ ] O relatório de métricas da semana anterior foi removido (nenhuma consulta ao Todoist no Fluxo 4).
- [ ] Segunda cedo, o Fluxo 4 envia a agenda da semana atual (segunda 00:00 → segunda seguinte 00:00).
- [ ] `/semana` envia o mesmo relatório sob demanda, qualquer dia da semana.
- [ ] Eventos de dia inteiro aparecem no topo do dia, sem erro de "dia a mais" por `end` exclusivo.
- [ ] Evento multi-dia aparece completo no primeiro dia e como linha curta de continuação nos demais.
- [ ] Evento que começou antes de segunda e/ou termina depois de domingo é indicado corretamente.
- [ ] Eventos recorrentes aparecem com 🔁; cancelados e recusados não aparecem.
- [ ] Dias sem eventos mostram "livre"; dias só com continuação **não** mostram "livre".
- [ ] Mensagem acima do teto é dividida **entre dias**, nunca no meio de um dia.
- [ ] Falha do DeepSeek na divisão não impede o envio (fallback determinístico).
- [ ] Nenhum ID de agenda, `chat_id` ou nome pessoal hardcoded no workflow versionado.

## 8. Testes

A data de referência ("hoje") deve ser **parametrizável** para testar qualquer semana sem esperar segunda.
Cenários mínimos (com a API do Google Calendar mockada ou agenda de teste):

1. Semana vazia.
2. Semana com eventos simples em vários dias.
3. Evento de dia inteiro (1 dia) — verificar o `end` exclusivo.
4. Evento multi-dia dentro da semana (sexta → domingo).
5. Evento que começa antes de segunda; evento que termina depois de domingo.
6. Evento recorrente; evento cancelado; evento recusado.
7. Virada de mês (ex.: 26/10 – 01/11) e de ano.
8. Mensagem acima do teto → divisão por dia; DeepSeek mockado com resposta válida, inválida e erro (testar o fallback).
9. Título com caracteres HTML (`<`, `&`) não quebra o envio.
10. `/semana` executado numa quarta devolve a mesma janela do agendamento de segunda dessa semana.

## 9. Passo a passo sugerido para o Claude Code

1. Ler o workflow atual do Fluxo 4 e a documentação dos workflows (hoje `docs/referencia/workflows.md`); descrever o comportamento atual antes de alterar.
2. Remover a parte de métricas/Todoist do Fluxo 4.
3. Implementar o cálculo da janela (Luxon, `America/Sao_Paulo`) com data de referência parametrizável.
4. Reaproveitar a busca de agendas/eventos do Fluxo 2 (ou extrair sub-workflow compartilhado).
5. Implementar a normalização dos eventos (dia inteiro, multi-dia, recorrente, cancelado/recusado) em um nó Code.
6. Implementar a formatação por dia e a regra de continuação.
7. Implementar a divisão (DeepSeek só decide os pontos; código monta; validação + fallback).
8. Adicionar o comando `/semana`.
9. Rodar os testes da seção 8 e só então preencher **Executado em:**.
10. Atualizar a documentação dos workflows e o roteiro (`docs/explicacao/roadmap-e-ideias.md`) (o item "Métricas Semanais" deixa de existir como descrito).

## 10. Observações da execução

**2026-10-23.** Fluxo 4 (`ChrFluxo4Metr001`, mesmo id) reescrito em `workflows/fluxo-4-agenda-semanal.json` (renomeado de `fluxo-4-metricas-semanais.json`): Período (Luxon, `ref_date` opcional) → listar/selecionar agendas → eventos → Montar agenda → Passou do teto? → [DeepSeek: onde dividir] → Dividir em mensagens → Telegram. Todoist removido do Fluxo 4. No Fluxo 1b: nó renomeado para "Fluxo 4: agenda agora" e texto do `/ajuda`. Docs, README e roadmap atualizados. Testes: `tests/fluxo-4` (`npm install && npm test`), 15 casos cobrindo a seção 8.

**Desvios / decisões:**
- **Resolução de agendas não foi extraída para sub-workflow** (o documento permitia "se possível"): o Fluxo 4 já tinha a sua cópia; extrair obrigaria reimportar Fluxo 2 e 1b ativos (risco do gatilho duplicado). Continuam 3 cópias idênticas de *listar agendas → Selecionar agendas*.
- ~~Nomes das 4 agendas fixos no nó *Selecionar agendas*.~~ **Resolvido em 2026-11-03:** o nó usa todas as agendas editáveis do `calendarList` (ou as de `CHRONOS_CALENDARS`). Não há ID nem `chat_id` no JSON (`$env.TELEGRAM_CHAT_ID`).
- Horário mantido em **segunda 9h30** (documento diz "segunda cedo / mesmo horário atual").
- Divisão: o DeepSeek recebe chaves `AAAA-MM-DD` dos dias e devolve só a primeira de cada bloco. Um dia sozinho maior que o teto é quebrado por linha ("(cont.)") — o documento não previa esse caso.
- Rodapé de erro (agenda indisponível) entra na contagem do teto e vai na última mensagem.
- Alias `/metricas` no Fluxo 1 mantido (alterar exigiria reimportar o poller ativo).
- Sem paginação de eventos (250 por agenda).

**Deploy (2026-10-23):** Fluxo 4 e 1b importados e publicados, n8n reiniciado. Execução real (`n8n execute`) com Google Calendar (6 eventos) e Telegram: mensagem entregue, sem erros. **Não exercitado em produção:** a chamada real ao DeepSeek para divisão (só testada com mock) e o `/semana` digitado no Telegram.
