# Como instalar, atualizar e exportar workflows

Os workflows ficam em [`workflows/`](../../workflows/) como JSON **portável**: em vez de ids da sua instância, eles têm placeholders (`__DATATABLE:<nome>__`, `__WF_ID:<arquivo>__`, `__CREDENTIAL:<tipo>__`) que o `setup` troca pelos ids reais. Detalhes de cada opção: [Scripts](../referencia/scripts.md).

## Instalar numa instância nova

Pré-requisitos: container no ar (`docker compose up -d`), `N8N_API_KEY` no `.env` e a [credencial do Google](credencial-google-calendar.md) criada.

```bash
node scripts/setup.mjs
```

Para ver o que seria feito sem alterar nada: `node scripts/setup.mjs --dry-run`.

## Instalar sem a chave da API

Crie as três [Data Tables](../referencia/data-tables.md) pela interface do n8n, pegue o id de cada uma (na URL da tabela) e informe:

```bash
node scripts/setup.mjs \
  --tabela chronos_estado=<id> --tabela chronos_pendencias=<id> --tabela chronos_uso=<id>
```

## Atualizar depois de baixar uma versão nova do projeto

```bash
git pull
node scripts/setup.mjs                       # reimporta e publica tudo
# ou só o que mudou:
node scripts/setup.mjs --only fluxo-2-rotina-9h20,util-pendencias
```

O `setup` identifica workflows já existentes **pelo nome** e atualiza no lugar (sem duplicar). Ele reinicia o n8n ao final: reimportar por CLI um workflow *ativo* deixa o gatilho antigo registrado junto com o novo, e o reinício resolve.

## Importar manualmente (alternativa)

No editor do n8n: `⋯` › **Import from File**. Você mesmo precisa trocar os placeholders pelos ids da sua instância, anexar a credencial do Google e publicar na ordem: **Util: Horário livre → Util: Buscar tarefa → Util: Criar subtarefas → Fluxo 3 → Util: Pendências → Fluxo 2 → Fluxo 4 → Fluxo 1b → Fluxo 1** (o n8n só publica um workflow se os sub-workflows que ele chama já estiverem publicados).

## Exportar uma alteração sua para o repositório

1. Edite no n8n e teste.
2. Exporte (dentro do container) e copie para `workflows/`:

   ```bash
   docker compose exec n8n n8n export:workflow --id=<id> > /tmp/wf.json
   docker compose cp n8n:/tmp/wf.json workflows/<arquivo>.json
   ```

3. **Sanitize** — o export traz nome e e-mail do dono da instância, ids de usuário/projeto, ids de tabelas e credenciais, datas e versões:

   ```bash
   node scripts/sanitizar-workflows.mjs <arquivo-sem-.json>
   ```

4. Rode os [testes](testar-o-chronos.md): um deles falha se algum workflow voltar a ter dado pessoal ou id de instância.
