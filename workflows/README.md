# Workflows

Exports em JSON dos workflows do n8n. Eles só têm referências `$env.*` (nenhum segredo) e **placeholders** no lugar de tudo que é específico de uma instalação — ids de Data Tables, de credenciais e de sub-workflows —, então funcionam em qualquer instância depois do `scripts/setup.mjs` (veja [Instalação](#instalação)).

## Os workflows

- `fluxo-1-captura.json` (23 nós) — poller: `getUpdates` a cada 10s → lock (`chronos_estado`) → **um update por vez** → Fluxo 1b → confirma o offset só depois do sucesso; desiste na 4ª tentativa com aviso
- `fluxo-1b-processar-mensagem.json` (48 nós) — sub-workflow com 1 update: lista as agendas do Google e monta a árvore Projeto › Seção › Tarefa do Todoist (ids curtos `P#/S#/T#`) e faz **uma** chamada ao DeepSeek (título curto + descrição, destino/pai/subtarefas por id, prioridade/prazo, agenda/local/horário do evento) → o código valida os ids → tarefa, subtarefa ou tarefa com subtarefas no Todoist + horário livre, ou evento no Google Calendar (a IA escolhe entre as suas agendas reais) → confirmação; registra tokens em `chronos_uso`; botões do resumo e de pendências; comandos `/hoje`, `/edit`, `/semana`, `/ajuda`
- `fluxo-2-rotina-9h20.json` (17 nós) — Schedule 9h20 (ou `/hoje`) → Todoist (hoje/atrasadas/Entrada) + Google Calendar (eventos de hoje nas suas agendas) → DeepSeek sugere 3 → resumo com bloco 📅 Agenda + tarefas numeradas com botões
- `fluxo-3-editar-tarefa.json` (30 nós) — sub-workflow do `/edit <tarefa> | <ajuste>`: busca por nome → DeepSeek devolve só o diff → `POST /tasks/{id}` e `/move`; nome ambíguo → botões
- `fluxo-4-agenda-semanal.json` (12 nós) — segunda 9h30 (ou `/semana`): eventos da semana atual (seg 00:00 → seg seguinte 00:00) nas suas agendas do Google Calendar → mensagem por dia no Telegram; acima de ~3800 caracteres divide **entre dias** (DeepSeek só escolhe os cortes; o código monta e valida, com fallback determinístico). Testes offline em `../tests/fluxo-4`
- `util-horario-livre.json` (9 nós) — sub-workflow: encaixa uma tarefa no primeiro horário livre do dia (janela de 08h às 20h, nas constantes `WORK_START`/`WORK_END` do nó *Escolher horário livre*)
- `util-buscar-tarefa.json` (5 nós) — sub-workflow: acha tarefa aberta por nome (`one`/`many`/`none` + candidatos)
- `util-criar-subtarefas.json` (6 nós) — sub-workflow: cria em ordem as subtarefas de uma tarefa já criada; falha em uma não derruba a execução (devolve `created`/`failed`/`lines`)
- `util-pendencias.json` (29 nós) — resolve os botões `pk:<pid>:<opção>` e, a cada 2 min, cria sem tarefa-pai as subtarefas sem resposta há 30 min

## Pré-requisitos

- **Variáveis do `.env`** (copie de `../.env.example`): `TELEGRAM_BOT_TOKEN`, `TODOIST_API_TOKEN`, `DEEPSEEK_API_KEY`, `TELEGRAM_CHAT_ID`, além de `CHRONOS_TIMEZONE` e `CHRONOS_LOCALE` (fuso e idioma; padrão `America/Sao_Paulo` e `pt-BR`) e, opcionalmente, `CHRONOS_CALENDARS` (restringe as agendas do resumo diário e da agenda da semana). O `docker-compose.yml` repassa todas ao container.
- **Credencial Google Calendar OAuth2 API**, criada no n8n (única credencial que vive lá dentro). No consentimento do Google marque **as duas** permissões — `calendar` **e** `calendar.events` —, senão tudo cai na agenda principal. O export só guarda um placeholder dela; o setup anexa a que existir na sua instância.
- **Data Tables** (o setup cria as que faltarem):

  | Tabela | Colunas |
  | --- | --- |
  | `chronos_estado` | `chave` (texto), `valor` (texto), `ts` (número) |
  | `chronos_pendencias` | `pid`, `chat_id`, `tipo`, `status`, `payload` (texto); `criado_ms`, `message_id` (número) |
  | `chronos_uso` | `ts`, `tipo` (texto); `ts_ms`, `prompt_tokens`, `completion_tokens`, `cache_hit`, `cache_miss`, `tree_chars`, `tree_tasks`, `tree_level` (número) |

## Instalação

```bash
cp .env.example .env            # preencha os tokens e, se quiser, fuso/idioma
docker compose up -d
# n8n > Settings > n8n API: crie uma chave e ponha em N8N_API_KEY no .env
# n8n > Credentials: crie a "Google Calendar OAuth2 API" (veja acima)
node scripts/setup.mjs          # cria as tabelas, resolve os placeholders, importa, publica e reinicia
```

O `setup` troca `__DATATABLE:<nome>__`, `__WF_ID:<arquivo>__` e `__CREDENTIAL:<tipo>__` pelos ids reais da sua instância, importa os workflows na ordem certa (sub-workflows antes de quem os chama), publica e reinicia o n8n. Se um workflow com o mesmo nome já existir, ele é atualizado no lugar (sem duplicar).

Opções úteis: `--dry-run` (só mostra o que faria), `--only fluxo-2-rotina-9h20,util-pendencias` (só alguns), `--no-publish`, e `--tabela nome=id` (se preferir criar as tabelas pela interface em vez de usar a chave da API).

Alternativa manual: no editor do n8n, `⋯` > **Import from File** em cada arquivo, trocando você mesmo os placeholders pelos ids da sua instância.

**Atenção ao reimportar por CLI um workflow que está ativo** (ex.: o Fluxo 1): o gatilho antigo fica registrado junto com o novo. O `setup` já reinicia o container ao final; se importar na mão, rode `docker compose restart n8n` depois.

A pasta é montada no container em `/workflows` (somente leitura).

## Antes de versionar um export novo

O `n8n export:workflow` inclui dados da instância e da conta (nome e e-mail do dono, ids de usuário e de projeto, ids de tabelas e credenciais, datas e versões). **Passe sempre o export por**:

```bash
node scripts/sanitizar-workflows.mjs [arquivo ...]
```

Ele apaga esses metadados e devolve os placeholders (para trocar os ids de Data Tables ele usa a `N8N_API_KEY` do `.env` ou `--tabela nome=id`). O teste `tests/fluxo-1b` (`npm test`) falha se algum workflow voltar a ter e-mail, `chat_id`, segredo ou id de instância.
