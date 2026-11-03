# Como operar o container do n8n

```bash
docker compose up -d                          # subir (e aplicar mudanças do .env)
docker compose logs -f n8n                    # acompanhar logs
docker compose exec n8n sh                    # entrar no container
docker compose restart n8n                    # reiniciar
docker compose down                           # parar (dados ficam no volume n8n_storage)
docker compose down -v                        # parar E apagar o volume (perde workflows, credenciais e tabelas)
docker compose pull && docker compose up -d   # atualizar o n8n
```

## O que fica onde

- **Volume `n8n_storage`**: workflows, credenciais, Data Tables e histórico de execuções. Sobrevive a `down`, não a `down -v`.
- **`./workflows` → `/workflows`** (somente leitura): os exports versionados, visíveis dentro do container.
- **`.env`**: segredos e configuração; o compose os repassa ao container (`$env.*` nos workflows). Depois de editar, `docker compose up -d`.

## Atualizar o n8n

O compose usa a imagem `n8nio/n8n:latest`. O Chronos foi desenvolvido e testado com o **n8n 2.x**; se uma versão nova quebrar algo, fixe a versão testada trocando `latest` por um número (ex.: `n8nio/n8n:2.43.5`) no `docker-compose.yml`. Depois de atualizar, rode `node scripts/setup.mjs --dry-run` e um `/hoje` para conferir.

## Se o computador ficar desligado

O Telegram retém as mensagens por até 24 h; ao subir, o Chronos processa todas, em ordem, e só as marca como lidas depois de processadas. Os resumos agendados do período desligado **não** são recuperados — use `/hoje` e `/semana`.

## Backup

Os workflows já estão no repositório. Credenciais e tabelas estão no volume: exporte as credenciais com `docker compose exec n8n n8n export:credentials --all --output=/tmp/cred.json` (criptografadas) e guarde o arquivo e a chave de criptografia do n8n em local seguro. Nunca versione esse arquivo.
