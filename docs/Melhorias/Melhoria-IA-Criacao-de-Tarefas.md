# Melhoria — IA na Criação de Tarefas (árvore do Todoist, tarefa-pai e subtarefas)

| Campo | Valor |
| --- | --- |
| Criada em | 2026-10-23 |
| **Executado em:** | **2026-10-23** — árvore do Todoist + prompt/JSON novos + validação por ids + subtarefas reais + botões com caminho + medição em `chronos_uso`; 26 testes offline, avaliação 20/20 e testes ponta a ponta no n8n real. |
| Fluxos afetados | **Fluxo 1b: Processar mensagem** (principal); `Util: resolver pendência` (`ChrUtilPendenc01`); `Util: buscar tarefa-pai` (`ChrUtilBuscaTf01`, vira rede de segurança) |
| Relação com outras melhorias | **Estende** as melhorias 7 (título/descrição) e 9 (subtarefa por "subtarefa de X"), já executadas. **Não refazer** o que elas já entregaram (ver seção 3). |

> **Instrução para o Claude Code:** se o campo **Executado em** acima estiver preenchido com uma
> data, esta melhoria **já foi implementada — não refaça**. Ao concluir (código + testes
> passando), preencha o campo com a data (AAAA-MM-DD) e uma linha de resumo. Registre desvios e
> pendências na seção "Observações da execução" no fim.

---

## 1. Problema

1. **A IA não enxerga as tarefas.** O catálogo enviado ao DeepSeek tem só projetos e seções (e
   **exclui a Entrada**). Se existe a tarefa "Lista de Compras" dentro da Entrada e o usuário envia
   "Comprar leite", a IA não tem como saber que deveria virar subtarefa dela; a tarefa cai solta
   na Entrada.
2. **Pai só quando o usuário diz explicitamente** "subtarefa de X" (`parent_task_title`).
3. **Textos grandes viram bullets na descrição**, não subtarefas reais.
4. **Quando a tarefa-pai não é encontrada**, o fluxo hoje pergunta com botões. O desejado é criar
   na Entrada e avisar (ver 4.5).
5. **Custo de tokens:** a data/hora atual fica no meio do prompt, o que quebra o cache de prefixo
   do DeepSeek para tudo que vem depois dela (ver 4.2).

## 2. Objetivo e decisões já tomadas

Dar ao DeepSeek o mapa **Projeto › Seção › Tarefa › Subtarefa** de todo o Todoist e deixar que ele decida **onde**
a nova tarefa entra: tarefa solta num projeto, dentro de uma seção, como subtarefa de uma tarefa
existente, ou na **Entrada**. Também ler a mensagem inteira e dividi-la em título, descrição,
prioridade, vencimento e, quando fizer sentido, subtarefas reais.

Decisões do usuário (não rediscutir):

- **Arquitetura: pipeline.** O n8n monta o contexto, faz **uma** chamada ao DeepSeek por mensagem,
  e o código valida e cria. Sem agente com ferramentas e sem "agente hospedado".
- **"Horas" = data de vencimento.** Mostrar o vencimento (data e, se houver, hora) na
  confirmação. **Sem duração estimada.**
- **Dúvida entre dois ou mais pais → botões** para o usuário escolher o pai.
- **IA não soube qual é o pai → cria na Entrada e avisa** que não soube qual poderia ser o pai.

## 3. Estado atual (já existe — não refazer)

Cadeia de nós no Fluxo 1b para texto: `Buscar projetos Todoist` → `Buscar seções Todoist` →
`Montar prompt` → `DeepSeek: classificar` → `Interpretar classificação` → `Evento ou tarefa?`.
No ramo tarefa: `É subtarefa?` → `Util: buscar tarefa-pai` → `Decidir tarefa-pai` →
`Criar ou perguntar?` (→ `Salvar pendência` → `Telegram: perguntar tarefa-pai` →
`Guardar message_id`) ou `Preparar tarefa` → `Todoist: criar tarefa` → `Tem data sem horário?` →
`Util: horário livre (nova tarefa)` → `Telegram: confirmar tarefa`.

- Chamada: `deepseek-flash`, `thinking: disabled`, `temperature: 0`, `max_tokens: 800`,
  `response_format: json_object`.
- JSON atual: `type`, `title` (≤ 6 palavras), `description`, `project` e `section` **por nome**,
  `priority`, `due` (linguagem natural → `due_string` + `due_lang: pt` no Todoist),
  `parent_task_title`, `parent_project` e os campos de evento (`start`, `end`, `location`,
  `calendar`). **Os campos de evento não mudam nesta melhoria.** (Na época existia também um campo de regra de negócio pessoal, removido em 2026-11-03.)
- Subtarefa: `Util: buscar tarefa-pai` busca por **título** entre as abertas e devolve
  `status`/`best`/`candidates`. Um match → cria com `parent_id` (e remove `project_id`/`section_id`
  do corpo, porque o Todoist herda do pai).
- Pendências: Data Table `chronos_pendencias` (`pid`, `chat_id`, `tipo`, `status`, `payload`,
  `criado_ms`, `message_id`); botões `pk:<pid>:<índice | in | x>`; `Util: resolver pendência`
  resolve o clique; após **30 min** sem resposta cria sem tarefa-pai.
- Confirmação já mostra `📅 data ⏰ hora` do vencimento devolvido pelo Todoist.
- Fluxo 1 (poller) reprocessa até 3 vezes se o 1b **falhar** → ver idempotência em 4.6.

## 4. Design

### 4.1 Árvore do Todoist (montada por código, sem IA)

- Novo(s) nó(s) antes de `Montar prompt`: `GET https://api.todoist.com/api/v1/tasks` (só abertas)
  **paginando** pelo cursor (`next_cursor`) até acabar. Reaproveitar projetos e seções já buscados.
- **Incluir a Entrada** (hoje é excluída do catálogo).
- Montar texto compacto com **ids curtos** (`P#`, `S#`, `T#`) e um `idmap` em memória que traduz
  de volta para os ids reais do Todoist. Isso economiza tokens e impede o modelo de inventar id.
- Manter as **descrições de projeto e seção** (a IA já as usa para decidir; ver catálogo atual).
- Formato (tarefas sem seção primeiro, depois cada seção; filhos indentados):

```
P1 Entrada (inbox)
  T1 Lista de Compras
    T2 Comprar pão
  T3 Ligar para o banco
P2 Casa: <descrição do projeto>
  T4 Organizar mudança
  S1 Eventos: <descrição da seção>
    T5 Planejar festa
```

- Só tarefas **abertas**; títulos truncados (~60 caracteres); **sem** descrição de tarefa.
- **Orçamento** inicial da árvore: ~3.000 tokens (≈ 10–12 mil caracteres) — ponto de partida, a
  calibrar na Fase 6. Se estourar, degradar nesta ordem: (1) mostrar filhos só até o 2º nível e
  colapsar o resto como `(+N subtarefas)`; (2) truncar títulos mais; (3) por último, manter só
  tarefas com filhos + as que compartilham palavras com a mensagem do usuário.
- A árvore é necessária apenas para `tarefa`. Mesmo assim ela vai em toda chamada nesta versão
  (uma chamada só). Se a medição mostrar custo alto, o plano B é a classificação em **duas etapas**
  (etapa 1 curta, sem árvore, só decide evento × tarefa) — **não implementar agora**.

### 4.2 Ordem do prompt (cache de prefixo do DeepSeek)

O DeepSeek reaproveita automaticamente o **prefixo idêntico** entre chamadas, e o trecho em cache
é cobrado mais barato (conferir o preço atual). Para aproveitar, ordenar o conteúdo do **mais
estável para o mais volátil**:

1. Regras e formato do JSON  →  2. Exemplos  →  3. Árvore  →  4. **Data e hora atual** (hoje está
no meio do prompt)  →  5. Mensagem do usuário (já vai em `role: user`).

A data/hora tem que ficar **depois** de tudo que for estável.

### 4.3 Novo JSON de saída (tarefa)

```json
{
  "type": "tarefa",
  "title": "Comprar leite",
  "description": "",
  "priority": 4,
  "due": "amanhã às 18h",
  "destino": { "projeto": "P1", "secao": null, "pai": "T1" },
  "eh_subtarefa": true,
  "pai_citado": null,
  "candidatos_pai": [],
  "subtarefas": [ { "title": "Reservar o salão", "due": null } ]
}
```

- `destino.projeto/secao/pai`: ids curtos da árvore. Com `pai`, projeto e seção são **derivados do
  pai** (o modelo pode devolvê-los, mas o código ignora).
- `eh_subtarefa`: o modelo acredita que a mensagem é filha de outra tarefa (citada ou claramente
  existente).
- `pai_citado`: texto da tarefa-pai **como o usuário escreveu** (só quando ele citou).
- `candidatos_pai`: 2 a 5 ids, **só** quando houver dúvida entre tarefas plausíveis (então
  `destino.pai` fica `null`).
- `subtarefas`: lista de `{title, due}`, máximo **10** (constante configurável).
- Remover `project`, `section`, `parent_task_title`, `parent_project` do formato novo (o campo
  `pai_citado` e a busca por título cobrem o caso). Os campos de **evento** permanecem.
- Subir `max_tokens` (ex.: 1200) por causa das subtarefas.

### 4.4 Regras do prompt (conteúdo a escrever)

- **Pai:** definir `destino.pai` só com **alta certeza**. Itens de uma lista existente (ex.: item de
  compra e uma tarefa "Lista de Compras") vão como subtarefa. Se houver duas ou mais tarefas
  plausíveis, listar em `candidatos_pai` e deixar `pai` nulo. Se **não existe** tarefa-pai
  plausível, tratar como tarefa normal (`eh_subtarefa: false`) e escolher projeto/seção.
- **Citação explícita** ("subtarefa de X", "dentro de X", "parte de X", "etapa de X"): `eh_subtarefa:
  true`; resolver X para um id da árvore; se não conseguir, `pai: null`, `candidatos_pai: []` e
  preencher `pai_citado`.
- **Ler a mensagem inteira** antes de decidir. Título curto (≤ 6 palavras, imperativo), sem data,
  hora, local ou detalhes.
- **Subtarefas:** criar quando o texto contiver **duas ou mais ações distintas e executáveis
  separadamente**. Nesse caso os passos vão em `subtarefas` (títulos curtos), e a `description` fica
  só com **contexto** (motivo, quantidades, pessoas, referências), sem repetir os passos. Sem passos
  distintos → sem subtarefas; o texto vai para a `description`.
- **Atualizar o exemplo** do aniversário do João: hoje os passos saem como bullets na descrição; no
  novo formato viram `subtarefas`.
- **Vencimento:** continuar devolvendo `due` em linguagem natural (o fluxo atual depende disso e do
  `Util: horário livre`). Subtarefas podem ter `due` próprio, mas é raro.

### 4.5 Validação e decisão (código em `Interpretar classificação` / `Decidir tarefa-pai`)

Traduzir ids curtos pelo `idmap`. **Nunca** confiar no modelo: id inexistente, seção que não
pertence ao projeto ou pai que não está na árvore → tratar como "não informado".

| Situação devolvida pelo modelo | Ação |
| --- | --- |
| `eh_subtarefa: false` | Cria em `destino.projeto/secao` (comportamento de hoje). Se o id for inválido → Entrada + aviso (como já existe para projeto inexistente). |
| `eh_subtarefa: true` e `pai` válido | Cria como **subtarefa** (`parent_id`; sem `project_id`/`section_id`). |
| `candidatos_pai` com 2+ ids válidos | **Pergunta com botões** (4.8). |
| `eh_subtarefa: true`, sem `pai` e sem candidatos, **com** `pai_citado` | Rodar a **busca por título** existente (`Util: buscar tarefa-pai`) como rede de segurança: 1 resultado → subtarefa; vários → botões; **nenhum → cria na Entrada e avisa** (mensagem abaixo). |
| `eh_subtarefa: true`, sem `pai`, sem candidatos, sem `pai_citado` | **Cria na Entrada e avisa** que não soube qual seria a tarefa-pai. |

Mudança de comportamento: hoje "nenhuma tarefa-pai encontrada" gera uma pergunta com botões; passa a
**criar na Entrada com aviso**. Os botões ficam só para **dúvida entre 2+ candidatos**.

### 4.6 Criação (pai → subtarefas) e idempotência

1. Criar a tarefa principal (`Todoist: criar tarefa`), como hoje.
2. Para cada subtarefa, **em ordem**, `POST /api/v1/tasks` com `content`, `parent_id` = id da tarefa
   criada, `priority` herdada da tarefa-mãe, e `due_string` + `due_lang: pt` se houver.
3. **Aninhamento:** o Todoist limita os níveis (hoje 4; confirmar na documentação). Se criar as
   subtarefas estourar o limite, **não criar** e anexar os passos como bullets na descrição.
4. **Idempotência (crítico):** o Fluxo 1 reprocessa a mensagem se o 1b falhar. Depois que a tarefa
   principal existe, **nenhum erro de subtarefa pode derrubar a execução**: nós de subtarefa com
   `onError: continueRegularOutput`; falhas viram aviso na confirmação ("⚠️ N de M subtarefas não
   foram criadas: …"). Sem rollback do pai. (Alternativa avançada, opcional: Sync API com `temp_id`
   em uma única chamada.)
5. `Tem data sem horário?` / `Util: horário livre` continuam atuando **só na tarefa principal**.

### 4.7 Mensagens do Telegram (formato)

Subtarefa criada:

```
✅ Subtarefa criada

Comprar leite
📁 Entrada ↳ Lista de Compras
⚑ ⚪ normal
📅 2026-10-24 ⏰ 18:00
```

Tarefa com subtarefas:

```
✅ Tarefa criada

Organizar aniversário do João
Festa para 30 pessoas.
📁 Casa › Eventos
⚑ 🔵 média
📅 2026-10-24
↳ 3 subtarefas: Reservar salão · Mandar convites · Encomendar bolo
```

IA não soube o pai:

```
📥 Tarefa criada na Entrada

Comprar parafusos
Você citou “Montar estante”, mas não consegui identificar qual seria a tarefa-pai.
```

- **Sempre** mostrar o vencimento (📅, mais ⏰ quando houver hora) na confirmação de tarefa e de
  subtarefa. Listar até 5 subtarefas; acima disso, "+N".
- Escapar HTML (`<`, `>`, `&`) em tudo que vier do usuário ou do Todoist.

### 4.8 Dúvida entre pais (botões)

Reaproveitar o mecanismo de pendências existente:

- Candidatos vêm de `candidatos_pai` (ids da árvore), exibidos com o **caminho**
  `Projeto › Seção › Tarefa` para o usuário distinguir homônimas.
- Botões: um por candidato (`pk:<pid>:<i>`), mais **"📥 Criar sem tarefa-pai"** e **"✖️ Cancelar"**
  (como hoje). Limite de 64 bytes no `callback_data` do Telegram — manter o formato atual.
- O `payload` da pendência passa a incluir **`subtarefas`**. **`Util: resolver pendência` deve criar
  as subtarefas** depois de criar a tarefa principal com o pai escolhido (mesma regra de 4.6).
- Timeout de 30 min: mantém o comportamento atual (cria sem tarefa-pai no destino escolhido pela IA).

### 4.9 Medição de tokens

- Registrar a cada chamada o `usage` devolvido pelo DeepSeek: tokens de entrada, de saída e, se o
  campo existir, tokens com **cache hit/miss**.
- Data Table nova `chronos_uso` (data/hora, tipo `tarefa|evento`, tokens de entrada/saída/cache,
  tamanho da árvore em caracteres, nº de tarefas na árvore). **Não gravar texto de mensagem nem
  títulos** (privacidade; o projeto será publicado). Reter só os últimos ~30 dias.
- Modelo: manter `deepseek-flash` com `thinking` desligado.

## 5. Fora de escopo

- Agente com ferramentas (nó AI Agent) e classificação em duas etapas (plano B de 4.1).
- Duração estimada de tarefa.
- Detecção de tarefas duplicadas.
- Alterar os fluxos 2, 3 (`/edit`) e 4 — apenas **auditar** o uso de IA na Fase 0 e listar
  oportunidades (não implementar).

## 6. Fases (testar cada uma antes da próxima)

| Fase | Entrega | Teste para avançar |
| --- | --- | --- |
| 0 | **Auditoria:** tabela de onde o DeepSeek é chamado em cada fluxo (1b, 2, 3, 4, utils), para quê, e se precisa de IA. **Linha de base:** rodar ~10 mensagens representativas e anotar tokens. | Tabela e números registrados em "Observações da execução". |
| 1 | **Árvore sem IA** (4.1) com `idmap`. | Execução manual mostra a árvore com a Entrada incluída, ids curtos reversíveis, tamanho em caracteres/tokens estimados. |
| 2 | **Prompt e JSON novos** (4.2–4.4), **sem criar nada** no Todoist. | Com "Lista de Compras" na árvore, "Comprar leite" devolve `pai` = id dela; texto longo devolve `subtarefas`; JSON válido. |
| 3 | **Validação e decisão** (4.5). | Cenários 1–9 e 13–14 da seção 8 com resposta do DeepSeek **mockada**. |
| 4 | **Criação com subtarefas + confirmação** (4.6–4.7). | Cenários 1, 4, 10–12 de ponta a ponta numa tarefa de teste. |
| 5 | **Botões e "não soube o pai"** (4.5, 4.8), incluindo `Util: resolver pendência`. | Cenários 7 e 8; clique cria também as subtarefas. |
| 6 | **Medição e ajuste** (4.9): reordenar prompt (cache), calibrar orçamento da árvore. | Comparar com a linha de base da Fase 0; árvore dentro do orçamento; cache hit visível a partir da 2ª mensagem seguida. |
| 7 | **Documentação:** atualizar a documentação (hoje em `docs/referencia/workflows.md`) e preencher **Executado em**. | — |

## 7. Critérios de aceite

- [ ] "Comprar leite" com uma tarefa "Lista de Compras" existente na Entrada é criada como
      **subtarefa** dela, sem o usuário citar a lista.
- [ ] Sem tarefa-pai plausível, a tarefa vai para o projeto/seção que a IA escolheu (ou Entrada).
- [ ] Texto longo com passos distintos gera **título curto + subtarefas reais**; a descrição fica só
      com contexto.
- [ ] Texto longo **sem** passos distintos gera título curto + descrição, sem subtarefas.
- [ ] Dúvida entre 2+ pais → mensagem com botões (caminho completo de cada candidato); o clique
      cria a tarefa **e** suas subtarefas.
- [ ] Pai citado/esperado que a IA não identifica → tarefa criada na **Entrada** com o aviso de que
      não soube qual seria a tarefa-pai.
- [ ] O vencimento (data e hora, quando houver) aparece na confirmação de tarefa e de subtarefa.
- [ ] Ids inventados ou inconsistentes **nunca** causam erro; caem na Entrada com aviso.
- [ ] Falha em subtarefa **não** duplica a tarefa principal (sem reprocessamento pelo Fluxo 1).
- [ ] Eventos continuam funcionando exatamente como antes (regressão).
- [ ] Prompt reordenado (data/hora no fim) e `usage` registrado em `chronos_uso`, sem texto de
      mensagem.
- [ ] Nenhum nome, id de agenda, `chat_id` ou dado pessoal novo hardcoded no workflow versionado.

## 8. Testes

Usar uma **árvore de teste fixa** e o DeepSeek **mockado** (respostas JSON prontas por cenário);
fazer a lógica de validação testável fora da UI do n8n (módulo/arquivo de teste ou execução do
workflow com entradas simuladas). Cenários mínimos:

1. Item de lista existente → subtarefa (pai inferido).
2. Tarefa sem pai plausível → projeto/seção corretos, sem aviso.
3. Projeto e seção válidos, sem pai.
4. Texto longo com 3 passos → título curto + 3 subtarefas; descrição só com contexto.
5. Texto longo sem passos distintos → sem subtarefas.
6. "Subtarefa de X" com X único → subtarefa.
7. Duas tarefas plausíveis → botões; clicar cria a principal **e** as subtarefas; "criar sem pai" e
   "cancelar" funcionam; timeout de 30 min mantém o comportamento atual.
8. Pai citado que não existe → Entrada + aviso "não soube".
9. Ids inválidos (`T999`, seção de outro projeto) → fallback Entrada + aviso, sem exceção.
10. Vencimento só com data / com data e hora → confirmação com 📅 (e ⏰); `Util: horário livre`
    continua agindo só na principal.
11. Estouro do limite de aninhamento → subtarefas viram bullets na descrição.
12. Falha numa subtarefa → pai preservado, aviso na confirmação, **sem duplicar** a principal.
13. Árvore acima do orçamento → degradação e a classificação ainda funciona.
14. DeepSeek indisponível ou JSON inválido → comportamento atual ("não entendi").
15. **Regressão de eventos:** evento simples, dia inteiro e as regras de agenda existentes.
16. **Conjunto de avaliação do prompt** (manual, contra o DeepSeek real, fora de CI): ~20 mensagens
    reais anonimizadas com o destino esperado; registrar acertos e tokens a cada ajuste do prompt.

## 9. Observações da execução

**2026-10-23.** Implementado e publicado no n8n (Fluxo 1b, Util: Pendências e o novo **Util: Criar subtarefas**, `ChrUtilSubtarefa01`). Detalhes de nós em [`docs/referencia/workflows.md`](../referencia/workflows.md) e a explicação do desenho em [`docs/explicacao/ia-na-criacao-de-tarefas.md`](../explicacao/ia-na-criacao-de-tarefas.md). Testes: `tests/fluxo-1b` (`npm install && npm test`; avaliação manual `npm run avaliar`).

### Fase 0 — Auditoria do uso do DeepSeek

| Fluxo / nó | Para quê | Precisa de IA? | Oportunidade (não implementada) |
| --- | --- | --- | --- |
| 1b — *DeepSeek: classificar* | Evento × tarefa, título/descrição, destino, pai, subtarefas, prazo, campos de evento | **Sim** — linguagem natural | Plano B de 4.1 (duas etapas) só se o custo incomodar: hoje a árvore vai em toda chamada, inclusive eventos |
| 2 — *DeepSeek: sugerir 3 tarefas* | Escolhe 3 tarefas da Entrada para o dia | Em parte — o fallback (3 primeiras) já funciona; a IA agrega julgamento de contexto/agenda | Pôr data/hora no fim do prompt (cache) e usar a árvore para sugerir pais |
| 3 — *DeepSeek: calcular ajuste* (`/edit`) | Traduz o pedido em diff (`content`, `due`, `priority`, `project`, `section`…) | **Sim** | Usar a mesma árvore com ids curtos (mover para outro projeto/seção/pai por id); data/hora hoje fica no meio do prompt, antes da "Tarefa atual" (quebra o cache) |
| 4 — *DeepSeek: onde dividir* | Escolhe cortes entre dias quando a agenda passa de 3800 caracteres | **Não** — a divisão determinística resolve; a IA só equilibra o tamanho | Remover a chamada se o custo/latência não compensar |
| Utils (horário livre, buscar tarefa, pendências, criar subtarefas) | — | Não usam IA | — |

### Linha de base × resultado (10 mensagens, DeepSeek real, árvore real de 82 tarefas)

| | Antes (prompt antigo) | Depois |
| --- | --- | --- |
| Tokens de entrada / mensagem | ≈ 2.577 | ≈ 4.434 (+72%: árvore 3.952 caracteres + exemplos novos) |
| Tokens de saída / mensagem | ≈ 86 | ≈ 120 |
| Cache hit | 22.144 de 25.774 (86%) | 40.960 de 44.344 (92%); a partir da 2ª mensagem seguida ≈ 4.224 de 4.430 |
| Tokens **sem** cache / mensagem | ≈ 363 | ≈ 340 |

Ou seja: a entrada cresceu, mas quase tudo é prefixo em cache (regras → exemplos → árvore → data/hora); o que é cobrado sem cache ficou igual. A árvore real usou ~33% do orçamento (12.000 caracteres), nível de degradação 0. Avaliação do prompt contra o DeepSeek real: 20/20 mensagens no destino esperado (tabela em `tests/fluxo-1b/avaliacao.js`).

### Desvios e decisões

- **Util novo `Util: Criar subtarefas`** (não previsto): o Fluxo 1b, o clique dos botões e o timeout de 30 min precisam criar subtarefas com a mesma regra de falha; um sub-workflow evita três cópias.
- **Limite de aninhamento = 4 (constante `MAX_DEPTH`)**: a documentação da API não traz o limite e a API v1 aceitou 15 níveis num teste (tarefas apagadas depois). Mantive 4 por ser o limite dos apps do Todoist; para aumentar, trocar a constante em *Preparar tarefa* e em *Resolver escolha*. O cenário 11 foi coberto por teste offline (não há erro real da API para reproduzir).
- **Um único candidato válido** em `candidatos_pai` (os outros ids eram inventados) ainda pergunta com botões em vez de assumir o pai.
- **Pai válido vence** quando o modelo devolve `pai` e `candidatos_pai` juntos (ordem da tabela de 4.5).
- Subtarefa idêntica ao título da mãe é descartada (a IA repetia o 1º passo como título num teste real); regra equivalente entrou no prompt.
- O rodapé de vencimento passou a ser montado num nó *Montar confirmação* (no 1b) em vez da expressão longa no nó do Telegram; a confirmação de subtarefa passou a usar `📁 Projeto ↳ Pai` (formato de 4.7).
- *Interpretar classificação* devolve `usage` e `tree` em todo item; *Registrar uso* roda antes do ramo principal e nunca derruba a mensagem.
- Eventos: nenhum campo mudou (o bloco do Google Calendar é o mesmo código); o JSON de evento ganhou os campos de destino, ignorados.
- A Data Table `chronos_uso` foi criada via um workflow temporário com webhook (o CLI `n8n execute` não tem o módulo de Data Tables); esse workflow (`TMP harness (apagar)`) ficou **despublicado** e pode ser arquivado na UI.

### Pendências / pontos de atenção

- ~~Os exports do n8n traziam, no bloco `shared`, o nome e e-mail do dono da instância.~~ **Resolvido em 2026-11-03:** `scripts/sanitizar-workflows.mjs` remove esse bloco e os ids da instância.
- ~~Os nomes das 4 agendas continuavam fixos no código.~~ **Resolvido em 2026-11-03:** o Fluxo 1b lista as agendas reais do Google e as envia à IA; os Fluxos 2 e 4 usam todas as agendas editáveis (ou `CHRONOS_CALENDARS`).
- `/metricas` ainda é alias de `/semana`; o Fluxo 1 não foi reimportado.
- Linhas de teste ficaram em `chronos_uso` (8) e `chronos_pendencias` (`zzclick01`, `zztime01`, mais as de teste do cenário de botões); dá para limpar pela UI.
