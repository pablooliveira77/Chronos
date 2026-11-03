# Como contribuir sem vazar dados pessoais

O Chronos é desenhado para qualquer pessoa instalar do GitHub. Por isso o repositório **não pode** conter dados de nenhuma instalação: nomes e e-mails, `chat_id`, tokens, ids de tabelas/credenciais/workflows, nomes dos seus projetos, seções e agendas.

## Fluxo de trabalho

1. Instale o projeto ([tutorial](../tutoriais/primeiros-passos.md)) e faça a mudança no n8n.
2. Exporte e **sanitize** ([como](instalar-e-atualizar-workflows.md#exportar-uma-alteração-sua-para-o-repositório)).
3. Rode os [testes offline](testar-o-chronos.md) — o teste “sem dados pessoais, segredos ou ids da instância” varre todos os `workflows/*.json`.
4. Atualize a documentação na página certa (veja abaixo).
5. Abra o pull request.

## Regras para o código dos workflows

- **Segredos só em `$env.*`.** Novas variáveis entram em `.env.example` (com comentário) e no `docker-compose.yml`; documente em [Variáveis de ambiente](../referencia/variaveis-de-ambiente.md).
- **Nada específico de uma pessoa no código:** nem nome de projeto, seção, agenda, empresa ou pessoa. O que depender da conta deve vir do Todoist/Google (como a árvore de projetos e a lista de agendas) ou do `.env`.
- **Fuso e idioma** vêm de `CHRONOS_TIMEZONE` e `CHRONOS_LOCALE` — nunca escreva `America/Sao_Paulo`/`pt-BR` direto (use `$env.CHRONOS_TIMEZONE || 'America/Sao_Paulo'`).
- **Ids de Data Tables, credenciais e sub-workflows** são placeholders; ao criar um novo, registre-o em `scripts/tabelas.mjs` (tabelas/credenciais) e use um `id` fixo e legível no JSON.
- **Exemplos** em prompts, testes e docs: fictícios e genéricos (“comprar leite”, “reunião com o time”, “aniversário do João”).
- **Nunca** grave texto de mensagens nas Data Tables de métricas.

## Onde documentar (Diátaxis)

| Mudança | Página |
| --- | --- |
| Novo comando ou botão | [Comandos e botões](../referencia/comandos-e-botoes.md) |
| Nova variável do `.env` | [Variáveis de ambiente](../referencia/variaveis-de-ambiente.md) |
| Nó ou fluxo novo/alterado | [Workflows](../referencia/workflows.md) |
| Campo novo no JSON da IA | [JSON da IA](../referencia/json-da-ia.md) |
| Tabela nova | [Data Tables](../referencia/data-tables.md) |
| Uma decisão com alternativas | [Decisões de projeto](../explicacao/decisoes-de-projeto.md) |
| Uma tarefa de operação nova | uma nova receita em `como-fazer/` |

## Checagem final antes de enviar

```bash
git ls-files -co --exclude-standard | grep -v -E '(^|/)node_modules/|package-lock\.json$' \
  | xargs grep -n -I -i -E '@gmail|@outlook|@hotmail|"shared"|creatorId|bot[0-9]+:'
```

O resultado deve ser vazio.
