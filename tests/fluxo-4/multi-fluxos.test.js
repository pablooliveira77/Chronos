// Fluxos 2, 3 e 4 e utilitários: nada fixo da instalação de ninguém (agendas, fuso, idioma) — tudo vem do Google/.env.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DateTime } = require('luxon');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../workflows', f + '.json'), 'utf8'))[0];
const wf = { f2: load('fluxo-2-rotina-9h20'), f3: load('fluxo-3-editar-tarefa'), f4: load('fluxo-4-agenda-semanal'),
  hl: load('util-horario-livre'), cs: load('util-criar-subtarefas'), pe: load('util-pendencias'), bt: load('util-buscar-tarefa') };
const codeOf = (w, name) => wf[w].nodes.find((n) => n.name === name).parameters.jsCode;
const wrap = (v) => ({ first: () => ({ json: v }), all: () => (Array.isArray(v) ? v : [{ json: v }]) });
const run = (w, name, { nodes = {}, json = {}, env = {}, now = DateTime.fromISO('2026-10-28T10:00:00', { zone: 'America/Sao_Paulo' }) } = {}) => {
  const $ = (n) => { if (!(n in nodes)) throw new Error("Node '" + n + "' hasn't been executed"); return wrap(nodes[n]); };
  const out = new Function('DateTime', '$', '$input', '$json', '$now', '$env', codeOf(w, name))(DateTime, $, { all: () => [{ json }], first: () => ({ json }) }, json, now, env);
  return Array.isArray(out) ? out.map((o) => o.json) : [out.json];
};

const agendas = { items: [
  { id: 'a', summary: 'Trabalho' }, { id: 'b', summary: 'Casa & Família' }, { id: 'c', summary: 'Antiga', deleted: true },
  { id: 'd', summary: 'Mensagens', summaryOverride: 'Pessoal' },
] };

test('Selecionar agendas (Fluxos 2 e 4): sem CHRONOS_CALENDARS usa todas as editáveis', () => {
  for (const w of ['f2', 'f4']) {
    const r = run(w, 'Selecionar agendas', { json: agendas });
    assert.deepEqual(r.map((x) => x.calendar_label), ['Trabalho', 'Casa & Família', 'Pessoal'], w);
    assert.deepEqual(r.map((x) => x.calendar_id), ['a', 'b', 'd'], w);
  }
});

test('Selecionar agendas: CHRONOS_CALENDARS restringe (sem acento/caixa/&), usa o nome exibido; sem match → principal', () => {
  for (const w of ['f2', 'f4']) {
    const r = run(w, 'Selecionar agendas', { json: agendas, env: { CHRONOS_CALENDARS: ' casa e familia ; PESSOAL ' } });
    assert.deepEqual(r.map((x) => x.calendar_id), ['b', 'd'], w);
    const nada = run(w, 'Selecionar agendas', { json: agendas, env: { CHRONOS_CALENDARS: 'Inexistente' } });
    assert.equal(nada[0].calendar_id, 'primary');
    assert.match(nada[0].list_error, /CHRONOS_CALENDARS/);
    const erro = run(w, 'Selecionar agendas', { json: { error: { message: '403' } } });
    assert.equal(erro[0].calendar_id, 'primary');
    assert.match(erro[0].list_error, /403/);
  }
});

test('Fluxo 4: a semana começa na segunda no fuso de CHRONOS_TIMEZONE', () => {
  const sp = run('f4', 'Período', { json: { ref_date: '2026-10-28' } })[0];
  assert.match(sp.start, /^2026-10-26T00:00:00\.000-03:00$/);
  const ny = run('f4', 'Período', { json: { ref_date: '2026-10-28' }, env: { CHRONOS_TIMEZONE: 'America/New_York' } })[0];
  assert.match(ny.start, /^2026-10-26T00:00:00\.000-04:00$/);
});

test('Fluxo 3: idioma do prazo e fuso vêm do .env', () => {
  const ctx = { chat_id: 1, task: { id: 't1', content: 'Comprar leite', description: '', priority: 1, project_id: 'p', due: null }, projects: [] };
  const resp = { choices: [{ message: { content: JSON.stringify({ changes: { due: 'friday' }, summary: 'prazo' }) } }] };
  const nodes = { 'Montar prompt de edição': ctx };
  assert.equal(run('f3', 'Interpretar ajuste', { json: resp, nodes })[0].update_body.due_lang, 'pt');
  assert.equal(run('f3', 'Interpretar ajuste', { json: resp, nodes, env: { CHRONOS_LOCALE: 'en-US' } })[0].update_body.due_lang, 'en');
  const prompt = (env) => run('f3', 'Montar prompt de edição', { nodes: { 'Alvo da edição': { chat_id: 1, adjust: 'x' }, 'Obter tarefa': ctx.task, 'Buscar projetos': { results: [] } }, json: { results: [] }, env })[0].system;
  assert.match(prompt({}), /\(America\/Sao_Paulo\)\./);
  assert.match(prompt({ CHRONOS_TIMEZONE: 'Europe/Lisbon' }), /\(Europe\/Lisbon\)\./);
});

test('Fluxo 2: classifica hoje/atrasada no fuso configurado', () => {
  const projetos = { results: [{ id: 'p', name: 'Casa', inbox_project: false }] };
  const t = (id, date) => ({ id, content: id, project_id: 'p', priority: 1, due: { date } });
  const nodes = {
    'Buscar projetos': projetos,
    'Tarefas de hoje': { results: [t('manha', '2026-10-28T08:00:00'), t('tarde', '2026-10-28T18:00:00')] },
    'Tarefas atrasadas': { results: [t('ontem', '2026-10-27T10:00:00')] },
    'Tarefas da Entrada': { results: [] },
    'Selecionar agendas': [], 'Google: eventos de hoje': [],
  };
  // 10:00 em São Paulo: manhã (08:00) já passou → atrasada; tarde (18:00) → hoje
  const sp = run('f2', 'Preparar contexto', { nodes });
  const ids = (l) => l.map((x) => x.id).sort();
  assert.deepEqual(ids(sp[0].today), ['tarde']);
  assert.deepEqual(ids(sp[0].overdue), ['manha', 'ontem']);
  assert.doesNotMatch(sp[0].system, /6XGgmFVcrG5RRjVt/); // id de tarefa real não vai no exemplo do prompt
});

test('Util: horário livre usa o fuso do .env', () => {
  const nodes = { Entrada: { date: '2026-10-29' }, 'Obter tarefa': { id: 't', content: 'X', due: { date: '2026-10-29' } } };
  const prox = (env) => run('hl', 'Escolher horário livre', { nodes, json: { results: [] }, env, now: DateTime.fromISO('2026-10-20T10:00:00', { zone: 'UTC' }) })[0];
  assert.match(prox({}).due_datetime, /^2026-10-29T08:00:00\.000-03:00$/);
  assert.match(prox({ CHRONOS_TIMEZONE: 'Europe/Lisbon' }).due_datetime, /^2026-10-29T08:00:00\.000\+00:00$/);
});

test('Util: criar subtarefas manda o idioma da locale ao Todoist', () => {
  const nodes = { Entrada: { parent_id: 'p1', priority: 3, subs_json: JSON.stringify([{ title: 'A', due: 'amanhã' }]) } };
  assert.equal(run('cs', 'Preparar subtarefas', { nodes })[0].body.due_lang, 'pt');
  assert.equal(run('cs', 'Preparar subtarefas', { nodes, env: { CHRONOS_LOCALE: 'es-ES' } })[0].body.due_lang, 'es');
});

test('nenhum dado pessoal/da instância nos Fluxos 2, 3 e 4 e nos utilitários', () => {
  for (const k of Object.keys(wf)) {
    const txt = JSON.stringify(wf[k]);
    assert.doesNotMatch(txt, /@gmail|@outlook|creatorId|"shared"|versionMetadata/, k);
    // nenhuma agenda fixa no código: as agendas vêm do Google (calendarList) ou de CHRONOS_CALENDARS
    assert.doesNotMatch(txt, /const WANTED = \[/, k);
    // ids de tabela/credencial/sub-workflow são placeholders resolvidos pelo scripts/setup.mjs
    const achados = [];
    (function andar(o) {
      if (Array.isArray(o)) return o.forEach(andar);
      if (!o || typeof o !== 'object') return;
      if (o.dataTableId && !String(o.dataTableId.value).startsWith('__DATATABLE:')) achados.push('dataTableId');
      if (o.workflowId && o.workflowId.value && !String(o.workflowId.value).startsWith('__WF_ID:')) achados.push('workflowId');
      if (o.credentials) for (const c of Object.values(o.credentials)) if (!String(c.id).startsWith('__CREDENTIAL:')) achados.push('credencial');
      Object.values(o).forEach(andar);
    })(wf[k]);
    assert.deepEqual(achados, [], k + ': id da instância sem placeholder');
  }
});
