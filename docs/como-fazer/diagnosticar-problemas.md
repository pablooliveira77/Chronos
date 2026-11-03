# Como diagnosticar problemas comuns

Procure o sintoma. Para ver o que aconteceu, abra **Executions** no n8n (cada mensagem gera uma execução do Fluxo 1b) ou rode `docker compose logs -f n8n`.

## O bot não responde a nada

- `docker compose ps`: o container `chronos-n8n` está de pé? Os workflows **Fluxo 1** e **Fluxo 1b** estão ativos/publicados?
- Erro **409** no `getUpdates`: existe um *webhook* registrado no bot. Remova:
  `https://api.telegram.org/bot<TOKEN>/deleteWebhook`.
- Com o container desligado, o Telegram guarda as mensagens por até 24 h; ao subir, o Chronos processa todas, em ordem.
- Uma execução do Fluxo 1 que morreu no meio (ex.: reinício do container) segura novas varreduras por até **3 min** (lock `poll_lock`); depois a fila anda sozinha.
- Uma mensagem que falha **3 vezes** é pulada, com aviso no chat (“vou pular para não travar as próximas”). Se ainda for necessária, mande de novo.

## “Não consegui classificar essa mensagem”

- Quase sempre é a API do DeepSeek: **402** = sem saldo (recarregue em platform.deepseek.com); timeout/erro de rede costuma passar na tentativa seguinte. A mensagem de erro vem em itálico no fim da resposta.
- No resumo diário, se o DeepSeek falhar, o Fluxo 2 usa como sugestão as 3 primeiras tarefas da Entrada.

## Os eventos vão para a “Agenda principal” ou o resumo diz “(só a agenda principal — Forbidden…)”

O token do Google perdeu o escopo `calendar` (a listagem de agendas devolve 403). Na credencial do n8n, faça **Reconnect** e marque **as duas** permissões. Veja [Criar a credencial do Google](credencial-google-calendar.md).

## A credencial do Google falha com 401 depois de alguns dias

O app OAuth está em modo *Teste* no Google Cloud: o refresh token expira em **7 dias**. Publique o app (*Status de publicação*) ou reconecte a credencial.

## O evento foi criado no dia errado

As datas são calculadas pelo DeepSeek a partir da data/hora atual do prompt. A confirmação mostra a data real para você conferir; data inválida não cria evento. Confira também se `CHRONOS_TIMEZONE` está correto.

## Uma mensagem virou evento (ou tarefa) e não devia

- Para forçar, comece a mensagem com **`Tarefa:`** ou **`Evento:`**, ou use palavras como “todoist”/“lembrete” (tarefa) e “agendar” (evento). Detalhes em [decisões de projeto](../explicacao/decisoes-de-projeto.md#tarefa--evento).
- Na dúvida, o Chronos escolhe **tarefa**.

## O resumo diário não chegou às 9h20

O Schedule Trigger do n8n **não roda retroativamente**: se o computador/Docker estava desligado, o disparo foi perdido. Use `/hoje` (e `/semana`) para recuperar.

## Disparos em duplicidade (a mesma execução duas vezes)

Aconteceu um workflow ativo ter sido reimportado por CLI e publicado: o gatilho antigo fica registrado junto com o novo. `docker compose restart n8n` resolve (o `setup.mjs` já faz isso).

## `setup.mjs` falhou

| Mensagem | O que fazer |
| --- | --- |
| `Defina N8N_API_KEY…` | Crie a chave em n8n › Settings › n8n API, ou use `--tabela nome=id` |
| `não consegui ler as credenciais no container` | O container está no ar? (`docker compose up -d`; nome em `N8N_CONTAINER` se mudou) |
| `credencial "googleCalendarOAuth2Api" não existe…` | Crie a [credencial do Google](credencial-google-calendar.md) e rode o setup de novo |
| `placeholders sem valor` | Há um `__DATATABLE:…__`/`__WF_ID:…__` que o script não conhece; veja [Scripts](../referencia/scripts.md) |

## Limpar dados de teste

`chronos_pendencias` guarda o histórico de perguntas (resolvidas/canceladas/expiradas) e `chronos_uso` guarda uma linha por chamada à IA (apagada após 30 dias). Para limpar antes, use *Data tables* na interface do n8n.
