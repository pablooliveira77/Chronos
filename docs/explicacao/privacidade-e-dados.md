# Privacidade: o que fica onde

O Chronos é auto-hospedado, mas usa serviços de terceiros. Esta página diz que dado vai para onde — útil para decidir se o modelo serve para você.

## O que sai da sua máquina

| Destino | O que recebe | Quando |
| --- | --- | --- |
| **DeepSeek** | o texto da sua mensagem; a lista de **agendas** (nome e descrição); a **árvore do Todoist** (nomes e descrições de projetos e seções, **títulos** das tarefas abertas — sem a descrição das tarefas); a data/hora atual | a cada mensagem de texto (Fluxo 1b) |
| | títulos das tarefas da Entrada e a agenda do dia | resumo diário (Fluxo 2) |
| | a tarefa atual (título, descrição, prazo, prioridade, projeto, seção), o catálogo de projetos e o seu pedido | `/edit` (Fluxo 3) |
| | os dias da agenda com seus tamanhos e o texto da semana | só quando a agenda passa de ~3800 caracteres (Fluxo 4) |
| **Todoist** | tarefas, subtarefas, prazos | sempre que algo é criado/editado/concluído |
| **Google Calendar** | eventos (título, descrição, local, horário) | ao criar eventos; leitura nos resumos |
| **Telegram** | suas mensagens e as respostas do bot | sempre |

Consulte as políticas de cada serviço sobre retenção e treinamento. Se há projetos ou tarefas sensíveis, **não** os deixe na árvore do Todoist que a IA enxerga (por exemplo, mantendo-os arquivados) — o Chronos envia o que estiver aberto.

## O que fica na sua instância do n8n

- **Credenciais** (Google, criptografadas) e **execuções** (o n8n guarda os dados de cada execução por um tempo, incluindo mensagens e respostas).
- **`chronos_pendencias`**: `chat_id`, títulos de tarefas e o corpo da tarefa pendente de uma pergunta com botões.
- **`chronos_estado`**: lock e tentativas (sem conteúdo).
- **`chronos_uso`**: tokens e tamanhos da árvore por chamada — **nunca** texto de mensagens nem títulos; retenção de 30 dias.

Tudo isso mora no volume Docker `n8n_storage`, na sua máquina.

## O que vai para o repositório (e o que não vai)

Nada seu. Os workflows versionados não têm segredos (`$env.*`), nem `chat_id`, nem nome/e-mail do dono da instância, nem ids da sua instância (placeholders resolvidos pelo `setup`). O `.env` é ignorado pelo git. Veja [Contribuir](../como-fazer/contribuir.md).
