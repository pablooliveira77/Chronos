# Scripts

Duas ferramentas de linha de comando, sem dependências (só Node.js 18+; o `setup` também usa Docker). Rode sempre da **raiz do repositório**.

| Script | Para quê | Quando usar |
| --- | --- | --- |
| [`setup.mjs`](setup.mjs) | Instala (ou atualiza) os 9 workflows na **sua** instância do n8n | Na primeira instalação e depois de cada `git pull` que mude `workflows/` |
| [`sanitizar-workflows.mjs`](sanitizar-workflows.mjs) | Tira dados pessoais e ids da instância de um export do n8n | Antes de commitar um workflow que você editou no n8n (quem contribui) |

`lib.mjs` (funções compartilhadas) e `tabelas.mjs` (colunas das Data Tables e nome da credencial) são usados pelos dois e não se executam sozinhos.

## Por que existem

Os arquivos em `workflows/` não trazem ids da instância de ninguém: no lugar ficam **placeholders** (`__DATATABLE:<nome>__`, `__WF_ID:<arquivo>__`, `__CREDENTIAL:<tipo>__`). Assim o repositório não vaza dados pessoais e funciona em qualquer máquina.

- O **`setup`** faz o caminho de ida: troca os placeholders pelos ids reais da sua instância e importa.
- O **`sanitizar`** faz o caminho de volta: troca os ids reais por placeholders e apaga os metadados antes de versionar.

Sem eles você teria de importar nove workflows um a um e editar à mão cada id de tabela, de credencial e de sub-workflow.

## `setup.mjs` — instalar e atualizar

### Antes de rodar

1. `cp .env.example .env` e preencha os tokens.
2. `docker compose up -d` (o container `chronos-n8n` precisa estar no ar).
3. No n8n, crie a **chave da API** (*Settings › n8n API*) e coloque em `N8N_API_KEY` no `.env`.
4. Crie a credencial **Google Calendar OAuth2 API** ([como fazer](../docs/como-fazer/credencial-google-calendar.md)). Sem ela o setup avisa e os nós do Google ficam sem credencial.

### Uso

```bash
node scripts/setup.mjs --dry-run     # 1º: simula; não importa nada
node scripts/setup.mjs               # instala de verdade
```

O que acontece, em ordem: cria as Data Tables que faltam → lê o id da sua credencial do Google → resolve os placeholders → importa e publica os workflows (sub-workflows antes de quem os chama) → **reinicia o n8n**. Pode rodar de novo quantas vezes quiser: workflows que já existem (mesmo nome) são atualizados no lugar, sem duplicar.

| Opção | Efeito |
| --- | --- |
| `--dry-run` | Não importa nada; mostra o que faria e grava os JSON resolvidos numa pasta temporária |
| `--only a,b` | Só os workflows listados (nome do arquivo sem `.json`), ex.: `--only fluxo-2-rotina-9h20,util-pendencias` |
| `--no-publish` | Importa sem publicar (o n8n ainda é reiniciado) |
| `--tabela nome=id` | Usa uma tabela que você criou pela interface, sem precisar da `N8N_API_KEY`. Repita para as 3 tabelas |

Variáveis opcionais (no `.env` ou no ambiente): `N8N_URL` (padrão `http://localhost:5678`) e `N8N_CONTAINER` (padrão `chronos-n8n`).

### Se algo falhar

| Mensagem | O que fazer |
| --- | --- |
| `Defina N8N_API_KEY…` | Crie a chave da API ou use `--tabela` |
| `não consegui ler as credenciais no container` | Suba o container (`docker compose up -d`) |
| `credencial "googleCalendarOAuth2Api" não existe…` | Crie a credencial do Google e rode o setup de novo |
| `placeholders sem valor` | Há um placeholder que o script não conhece; confira o nome em `tabelas.mjs` e em `workflows/` |

Mais casos em [diagnosticar problemas](../docs/como-fazer/diagnosticar-problemas.md#setupmjs-falhou).

## `sanitizar-workflows.mjs` — limpar antes de commitar

Você só precisa dele se **editar um workflow no n8n e quiser versionar a mudança** (por exemplo, num pull request).

```bash
# 1. Exporte dentro do container e copie para workflows/
docker compose exec n8n n8n export:workflow --id=<ID_DO_WORKFLOW> --output=/tmp/wf.json
docker compose cp n8n:/tmp/wf.json workflows/<arquivo>.json

# 2. Limpe (sem argumentos, limpa todos os arquivos de workflows/)
node scripts/sanitizar-workflows.mjs <arquivo-sem-.json>

# 3. Confira que nada pessoal sobrou
cd tests/fluxo-1b && npm install && npm test
```

O que ele faz em cada arquivo:

- **apaga** o dono da instância (nome e e-mail), ids de usuário e de projeto, datas, versões e dados de execução (`shared`, `createdAt`, `versionId`, `staticData`, `meta` etc.);
- **troca** ids de Data Tables, credenciais e sub-workflows pelos placeholders.

Para reconhecer os ids das suas tabelas, ele usa a `N8N_API_KEY` do `.env` ou `--tabela nome=id`. No fim, mostra os placeholders de cada arquivo e avisa de qualquer id que não reconheceu (**não ignore esse aviso**: é um id da sua instância que ia ser commitado).

> O arquivo exportado sobrescreve o do repositório. Faça isso numa branch e revise o `git diff` antes de commitar.

## Criar uma Data Table nova

Se um workflow passar a usar uma tabela nova, registre o nome e as colunas em [`tabelas.mjs`](tabelas.mjs): o `setup` passa a criá-la e o `sanitizar` a reconhece.

## Referência

Detalhes completos em [docs/referencia/scripts.md](../docs/referencia/scripts.md).
