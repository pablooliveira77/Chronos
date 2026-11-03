#!/usr/bin/env node
// Prepara uma instância n8n (Docker Compose deste repositório) para rodar o Chronos:
//   1. cria as Data Tables que faltarem (API pública do n8n);
//   2. descobre o id da credencial do Google Calendar já criada na instância;
//   3. troca os placeholders dos workflows (__DATATABLE:…__, __WF_ID:…__, __CREDENTIAL:…__) pelos ids reais;
//   4. importa e publica os workflows (CLI do n8n dentro do container) e reinicia o n8n.
//
//   node scripts/setup.mjs [--dry-run] [--only stem,stem] [--no-publish] [--tabela nome=id ...]
//
// Pré-requisitos: container do n8n no ar (docker compose up -d) e N8N_API_KEY no .env
// (n8n > Settings > n8n API). Sem a chave, crie as 3 tabelas na interface e passe --tabela nome=id.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { RAIZ, listarWorkflows, lerWorkflow, percorrer, placeholdersRestantes, lerEnv } from './lib.mjs';
import { TABELAS } from './tabelas.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const valor = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const manual = {};
args.forEach((a, i) => { if (a === '--tabela') { const [n, id] = String(args[i + 1]).split('='); manual[n] = id; } });

const DRY = flag('--dry-run');
const env = { ...lerEnv(), ...process.env };
const URL_N8N = (env.N8N_URL || 'http://localhost:5678').replace(/\/$/, '');
const CONTAINER = env.N8N_CONTAINER || 'chronos-n8n';
const so = valor('--only') ? valor('--only').split(',') : null;

// Sub-workflows antes de quem os chama (publicar nessa ordem).
const ORDEM = ['util-horario-livre', 'util-buscar-tarefa', 'util-criar-subtarefas', 'util-pendencias', 'fluxo-3-editar-tarefa',
  'fluxo-4-agenda-semanal', 'fluxo-2-rotina-9h20', 'fluxo-1b-processar-mensagem', 'fluxo-1-captura'];

const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const n8n = (...a) => docker('exec', CONTAINER, 'n8n', ...a);
const api = async (metodo, rota, corpo) => {
  const r = await fetch(`${URL_N8N}/api/v1${rota}`, {
    method: metodo, headers: { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (!r.ok) throw new Error(`${metodo} ${rota} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};
const falhar = (m) => { console.error('✖ ' + m); process.exit(1); };

const arquivos = listarWorkflows();
const porStem = Object.fromEntries(arquivos.map((a) => [a.stem, { ...a, wf: lerWorkflow(a.arquivo) }]));
const desconhecidos = (so || []).filter((s) => !porStem[s]);
if (desconhecidos.length) falhar(`workflow(s) inexistente(s) em workflows/: ${desconhecidos.join(', ')}`);

// ---- 1. Data Tables ----
const idTabela = { ...manual };
if (Object.keys(manual).length < Object.keys(TABELAS).length) {
  if (!env.N8N_API_KEY) falhar('Defina N8N_API_KEY no .env (n8n > Settings > n8n API) ou passe --tabela nome=id para cada tabela: ' + Object.keys(TABELAS).join(', '));
  const existentes = (await api('GET', '/data-tables?limit=250')).data || [];
  for (const [nome, colunas] of Object.entries(TABELAS)) {
    if (idTabela[nome]) continue;
    let t = existentes.find((x) => x.name === nome);
    if (t) console.log(`• tabela ${nome}: já existe (${t.id})`);
    else if (DRY) { console.log(`• tabela ${nome}: seria criada`); t = { id: `(novo:${nome})` }; }
    else { t = await api('POST', '/data-tables', { name: nome, columns: colunas.map(([name, type]) => ({ name, type })) }); console.log(`• tabela ${nome}: criada (${t.id})`); }
    idTabela[nome] = t.id;
  }
}

// ---- 2. Credenciais ----
const credenciais = {};
try {
  for (const c of JSON.parse(n8n('export:credentials', '--all'))) credenciais[c.type] = credenciais[c.type] || { id: c.id, name: c.name };
} catch (e) { falhar(`não consegui ler as credenciais no container "${CONTAINER}" (ele está no ar? docker compose up -d): ${e.message.split('\n')[0]}`); }

// ---- 3. Ids dos workflows: o que já existe na instância (pelo nome) manda; senão vale o id do arquivo ----
let existentesWf = [];
if (env.N8N_API_KEY) existentesWf = (await api('GET', '/workflows?limit=250')).data || [];
else {
  try { existentesWf = JSON.parse(n8n('export:workflow', '--all')).map((w) => ({ id: w.id, name: w.name, isArchived: w.isArchived })); } catch { /* instância vazia */ }
}
const idWf = {};
for (const [stem, { wf }] of Object.entries(porStem)) idWf[stem] = (existentesWf.find((w) => w.name === wf.name && !w.isArchived) || wf).id; // arquivados não contam

// ---- 4. Resolver placeholders, importar, publicar ----
const avisos = [];
function resolver(wf) {
  percorrer(wf, (o) => {
    if (o.dataTableId && typeof o.dataTableId === 'object') o.dataTableId.value = String(o.dataTableId.value).replace(/^__DATATABLE:(.+)__$/, (_, n) => idTabela[n] || `__DATATABLE:${n}__`);
    if (o.workflowId && typeof o.workflowId === 'object') o.workflowId.value = String(o.workflowId.value).replace(/^__WF_ID:(.+)__$/, (_, s) => idWf[s] || `__WF_ID:${s}__`);
    if (o.credentials && typeof o.credentials === 'object') {
      for (const tipo of Object.keys(o.credentials)) {
        if (!/^__CREDENTIAL:/.test(String(o.credentials[tipo].id))) continue;
        if (credenciais[tipo]) o.credentials[tipo] = credenciais[tipo];
        else { delete o.credentials[tipo]; avisos.push(`credencial "${tipo}" não existe na instância — crie-a no n8n e anexe aos nós (ou rode o setup de novo)`); }
      }
      if (!Object.keys(o.credentials).length) delete o.credentials;
    }
  });
}

const alvo = ORDEM.concat(Object.keys(porStem).filter((s) => !ORDEM.includes(s))).filter((s) => porStem[s] && (!so || so.includes(s)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chronos-setup-'));
const importados = [];
for (const stem of alvo) {
  const wf = structuredClone(porStem[stem].wf);
  wf.id = idWf[stem];
  resolver(wf);
  const sobra = placeholdersRestantes(wf);
  if (sobra.length) falhar(`${stem}: placeholders sem valor: ${sobra.join(', ')}`);
  const f = path.join(tmp, stem + '.json');
  fs.writeFileSync(f, JSON.stringify([wf], null, 2));
  if (DRY) { console.log(`• ${stem}: pronto para importar (id ${wf.id}) → ${f}`); continue; }
  docker('cp', f, `${CONTAINER}:/tmp/${stem}.json`);
  n8n('import:workflow', `--input=/tmp/${stem}.json`);
  importados.push(wf.id);
  console.log(`• ${stem}: importado (id ${wf.id})`);
}
if (!DRY && !flag('--no-publish')) {
  for (const id of importados) n8n('publish:workflow', `--id=${id}`);
  console.log(`• ${importados.length} workflow(s) publicados`);
}
for (const a of [...new Set(avisos)]) console.warn('⚠ ' + a);
if (!DRY && importados.length) {
  console.log('• reiniciando o n8n (necessário para registrar os gatilhos publicados)…');
  execFileSync('docker', ['compose', 'restart', 'n8n'], { cwd: RAIZ, stdio: 'inherit' });
}
console.log(DRY ? '\n(dry-run: nada foi importado; arquivos resolvidos em ' + tmp + ')' : '\n✔ pronto.');
