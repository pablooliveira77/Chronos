# Documentação do Chronos

A documentação segue o modelo [Diátaxis](https://diataxis.fr/): cada página tem **uma** finalidade, para você achar rápido o que precisa.

| Quero… | Vá para | Em uma frase |
| --- | --- | --- |
| **aprender** fazendo, do zero | [Tutoriais](#tutoriais) | passo a passo guiado, com resultado garantido |
| **resolver** uma tarefa concreta | [Como fazer](#como-fazer) | receitas objetivas para quem já conhece o básico |
| **consultar** um detalhe exato | [Referência](#referência) | fatos secos: comandos, variáveis, tabelas, nós |
| **entender** por que é assim | [Explicação](#explicação) | contexto, decisões e alternativas descartadas |

## Tutoriais

- [Primeiros passos: do `git clone` à primeira tarefa criada pelo Telegram](tutoriais/primeiros-passos.md)

## Como fazer

- [Criar a credencial do Google Calendar](como-fazer/credencial-google-calendar.md)
- [Instalar, atualizar e exportar workflows](como-fazer/instalar-e-atualizar-workflows.md)
- [Configurar fuso, idioma e agendas](como-fazer/configurar-fuso-idioma-e-agendas.md)
- [Testar o Chronos (offline e ponta a ponta)](como-fazer/testar-o-chronos.md)
- [Diagnosticar problemas comuns](como-fazer/diagnosticar-problemas.md)
- [Operar o container do n8n](como-fazer/operar-o-container.md)
- [Contribuir sem vazar dados pessoais](como-fazer/contribuir.md)

## Referência

- [Comandos do bot e botões](referencia/comandos-e-botoes.md)
- [Variáveis de ambiente](referencia/variaveis-de-ambiente.md)
- [Data Tables (estado entre mensagens)](referencia/data-tables.md)
- [JSON devolvido pela IA](referencia/json-da-ia.md)
- [Scripts (`setup`, `sanitizar-workflows`)](referencia/scripts.md)
- [Workflows, nó a nó](referencia/workflows.md)

## Explicação

- [Visão geral e arquitetura](explicacao/visao-geral.md)
- [Decisões de projeto](explicacao/decisoes-de-projeto.md)
- [Como a IA decide onde a tarefa entra](explicacao/ia-na-criacao-de-tarefas.md)
- [Como a agenda da semana é montada](explicacao/agenda-da-semana.md)
- [Privacidade: o que fica onde](explicacao/privacidade-e-dados.md)
- [Roteiro, histórico e ideias](explicacao/roadmap-e-ideias.md)

## Especificações das melhorias

Documentos de especificação usados para implementar cada melhoria (critérios de aceite, fases e observações da execução). São registros históricos: o estado atual do sistema está na Referência.

- [IA na criação de tarefas](Melhorias/Melhoria-IA-Criacao-de-Tarefas.md)
- [Agenda da semana](Melhorias/Melhoria-Agenda-Semanal.md)
