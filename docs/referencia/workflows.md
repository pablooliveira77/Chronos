# Referência — workflows

Descrição técnica, nó a nó, dos 9 workflows em [`workflows/`](../../workflows/). Para o *porquê* das escolhas, veja [decisões de projeto](../explicacao/decisoes-de-projeto.md); para instalar, o [tutorial](../tutoriais/primeiros-passos.md).

## Índice

| Workflow | Arquivo | Gatilho | Quem o chama |
| --- | --- | --- | --- |
| [Fluxo 1 — Captura](#fluxo-1--captura-inteligente-poller) | `fluxo-1-captura.json` | Schedule, a cada 10 s | — |
| [Fluxo 1b — Processar mensagem](#fluxo-1b--processar-mensagem-sub-workflow) | `fluxo-1b-processar-mensagem.json` | Execute Workflow | Fluxo 1 |
| [Fluxo 2 — Rotina diária](#fluxo-2--rotina-diária) | `fluxo-2-rotina-9h20.json` | Schedule 09:20 + Execute Workflow | `/hoje` (Fluxo 1b) |
| [Fluxo 3 — Editar tarefa](#fluxo-3--editar-tarefa-edit) | `fluxo-3-editar-tarefa.json` | Execute Workflow | `/edit` (Fluxo 1b), Util: Pendências |
| [Fluxo 4 — Agenda da semana](#fluxo-4--agenda-da-semana) | `fluxo-4-agenda-semanal.json` | Schedule segunda 09:30 + Execute Workflow | `/semana` (Fluxo 1b) |
| [Util — Horário livre](#util--horário-livre) | `util-horario-livre.json` | Execute Workflow | Fluxo 1b, Util: Pendências |
| [Util — Buscar tarefa](#util--buscar-tarefa) | `util-buscar-tarefa.json` | Execute Workflow | Fluxo 1b, Fluxo 3 |
| [Util — Criar subtarefas](#util--criar-subtarefas) | `util-criar-subtarefas.json` | Execute Workflow | Fluxo 1b, Util: Pendências |
| [Util — Pendências](#util--pendências) | `util-pendencias.json` | Execute Workflow (botões `pk:`) + Schedule a cada 2 min | Fluxo 1b |

Convenções: toda chamada a sub-workflow usa `mode: each` (um item por execução); nós que respondem no Telegram usam `continueRegularOutput` (falhar ao *responder* não faz a mensagem ser reprocessada); `GET`s do Todoist têm `retryOnFail` (3 tentativas, 2 s). O n8n só publica um workflow se os sub-workflows que ele chama já estiverem publicados — o [`scripts/setup.mjs`](scripts.md) respeita essa ordem.

---

## Fluxo 1 — Captura inteligente (poller)

O Fluxo 1 só faz o **polling**. O processamento de cada update fica no sub-workflow **Fluxo 1b: Processar mensagem**.


```
A cada 10s → Telegram getUpdates → Extrair updates → Ler lock → Checar lock → Pegar lock → Updates a processar → Um update por vez (loop)
   cada update → Update atual → Ler tentativas → Contar tentativa → Salvar tentativa → Renovar lock → Desistir? (3 falhas)
        não → Montar entrada → Fluxo 1b: processar mensagem ─ ok ──→ Confirmar offset → Limpar tentativa → (próximo)
                                                           └ erro → Liberar lock (falha)   [offset NÃO avança]
        sim → Telegram: pulei a mensagem ──────────────────────────→ Confirmar offset → …
   fim do lote → Liberar lock
```

| Nó | O que faz |
| --- | --- |
| **Telegram getUpdates** | `GET /getUpdates?timeout=0&limit=50&allowed_updates=["message","callback_query"]`. Erro de rede → 3 tentativas e depois segue sem itens (a varredura seguinte tenta de novo). |
| **Extrair updates** | Code: 1 item por update, em ordem de `update_id`, com `kind` = `text` \| `callback` \| `cmd_resumo` (`/hoje`, `/resumo`) \| `cmd_edit` (`/edit`, `/editar`) \| `cmd_semana` (`/semana`, `/metricas` — alias legado, hoje devolve a agenda) \| `cmd_help` (`/start`, `/id`, `/ajuda`, desconhecidos) \| `ignore`. Comandos levam `args` (texto após o comando); callbacks levam `action`, `task_id` (o que vem após `:`), `message_id` e `message_text`. Sem updates → nenhum item e nada mais roda (nem lock). |
| **Ler lock → Checar lock → Pegar lock** | Data Table `chronos_estado`, linha `poll_lock` (`valor` = id da execução, `ts` = epoch ms). Se outra varredura segurou o lock há menos de **3 min**, esta para (os updates continuam pendentes no Telegram). |
| **Um update por vez** | *Loop Over Items* com lote 1: um update de cada vez, na ordem. |
| **Ler/Contar/Salvar tentativa** | Linha `tent:<update_id>` conta quantas vezes o update já entrou no 1b. **Renovar lock** atualiza o `ts` a cada item (lotes longos não expiram o lock). |
| **Desistir? (3 falhas)** | Na **4ª** tentativa, avisa no chat ("tentei processar esta mensagem 3 vezes…") e avança o offset — uma mensagem com problema não trava a fila. |
| **Fluxo 1b: processar mensagem** | *Execute Sub-workflow* (`mode: each`, espera terminar, saída de erro ligada). |
| **Confirmar offset** | `getUpdates?offset=<update_id>+1&limit=1` — marca como lido **só este** update (e os anteriores), **depois** do sucesso. |
| **Liberar lock / Liberar lock (falha)** | Zera o `poll_lock`. Na falha o loop para ali: o offset não avança e a próxima varredura recomeça por essa mensagem. |

---

## Fluxo 1b — Processar mensagem (sub-workflow)


```
Recebe update → Tipo de update
   texto ──→ Google: listar agendas → Buscar projetos → Buscar seções → Buscar tarefas abertas (paginado)
             → Montar prompt (agendas + árvore P#/S#/T#) → DeepSeek: classificar
             → Interpretar classificação ─┬→ Registrar uso → Limpar uso antigo (chronos_uso)
                                          └→ Evento ou tarefa?
                  evento  → Criar no Google Calendar? ─ sim → Escolher agenda → Google: criar evento ─┬→ Telegram: confirmar evento
                                                      │                                      (erro) ────┴→ Telegram: erro no evento
                                                      └ não (data ausente ou inválida) → Telegram: responder evento
                  tarefa  → Como achar o pai? ─ sem busca (nenhum pai / pai já válido / Entrada + aviso) ───────────────┐
                                              ├ buscar (pai citado que a IA não achou) → Util: buscar tarefa-pai ─┐       │
                                              └ perguntar (2+ candidatos) ────────────────────────────────────────┴→ Decidir tarefa-pai → Criar ou perguntar?
                                                     criar (1 match / nenhum → Entrada + aviso) ──────────────────────────┤
                                                     perguntar → Salvar pendência → Telegram: perguntar tarefa-pai → Guardar message_id
                            Preparar tarefa ←─────────────────────────────────────────────────────────────────────────────┘
                            → Todoist: criar tarefa → Util: criar subtarefas → Tarefa criada → Tem data sem horário? ─ sim → Util: horário livre ─┐
                                                                                                                    └ não ──────────────────────┴→ Montar confirmação → Telegram: confirmar tarefa
                            (erro ao criar → Telegram: erro ao criar)
                  inválido→ Telegram: não entendi
   botão ──→ Ação do botão → concluir → Todoist: concluir tarefa ─────┬→ Telegram: confirmar ação (toast)
                            → hoje    → Util: mover para hoje ─────────┤      (erro) → Telegram: falha na ação
                            → amanhã  → Util: mover para amanhã ───────┘
                            → pk      → Util: resolver pendência
   /hoje ──→ Fluxo 2: enviar resumo agora
   /ajuda ─→ Telegram: ajuda e chat_id
   /edit ──→ Fluxo 3: editar tarefa
   /semana → Fluxo 4: agenda agora
```

| Nó | O que faz | Origem |
| --- | --- | --- |
| **Recebe update** | *Execute Workflow Trigger* (aceita qualquer dado): um update já normalizado pelo *Extrair updates* do Fluxo 1. Permite testar o processamento sem Telegram (harness com updates simulados). | M8 |
| **Google: listar agendas** | Primeiro nó do ramo de texto: `GET calendarList` (só agendas com permissão de escrita). Falha não derruba nada (`continueRegularOutput`); sem lista, o prompt segue sem agendas. | Agendas |
| **Buscar projetos / seções / tarefas abertas** | `GET /api/v1/projects`, `/sections` e `/tasks` (este paginado por `next_cursor`; falha nele não derruba: a árvore sai só com projetos e seções). | 5 / IA |
| **Montar prompt** | Code, **sem IA**: lista **AGENDAS DO GOOGLE CALENDAR** (nome + descrição de cada uma, para a IA responder o nome exato) e árvore compacta `P#` projeto (a **Entrada vem primeiro**, com a descrição do projeto) › `S#` seção › `T#` tarefa aberta (filhos indentados, títulos ≤ 60 caracteres, sem descrição de tarefa) e o `idmap` que traduz os ids curtos de volta para os reais (+ `t_by_id`, `depth_by_id`). **Orçamento 12.000 caracteres**; se estourar, degrada em 4 níveis: filhos só até o 2º nível (`(+N subtarefas)`) → títulos de 35 caracteres → só tarefas com filhos ou que compartilham palavras com a mensagem (+ ancestrais) → corta o fim. **Ordem do prompt (cache de prefixo): regras → exemplos (com agendas e árvore fictícias) → agendas reais → árvore real → data/hora atual** (fuso de `CHRONOS_TIMEZONE`); a mensagem vai em `role: user`. | 4 / IA |
| **DeepSeek: classificar** | JSON mode, `max_tokens` 1200 (subtarefas); erro da API segue no item. | 3–4 / IA |
| **Interpretar classificação** | Code: valida o JSON novo (`destino {projeto, secao, pai}`, `eh_subtarefa`, `pai_citado`, `candidatos_pai`, `subtarefas`) **traduzindo os ids pelo `idmap` — id inexistente, seção de outro projeto ou pai fora da árvore = "não informado", nunca erro**. Decide `parent_mode`: `parent` (pai válido → `parent_id`, sem projeto/seção) · `ask` (1+ candidatos válidos) · `search` (pai citado que a IA não resolveu → busca por título) · `inbox_nopai` (queria pai e não há: **Entrada + aviso**) · `none`. Subtarefas: máx. 10 (o resto vira bullets na descrição), descarta a que repete o título da mãe. Também devolve `usage` (tokens/cache). Evento: `calendar` só vale se for exatamente o nome de uma agenda real (senão fica vazio e o evento vai para a agenda principal); sem data válida (`start`) o evento **não** é criado — só volta a classificação. A dica de intenção (`Tarefa:`/`Evento:`) e a rede de segurança evento → tarefa estão em [decisões de projeto](../explicacao/decisoes-de-projeto.md). | 4, 6, M7, M9, IA, agendas |
| **Registrar uso** → **Limpar uso antigo** | Uma linha em `chronos_uso` por chamada (`tipo` tarefa/evento/invalido, tokens de entrada/saída/cache hit/miss, tamanho da árvore) e apaga linhas com mais de 30 dias. `continueRegularOutput`: nunca interfere na mensagem. | IA |
| **Como achar o pai?** → **Util: buscar tarefa-pai** → **Decidir tarefa-pai** | `search`: busca por título (rede de segurança). **1 match** → subtarefa; **nenhum → cria na Entrada e avisa** ("Você citou “X”, mas não consegui identificar qual seria a tarefa-pai"); **vários** (ou `ask`) → pergunta com o **caminho** `Projeto › Seção › Tarefa` de cada candidato + "📥 Criar sem tarefa-pai" + "✖️ Cancelar" (`pk:<pid>:<n>`), gravada em `chronos_pendencias` com `subtarefas` e `depth` no `payload`. | M9 / IA |
| **Preparar tarefa** | Limite de aninhamento (`MAX_DEPTH = 4`): se as subtarefas passariam do último nível, **não são criadas** e viram bullets na descrição (com aviso). Ponto único antes de criar. | M9 / IA |
| **Todoist: criar tarefa** → **Util: criar subtarefas** → **Tarefa criada** | Cria a tarefa; depois o util cria cada subtarefa em ordem (`parent_id`, prioridade herdada, `due_string` próprio). Nenhum erro de subtarefa derruba a execução (o Fluxo 1 reprocessaria e duplicaria a mãe): vira "⚠️ N de M subtarefas não foram criadas". | IA |
| **Criar no Google Calendar?** → **Escolher agenda** → **Google: criar evento** | Evento com `create_event`: escolhe, na lista já buscada, a agenda de nome igual a `calendar_name` (sem correspondência → agenda principal, com aviso na confirmação) e cria com `POST calendars/{id}/events` (1 h de duração se não houver fim; dia inteiro se não houver hora). | Google |
| **Tem data sem horário?** → **Util: horário livre** | Só na tarefa principal (as subtarefas ficam como a IA devolveu). | 5–7 |
| **Montar confirmação** → **Telegram: confirmar tarefa** | Texto da decisão + 📅 vencimento (⏰ se houver hora) + `↳ N subtarefas: A · B · C` (até 5, "+N") + avisos. | IA |
| **Ação do botão** | `done` / `today` / `snooze` como antes; **`pk`** → *Util: resolver pendência* (Util: Pendências). | 9 / M9 |
| **Fluxo 3: editar tarefa** / **Fluxo 4: agenda agora** | `/edit` e `/semana`. | M2 / M4 |

Todos os nós que respondem no Telegram usam `continueRegularOutput`: se a *resposta* falhar depois de a tarefa já ter sido criada, a execução não falha e a mensagem não é reprocessada (sem duplicata).

---

## Util — Horário livre

```
Entrada (task_id, date, echo) → Obter tarefa → Tarefas do dia (filter?query=date: YYYY-MM-DD) → Escolher horário livre → Achou horário?
                                                                              sim → Todoist: gravar horário ─┐
                                                                              não → Todoist: gravar só a data ┴→ Resultado
```

| Nó | O que faz |
| --- | --- |
| **Entrada** | Execute Workflow Trigger. Recebe `task_id`, `date` (`YYYY-MM-DD`) e `echo` (qualquer contexto do chamador, devolvido intacto em *Resultado*). |
| **Obter tarefa** / **Tarefas do dia** | `GET tasks/{id}` (para saber o horário original) e `GET tasks/filter?query=date: <date>` (tarefas já marcadas no dia). |
| **Escolher horário livre** | Code (constantes `WORK_START = 8`, `WORK_END = 20`, `SLOT_MIN = 60`, `ZONE` = `CHRONOS_TIMEZONE`): ocupa os intervalos das tarefas com hora (duração do Todoist ou 60 min); se a tarefa já tinha hora e ela ainda cabe, **mantém**; senão pega a primeira hora cheia livre (se `date` for hoje, só a partir da próxima hora cheia). Devolve `found`, `due_datetime`, `time`, `reason`, `original_time` e `busy` (slots ocupados, para depurar). |
| **Achou horário?** → **Todoist: gravar horário** / **gravar só a data** | `POST tasks/{id}` com `due_datetime` ou só `due_date`. |
| **Resultado** | Normaliza `{ok, task_id, content, date, time, reason, original_time, due, echo}` — `ok: false` com `reason: "Todoist: …"` se a gravação falhou — para o chamador montar a confirmação/toast. |

Chamado por três nós do Fluxo 1b (*Util: horário livre (nova tarefa)*, *Util: mover para hoje*, *Util: mover para amanhã*) e pelo Util: Pendências (subtarefa criada pelo botão), sempre com `mode: each` (um item por execução). Sem gatilho próprio, precisa estar **publicado** para o Fluxo 1 publicar.

---

## Fluxo 2 — Rotina diária

```
Todo dia às 9h20 → Buscar projetos ─┬→ Tarefas de hoje    (filter?query=today)         ─┐
                                   ├→ Tarefas atrasadas (filter?query=today | overdue) ─┼→ Aguardar as 4 consultas (Merge)
                                   ├→ Tarefas da Entrada (tasks?project_id=inbox)      ─┤
                                   └→ Google: listar agendas → Selecionar agendas → Google: eventos de hoje ┘
   → Preparar contexto → Entrada tem tarefas? ─ sim → DeepSeek: sugerir 3 tarefas ─┐
                                              └ não ───────────────────────────────┴→ Montar resumo → Telegram: enviar resumo
```

| Nó | O que faz | Origem |
| --- | --- | --- |
| **Todo dia às 9h20** / **Chamado por /hoje** | Schedule Trigger diário 09:20 (fuso de `CHRONOS_TIMEZONE`) e Execute Workflow Trigger (passthrough) — ambos entram em *Buscar projetos*. | 8 |
| **Tarefas de hoje / Tarefas atrasadas / Tarefas da Entrada** | 3 consultas ao Todoist em paralelo a partir de *Buscar projetos* (que fornece o id do Inbox). `Tarefas de hoje` usa o filtro nativo `today`; `Tarefas atrasadas` usa `today \| overdue` (não só `overdue` — ver nota abaixo); Entrada por `project_id`. As duas primeiras se sobrepõem de propósito; quem separa de verdade "hoje" de "atrasada" é o *Preparar contexto*, não o filtro do Todoist. | 8 |
| **Google: listar agendas** → **Selecionar agendas** → **Google: eventos de hoje** | 4ª consulta paralela (Melhoria 6). `GET calendarList` com a mesma credencial do Google do Fluxo 1b; o Code seleciona as agendas — todas as editáveis ou só as listadas em `CHRONOS_CALENDARS` (comparação sem acentos, caixa e `&`) — e emite **um item por agenda**; o HTTP roda uma vez por item: `GET calendars/{id}/events?timeMin=hoje 00:00&timeMax=amanhã 00:00&singleEvents=true&orderBy=startTime` (dia calculado no fuso de `CHRONOS_TIMEZONE`). Se a listagem falhar (ex.: 403 por escopo insuficiente), consulta só a agenda `primary` e registra `list_error`; os dois nós do Google têm `onError: continueRegularOutput`, então o Merge sempre recebe a 4ª entrada. | M6 |
| **Preparar contexto** | Code: junta as listas de *Tarefas de hoje* e *Tarefas atrasadas* por `id` (deduplicando) e reclassifica cada tarefa comparando seu `due` — parseado com `DateTime.fromISO(raw, { zone: <fuso configurado> })`, que cobre os dois formatos que o Todoist devolve (absoluto com `Z`/offset, e "flutuante" sem timezone) — contra `$now` no fuso configurado: vencida antes de hoje, ou hoje com hora já passada → **atrasada**; hoje sem hora ainda vencida, ou com hora futura → **hoje**. Depois normaliza `{id, content, project, priority, due}`, ordena por prioridade/prazo e **remove da Entrada o que já está em Hoje/Atrasadas**, montando o prompt com `id + título` para o DeepSeek escolher por id. Também normaliza os eventos do Google (`{title, calendar, all_day, start, end, location, link}`, ignora `cancelled`, ordena por hora) e acrescenta ao prompt a linha *"Agenda de hoje no Google Calendar: …; se o dia estiver cheio, prefira tarefas curtas"*. Expõe `events`, `calendar_error` (falha ao consultar eventos) e `calendar_note` (listagem falhou → só a agenda principal). | 9 / M6 |
| **Entrada tem tarefas?** | IF — sem tarefas na Entrada não gasta chamada de IA. | 9 |
| **DeepSeek: sugerir 3 tarefas** | JSON mode, devolve `{"suggestions":[{id,title,reason}]}`. `onError: continueRegularOutput`. | 9 |
| **Montar resumo** | Code: descarta ids inventados; se a IA falhar ou vier vazio, usa as 3 primeiras da Entrada. Numera as tarefas (1., 2., …) em 3 blocos e gera o teclado com o número em cada botão: hoje → `N ✅ Concluir` + `N ⏰ Amanhã`; atrasadas → `N ✅ Concluir` + `N ⏰ Hoje`; sugestões → `N 📅 Fazer hoje` + `N ✅ Já fiz`. Máximo de 6 por bloco (o resto vira "… e mais X"). Antes das tarefas vem o bloco **📅 Agenda de hoje** (até 8 eventos, sem botões): `• HH:mm–HH:mm Título #Agenda 📍 local` ou `• Dia inteiro …`; sem eventos → *"Nenhum compromisso hoje"*; `calendar_error` → *"Google Calendar indisponível: …"*; `calendar_note` → linha *"(só a agenda principal — motivo)"*. | 9 / M6 |
| **Telegram: enviar resumo** | `sendMessage` para `$env.TELEGRAM_CHAT_ID` com `reply_markup`. | 9 |

---

## Util — Buscar tarefa

```
Entrada (query, project) → Buscar projetos → Buscar tarefas abertas (paginado) → Casar nome
```

Devolve `{status: one|many|none, best, candidates[≤5], project_note, total_open}`; cada candidato traz `id, content, project, parent_content, due, priority, score`. `project` opcional restringe a busca (nome igual, ou contido); se o projeto não existir, procura em todos e informa em `project_note`. Regras de pontuação na decisão 15.

---

## Fluxo 3 — Editar tarefa (`/edit`)

```
Recebe pedido → Interpretar comando → Modo?
   uso    → Telegram: como usar
   buscar → Util: buscar tarefa → Decidir alvo → Achou a tarefa?
               editar    → Alvo da edição
               perguntar → Salvar pendência (tipo edicao) → Telegram: perguntar qual → Guardar message_id
               nenhuma   → Telegram: não encontrei
   direto (vindo do botão) → Alvo da edição
Alvo da edição → Obter tarefa → Tarefa existe? → Buscar projetos → Buscar seções → Montar prompt de edição → DeepSeek: calcular ajuste
   → Interpretar ajuste → Tem mudanças? ─ não → Telegram: nada a mudar
                                       └ sim → Precisa atualizar? → Todoist: atualizar → Precisa mover? → Todoist: mover → Montar confirmação → Telegram: confirmar edição
                                                                   (erros do Todoist → Telegram: erro na edição)
```

- Formato: `/edit <nome da tarefa> | <o que mudar>` (o `|` separa). Sem `|` ou com um dos lados vazio → mensagem de uso.
- O prompt manda a tarefa atual (título, descrição, prazo, prioridade, projeto, seção) e o catálogo; o DeepSeek devolve `{"changes": {...só o que muda...}, "summary": "..."}`. O código ainda descarta campos iguais ao valor atual.
- Confirmação: `✅ <título> atualizada — <summary>` + uma linha por campo (`⚑ Prioridade: 🔵 média → 🟠 alta`, `📅 Prazo: qua 23/09 → sex 25/09`, …), com o prazo lido da resposta do Todoist.

---

## Util — Criar subtarefas

```
Entrada (parent_id, priority, subs_json) → Preparar subtarefas → Tem subtarefas? ─ sim → Todoist: criar subtarefa (1 chamada por item, em ordem) ─┐
                                                                                └ não ──────────────────────────────────────────────────────────┴→ Resumir
```

`Resumir` devolve `{total, created, failed, lines}`; `lines` é o HTML pronto para a confirmação. A chamada ao Todoist usa `continueRegularOutput` (falha em uma subtarefa não impede as outras nem derruba o chamador). Usado pelo Fluxo 1b, pelo clique dos botões e pelo timeout de 30 min do Util: Pendências.

---

## Util — Pendências

```
Botão escolhido (pk:<pid>:<opção>) → Ler pendência → Resolver escolha → Escolha válida?
   não → Telegram: aviso no botão (alerta: já respondida / expirada / opção inválida)
   sim → Marcar resolvida → Telegram: responder botão → Telegram: registrar escolha → Ação?
            editar → Pedido de edição → Fluxo 3: editar tarefa
            criar  → Todoist: criar tarefa → Util: criar subtarefas → Tarefa criada → Tem data sem horário? → Util: horário livre → Montar confirmação → Telegram: confirmar tarefa
A cada 2 min → Subtarefa vencida (aberta, tipo subtarefa, > 30 min, a mais antiga) → Preparar fallback → Marcar expirada
   → Todoist: criar sem tarefa-pai → Util: criar subtarefas (fallback) → Telegram: avisar fallback → Tem mensagem da pergunta? → Telegram: tirar botões (expirada)
```

O clique (e o timeout) criam a tarefa **e** as subtarefas guardadas no `payload`; a confirmação segue o mesmo formato do Fluxo 1b (`📁 Projeto ↳ Pai`, vencimento, subtarefas). *Registrar escolha* edita a pergunta original com o desfecho (`✖️ Cancelado — nada foi criado.`, `👉 Escolhida: …`) e remove os botões — usa o texto que vem no callback (`message_text`). A varredura trata **uma** pendência vencida por execução (a cada 2 min), o suficiente para o volume pessoal.

---

## Fluxo 4 — Agenda da semana

Agenda da semana atual (especificação: [`docs/Melhorias/Melhoria-Agenda-Semanal.md`](../Melhorias/Melhoria-Agenda-Semanal.md); regras e motivos: [explicação](../explicacao/agenda-da-semana.md)). O antigo relatório de métricas (Todoist) foi removido.

```
Segunda às 9h30 / Chamado por /semana → Período → Google: listar agendas → Selecionar agendas → Google: eventos da semana
   → Montar agenda → Passou do teto? ─ sim → DeepSeek: onde dividir ─┐
                                      └ não ───────────────────────┴→ Dividir em mensagens → Telegram: enviar agenda
```

- **Período**: segunda 00:00 → segunda seguinte 00:00 (exclusivo), no fuso de `CHRONOS_TIMEZONE`, `startOf('week')` do Luxon; `timeMin`/`timeMax` em RFC 3339 com offset. `/semana` usa a mesma janela em qualquer dia. O item de entrada aceita `ref_date` (`AAAA-MM-DD`) para simular outra semana (ex.: pinData no editor).
- **Eventos**: mesma seleção de agendas do Fluxo 2 (*listar agendas → Selecionar agendas*: todas as editáveis ou as de `CHRONOS_CALENDARS`), `singleEvents=true`, `orderBy=startTime`. Fora: `status=cancelled` e eventos recusados pelo próprio usuário (`attendees[self].responseStatus=declined`). Recorrentes (`recurringEventId`) levam 🔁.
- **Dia inteiro**: comparado por data; `end` é exclusivo (último dia = `end − 1`). Sai no topo do dia ("Dia inteiro: …"). Evento com hora que termina às 00:00 não ocupa o dia seguinte.
- **Multi-dia**: linha completa no 1º dia visível (`• 09:00 Viagem ▶ até dom 01/11 16:00 (Agenda)`), `↳ … (continua)` nos intermediários, `↳ … (termina 16:00)` no último; começou antes de segunda → `↳ … (desde dom 25/10, até seg 12:00)` na segunda; passa do domingo → `↳ … (continua até seg 02/11 08:00)`. Dia só com continuação não é "livre".
- **Mensagem**: um bloco por dia (`<b>Segunda 26/10</b>`, `— livre` quando vazio), `parse_mode: HTML` com `<`, `>`, `&` escapados. Semana sem nada → mensagem curta. Falha do Google → "Google Calendar indisponível: motivo" (ou aviso de agenda que não respondeu).
- **Divisão**: teto de 3800 caracteres (Telegram: 4096). Só se passar, o DeepSeek (`deepseek-flash`, JSON) recebe os dias com tamanhos e devolve **apenas** `{"blocks":[{"first_day":"AAAA-MM-DD"}…]}`. O código monta os blocos (cabeçalho `Sua semana (1/2)`), e valida: cortes existentes e crescentes, começando no 1º dia, concatenação idêntica ao original e cada mensagem ≤ teto. Resposta inválida, erro ou timeout → divisão determinística (enche cada mensagem com dias inteiros). Único caso em que um dia é quebrado por linha: um dia sozinho maior que o teto (marcado "(cont.)").
- **Testes**: `tests/fluxo-4` — ver [testar o Chronos](../como-fazer/testar-o-chronos.md).
