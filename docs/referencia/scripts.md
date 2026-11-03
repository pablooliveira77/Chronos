# Referência — scripts

Em [`scripts/`](../../scripts/). Precisam de Node 18+ (sem dependências) e, o `setup`, de Docker.

## `scripts/setup.mjs`

Prepara uma instância n8n (a deste `docker-compose.yml`) para rodar o Chronos.

```bash
node scripts/setup.mjs [--dry-run] [--only stem,stem] [--no-publish] [--tabela nome=id ...]
```

O que faz, em ordem:

1. **Data Tables** — cria as que faltarem pela API pública do n8n (`N8N_API_KEY`), ou usa as informadas em `--tabela`.
2. **Credenciais** — lê as credenciais da instância (`n8n export:credentials`, no container) e guarda o id da *Google Calendar OAuth2 API*.
3. **Ids de workflows** — se já existir um workflow com o mesmo **nome** (não arquivado), mantém o id dele; senão usa o do arquivo.
4. **Placeholders** — troca `__DATATABLE:<nome>__`, `__WF_ID:<arquivo>__` e `__CREDENTIAL:<tipo>__` pelos ids reais (sem credencial, remove a ligação e avisa).
5. **Importa e publica** na ordem das dependências (utilitários → fluxos 3, 4, 2 → 1b → 1) e **reinicia o n8n**.

| Opção | Efeito |
| --- | --- |
| `--dry-run` | não importa nada; grava os arquivos resolvidos numa pasta temporária e mostra o caminho |
| `--only a,b` | só os workflows listados (nome do arquivo sem `.json`); os placeholders dos demais continuam resolvidos |
| `--no-publish` | importa sem publicar (o n8n ainda é reiniciado ao final) |
| `--tabela nome=id` | usa o id informado em vez de consultar/criar a tabela (repetível) |

Variáveis lidas do `.env`/ambiente: `N8N_API_KEY`, `N8N_URL`, `N8N_CONTAINER` ([lista](variaveis-de-ambiente.md)). Falhas comuns: [diagnosticar problemas](../como-fazer/diagnosticar-problemas.md#setupmjs-falhou).

## `scripts/sanitizar-workflows.mjs`

Limpa exports do n8n antes de versionar.

```bash
node scripts/sanitizar-workflows.mjs [stem ...] [--tabela nome=id ...]
```

Sem argumentos, limpa todos os `workflows/*.json`. Para cada arquivo:

- **remove** `shared` (nome/e-mail do dono, ids de usuário e projeto), `createdAt`, `updatedAt`, `versionId`, `activeVersionId`, `versionCounter`, `triggerCount`, `staticData`, `meta`, `sourceWorkflowId` e `versionMetadata`;
- **troca** ids de Data Tables (por `--tabela` ou pela API, com `N8N_API_KEY`), de credenciais e de sub-workflows (pelos arquivos de `workflows/`) pelos placeholders.

Imprime os placeholders que sobraram em cada arquivo e avisa ids que não reconheceu.

## `scripts/tabelas.mjs` e `scripts/lib.mjs`

`tabelas.mjs` define as colunas das três Data Tables e o nome padrão da credencial; `lib.mjs` tem o que os dois scripts compartilham (ler `.env`, percorrer/limpar JSON). Ao criar uma tabela nova, registre-a em `tabelas.mjs`.
