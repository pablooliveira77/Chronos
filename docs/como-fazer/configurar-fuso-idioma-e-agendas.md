# Como configurar fuso, idioma e agendas

Tudo isso vive no `.env` (modelo em `.env.example`). Depois de editar, aplique com:

```bash
docker compose up -d
```

(O compose recria o container com as variáveis novas; workflows e credenciais ficam no volume.)

## Mudar o fuso horário

```env
CHRONOS_TIMEZONE=Europe/Lisbon
```

Vale para o agendamento do n8n (9h20 e segunda 9h30 são no seu fuso), para o cálculo de “hoje”, “atrasada” e “esta semana” e para os horários mostrados. Use um nome da [lista IANA](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones).

## Mudar o idioma

```env
CHRONOS_LOCALE=en-US
```

Controla o formato de datas/dias da semana e o **idioma dos prazos no Todoist** (`pt-BR` → `pt`, `en-US` → `en`). Atenção: os **textos** das mensagens do bot e dos prompts continuam em português; para traduzi-los, edite os nós *Code* e os prompts nos workflows.

## Escolher quais agendas entram no resumo

```env
# vazio = todas as agendas em que você pode editar
CHRONOS_CALENDARS=
# ou só estas (nomes separados por ";", sem diferenciar acentos, caixa ou "&"):
CHRONOS_CALENDARS="Trabalho;Casa & Família"
```

Isso afeta o **resumo diário** (`/hoje`) e a **agenda da semana** (`/semana`). Ao **criar** eventos, o Chronos escolhe entre todas as agendas editáveis, usando o nome (e a descrição) de cada uma. Dica: escreva na *descrição* de cada agenda no Google Calendar para que serve — a IA usa esse texto para decidir.

Se nenhuma agenda listada for encontrada, o resumo cai na agenda principal e avisa o motivo.

## Mudar o horário dos resumos

O horário está no próprio gatilho: no n8n, abra **Fluxo 2** (nó *Todo dia às 9h20*) ou **Fluxo 4** (nó *Segunda às 9h30*), ajuste e salve. Se exportar para o repositório, passe pelo [sanitizador](instalar-e-atualizar-workflows.md#exportar-uma-alteração-sua-para-o-repositório).

## Mudar a janela do horário livre

O encaixe de tarefas com data sem hora usa 08h–20h, em slots de 60 min. Para mudar, edite as constantes `WORK_START`, `WORK_END` e `SLOT_MIN` no nó *Escolher horário livre* do **Util: Horário livre**.
