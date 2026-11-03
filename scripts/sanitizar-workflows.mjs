#!/usr/bin/env node
// Limpa os exports do n8n antes de versionar: tira nome/e-mail do dono da instância, ids de usuário/projeto,
// datas e versões, e troca ids de Data Tables, credenciais e sub-workflows por placeholders portáveis.
//
//   node scripts/sanitizar-workflows.mjs [stem ...] [--tabela nome=id ...]
//
// Sem argumentos, limpa todos os workflows/*.json. Os ids das Data Tables da sua instância vêm de
// --tabela nome=id (repetível) ou, se houver N8N_API_KEY no .env, da API do n8n.
import { listarWorkflows, lerWorkflow, salvarWorkflow, sanitizar, lerEnv, placeholdersRestantes } from './lib.mjs';
import { TABELAS } from './tabelas.mjs';

const args = process.argv.slice(2);
const stems = []; const manual = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tabela') { const [n, id] = String(args[++i]).split('='); manual[n] = id; } else stems.push(args[i]);
}

const env = { ...lerEnv(), ...process.env };
const idsTabelas = {};
for (const [nome, id] of Object.entries(manual)) idsTabelas[id] = nome;
if (env.N8N_API_KEY) {
  try {
    const r = await fetch(`${env.N8N_URL || 'http://localhost:5678'}/api/v1/data-tables?limit=250`, { headers: { 'X-N8N-API-KEY': env.N8N_API_KEY } });
    for (const t of (await r.json()).data || []) if (TABELAS[t.name]) idsTabelas[t.id] = t.name;
  } catch (e) { console.warn('Aviso: não consegui listar as Data Tables pela API (' + e.message + ').'); }
}

const todos = listarWorkflows();
const idsWorkflows = {};
for (const w of todos) { const id = lerWorkflow(w.arquivo).id; if (id) idsWorkflows[id] = w.stem; }

for (const w of todos.filter((x) => !stems.length || stems.includes(x.stem))) {
  const wf = lerWorkflow(w.arquivo);
  const avisos = sanitizar(wf, { idsTabelas, idsWorkflows });
  salvarWorkflow(w.arquivo, wf);
  console.log(`✔ ${w.stem}` + (avisos.length ? `\n   ⚠ ${[...new Set(avisos)].join('\n   ⚠ ')}` : '') + `  [placeholders: ${placeholdersRestantes(wf).join(', ') || '—'}]`);
}
