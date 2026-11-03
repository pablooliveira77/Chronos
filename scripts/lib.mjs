import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREDENCIAIS } from './tabelas.mjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PASTA_WORKFLOWS = path.join(RAIZ, 'workflows');

// Campos que o n8n acrescenta ao exportar e que identificam a instância/pessoa (ou só geram ruído nos diffs)
export const CAMPOS_DE_INSTANCIA = [
  'shared', 'createdAt', 'updatedAt', 'versionId', 'activeVersionId', 'versionCounter', 'triggerCount',
  'staticData', 'meta', 'sourceWorkflowId', 'versionMetadata',
];

export function lerEnv(arquivo = path.join(RAIZ, '.env')) {
  const env = {};
  if (!fs.existsSync(arquivo)) return env;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

export const listarWorkflows = () =>
  fs.readdirSync(PASTA_WORKFLOWS).filter((f) => f.endsWith('.json')).map((f) => ({
    stem: f.replace(/\.json$/, ''),
    arquivo: path.join(PASTA_WORKFLOWS, f),
  }));

export const lerWorkflow = (arquivo) => JSON.parse(fs.readFileSync(arquivo, 'utf8'))[0];

// Percorre todo o JSON; fn(objeto) pode alterar objetos in place.
export function percorrer(no, fn) {
  if (Array.isArray(no)) no.forEach((x) => percorrer(x, fn));
  else if (no && typeof no === 'object') { fn(no); Object.values(no).forEach((x) => percorrer(x, fn)); }
}

export function salvarWorkflow(arquivo, wf) {
  fs.writeFileSync(arquivo, JSON.stringify([wf], null, 2) + '\n');
}

// Remove metadados da instância e troca ids da instância por placeholders portáveis.
//   idsTabelas: { <id>: <nome> }   idsWorkflows: { <id>: <stem do arquivo> }
export function sanitizar(wf, { idsTabelas = {}, idsWorkflows = {} } = {}) {
  const avisos = [];
  for (const c of CAMPOS_DE_INSTANCIA) delete wf[c];
  percorrer(wf, (o) => {
    if (o.dataTableId && typeof o.dataTableId === 'object' && o.dataTableId.value) {
      const nome = idsTabelas[o.dataTableId.value];
      if (nome) o.dataTableId.value = `__DATATABLE:${nome}__`;
      else if (!String(o.dataTableId.value).startsWith('__')) avisos.push(`tabela desconhecida: ${o.dataTableId.value}`);
    }
    if (o.workflowId && typeof o.workflowId === 'object' && o.workflowId.value) {
      const stem = idsWorkflows[o.workflowId.value];
      if (stem) o.workflowId.value = `__WF_ID:${stem}__`;
      else if (!String(o.workflowId.value).startsWith('__')) avisos.push(`workflow desconhecido: ${o.workflowId.value}`);
    }
    if (o.credentials && typeof o.credentials === 'object') {
      for (const tipo of Object.keys(o.credentials)) {
        o.credentials[tipo] = { id: `__CREDENTIAL:${tipo}__`, name: CREDENCIAIS[tipo] || tipo };
      }
    }
  });
  return avisos;
}

export function placeholdersRestantes(wf) {
  return [...new Set(JSON.stringify(wf).match(/__(?:DATATABLE|WF_ID|CREDENTIAL):[^"]+?__/g) || [])];
}
