// Executa os nós Code dos workflows exportados com um ambiente n8n simulado (sem rede, sem DeepSeek/Todoist reais).
const fs = require('node:fs');
const path = require('node:path');
const { DateTime } = require('luxon');

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, '../../workflows', f), 'utf8'))[0];
const wf = { fluxo1b: load('fluxo-1b-processar-mensagem.json'), pend: load('util-pendencias.json'), subs: load('util-criar-subtarefas.json') };
const codeOf = (w, name) => wf[w].nodes.find((n) => n.name === name).parameters.jsCode;
const wrap = (v) => ({ first: () => ({ json: v }), all: () => (Array.isArray(v) ? v : [{ json: v }]) });
const notRun = (name) => () => { throw new Error("Node '" + name + "' hasn't been executed"); };

// $: mapa nome → json (objeto), lista de itens ({json}) ou função que lança (nó que não rodou)
function run(w, name, { nodes = {}, input = [], json = {}, env = {}, now = DateTime.fromISO('2026-10-23T10:00:00', { zone: 'America/Sao_Paulo' }) } = {}) {
  const $ = (n) => {
    if (!(n in nodes)) throw new Error("Node '" + n + "' hasn't been executed");
    const v = nodes[n];
    return wrap(v);
  };
  const items = Array.isArray(input) ? input : [{ json: input }];
  const fn = new Function('DateTime', '$', '$input', '$json', '$now', '$env', codeOf(w, name));
  const out = fn(DateTime, $, { all: () => items, first: () => items[0] }, json, now, { TELEGRAM_CHAT_ID: 'CHAT', ...env });
  return Array.isArray(out) ? out.map((o) => o.json) : [out.json];
}

// ---------- árvore de teste fixa ----------
let seq = 0;
const task = (o) => ({ id: 'id' + (++seq), checked: false, is_deleted: false, section_id: null, parent_id: null, child_order: seq, description: '', ...o });
function fixture() {
  seq = 0;
  const projects = [
    { id: 'c', name: 'Casa', description: 'Manutenção da casa', child_order: 2, inbox_project: false },
    { id: 'in', name: 'Inbox', description: '', child_order: 1, inbox_project: true },
    { id: 'e', name: 'Estudos', description: 'Cursos e leituras', child_order: 3, inbox_project: false },
  ];
  const sections = [
    { id: 'sc_ev', project_id: 'c', name: 'Eventos', description: 'Festas', child_order: 1 },
    { id: 'sc_bib', project_id: 'e', name: 'Leitura', description: 'Livros e artigos', child_order: 1 },
  ];
  const T = {};
  T.lista = task({ project_id: 'in', content: 'Lista de Compras' });
  T.pao = task({ project_id: 'in', content: 'Comprar pão', parent_id: T.lista.id });
  T.banco = task({ project_id: 'in', content: 'Ligar para o banco' });
  T.estante = task({ project_id: 'c', content: 'Montar estante' });
  T.obra = task({ project_id: 'c', content: 'Compras da obra' });
  T.festa = task({ project_id: 'c', section_id: 'sc_ev', content: 'Planejar festa' });
  // cadeia profunda: N1 > N2 > N3 > N4
  T.n1 = task({ project_id: 'e', content: 'Nível 1' });
  T.n2 = task({ project_id: 'e', content: 'Nível 2', parent_id: T.n1.id });
  T.n3 = task({ project_id: 'e', content: 'Nível 3', parent_id: T.n2.id });
  T.n4 = task({ project_id: 'e', content: 'Nível 4', parent_id: T.n3.id });
  return { projects, sections, tasks: Object.values(T), T };
}

function montar(text, fx = fixture(), opts = {}) {
  const items = opts.tasksItems || [{ json: { results: fx.tasks } }];
  return run('fluxo1b', 'Montar prompt', {
    nodes: { 'Recebe update': { text, chat_id: 7 }, 'Buscar projetos Todoist': { results: fx.projects }, 'Buscar seções Todoist': { results: fx.sections },
      'Google: listar agendas': { items: opts.calendars || [{ id: 'cal_t', summary: 'Trabalho', description: 'Trabalho e clientes' }, { id: 'cal_i', summary: 'Lazer' }, { id: 'cal_p', summary: 'Pessoal', primary: true }] } },
    input: items,
    env: opts.env,
  })[0];
}
const ds = (obj, usage) => ({ choices: [{ message: { content: typeof obj === 'string' ? obj : JSON.stringify(obj) } }], usage: usage || { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 64, prompt_cache_miss_tokens: 36 } });
function interpretar(ctx, response, env) {
  return run('fluxo1b', 'Interpretar classificação', { nodes: { 'Montar prompt': ctx }, json: response, env })[0];
}
const answer = (o) => ({ type: 'tarefa', title: 'Comprar leite', description: '', priority: 4, due: null, destino: { projeto: 'P1', secao: null, pai: null }, eh_subtarefa: false,
  pai_citado: null, candidatos_pai: [], subtarefas: [], start: null, end: null, location: null, calendar: null, ...o });
// código curto de uma tarefa/seção na árvore montada
const codeOfTask = (ctx, content) => Object.keys(ctx.idmap.T).find((c) => ctx.idmap.T[c].content === content);
const codeOfProject = (ctx, name) => Object.keys(ctx.idmap.P).find((c) => ctx.idmap.P[c].name === name);
const codeOfSection = (ctx, name) => Object.keys(ctx.idmap.S).find((c) => ctx.idmap.S[c].name === name);

module.exports = { run, wf, fixture, task, montar, ds, interpretar, answer, codeOfTask, codeOfProject, codeOfSection, DateTime };
