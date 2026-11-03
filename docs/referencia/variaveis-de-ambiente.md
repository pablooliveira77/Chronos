# Referência — variáveis de ambiente

Definidas no `.env` (copie de `.env.example`). O `docker-compose.yml` repassa ao container as que os workflows leem como `$env.<NOME>`. Depois de editar, rode `docker compose up -d`.

## Obrigatórias

| Variável | Para quê | Onde obter |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | enviar/receber mensagens | `@BotFather` › `/newbot` |
| `TODOIST_API_TOKEN` | ler/criar/editar tarefas | Todoist › Configurações › Integrações › Desenvolvedor |
| `DEEPSEEK_API_KEY` | classificação e sugestões | platform.deepseek.com |
| `TELEGRAM_CHAT_ID` | destino do resumo diário e da agenda de segunda | envie `/start` ao bot depois de instalar |

## Opcionais (com padrão)

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `CHRONOS_TIMEZONE` | `America/Sao_Paulo` | fuso dos agendamentos, de “hoje/atrasada/semana” e dos horários exibidos. Repassada também a `TZ` e `GENERIC_TIMEZONE` do n8n |
| `CHRONOS_LOCALE` | `pt-BR` | formato de datas e idioma dos prazos no Todoist (`pt-BR` → `pt`). Não traduz os textos do bot |
| `CHRONOS_CALENDARS` | *(vazio)* | restringe as agendas lidas no resumo diário e na agenda da semana. Vazio = todas as editáveis. Nomes separados por `;` |

## Só para os scripts (não vão para o container)

| Variável | Padrão | Efeito |
| --- | --- | --- |
| `N8N_API_KEY` | — | chave da API do n8n; o `setup` a usa para criar as Data Tables |
| `N8N_URL` | `http://localhost:5678` | endereço do n8n para o `setup`/`sanitizar` |
| `N8N_CONTAINER` | `chronos-n8n` | nome do container, para o `docker exec` do `setup` |

## Fixas no `docker-compose.yml`

| Variável | Valor | Motivo |
| --- | --- | --- |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | `false` | o n8n 2.x bloqueia `$env` nos nós por padrão; este design lê os segredos de `$env.*` |
| `N8N_RUNNERS_ENABLED` | `true` | executor de código do n8n 2.x |
| `N8N_HOST` / `N8N_PORT` / `N8N_PROTOCOL` / `WEBHOOK_URL` | `localhost` / `5678` / `http` / `http://localhost:5678/` | acesso local; troque ao [hospedar num servidor](../explicacao/roadmap-e-ideias.md#hospedar-em-um-servidor) |

## Credencial dentro do n8n

A única credencial que **não** vem do `.env` é a **Google Calendar OAuth2 API** — veja [como criar](../como-fazer/credencial-google-calendar.md).
