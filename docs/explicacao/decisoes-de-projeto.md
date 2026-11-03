# Decisões de projeto

As escolhas que moldam o Chronos, com o motivo e as alternativas descartadas. (Para o *como*, veja a [referência de workflows](../referencia/workflows.md).)

## Telegram por polling, não por webhook

O nó *Telegram Trigger* registra um webhook, e o Telegram só aceita URL **HTTPS pública** — inviável com o n8n em `localhost`. O Fluxo 1 usa um *Schedule Trigger* a cada 10 s chamando `getUpdates`. Isso também entrega a resiliência desejada (fila retida por 24 h e consumida ao subir o Docker). Ao hospedar num servidor com HTTPS, os 3 primeiros nós do Fluxo 1 podem ser trocados pelo Telegram Trigger; o resto não muda. Efeito colateral: se algum dia um webhook for registrado no bot, `getUpdates` devolve 409.

## Segredos em `$env.*`, credencial só para o Google

Os nós são *HTTP Request* lendo `$env.TELEGRAM_BOT_TOKEN`, `$env.TODOIST_API_TOKEN` e `$env.DEEPSEEK_API_KEY`: o `.env` é a fonte única e nada de segredo entra nos JSON versionados. O n8n 2.x bloqueia `$env` nos nós por padrão, então o compose define `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. A exceção é o Google Calendar, que exige OAuth2 (não há como criar eventos com uma chave de API); o n8n guarda a credencial e renova o token sozinho.

## Processar um update por vez e só confirmar o offset depois do sucesso

A primeira versão confirmava o offset **antes** e em paralelo ao processamento, então qualquer falha no meio perdia a mensagem; e um sub-workflow chamado “uma vez com todos os itens” só olhava o primeiro. Hoje o Fluxo 1 só faz o polling e chama o Fluxo 1b com **um update por vez**, confirma o offset depois de cada sucesso, usa **lock** (3 min) para duas varreduras não processarem o mesmo update e **desiste na 4ª tentativa** com aviso no chat. Preferimos desistir de uma mensagem a travar a fila para sempre.

## Modelo: `deepseek-flash` com *thinking* desligado

`deepseek-chat` foi aposentado. O modo *thinking* vem ligado por padrão, ignora `temperature` e pode gastar todo o `max_tokens` raciocinando, devolvendo `content` vazio. Com `thinking: {type: "disabled"}`, `temperature: 0` e `response_format: json_object` a saída é estável.

## Prioridade: a IA fala como a interface, o código converte

A IA responde `1` (urgente) … `4` (normal), como na UI do Todoist; a API usa o inverso (`4` = urgente). A conversão `api = 5 - p` fica no código.

## Prazo em linguagem natural

`due` (“sexta às 15h”) é repassado ao Todoist como `due_string` + `due_lang`, que ele mesmo resolve. O idioma vem de `CHRONOS_LOCALE`. Isso evita a IA calcular datas de tarefas (só os eventos têm data absoluta calculada, porque o Google exige).

## Horário livre

Tarefa com data mas sem hora (ou reagendada pelos botões) passa pelo **Util: Horário livre**: considera ocupadas as tarefas do dia que têm hora (duração informada ou 60 min), mantém o horário original da tarefa se ainda couber e, senão, pega a primeira hora cheia livre na janela (08h–20h). Se for hoje, só a partir da próxima hora cheia; sem vaga, grava só a data. Só a tarefa principal é encaixada.

## “Hoje” e “atrasada” sempre no seu fuso

O filtro `overdue` do Todoist compara só **datas**, então uma tarefa de hoje com hora já vencida não aparecia como atrasada; trocar por `today | overdue` trouxe *todas* as de hoje para “atrasadas”. A solução definitiva tirou a decisão da query: o *Preparar contexto* junta as duas listas por id e reclassifica cada tarefa comparando o `due` — parseado no fuso configurado, o que cobre os dois formatos do Todoist (absoluto com `Z`/offset e “flutuante” sem timezone) — com o `$now` no mesmo fuso. Nenhuma comparação usa o fuso padrão (UTC) do processo.

## Estado entre mensagens em Data Tables

Perguntas com botões (“qual tarefa?”) não cabem no `callback_data` (64 bytes), então ficam em `chronos_pendencias` e o botão carrega só `pk:<pid>:<opção>`. O *Util: Pendências* resolve o clique e, a cada 2 min, cria **sem tarefa-pai** a subtarefa cuja pergunta está aberta há mais de 30 min. Lock e tentativas ficam em `chronos_estado` (o *Static Data* do n8n só grava ao fim da execução, não serve de lock). Ver [Data Tables](../referencia/data-tables.md).

## Tarefa × evento

Uma data ou hora na mensagem **não** faz dela um evento (“entregar o relatório às 17h” é tarefa com prazo). Três camadas:

1. **Prompt**, por ordem: intenção explícita (“tarefa”, “todoist”, “lembrete”…) → horário é prazo, não evento → evento só com pista clara (reunião, consulta, aula, aniversário, “agendar”…) → **na dúvida, tarefa**. Uma tarefa sempre fica registrada no Todoist; um evento errado polui a agenda.
2. **Dica determinística**: o *Montar prompt* detecta a intenção por regex (prefixo `Tarefa:`/`Evento:`, palavras `todoist`/`agendar`…) e anexa uma dica ao **fim da mensagem do usuário**, mantendo o `system` idêntico (preserva o cache).
3. **Rede de segurança**: o *Interpretar classificação* converte evento → tarefa quando o usuário disse “tarefa” ou o texto **não tem nenhuma pista de compromisso**.

## `/edit` só edita campos

Título, descrição, prazo (“sem prazo” remove), prioridade, projeto e seção. Não apaga nem conclui — uma decisão deliberada para um comando em linguagem natural. Projeto/seção usam `POST /tasks/{id}/move`, que aceita um destino por vez (seção tem precedência). A IA devolve só o **diff** e o código descarta campos iguais ao valor atual.

## Busca de tarefa por nome compartilhada

O *Util: Buscar tarefa* lê todas as tarefas abertas (paginando `next_cursor`, incluindo subtarefas) e pontua: 100 nome igual (sem acento/caixa/pontuação), 90 mesmas palavras sem artigos/preposições, 80 um contém o outro, 35–70 palavras em comum. `one` = um único igual (ou nenhum igual e um único ≥ 80); senão `many` (até 5) ou `none`. Serve a subtarefa e o `/edit`.

## Título curto + descrição

`title` (≤ 6 palavras) vai para `content`; `description` (contexto, passos em `- `) vai para a descrição da tarefa **e** do evento. Descrição igual ao título (ou contida nele) é descartada no código.

## Leituras com *retry*

Todo `GET` HTTP tem `retryOnFail` (3 tentativas, 2 s): um `GET /sections` do Todoist chegou a dar timeout de 15 s.

## Nada específico de uma pessoa no código

Projetos, seções e agendas vêm do Todoist e do Google em tempo de execução; fuso, idioma e filtro de agendas vêm do `.env`; ids de instância são placeholders resolvidos pelo `setup`. Regras de negócio pessoais (empresa, igreja…) não ficam no repositório — se você precisa delas, descreva-as nas **descrições** de projetos, seções e agendas, que a IA lê. Ver [contribuir](../como-fazer/contribuir.md).

## Pipeline em vez de agente

Uma chamada ao DeepSeek por mensagem (o n8n monta o contexto, o código valida e cria) em vez de um agente com ferramentas: custo previsível, fácil de testar offline e sem a IA tendo poder direto sobre o Todoist. Detalhes em [como a IA decide](ia-na-criacao-de-tarefas.md).
