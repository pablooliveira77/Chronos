# Como criar a credencial do Google Calendar

O Chronos cria e lê eventos pelo Google Calendar. A API do Google não permite isso com uma simples chave: é preciso um **ID de cliente OAuth** e uma credencial dentro do n8n. É a única credencial que vive no n8n (as demais vêm do `.env`).

## Passo a passo

1. No [Google Cloud Console](https://console.cloud.google.com/), crie um projeto novo e, em **APIs e serviços › Biblioteca**, ative a **Google Calendar API**.
2. Em **Tela de consentimento OAuth**, escolha o tipo **Externo** e adicione o seu e-mail em **Usuários de teste**.
   - Enquanto o app estiver em modo *Teste*, o refresh token expira em **7 dias** (a credencial passa a falhar com 401). Para não expirar, publique o app em **Status de publicação**.
3. Em **Credenciais › Criar credenciais › ID do cliente OAuth**, escolha **Aplicativo da Web** e cadastre o URI de redirecionamento:

   ```
   http://localhost:5678/rest/oauth2-credential/callback
   ```

   (Em um servidor, troque `localhost:5678` pelo seu endereço público — `https://<seu-dominio>/rest/oauth2-credential/callback`.)
4. No n8n: **Credentials › Add credential › Google Calendar OAuth2 API**. Cole o *Client ID* e o *Client Secret* e clique em **Sign in with Google**.
5. Na tela de consentimento do Google, **marque as duas permissões** — a de *agendas* (`calendar`) **e** a de *eventos* (`calendar.events`). Com só a de eventos, a listagem de agendas devolve 403 e tudo cai na agenda principal.

## Anexar aos workflows

Você não precisa anexar nada à mão: o [`scripts/setup.mjs`](../referencia/scripts.md) procura a credencial do tipo *Google Calendar OAuth2 API* na sua instância e a coloca nos 6 nós do Google (Fluxos 1b, 2 e 4). Rode o script (ou rode de novo) depois de criá-la.

Se trocar o token depois (**Reconnect**), não precisa republicar nada: ele é lido em tempo de execução.

## Conferir

Envie `/hoje` ao bot. Se o resumo trouxer o bloco “📅 Agenda de hoje” sem avisos, está certo. Se aparecer “(só a agenda principal — Forbidden…)”, o token perdeu o escopo `calendar`: faça **Reconnect** marcando as duas permissões (se o Google não oferecer a caixa, revogue o app em myaccount.google.com/permissions e refaça).
