# Chronos — agente de produtividade pessoal

Um agente **auto-hospedado** que recebe mensagens no Telegram, usa o DeepSeek para decidir se é uma **tarefa** ou um **evento** e organiza tudo sozinho: tarefas no **Todoist** (no projeto, seção e posição certos da sua árvore) e eventos no **Google Calendar** (na agenda mais adequada). Todo dia envia um resumo; toda segunda, a agenda da semana.

```
você, no Telegram:  "comprar leite amanhã"            →  subtarefa de “Lista de Compras”, amanhã, em horário livre
                    "dentista sexta às 15h"           →  evento de 15h às 16h no Google Calendar
                    "organizar o churrasco: comprar carne, avisar os convidados…"  →  tarefa + subtarefas reais
                    /hoje   /semana   /edit Montar estante | prazo sexta
```

## O que ele faz

- **Captura inteligente.** Lê a mensagem inteira e separa título curto, descrição, prioridade, prazo e — quando há vários passos — subtarefas reais.
- **Enxerga o seu Todoist.** A IA recebe o mapa *Projeto › Seção › Tarefa › Subtarefa* e escolhe onde a tarefa entra; dúvida entre duas tarefas-pai vira uma pergunta com botões.
- **Eventos no lugar certo.** Escolhe, entre as *suas* agendas do Google, a que combina com o evento (usando o nome e a descrição de cada uma).
- **Horário livre.** Tarefa com data e sem hora é encaixada no primeiro horário livre do dia.
- **Resumo diário (9h20).** Agenda do dia, tarefas de hoje e atrasadas e 3 sugestões da Entrada, com botões ✅ Concluir / ⏰ Adiar. Também com `/hoje`.
- **Agenda da semana (segunda, 9h30).** Eventos dia a dia; também com `/semana`.
- **Edição por texto.** `/edit <tarefa> | <o que mudar>`.
- **Resiliente.** Processa as mensagens acumuladas com o computador desligado, em ordem, e só as marca como lidas depois de processadas.

## Começando

Você precisa de Docker (Compose v2), Node.js 18+ e contas no Telegram, Todoist, DeepSeek e Google.

```bash
git clone <URL-do-repositório> chronos && cd chronos
cp .env.example .env            # preencha os tokens (Telegram, Todoist, DeepSeek)
docker compose up -d            # n8n em http://localhost:5678
# crie a chave da API do n8n (N8N_API_KEY no .env) e a credencial do Google Calendar
node scripts/setup.mjs          # cria tabelas, importa e publica os 9 workflows
```

O passo a passo completo, com o que você deve ver em cada etapa, está no **[tutorial de primeiros passos](docs/tutoriais/primeiros-passos.md)**.

## Documentação

A documentação está em [`docs/`](docs/README.md), organizada pelo modelo [Diátaxis](https://diataxis.fr/):

| | |
| --- | --- |
| 🎓 [**Tutoriais**](docs/README.md#tutoriais) | aprender fazendo — [primeiros passos](docs/tutoriais/primeiros-passos.md) |
| 🛠️ [**Como fazer**](docs/README.md#como-fazer) | receitas: [credencial do Google](docs/como-fazer/credencial-google-calendar.md), [configurar fuso e agendas](docs/como-fazer/configurar-fuso-idioma-e-agendas.md), [testar](docs/como-fazer/testar-o-chronos.md), [diagnosticar problemas](docs/como-fazer/diagnosticar-problemas.md), [contribuir](docs/como-fazer/contribuir.md) |
| 📖 [**Referência**](docs/README.md#referência) | [comandos](docs/referencia/comandos-e-botoes.md), [variáveis](docs/referencia/variaveis-de-ambiente.md), [Data Tables](docs/referencia/data-tables.md), [workflows nó a nó](docs/referencia/workflows.md) |
| 💡 [**Explicação**](docs/README.md#explicação) | [visão geral](docs/explicacao/visao-geral.md), [decisões de projeto](docs/explicacao/decisoes-de-projeto.md), [como a IA decide](docs/explicacao/ia-na-criacao-de-tarefas.md), [privacidade](docs/explicacao/privacidade-e-dados.md) |

## Stack

| Camada | Tecnologia |
| --- | --- |
| Orquestração | n8n 2.x (Docker local) |
| Interface | Telegram Bot |
| IA | DeepSeek API |
| Tarefas | Todoist API |
| Eventos | Google Calendar API (OAuth2 via credencial do n8n) |
| Segredos | `.env` injetado no Docker Compose |

## Estrutura do repositório

```
chronos/
├── docker-compose.yml   # sobe o n8n com fuso, volume persistente e variáveis do .env
├── .env.example         # modelo de configuração (copie para .env — nunca versione o .env)
├── workflows/           # os 9 workflows do n8n em JSON portável (placeholders no lugar de ids)
├── scripts/             # setup.mjs (instala) e sanitizar-workflows.mjs (limpa exports); veja scripts/README.md
├── tests/               # testes offline dos nós Code (fluxo-1b, fluxo-4) e avaliação do prompt
└── docs/                # documentação (Diátaxis)
```

## Privacidade

Seus dados ficam na sua máquina, exceto o que é enviado ao DeepSeek, Todoist, Google e Telegram para o Chronos funcionar — veja [o que fica onde](docs/explicacao/privacidade-e-dados.md). O repositório não contém segredos, nem dados de nenhuma instalação.

## Contribuindo

Veja [como contribuir sem vazar dados pessoais](docs/como-fazer/contribuir.md) e, antes de qualquer pull request, rode os testes (`cd tests/fluxo-1b && npm install && npm test`).

## Licença

[MIT](LICENSE).
