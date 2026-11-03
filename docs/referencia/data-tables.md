# Referência — Data Tables

O Chronos guarda estado entre mensagens em três Data Tables do n8n. O `scripts/setup.mjs` cria as que faltarem (definição em `scripts/tabelas.mjs`); os workflows as referenciam por nome via placeholder `__DATATABLE:<nome>__`.

## `chronos_estado`

Lock do polling e contador de tentativas.

| Coluna | Tipo | Conteúdo |
| --- | --- | --- |
| `chave` | texto | `poll_lock` ou `tent:<update_id>` |
| `valor` | texto | `poll_lock`: id da execução que segura o lock (vazio = livre); `tent:*`: nº de tentativas |
| `ts` | número | epoch em ms (lock expira após 3 min) |

Usada por: Fluxo 1.

## `chronos_pendencias`

Perguntas com botões ainda abertas ou já resolvidas (não cabem no `callback_data` de 64 bytes).

| Coluna | Tipo | Conteúdo |
| --- | --- | --- |
| `pid` | texto | id curto da pergunta (vai no botão: `pk:<pid>:<opção>`) |
| `chat_id` | texto | chat que recebeu a pergunta |
| `tipo` | texto | `subtarefa` ou `edicao` |
| `status` | texto | `aberta` → `resolvida` \| `cancelada` \| `expirada` |
| `payload` | texto | JSON: corpo da tarefa a criar, `subtarefas`, candidatos com `depth` e caminho, `adjust` (edição)… |
| `criado_ms` | número | quando foi criada (base dos 30 min) |
| `message_id` | número | mensagem da pergunta no Telegram (para tirar os botões) |

Usada por: Fluxo 1b, Fluxo 3, Util: Pendências. Guarda **títulos de tarefas** e o `chat_id` — fica só no banco do n8n, nunca no repositório.

## `chronos_uso`

Uma linha por chamada ao DeepSeek no Fluxo 1b, para medir tokens e cache. **Sem texto de mensagem**; linhas com mais de 30 dias são apagadas.

| Coluna | Tipo | Conteúdo |
| --- | --- | --- |
| `ts` | texto | data/hora ISO no fuso configurado |
| `ts_ms` | número | epoch em ms (base da retenção) |
| `tipo` | texto | `tarefa`, `evento` ou `invalido` |
| `prompt_tokens` / `completion_tokens` | número | tokens de entrada / saída |
| `cache_hit` / `cache_miss` | número | tokens de entrada com / sem cache de prefixo |
| `tree_chars` / `tree_tasks` / `tree_level` | número | tamanho da árvore enviada, nº de tarefas nela e nível de degradação (0–4) |

Usada por: Fluxo 1b.
