# Referência — comandos do bot e botões

## Mensagens de texto

Qualquer texto que **não** comece com `/` é classificado pela IA como tarefa ou evento (veja [como a IA decide](../explicacao/ia-na-criacao-de-tarefas.md)). Prefixos que forçam o tipo:

| Prefixo / palavra | Efeito |
| --- | --- |
| `Tarefa:` (também `task`, `todo`, `to-do`), ou as palavras `tarefa`, `todoist`, `to-do`, `lembrete` | tarefa, mesmo que haja horário |
| `Evento:` / `Compromisso:`, ou as palavras `evento`, `compromisso`, `agendar`, `agende`, `na agenda`, `google agenda`, `google calendar` | evento |
| ambos presentes | a IA decide (na dúvida, tarefa) |

Padrões que a IA entende numa tarefa: “subtarefa de X”, “dentro de X”, “parte de X”, “etapa de X”, “na tarefa X”.

## Comandos

| Comando | Aliases | O que faz | Workflow |
| --- | --- | --- | --- |
| `/hoje` | `/resumo` | envia o resumo do dia agora | Fluxo 2 |
| `/semana` | `/metricas`, `/métricas` (legado) | agenda da semana atual, de segunda a domingo | Fluxo 4 |
| `/edit <tarefa> \| <o que mudar>` | `/editar` | edita uma tarefa (título, descrição, prazo, prioridade, projeto, seção). Não apaga nem conclui | Fluxo 3 |
| `/ajuda` | `/start`, `/id`, `/help` e qualquer comando desconhecido | ajuda + seu `chat_id` | Fluxo 1b |

`/edit` exige o `|` separando o nome da tarefa do ajuste; sem ele, o bot mostra como usar. Exemplos: `/edit Montar estante | mudar prazo pra sexta`; `/edit Comprar leite | prioridade alta e mover para o projeto Casa`; `/edit Revisar contrato | acrescentar na descrição: conferir cláusula 4`. Para remover o prazo: “sem prazo”.

## Botões (inline keyboard)

O Telegram limita `callback_data` a 64 bytes, então os botões carregam só uma ação curta:

| `callback_data` | Onde aparece | Efeito |
| --- | --- | --- |
| `done:<id da tarefa>` | resumo diário | conclui a tarefa no Todoist |
| `snooze:<id>` | tarefas de hoje | reagenda para amanhã (mantém o horário ou usa o próximo livre) |
| `today:<id>` | atrasadas e sugestões | reagenda para hoje (idem) |
| `pk:<pid>:<n>` | pergunta “qual tarefa?” | escolhe o candidato nº `n` (0, 1, …) |
| `pk:<pid>:in` | pergunta de subtarefa | cria sem tarefa-pai |
| `pk:<pid>:x` | qualquer pergunta | cancela; nada é criado/alterado |

`pid` é o id da pergunta guardada em [`chronos_pendencias`](data-tables.md). Perguntas de **subtarefa** expiram em 30 min (a tarefa é criada sem tarefa-pai, com aviso); perguntas de `/edit` não expiram.
