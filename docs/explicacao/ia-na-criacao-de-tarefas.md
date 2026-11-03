# Como a IA decide onde a tarefa entra

Esta página explica o desenho do Fluxo 1b: por que a IA enxerga a sua árvore do Todoist, por que ela responde com ids curtos e como o código garante que nada quebre. A especificação original, com critérios de aceite e testes, está em [Melhoria IA na criação de tarefas](../Melhorias/Melhoria-IA-Criacao-de-Tarefas.md); o contrato do JSON em [JSON da IA](../referencia/json-da-ia.md).

## O problema

Sem ver as tarefas, a IA não sabe que “comprar leite” deveria ser subtarefa da sua “Lista de Compras”; ela só conhecia projetos e seções. Textos longos viravam bullets na descrição em vez de subtarefas reais, e só havia relação de pai/filho quando você escrevia “subtarefa de X”.

## A ideia: dar o mapa e deixar a IA escolher o lugar

O n8n monta (sem IA) uma árvore compacta de tudo que está aberto no seu Todoist e a IA escolhe, nela, onde a nova tarefa entra: solta num projeto, dentro de uma seção, como subtarefa de uma tarefa existente ou na Entrada.

```
P1 Entrada (inbox)
  T1 Lista de Compras
    T2 Comprar pão
  T3 Ligar para o banco
P2 Casa: manutenção e organização da casa
  T4 Organizar mudança
  S1 Festas: aniversários e confraternizações
    T5 Planejar festa
```

- `P#` projeto, `S#` seção, `T#` tarefa (filhos indentados), com a **descrição** de projetos e seções — é o que a IA usa para decidir.
- **Ids curtos**: economizam tokens e impedem o modelo de inventar ids; um `idmap` em memória os traduz de volta para os reais.
- Só tarefas **abertas**, títulos truncados (~60 caracteres), sem descrição de tarefa.

## Por que uma única chamada (pipeline) e não um agente

O n8n monta o contexto, **uma** chamada ao DeepSeek devolve a decisão e o código valida e cria. Um agente com ferramentas teria custo imprevisível, seria difícil de testar offline e daria à IA poder direto sobre o Todoist. Se o custo da árvore incomodar, o plano B (não implementado) é classificar em duas etapas: a primeira, curta e sem árvore, só decide evento × tarefa.

## O orçamento da árvore

A árvore tem teto de **12.000 caracteres** (~3.000 tokens). Se estourar, ela degrada em níveis, sempre registrados em `chronos_uso.tree_level`:

| Nível | O que muda |
| --- | --- |
| 0 | árvore completa |
| 1 | filhos só até o 2º nível; o resto vira `(+N subtarefas)` |
| 2 | títulos truncados em 35 caracteres |
| 3 | só tarefas com filhos ou que compartilham palavras com a mensagem (e seus ancestrais) |
| 4 | último recurso: corta tarefas do fim, mantendo projetos e seções |

## A ordem do prompt e o cache de prefixo

O DeepSeek reaproveita automaticamente o **prefixo idêntico** entre chamadas, e o trecho em cache sai mais barato. Por isso o prompt vai do mais estável ao mais volátil: **regras e formato → exemplos (com agendas e árvore fictícias) → suas agendas → sua árvore → data/hora atual**; a mensagem do usuário vai em `role: user`. A dica de intenção (“o usuário disse que é TAREFA”) também vai no fim da mensagem, para o `system` não mudar.

Medição com uma árvore real de 82 tarefas (10 mensagens seguidas): a entrada subiu de ~2.600 para ~4.400 tokens por mensagem (a árvore pesa ~3.950 caracteres), mas o cache passou de 86% para 92% — a partir da 2ª mensagem seguida, só ~340 tokens por mensagem ficam sem cache, o mesmo de antes. A árvore real usou ~33% do orçamento (nível 0).

## Nunca confiar no modelo

O *Interpretar classificação* traduz os ids pelo `idmap`. **Id inexistente, seção de outro projeto ou pai fora da árvore = “não informado”**, nunca erro: a tarefa cai na Entrada com aviso. Regras de decisão:

- pai válido → subtarefa (o Todoist herda projeto/seção do pai);
- dúvida entre 2+ pais (`candidatos_pai`) → **pergunta com botões**, mostrando o caminho `Projeto › Seção › Tarefa` de cada candidato (um único candidato válido, dos que sobraram, ainda pergunta);
- pai citado que a IA não resolveu → busca por título como rede de segurança (1 achado → subtarefa; vários → botões; nenhum → **Entrada + aviso**);
- quer pai e não há → **Entrada + aviso** (“não consegui identificar qual seria a tarefa-pai”).

Mudança consciente de comportamento: “tarefa-pai não encontrada” deixou de perguntar e passou a **criar na Entrada com aviso**; os botões ficam só para dúvida entre 2+ candidatos.

## Subtarefas reais e idempotência

Quando o texto tem **duas ou mais ações distintas e executáveis separadamente**, cada passo vira uma subtarefa (máx. 10; o excedente vira bullets na descrição), o título principal nomeia o objetivo e a descrição guarda só o contexto. A subtarefa idêntica ao título da mãe é descartada.

O Fluxo 1 reprocessa a mensagem se o 1b falhar, então, **depois que a tarefa principal existe, nenhum erro de subtarefa pode derrubar a execução**: o *Util: Criar subtarefas* tem `continueRegularOutput` e as falhas viram aviso (“⚠️ N de M subtarefas não foram criadas”). Sem rollback do pai. O mesmo código atende o Fluxo 1b, o clique dos botões e o timeout de 30 min.

O Todoist limita os níveis de aninhamento; usamos `MAX_DEPTH = 4` (limite dos apps; a API v1 aceitou 15 num teste). Se as subtarefas estourarem o limite, os passos viram bullets na descrição.

## O que a IA não faz

Não calcula datas de tarefas (o Todoist resolve o `due_string`), não conclui nem apaga nada, não escolhe horário (o *Horário livre* é determinístico) e não vê o texto das descrições das tarefas.
