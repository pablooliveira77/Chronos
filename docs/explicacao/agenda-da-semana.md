# Como a agenda da semana é montada

O Fluxo 4 envia, na segunda de manhã (ou quando você manda `/semana`), os eventos do Google Calendar da **semana atual**, dia a dia. Esta página explica as regras e os motivos; o passo a passo dos nós está na [referência](../referencia/workflows.md#fluxo-4--agenda-da-semana) e a especificação original em [Melhoria Agenda da semana](../Melhorias/Melhoria-Agenda-Semanal.md).

## Por que prospectiva (e sem Todoist)

A primeira versão deste fluxo era um relatório *retrospectivo* (concluídas × criadas, taxa de atraso…). Foi considerada pouco efetiva e trocada por um resumo do que **vem aí**. Tarefas do Todoist ficam de fora de propósito: o resumo diário já cuida delas. As métricas poderiam voltar como melhoria futura.

## Janela de tempo

De **segunda 00:00 a segunda seguinte 00:00** (fim exclusivo), no fuso de `CHRONOS_TIMEZONE`, calculada com Luxon (`startOf('week')`) e enviada ao Google em RFC 3339 com offset. “Semana atual” é a que contém a data de execução. O `/semana` usa a mesma janela em qualquer dia — os dias que já passaram aparecem normalmente.

## Quais eventos

Mesma seleção de agendas do resumo diário (todas as editáveis, ou as de `CHRONOS_CALENDARS`), com `singleEvents=true` (recorrências expandidas) e `orderBy=startTime`. Ficam de fora os cancelados e os que **você** recusou. Recorrentes levam 🔁.

## Dia inteiro e eventos de vários dias

- **Dia inteiro**: o Google devolve datas sem hora e o `end` é **exclusivo** (um evento de um dia na segunda termina na terça). Compara-se por *data*, nunca por data-hora, e o evento aparece no topo do dia como “Dia inteiro”. Um evento com hora que termina às 00:00 não ocupa o dia seguinte.
- **Multi-dia** — estratégia híbrida: detalhes completos no **primeiro dia visível** e uma linha curta de continuação nos seguintes, para não repetir o texto todo e ainda deixar cada dia “autocontido”:

  | Dia | Linha |
  | --- | --- |
  | primeiro | `• 09:00 Viagem ▶ até dom 01/11 16:00 (Agenda)` |
  | intermediários | `↳ Viagem (continua)` |
  | último | `↳ Viagem (termina 16:00)` |
  | começou antes de segunda | `↳ Viagem (desde dom 25/10, até seg 12:00)` |
  | passa do domingo | `↳ Viagem (continua até seg 02/11 08:00)` |

  Um dia só com continuações **não** é “livre”.

## Formato

```
📅 Sua semana (26/10 – 01/11)

Segunda 26/10
• Dia inteiro: Feriado local (Pessoal)
• 09:00–10:00 Reunião X 🔁 (Trabalho)
• 19:30 Encontro Y (Casa) — Salão Z

Terça 27/10 — livre
```

HTML com `<`, `>` e `&` escapados. Semana sem compromissos: uma mensagem curta. Falha do Google: “Google Calendar indisponível: motivo” (ou aviso de agenda que não respondeu).

## Divisão em várias mensagens

O Telegram limita a 4096 caracteres; usamos **3800** como teto. Regras:

1. **Nunca cortar no meio de um dia**; só entre dias.
2. Cabendo no teto, vai em uma mensagem.
3. Senão, divide em 2 ou mais, cada uma com cabeçalho próprio (`Sua semana (1/2)`).

**Papel da IA:** só quando passa do teto, o DeepSeek recebe os dias com seus tamanhos e devolve **apenas o primeiro dia de cada bloco** — nunca o texto reescrito. O código monta os blocos e **valida** (cortes existentes e crescentes, começando no 1º dia, concatenação idêntica ao original, cada mensagem ≤ teto). Resposta inválida, erro ou timeout → **divisão determinística** (enche cada mensagem com dias inteiros). O relatório nunca deixa de ser enviado. O único caso em que um dia é quebrado por linha é um dia sozinho maior que o teto (marcado “(cont.)”).

## Limitações

Sem agendamento retroativo (se o computador estava desligado na segunda, use `/semana`); até 250 eventos por agenda; evento duplicado entre agendas aparece duas vezes; `/metricas` continua aceito como sinônimo de `/semana`.
