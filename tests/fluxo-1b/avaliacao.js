// Conjunto de avaliação do prompt (manual, contra o DeepSeek REAL — fora de CI). Árvore fictícia e mensagens genéricas.
// Uso: DEEPSEEK_API_KEY=... node avaliacao.js [--tree-real]   (--tree-real também usa TODOIST_API_TOKEN só para medir tokens)
const L = require('./lib');

function tree() {
  L.fixture(); // reinicia ids
  const projects = [
    { id: 'in', name: 'Inbox', description: '', child_order: 1, inbox_project: true },
    { id: 'casa', name: 'Casa', description: 'Manutenção, reformas e organização da casa', child_order: 2 },
    { id: 'est', name: 'Estudos', description: 'Cursos, leituras e faculdade', child_order: 3 },
    { id: 'trab', name: 'Trabalho', description: 'Tarefas profissionais e clientes', child_order: 4 },
    { id: 'saude', name: 'Saúde', description: 'Consultas, exames e atividade física', child_order: 5 },
  ];
  const sections = [
    { id: 's_festas', project_id: 'casa', name: 'Festas', description: 'Aniversários e confraternizações', child_order: 1 },
    { id: 's_bib', project_id: 'est', name: 'Leitura', description: 'Livros e artigos', child_order: 1 },
    { id: 's_fac', project_id: 'est', name: 'Faculdade', description: 'Trabalhos e provas', child_order: 2 },
  ];
  const T = {};
  const t = (k, o) => (T[k] = L.task(o));
  t('compras', { project_id: 'in', content: 'Lista de Compras' });
  t('pao', { project_id: 'in', content: 'Comprar pão', parent_id: T.compras.id });
  t('presentes', { project_id: 'in', content: 'Lista de Presentes' });
  t('banco', { project_id: 'in', content: 'Ligar para o banco' });
  t('estante', { project_id: 'casa', content: 'Montar estante' });
  t('garagem', { project_id: 'casa', content: 'Reforma da garagem' });
  t('obra', { project_id: 'casa', content: 'Compras da obra', parent_id: T.garagem.id });
  t('festa', { project_id: 'casa', section_id: 's_festas', content: 'Planejar festa de fim de ano' });
  t('tcc', { project_id: 'est', section_id: 's_fac', content: 'Escrever TCC' });
  t('cap1', { project_id: 'est', section_id: 's_fac', content: 'Capítulo 1', parent_id: T.tcc.id });
  t('alfa', { project_id: 'trab', content: 'Projeto Alfa' });
  t('relat', { project_id: 'trab', content: 'Relatório mensal' });
  t('dent', { project_id: 'saude', content: 'Consulta no dentista' });
  return { projects, sections, tasks: Object.values(T) };
}

// esperado: mode (parent_mode), parent (conteúdo), project (nome), section, subs ('>=N' | 0), type
const CASOS = [
  { m: 'comprar leite amanhã', mode: 'parent', parent: 'Lista de Compras' },
  { m: 'comprar ovos e pegar o pacote dos correios', mode: 'none' },
  { m: 'ler o capítulo 5 do livro de Estatística até sexta', mode: 'none', project: 'Estudos', section: 'Leitura' },
  { m: 'preciso organizar o aniversário do João no sábado: reservar o salão, mandar os convites e encomendar o bolo (de chocolate, pra 30 pessoas)', mode: 'none', project: 'Casa', section: 'Festas', subs: 3 },
  { m: 'comprar parafusos, subtarefa de Montar estante', mode: 'parent', parent: 'Montar estante' },
  { m: 'anotar as medidas, etapa de Reforma do banheiro', mode: 'search' },
  { m: 'comprar cimento', mode: 'parent|ask', parent: 'Compras da obra|Lista de Compras' },
  { m: 'ligar pro dentista pra remarcar a consulta', mode: 'none|parent', project: 'Saúde|Inbox' },
  { m: 'escrever a introdução do capítulo 1 do TCC até quarta', mode: 'parent', parent: 'Capítulo 1|Escrever TCC' },
  { m: 'pagar a conta de luz dia 10', mode: 'none' },
  { m: 'comprar um presente de aniversário para a Ana', mode: 'parent|none', parent: 'Lista de Presentes' },
  { m: 'revisar o relatório mensal e mandar para o cliente da Alfa', mode: 'none|parent', project: 'Trabalho' },
  { m: 'trocar a lâmpada da sala, passar na farmácia e buscar a encomenda no correio até sábado', mode: 'none', subs: 3 },
  { m: 'refletir sobre a palestra de ontem e anotar três pontos principais, sem pressa', mode: 'none' },
  { m: 'reunião com o time quinta às 14h na sala 3', type: 'evento' },
  { m: 'aula de inglês quarta das 18h às 20h na escola', type: 'evento' },
  { m: 'aniversário da minha amiga Ana dia 2 de novembro', type: 'evento' },
  { m: 'comprar pilhas e levar o carro na revisão, subtarefas de Planejar festa de fim de ano', mode: 'parent', parent: 'Planejar festa de fim de ano' },
  { m: 'ligar para o João', mode: 'none' },
  // tarefa × evento: horário em tarefa é prazo; intenção explícita vence
  { m: 'Tarefa: conversar com o Carlos 12h sobre o orçamento', type: 'tarefa' },
  { m: 'Coloque a tarefa abaixo no Todoist\n\nRevisar o contrato do cliente hoje 18h', type: 'tarefa' },
  { m: 'revisar a proposta da Acme hoje 15h', type: 'tarefa' },
  { m: 'conversar com o Carlos 12h sobre o orçamento', type: 'tarefa' },
  { m: 'consulta no dentista sexta às 15h', type: 'evento' },
  { m: 'evento: festa da turma sábado 20h', type: 'evento' },
];

function ok(c, r) {
  const f = [];
  if (c.type) { if (r.type !== c.type) f.push('type=' + r.type); return f; }
  if (r.type !== 'tarefa') return ['type=' + r.type];
  if (c.mode && !c.mode.split('|').includes(r.parent_mode)) f.push('mode=' + r.parent_mode);
  const want = (s, got) => s.split('|').includes(got);
  if (c.parent && r.parent_mode === 'parent' && !want(c.parent, r.parent.content)) f.push('pai=' + r.parent.content);
  if (c.project && r.parent_mode === 'none' && !want(c.project, r.project_name)) f.push('proj=' + r.project_name);
  if (c.section && r.parent_mode === 'none' && r.section_name !== c.section) f.push('sec=' + r.section_name);
  if (c.subs !== undefined && (c.subs === 0 ? r.subtarefas.length !== 0 : r.subtarefas.length < c.subs)) f.push('subs=' + r.subtarefas.length);
  return f;
}

(async () => {
  const fx = tree();
  const rows = [];
  for (const c of CASOS) {
    const ctx = L.montar(c.m, fx);
    const resp = await (await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + process.env.DEEPSEEK_API_KEY },
      body: JSON.stringify({ model: 'deepseek-flash', thinking: { type: 'disabled' }, temperature: 0, max_tokens: 1200, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: ctx.system }, { role: 'user', content: ctx.user }] }) })).json();
    const r = L.interpretar(ctx, resp);
    const falhas = ok(c, r);
    rows.push({ msg: c.m.slice(0, 44), tipo: r.type, pai: r.parent_mode, subs: (r.subtarefas || []).length, ok: falhas.length ? 'NÃO ' + falhas.join(',') : 'sim', prompt: r.usage.prompt_tokens, saida: r.usage.completion_tokens, hit: r.usage.cache_hit });
  }
  console.table(rows);
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  console.log('acertos:', rows.filter((r) => r.ok === 'sim').length + '/' + rows.length, '| tokens prompt', sum('prompt'), 'saída', sum('saida'), 'cache hit', sum('hit'));
})();
