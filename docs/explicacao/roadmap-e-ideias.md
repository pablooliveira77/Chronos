# Roteiro, histórico e ideias

## Como o projeto foi construído

O Chronos nasceu em fases pequenas, cada uma verificável isoladamente antes da seguinte:

| Fase | Entrega |
| --- | --- |
| 0 | n8n rodando via `docker compose up -d` |
| 1 | `.env` com os tokens |
| 2 | recebimento de mensagens do Telegram |
| 3 | chamada ao DeepSeek com prompt fixo |
| 4 | classificação real (evento/tarefa/projeto/prioridade) + roteamento |
| 5 | criação de tarefa no Todoist |
| 6 | fallback para a Entrada quando o projeto não existe |
| 7 | resposta formatada no Telegram |
| 8 | agendamento com as consultas ao Todoist |
| 9 | sugestões por IA + mensagem consolidada com botões |
| 10 | cron real ativado + monitoramento |

Divergências do desenho original (polling em vez de webhook, `deepseek-flash`, campos `section`/`due`…) estão em [decisões de projeto](decisoes-de-projeto.md).

## Melhorias entregues

| Melhoria | O que trouxe |
| --- | --- |
| **Eventos no Google Calendar** | o Fluxo 1 cria eventos na agenda escolhida pela IA |
| **6 — Agenda no resumo diário** | o Fluxo 2 lê as agendas e mostra “📅 Agenda de hoje”; a IA prefere tarefas curtas em dia cheio |
| **7 — Título curto + descrição** | `title` ≤ 6 palavras, `description` com o contexto |
| **8 — Todas as mensagens, uma por vez** | fila processada em ordem; offset só avança após o sucesso; lock e limite de tentativas |
| **9 — Subtarefas por “subtarefa de X”** | cria com `parent_id`; ambíguo → botões; sem resposta em 30 min → sem pai, com aviso |
| **2 — `/edit`** | edição de campos por linguagem natural (só edita) |
| **4 — Métricas semanais** | entregue e depois **substituída** pela agenda da semana (abaixo) |
| **IA na criação de tarefas** | árvore do Todoist no prompt, pai inferido, subtarefas reais, medição de tokens — [explicação](ia-na-criacao-de-tarefas.md) |
| **Agenda da semana** | o Fluxo 4 virou a agenda prospectiva — [explicação](agenda-da-semana.md) |
| **Tarefa × evento** | horário não faz evento; intenção explícita vence; na dúvida, tarefa |
| **Projeto sem dados pessoais** | agendas, fuso e idioma configuráveis; ids como placeholders; `setup` automático |

## Ideias que ficaram de fora (por decisão)

### Reconhecimento de voz
Mandar um áudio em vez de digitar. Exigiria baixar o áudio (`getFile`), transcrever (o DeepSeek não transcreve; seria preciso outro serviço, como o Whisper da OpenAI) e entregar o texto ao mesmo fluxo de classificação. Esforço baixo-médio, mas uma **dependência nova** (chave de transcrição). Não implementado.

### Reagendamento em lote
No resumo diário, selecionar várias atrasadas e adiá-las juntas. O difícil é o **estado da seleção** entre mensagens (checkboxes simulados com `callback_data` acumulativo ou comando de texto interpretado pela IA, mais um mecanismo de estado e um loop de chamadas ao Todoist). Esforço médio. Não implementado — o resumo já permite reagendar tarefa a tarefa.

### Hospedar em um servidor
Tirar o n8n do computador pessoal elimina a dependência de ele estar ligado e a janela de 24 h do Telegram. Roteiro (não validado neste projeto):

1. Provisionar uma VPS simples (1–2 vCPU, 2 GB de RAM bastam).
2. Subir o mesmo `docker-compose.yml`, trocando `N8N_HOST`, `N8N_PROTOCOL` e `WEBHOOK_URL` pelo domínio público; no Google Cloud, adicionar o URI `https://<dominio>/rest/oauth2-credential/callback` ao ID do cliente OAuth e reconectar a credencial.
3. Colocar HTTPS na frente (proxy reverso como Caddy, ou Nginx + Certbot). Com HTTPS, os 3 primeiros nós do Fluxo 1 podem dar lugar ao *Telegram Trigger* nativo — o resto não muda.
4. Migrar o volume `n8n_storage` (ou reinstalar com `scripts/setup.mjs`).

Custo: VPS (poucos dólares por mês) e um domínio. **Atenção à segurança:** o painel do n8n e o `.env` passam a estar expostos à internet.

## Adiado ou possível no futuro

- **Horário livre × Google Calendar**: o *Util: Horário livre* considerar também os eventos do Google como ocupados (hoje olha só tarefas com hora do Todoist).
- **Métricas de produtividade** (concluídas × criadas, atraso, tempo em eventos): saíram do Fluxo 4; poderiam voltar como mensagem separada.
- **Reduzir custo de IA**: classificação em duas etapas (sem árvore para eventos); remover a chamada que escolhe cortes da agenda (a divisão determinística já resolve); usar a árvore também no `/edit` (mover por id) e no resumo diário.
- **Detecção de tarefas duplicadas**, **duração estimada de tarefas**, **paginação de eventos** (>250 por agenda) e **deduplicação de eventos entre agendas**.
- **Internacionalização** dos textos do bot e dos prompts (hoje em português; fuso e idioma de datas já são configuráveis).
- **Resolução de agendas em sub-workflow compartilhado**: hoje *listar agendas → Selecionar agendas* existe em três cópias idênticas (Fluxos 2 e 4, e a lista no 1b); extrair exige reimportar workflows ativos.

Quer propor algo? Veja [Contribuir](../como-fazer/contribuir.md).
