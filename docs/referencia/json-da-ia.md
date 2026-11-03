# Referência — JSON devolvido pela IA

Contrato entre o prompt do nó **Montar prompt** (Fluxo 1b) e o código do nó **Interpretar classificação**. O modelo é chamado com `deepseek-flash`, `thinking: disabled`, `temperature: 0`, `response_format: json_object`, `max_tokens: 1200`. O código **nunca confia** no que volta: ids são validados contra a árvore e campos ruins viram “não informado”.

```json
{
  "type": "evento | tarefa",
  "title": "Comprar leite",
  "description": "",
  "priority": 4,
  "due": "amanhã às 18h",
  "destino": { "projeto": "P1", "secao": null, "pai": "T1" },
  "eh_subtarefa": true,
  "pai_citado": null,
  "candidatos_pai": [],
  "subtarefas": [{ "title": "Reservar o salão", "due": null }],
  "start": null,
  "end": null,
  "location": null,
  "calendar": null
}
```

## Campos comuns

| Campo | Regra |
| --- | --- |
| `type` | `tarefa` ou `evento`. Decidido nesta ordem: intenção explícita do usuário → horário é prazo, não evento → evento só com pista clara de compromisso → **na dúvida, tarefa** |
| `title` | curto (≤ 6 palavras), imperativo para tarefa; sem data, hora, local ou prioridade. Vira `content` (Todoist) / `summary` (Google) |
| `description` | contexto que não coube no título; `""` se não houver. Descartada pelo código se repetir o título |
| `priority` | `1` urgente … `4` normal (a API do Todoist usa o inverso; o código converte `5 - p`) |
| `due` | prazo em linguagem natural (“sexta às 15h”) ou `null`; vai como `due_string` + `due_lang` |

## Campos de tarefa (ids da árvore do prompt)

| Campo | Regra |
| --- | --- |
| `destino.projeto` | `P#`; sem projeto aplicável, o da Entrada |
| `destino.secao` | `S#` de uma seção **desse** projeto, ou `null` |
| `destino.pai` | `T#` da tarefa-pai, só com alta certeza; com pai, projeto e seção são herdados dele |
| `eh_subtarefa` | a IA acredita que é filha de outra tarefa |
| `pai_citado` | texto da tarefa-pai como o usuário escreveu (só se citou) |
| `candidatos_pai` | 2–5 `T#` quando há dúvida entre tarefas plausíveis (então `pai` é `null`) |
| `subtarefas` | `{title, due}`; só quando há 2+ ações distintas; máximo 10 (o resto vira bullets na descrição) |

## Campos de evento

Para tarefa, devolva `null` em todos; para evento, `destino.projeto` é a Entrada, `pai` `null`, `eh_subtarefa` `false` e `subtarefas` `[]`.

| Campo | Regra |
| --- | --- |
| `start` | data absoluta `YYYY-MM-DDTHH:mm` (ou `YYYY-MM-DD` para dia inteiro), calculada a partir da data/hora atual do prompt; `null` se não houver data |
| `end` | mesmo formato, ou `null` (o sistema assume 1 h) |
| `location` | local citado (endereço, sala, link) ou `null` |
| `calendar` | **exatamente** o nome de uma das agendas listadas no prompt (as suas agendas editáveis do Google) ou `null`; sem correspondência, o evento vai para a agenda principal |

## Como o código interpreta (`parent_mode`)

| Situação | `parent_mode` | Resultado |
| --- | --- | --- |
| `pai` válido | `parent` | subtarefa (`parent_id`, sem projeto/seção) |
| 1+ `candidatos_pai` válidos | `ask` | pergunta com botões |
| quer pai, citou, a IA não resolveu | `search` | busca por título (Util: Buscar tarefa): 1 achado → subtarefa; vários → botões; nenhum → Entrada + aviso |
| quer pai, não citou, sem pai | `inbox_nopai` | cria na Entrada + aviso |
| `eh_subtarefa: false` | `none` | cria no `destino` (id inválido → Entrada + aviso) |
