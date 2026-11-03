# Tutorial — Primeiros passos

Ao final deste tutorial você terá o Chronos rodando na sua máquina e terá criado, pelo Telegram, uma tarefa no Todoist, um evento no Google Calendar e o resumo do dia. Reserve ~30 minutos. Siga os passos **na ordem**; cada um diz o que você deve ver antes de seguir.

> Quer entender o porquê das coisas? Isso fica na [Explicação](../explicacao/visao-geral.md). Aqui só fazemos.

## O que você precisa

- **Docker** com Compose v2 (`docker compose version`) e **Node.js 18+** (`node --version`) — o Node só roda o script de instalação.
- Contas: **Telegram**, **Todoist**, **DeepSeek** (com saldo) e **Google** (para o Calendar).

## 1. Baixe o projeto e crie o `.env`

```bash
git clone <URL-do-repositório> chronos
cd chronos
cp .env.example .env
```

Abra o `.env` e preencha:

| Variável | Onde obter |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | No Telegram, converse com o `@BotFather`, envie `/newbot` e copie o token |
| `TODOIST_API_TOKEN` | Todoist › Configurações › Integrações › Desenvolvedor › Token de API |
| `DEEPSEEK_API_KEY` | Painel de desenvolvedor do DeepSeek (platform.deepseek.com) |

Deixe `TELEGRAM_CHAT_ID` e `N8N_API_KEY` em branco por enquanto. Fuso e idioma já vêm com padrões (`America/Sao_Paulo`, `pt-BR`); veja [como mudá-los](../como-fazer/configurar-fuso-idioma-e-agendas.md).

## 2. Suba o n8n

```bash
docker compose up -d
```

Abra **http://localhost:5678** e crie o usuário administrador. ✅ *Você deve ver o painel do n8n.*

## 3. Crie a chave da API do n8n

No n8n: **Settings › n8n API › Create an API key**. Copie a chave para `N8N_API_KEY` no `.env`. (O script de instalação usa essa chave para criar as tabelas de dados.)

## 4. Crie a credencial do Google Calendar

Siga [Criar a credencial do Google Calendar](../como-fazer/credencial-google-calendar.md) e volte aqui. ✅ *Em **Credentials** do n8n aparece uma credencial “Google Calendar OAuth2 API” conectada.*

## 5. Instale os workflows

```bash
node scripts/setup.mjs
```

O script cria as três Data Tables, liga os workflows entre si, anexa a credencial do Google, publica tudo e reinicia o n8n. ✅ *A última linha é `✔ pronto.` e, em **Workflows**, os 9 “Chronos — …” aparecem ativos.*

## 6. Descubra o seu `chat_id`

No Telegram, abra o bot que você criou e envie `/start`. ✅ *Ele responde com a ajuda e uma linha “Seu chat_id: `123456789`”.*

Copie esse número para `TELEGRAM_CHAT_ID` no `.env` e aplique:

```bash
docker compose up -d
```

(É para onde vão o resumo das 9h20 e a agenda de segunda. Os workflows continuam instalados: ficam no volume do Docker.)

## 7. Crie sua primeira tarefa

Envie ao bot: **`comprar leite amanhã`**.

✅ *O bot responde “✅ Tarefa criada”, com o projeto e a data (📅 … ⏰ …), e a tarefa aparece na **Entrada** do Todoist, encaixada no primeiro horário livre de amanhã.*

## 8. Crie seu primeiro evento

Envie: **`dentista sexta às 15h`**.

✅ *O bot responde “📅 Evento criado no Google Calendar”, com horário (15:00–16:00), a agenda escolhida e um link; o evento aparece no seu Google Calendar. Nada vai para o Todoist.*

## 9. Peça o resumo e a agenda da semana

- Envie **`/hoje`** → resumo do dia: agenda, tarefas de hoje, atrasadas e 3 sugestões da Entrada, com botões ✅/⏰.
- Envie **`/semana`** → agenda de segunda a domingo, dia a dia.

Toque em um botão do resumo (por exemplo **✅ Concluir**) e veja a tarefa concluída no Todoist.

## 10. Experimente os extras

- **Subtarefa:** `comprar parafusos, subtarefa de Montar estante` (crie antes uma tarefa “Montar estante”).
- **Vários passos:** `organizar o churrasco no sábado: comprar carne, avisar os convidados, limpar a churrasqueira` → uma tarefa com três subtarefas reais.
- **Edição:** `/edit Montar estante | mudar prazo pra sexta`.

## Pronto — e agora?

- Algo não respondeu? [Diagnosticar problemas](../como-fazer/diagnosticar-problemas.md).
- Quer limitar as agendas do resumo? [Configurar fuso, idioma e agendas](../como-fazer/configurar-fuso-idioma-e-agendas.md).
- Lista de comandos: [Comandos do bot e botões](../referencia/comandos-e-botoes.md).
- Como tudo funciona por dentro: [Visão geral](../explicacao/visao-geral.md).
