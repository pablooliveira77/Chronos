const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('./lib');
const { run, fixture, montar, ds, interpretar, answer, codeOfTask: T, codeOfProject: P, codeOfSection: S } = L;

const ctxFor = (text, fx) => montar(text, fx || fixture());
const decidir = (ctx, t, util) => run('fluxo1b', 'Decidir tarefa-pai', { nodes: { 'Interpretar classificação': t, 'Montar prompt': ctx }, input: util ? [{ json: util }] : [{ json: t }] });
const preparar = (t) => run('fluxo1b', 'Preparar tarefa', { input: [{ json: t }] })[0];

// ---------------- Fase 1: árvore ----------------
test('F1. árvore inclui a Entrada, ids curtos reversíveis e hierarquia indentada', () => {
  const ctx = ctxFor('qualquer coisa');
  const tree = ctx.system.split('ÁRVORE REAL DO TODOIST')[1];
  assert.match(tree, /P1 Entrada \(inbox\)\n {2}T1 Lista de Compras\n {4}T2 Comprar pão\n {2}T3 Ligar para o banco\nP2 Casa: Manutenção da casa\n {2}T4 Montar estante/);
  assert.match(tree, /S1 Eventos: Festas\n {4}T\d+ Planejar festa/);
  assert.equal(ctx.idmap.P.P1.inbox, true);
  assert.equal(ctx.idmap.T.T2.parent, 'T1');
  assert.equal(ctx.idmap.T.T2.path, 'Entrada › Lista de Compras › Comprar pão');
  assert.equal(ctx.t_by_id[ctx.idmap.T.T1.id], 'T1');
  assert.equal(ctx.depth_by_id[ctx.idmap.T.T2.id], 2);
  assert.equal(ctx.tree_level, 0);
  assert.ok(ctx.tree_chars > 100 && ctx.tree_chars < 12000);
});

test('F2. ordem do prompt: regras → exemplos → árvore → data/hora (no fim); mensagem em role:user', () => {
  const s = ctxFor('x').system;
  const i = (t) => s.indexOf(t);
  assert.ok(i('Regras:') < i('EXEMPLO DE ENTRADA') && i('EXEMPLO DE ENTRADA') < i('ÁRVORE REAL') && i('ÁRVORE REAL') < i('Data e hora atual'));
  assert.ok(s.trimEnd().endsWith('(America/Sao_Paulo).'));
  const a = ctxFor('um').system; const b = ctxFor('dois').system;
  assert.equal(a, b, 'a mensagem do usuário não entra no system (prefixo estável)');
});

test('13. árvore acima do orçamento degrada e a classificação ainda funciona', () => {
  const fx = fixture();
  const many = [];
  for (let i = 0; i < 300; i++) {
    const parent = L.task({ project_id: 'c', content: 'Tarefa pai número ' + i + ' com um título bem comprido para gastar caracteres' });
    const filha = L.task({ project_id: 'c', content: 'Filha ' + i + ' ' + 'x'.repeat(50), parent_id: parent.id });
    many.push(parent, filha, L.task({ project_id: 'c', content: 'Neta ' + i, parent_id: filha.id }));
  }
  fx.tasks.push(...many);
  const ctx = montar('comprar cimento na obra', fx);
  assert.ok(ctx.tree_level >= 1, 'degradou: nível ' + ctx.tree_level);
  assert.ok(ctx.tree_chars <= 12000, 'tamanho ' + ctx.tree_chars);
  assert.match(ctx.system, /\(\+\d+ subtarefas\)|tarefas omitidas/);
  // ainda classifica: tarefa com pai válido dentro da árvore degradada
  const lista = T(ctx, 'Lista de Compras');
  const r = interpretar(ctx, ds(answer({ destino: { projeto: 'P1', secao: null, pai: lista }, eh_subtarefa: true })));
  assert.equal(r.parent_mode, 'parent');
});

test('F1. falha ao buscar tarefas não derruba a montagem (árvore só com projetos/seções)', () => {
  const ctx = montar('x', fixture(), { tasksItems: [{ json: { error: { message: 'boom' } } }] });
  assert.equal(ctx.tasks_error, 'boom');
  assert.equal(ctx.tree_tasks, 0);
  assert.match(ctx.system, /P1 Entrada \(inbox\)/);
});

// ---------------- Fase 3: validação e decisão ----------------
test('1. item de lista existente → subtarefa (pai inferido); vencimento vai no body', () => {
  const ctx = ctxFor('comprar leite amanhã');
  const lista = T(ctx, 'Lista de Compras');
  const r = interpretar(ctx, ds(answer({ due: 'amanhã às 18h', destino: { projeto: 'P1', secao: null, pai: lista }, eh_subtarefa: true })));
  assert.equal(r.parent_mode, 'parent');
  assert.equal(r.task_body.parent_id, ctx.idmap.T[lista].id);
  assert.equal(r.task_body.project_id, undefined);
  assert.equal(r.task_body.due_string, 'amanhã às 18h');
  assert.match(r.confirm_text, /Subtarefa criada[\s\S]*Comprar leite[\s\S]*📁 Inbox|📁 Entrada ↳ Lista de Compras/);
  assert.match(r.confirm_text, /📁 Entrada ↳ Lista de Compras/);
  assert.equal(r.parent_depth, 1);
});

test('2. sem pai plausível → projeto/seção da IA, sem aviso', () => {
  const ctx = ctxFor('pagar conta');
  const r = interpretar(ctx, ds(answer({ title: 'Pagar conta', destino: { projeto: P(ctx, 'Casa'), secao: null, pai: null } })));
  assert.equal(r.parent_mode, 'none');
  assert.equal(r.task_body.project_id, 'c');
  assert.doesNotMatch(r.confirm_text, /não existe|Entrada/);
});

test('3. projeto e seção válidos, sem pai', () => {
  const ctx = ctxFor('x');
  const r = interpretar(ctx, ds(answer({ destino: { projeto: P(ctx, 'Casa'), secao: S(ctx, 'Eventos'), pai: null } })));
  assert.equal(r.task_body.project_id, 'c');
  assert.equal(r.task_body.section_id, 'sc_ev');
  assert.match(r.confirm_text, /📁 Casa › Eventos/);
});

test('4. texto longo com 3 passos → título curto + 3 subtarefas; descrição só com contexto', () => {
  const ctx = ctxFor('x');
  const r = interpretar(ctx, ds(answer({ title: 'Organizar aniversário do João', description: 'Festa para 30 pessoas.', due: 'sábado', priority: 3,
    destino: { projeto: P(ctx, 'Casa'), secao: S(ctx, 'Eventos'), pai: null },
    subtarefas: [{ title: 'Reservar salão', due: null }, { title: 'Mandar convites', due: null }, { title: 'Encomendar bolo', due: 'sexta' }] })));
  assert.equal(r.subtarefas.length, 3);
  assert.equal(r.subtarefas[2].due, 'sexta');
  assert.equal(r.task_body.description, 'Festa para 30 pessoas.');
  assert.equal(r.task_body.priority, 2);
  const p = preparar(r);
  assert.equal(p.subtarefas.length, 3);
});

test('4a. subtarefa que repete o título principal é descartada', () => {
  const ctx = ctxFor('x');
  const r = interpretar(ctx, ds(answer({ title: 'Comprar cimento', subtarefas: [{ title: 'comprar cimento!', due: null }, { title: 'Pedir orçamento', due: null }] })));
  assert.deepEqual(r.subtarefas.map((s) => s.title), ['Pedir orçamento']);
});

test('4b. mais de 10 subtarefas: 10 reais, o excedente vira bullets na descrição', () => {
  const ctx = ctxFor('x');
  const subs = Array.from({ length: 13 }, (_, i) => ({ title: 'Passo ' + (i + 1), due: null }));
  const r = interpretar(ctx, ds(answer({ subtarefas: subs })));
  assert.equal(r.subtarefas.length, 10);
  assert.match(r.task_body.description, /- Passo 11\n- Passo 12\n- Passo 13/);
});

test('5. texto longo sem passos distintos → sem subtarefas, descrição preservada', () => {
  const ctx = ctxFor('x');
  const r = interpretar(ctx, ds(answer({ description: 'Pesquisar preços e comparar com calma.', subtarefas: [] })));
  assert.deepEqual(r.subtarefas, []);
  assert.equal(r.task_body.description, 'Pesquisar preços e comparar com calma.');
});

test('6. "subtarefa de X" com X único na árvore → subtarefa', () => {
  const ctx = ctxFor('x');
  const est = T(ctx, 'Montar estante');
  const r = interpretar(ctx, ds(answer({ title: 'Comprar parafusos', destino: { projeto: P(ctx, 'Casa'), secao: null, pai: est }, eh_subtarefa: true, pai_citado: 'Montar estante' })));
  assert.equal(r.parent_mode, 'parent');
  assert.equal(r.task_body.parent_id, ctx.idmap.T[est].id);
});

test('6b. pai citado que a IA não achou → busca por título; 1 resultado → subtarefa; nenhum → Entrada + aviso; vários → botões', () => {
  const ctx = ctxFor('x');
  const t = interpretar(ctx, ds(answer({ title: 'Anotar medidas', eh_subtarefa: true, pai_citado: 'Reforma da garagem', destino: { projeto: P(ctx, 'Casa'), secao: null, pai: null } })));
  assert.equal(t.parent_mode, 'search');
  assert.equal(t.parent_task_title, 'Reforma da garagem');
  const est = ctx.idmap.T[T(ctx, 'Montar estante')];
  const one = decidir(ctx, t, { status: 'one', best: { id: est.id, content: est.content, project: 'Casa' } })[0];
  assert.equal(one.decisao, 'criar');
  assert.equal(one.task_body.parent_id, est.id);
  assert.equal(one.parent_depth, 1);
  const none = decidir(ctx, t, { status: 'none', candidates: [] })[0];
  assert.equal(none.decisao, 'criar');
  assert.equal(none.task_body.project_id, 'in');
  assert.equal(none.task_body.parent_id, undefined);
  assert.match(none.confirm_text, /Tarefa criada na Entrada[\s\S]*Você citou “Reforma da garagem”, mas não consegui identificar qual seria a tarefa-pai/);
  const many = decidir(ctx, t, { status: 'many', candidates: [{ id: est.id, content: est.content, project: 'Casa' }, { id: ctx.idmap.T[T(ctx, 'Compras da obra')].id, content: 'Compras da obra', project: 'Casa' }] })[0];
  assert.equal(many.decisao, 'perguntar');
  assert.equal(many.tg.reply_markup.inline_keyboard.length, 3);
});

test('7. duas tarefas plausíveis → botões com caminho; payload guarda subtarefas e depth', () => {
  const ctx = ctxFor('comprar cimento');
  const a = T(ctx, 'Lista de Compras'); const b = T(ctx, 'Compras da obra');
  const t = interpretar(ctx, ds(answer({ title: 'Comprar cimento', eh_subtarefa: true, candidatos_pai: [a, b],
    subtarefas: [{ title: 'Cotar preço', due: null }], destino: { projeto: 'P1', secao: null, pai: null } })));
  assert.equal(t.parent_mode, 'ask');
  const q = decidir(ctx, t)[0];
  assert.equal(q.decisao, 'perguntar');
  assert.match(q.tg.text, /1\. Entrada › Lista de Compras\n2\. Casa › Compras da obra/);
  const kb = q.tg.reply_markup.inline_keyboard;
  assert.equal(kb.length, 3);
  assert.match(kb[0][0].callback_data, /^pk:[a-z0-9]+:0$/);
  assert.ok(kb.flat().every((b) => Buffer.byteLength(b.callback_data) <= 64));
  assert.match(kb[2][0].text, /Criar sem tarefa-pai/);
  assert.match(kb[2][1].text, /Cancelar/);
  const payload = JSON.parse(q.payload);
  assert.equal(payload.subtarefas.length, 1);
  assert.equal(payload.candidates[0].depth, 1);
  assert.equal(payload.candidates.length, 2);

  // clique no 2º candidato: cria a principal com parent_id e carrega as subtarefas
  const row = { pid: q.pid, status: 'aberta', tipo: 'subtarefa', payload: q.payload };
  const click = (idx) => run('pend', 'Resolver escolha', { nodes: { 'Botão escolhido': { task_id: q.pid + ':' + idx, chat_id: 7, callback_id: 'cb', message_id: 5, message_text: '' } }, input: [{ json: row }] })[0];
  const c1 = click(1);
  assert.equal(c1.valida, true);
  assert.equal(c1.task_body.parent_id, payload.candidates[1].id);
  assert.equal(c1.task_body.project_id, undefined);
  assert.equal(c1.subtarefas.length, 1);
  assert.match(c1.confirm_text, /Subtarefa criada[\s\S]*📁 Casa ↳ Compras da obra/);
  // criar sem pai: destino da IA preservado, subtarefas também
  const c2 = click('in');
  assert.equal(c2.task_body.parent_id, undefined);
  assert.equal(c2.task_body.project_id, 'in');
  assert.equal(c2.subtarefas.length, 1);
  assert.match(c2.confirm_text, /sem tarefa-pai/);
  // cancelar
  const c3 = click('x');
  assert.equal(c3.acao, 'cancelar');
  // timeout de 30 min (Preparar fallback): cria no destino da IA, sem pai, com as subtarefas
  const fb = run('pend', 'Preparar fallback', { input: [{ json: { ...row, chat_id: '7', message_id: 5 } }] })[0];
  assert.equal(fb.task_body.parent_id, undefined);
  assert.equal(fb.subtarefas.length, 1);
  assert.match(fb.aviso, /sem tarefa-pai/);
});

test('7b. um único candidato válido (os outros eram inventados) ainda pergunta', () => {
  const ctx = ctxFor('x');
  const a = T(ctx, 'Lista de Compras');
  const t = interpretar(ctx, ds(answer({ eh_subtarefa: true, candidatos_pai: [a, 'T999'] })));
  assert.equal(t.parent_mode, 'ask');
  assert.equal(t.candidatos.length, 1);
});

test('8. pai citado que não existe e a IA não resolveu → search; sem citação → Entrada + aviso', () => {
  const ctx = ctxFor('x');
  const semCitacao = interpretar(ctx, ds(answer({ title: 'Comprar parafusos', eh_subtarefa: true })));
  assert.equal(semCitacao.parent_mode, 'inbox_nopai');
  assert.equal(semCitacao.task_body.project_id, 'in');
  assert.match(semCitacao.confirm_text, /Tarefa criada na Entrada[\s\S]*Não consegui identificar qual seria a tarefa-pai/);
});

test('9. ids inválidos nunca geram exceção: Entrada + aviso / ignorados', () => {
  const ctx = ctxFor('x');
  const badPai = interpretar(ctx, ds(answer({ destino: { projeto: 'P1', secao: null, pai: 'T999' }, eh_subtarefa: true })));
  assert.equal(badPai.parent_mode, 'inbox_nopai');
  assert.equal(badPai.task_body.project_id, 'in');
  const badProj = interpretar(ctx, ds(answer({ destino: { projeto: 'P99', secao: 'S1', pai: null } })));
  assert.equal(badProj.parent_mode, 'none');
  assert.equal(badProj.task_body.project_id, 'in');
  assert.equal(badProj.task_body.section_id, undefined);
  assert.match(badProj.confirm_text, /projeto indicado não existe → Entrada/);
  // seção de outro projeto
  const ctx2 = ctxFor('x');
  const bib = S(ctx2, 'Leitura');
  const wrongSec = interpretar(ctx2, ds(answer({ destino: { projeto: P(ctx2, 'Casa'), secao: bib, pai: null } })));
  assert.equal(wrongSec.task_body.section_id, undefined);
  assert.equal(wrongSec.task_body.project_id, 'c');
  assert.match(wrongSec.confirm_text, /seção indicada não existe/);
  // lixo completo
  const junk = interpretar(ctx, ds(answer({ destino: 'banana', candidatos_pai: 'x', subtarefas: 'y', priority: 'alta' })));
  assert.equal(junk.type, 'tarefa');
  assert.equal(junk.priority, 4);
});

test('10. vencimento só com data / com data e hora aparece na confirmação (📅 e ⏰); horário livre só na principal', () => {
  const prep = { chat_id: 7, confirm_text: '✅ <b>Tarefa criada</b>\n\n<b>X</b>\n⚑ ⚪ normal' };
  const conf = (created, extra = {}) => run('fluxo1b', 'Montar confirmação', { nodes: { 'Preparar tarefa': prep, 'Todoist: criar tarefa': created, ...extra } })[0].tg.text;
  assert.match(conf({ id: '1', due: { date: '2026-10-24' } }), /\n📅 2026-10-24$/);
  assert.match(conf({ id: '1', due: { date: '2026-10-24T18:00:00' } }), /\n📅 2026-10-24 ⏰ 18:00$/);
  assert.doesNotMatch(conf({ id: '1', due: null }), /📅/);
  const slot = conf({ id: '1', due: { date: '2026-10-24' } }, { 'Util: horário livre (nova tarefa)': { task_id: '1', date: '2026-10-24', time: '09:00', reason: 'primeiro horário livre' } });
  assert.match(slot, /📅 2026-10-24 ⏰ 09:00 <i>\(primeiro horário livre\)<\/i>/);
  // o horário livre é chamado só com o id/data da principal
  const node = L.wf.fluxo1b.nodes.find((n) => n.name === 'Util: horário livre (nova tarefa)');
  assert.equal(node.parameters.workflowInputs.value.task_id, '={{ $json.id }}');
  assert.equal(L.wf.fluxo1b.nodes.find((n) => n.name === 'Tarefa criada').parameters.jsCode.includes("$('Todoist: criar tarefa')"), true);
});

test('10b. confirmação traz as subtarefas e o aviso de falha', () => {
  const prep = { chat_id: 7, confirm_text: 'TXT' };
  const text = run('fluxo1b', 'Montar confirmação', { nodes: { 'Preparar tarefa': prep, 'Todoist: criar tarefa': { id: '1', due: null }, 'Util: criar subtarefas': { lines: '↳ 3 subtarefas: A · B · C' } } })[0].tg.text;
  assert.equal(text, 'TXT\n↳ 3 subtarefas: A · B · C');
});

test('11. estouro do limite de aninhamento → subtarefas viram bullets na descrição', () => {
  const ctx = ctxFor('x');
  const n3 = T(ctx, 'Nível 3'); // profundidade 3 → a principal seria nível 4 e as subtarefas, nível 5
  const t = interpretar(ctx, ds(answer({ destino: { projeto: 'P1', secao: null, pai: n3 }, eh_subtarefa: true, subtarefas: [{ title: 'Passo A', due: null }, { title: 'Passo B', due: 'sexta' }] })));
  assert.equal(t.parent_depth, 3);
  const p = preparar(t);
  assert.deepEqual(p.subtarefas, []);
  assert.match(p.task_body.description, /- Passo A\n- Passo B \(sexta\)/);
  assert.match(p.nest_note, /2 passos foram para a descrição/);
  // dentro do limite: mantém
  const n1 = T(ctx, 'Nível 1');
  const ok = preparar(interpretar(ctx, ds(answer({ destino: { projeto: 'P1', secao: null, pai: n1 }, eh_subtarefa: true, subtarefas: [{ title: 'Passo A', due: null }] }))));
  assert.equal(ok.subtarefas.length, 1);
});

test('12. falha numa subtarefa: resumo avisa; sem exceção (pai preservado)', () => {
  const prep = [{ json: { skip: false, title: 'A' } }, { json: { skip: false, title: 'B' } }, { json: { skip: false, title: 'C' } }];
  const res = [{ json: { id: '1' } }, { json: { error: { message: 'Bad Request <x>' } } }, { json: { id: '3' } }];
  const r = run('subs', 'Resumir', { nodes: { 'Preparar subtarefas': prep }, input: res })[0];
  assert.equal(r.created, 2); assert.equal(r.failed, 1);
  assert.match(r.lines, /↳ 2 subtarefas: A · C/);
  assert.match(r.lines, /⚠️ 1 de 3 subtarefa não foi criada: B <i>\(Bad Request &lt;x&gt;\)<\/i>/);
  assert.match(run('subs', 'Resumir', { nodes: { 'Preparar subtarefas': [{ json: { skip: false, title: 'A' } }] }, input: [{ json: { error: { message: '400 - {"error":"x"}' } } }] })[0].lines, /erro 400 do Todoist/);
  const empty = run('subs', 'Resumir', { nodes: { 'Preparar subtarefas': [{ json: { skip: true } }] }, input: [{ json: { skip: true } }] })[0];
  assert.equal(empty.lines, '');
  // todas as chamadas de subtarefa/horário/resposta usam continueRegularOutput (nada derruba o 1b depois que a mãe existe)
  const by = (n) => L.wf.fluxo1b.nodes.find((x) => x.name === n);
  assert.equal(by('Util: criar subtarefas').onError, 'continueRegularOutput');
  assert.equal(L.wf.subs.nodes.find((x) => x.name === 'Todoist: criar subtarefa').onError, 'continueRegularOutput');
});

test('Util: criar subtarefas prepara uma chamada por subtarefa, herdando prioridade e parent_id', () => {
  const items = run('subs', 'Preparar subtarefas', { nodes: { Entrada: { parent_id: 'P', priority: 3, subs_json: JSON.stringify([{ title: 'A', due: 'sexta' }, { title: 'B', due: '' }]) } } });
  assert.equal(items.length, 2);
  assert.deepEqual(items[0].body, { content: 'A', parent_id: 'P', priority: 3, due_lang: 'pt', due_string: 'sexta' });
  assert.equal(items[1].body.due_string, undefined);
  assert.deepEqual(run('subs', 'Preparar subtarefas', { nodes: { Entrada: { parent_id: '', priority: 1, subs_json: '[]' } } }), [{ skip: true }]);
});

test('14. DeepSeek indisponível ou JSON inválido → "não entendi"', () => {
  const ctx = ctxFor('x');
  assert.equal(interpretar(ctx, { error: { message: 'timeout' } }).type, 'invalido');
  assert.match(interpretar(ctx, { error: { message: 'timeout' } }).reason, /DeepSeek indisponível: timeout/);
  assert.equal(interpretar(ctx, ds('isso não é json')).type, 'invalido');
  assert.equal(interpretar(ctx, ds({ type: 'banana' })).type, 'invalido');
});

test('15. regressão de eventos: evento simples, dia inteiro, agenda inexistente', () => {
  const simples = interpretar(ctxFor('reunião com o time quinta 14h'), ds(answer({ type: 'evento', title: 'Reunião com o time', start: '2026-10-29T14:00', end: null, location: 'Sala 3', calendar: 'Trabalho' })));
  assert.equal(simples.type, 'evento');
  assert.equal(simples.create_event, true);
  assert.equal(simples.event_body.start.dateTime, '2026-10-29T14:00:00.000-03:00');
  assert.equal(simples.event_body.end.dateTime, '2026-10-29T15:00:00.000-03:00');
  assert.equal(simples.calendar_name, 'Trabalho');
  const dia = interpretar(ctxFor('aniversário da Ana dia 2'), ds(answer({ type: 'evento', title: 'Aniversário da Ana', start: '2026-11-02', calendar: 'Pessoal' })));
  assert.deepEqual(dia.event_body.start, { date: '2026-11-02' });
  assert.deepEqual(dia.event_body.end, { date: '2026-11-03' });
  assert.equal(dia.all_day, true);
  const sem = interpretar(ctxFor('reunião quinta 14h'), ds(answer({ type: 'evento', title: 'Reunião', start: '2026-10-29T14:00', calendar: 'Agenda que não existe' })));
  assert.equal(sem.calendar_name, '');
  assert.equal(sem.create_event, true);
  const semData = interpretar(ctxFor('reunião sem data'), ds(answer({ type: 'evento', title: 'Algo' })));
  assert.equal(semData.create_event, false);
});

// ---------------- Tarefa × evento (correção de 2026-11-03) ----------------
test('TE1. intenção explícita vira dica determinística na mensagem (system continua igual)', () => {
  const base = ctxFor('qualquer').system;
  const casos = [
    ['Tarefa: conversar com o Carlos 12h', 'tarefa'],
    ['tarefa - ligar pro banco 10h', 'tarefa'],
    ['Coloque a tarefa abaixo em Acme no todoist\n\nRevisar contrato hoje 18h', 'tarefa'],
    ['anotar no Todoist: pagar boleto', 'tarefa'],
    ['Evento: festa da turma sábado 20h', 'evento'],
    ['agendar dentista sexta 15h', 'evento'],
    ['Tarefa: agendar o dentista', 'tarefa'], // prefixo vence a palavra "agendar"
    ['comprar leite amanhã', ''],
    ['tarefa de agendar reunião na agenda', ''], // pistas conflitantes → deixa a IA decidir
  ];
  for (const [txt, intent] of casos) {
    const c = ctxFor(txt);
    assert.equal(c.intent, intent, txt);
    assert.equal(c.system, base);
    assert.equal(c.user.startsWith(txt), true);
    assert.equal(/Dica do sistema/.test(c.user), intent !== '');
  }
});

test('TE2. usuário disse "tarefa" mas a IA devolveu evento → vira tarefa (nada some por cair em "evento")', () => {
  const ctx = ctxFor('Tarefa: conversar com o Carlos 12h sobre o orçamento');
  assert.equal(ctx.intent, 'tarefa');
  const r = interpretar(ctx, ds(answer({ type: 'evento', title: 'Conversar com o Carlos', due: 'hoje às 12h', start: '2026-10-23T12:00', calendar: 'Trabalho' })));
  assert.equal(r.type, 'tarefa');
  assert.equal(r.intent_override, true);
  assert.equal(r.task_body.due_string, 'hoje às 12h');
  assert.equal(r.task_body.project_id, 'in'); // sem destino útil → Entrada
  assert.equal(r.create_event, undefined);
  // sem intenção explícita, o que a IA disser vale
  const livre = interpretar(ctxFor('reunião com o time quinta 14h'), ds(answer({ type: 'evento', title: 'Reunião', start: '2026-10-29T14:00' })));
  assert.equal(livre.type, 'evento');
  assert.equal(livre.intent_override, false);
  // intenção "evento" não converte tarefa em evento
  assert.equal(interpretar(ctxFor('Evento: algo'), ds(answer({}))).type, 'tarefa');
});

test('TE2b. evento sem nenhuma pista de compromisso vira tarefa; com pista continua evento', () => {
  const ev = (txt, extra = {}) => interpretar(ctxFor(txt), ds(answer({ type: 'evento', title: 'X', start: '2026-10-29T14:00', ...extra })));
  assert.equal(ev('Estatística avançada hoje 15h').type, 'tarefa');
  assert.equal(ev('Módulo 2 do curso 12h30').type, 'tarefa');
  for (const t of ['reunião com o time quinta 14h', 'Dentista sexta 15h', 'jantar de aniversário sábado 20h', 'aniversário da Ana dia 2', 'Daily da equipe amanhã 9h', 'Almoço com o Pedro 12h', 'festa da turma sábado', 'Consulta médica terça 8h', 'evento: lançamento 10h'])
    assert.equal(ev(t).type, 'evento', t);
  assert.equal(ev('Evento: Estatística avançada hoje 15h').type, 'evento'); // pedido explícito
});

test('TE3. agendas reais do Google entram no prompt (nenhuma agenda ou regra fixa)', () => {
  const c = ctxFor('x');
  assert.match(c.system, /AGENDAS DO GOOGLE CALENDAR/);
  assert.match(c.system, /- Trabalho: Trabalho e clientes/);
  assert.match(c.system, /- Pessoal \(principal\)/);
  assert.deepEqual(c.calendars.map((x) => x.name), ['Trabalho', 'Lazer', 'Pessoal']);
  const vazio = montar('x', fixture(), { calendars: [] });
  assert.match(vazio.system, /nenhuma agenda disponível/);
});

test('TE4. regras do prompt: horário não faz evento; na dúvida, tarefa', () => {
  const s = ctxFor('x').system;
  assert.match(s, /Horário NÃO torna algo um evento/);
  assert.match(s, /Na dúvida, escolha "tarefa"/);
  assert.match(s, /EXEMPLO DE ENTRADA: "Tarefa: ligar para o Carlos às 12h/);
});

test('TZ1. fuso e idioma vêm do .env (CHRONOS_TIMEZONE / CHRONOS_LOCALE) com padrão São Paulo/pt-BR', () => {
  const padrao = ctxFor('x').system;
  assert.match(padrao, /\(America\/Sao_Paulo\)\./);
  const env = { CHRONOS_TIMEZONE: 'America/New_York', CHRONOS_LOCALE: 'en-US' };
  const c = montar('x', fixture(), { env });
  assert.match(c.system, /\(America\/New_York\)\./);
  assert.match(c.system, /Data e hora atual: \w+day, /); // dia da semana no idioma configurado
  const r = interpretar(c, ds(answer({})), env);
  assert.equal(r.task_body.due_lang, 'en');
  assert.equal(interpretar(c, ds(answer({}))).task_body.due_lang, 'pt');
  const ev = interpretar(montar('reunião quinta 14h', fixture(), { env }), ds(answer({ type: 'evento', title: 'Reunião', start: '2026-10-29T14:00' })), env);
  assert.match(ev.event_body.start.timeZone, /America\/New_York/);
});

// ---------------- Fase 6: medição ----------------
test('uso: tokens (entrada, saída, cache) e tamanho da árvore, sem texto de mensagem', () => {
  const ctx = ctxFor('texto sigiloso do usuário');
  const r = interpretar(ctx, ds(answer({}), { prompt_tokens: 2500, completion_tokens: 90, prompt_cache_hit_tokens: 2304, prompt_cache_miss_tokens: 196 }));
  assert.deepEqual(r.usage, { prompt_tokens: 2500, completion_tokens: 90, cache_hit: 2304, cache_miss: 196 });
  assert.equal(r.tree.tasks, ctx.tree_tasks);
  const cols = Object.keys(L.wf.fluxo1b.nodes.find((n) => n.name === 'Registrar uso').parameters.columns.value);
  assert.deepEqual(cols, ['ts', 'ts_ms', 'tipo', 'prompt_tokens', 'completion_tokens', 'cache_hit', 'cache_miss', 'tree_chars', 'tree_tasks', 'tree_level']);
  // cache_hit via prompt_tokens_details (formato alternativo)
  const alt = interpretar(ctx, ds(answer({}), { prompt_tokens: 10, completion_tokens: 1, prompt_tokens_details: { cached_tokens: 7 } }));
  assert.equal(alt.usage.cache_hit, 7);
});

test('sem dados pessoais, segredos ou ids da instância em NENHUM workflow versionado', () => {
  const dir = path.join(__dirname, '../../workflows');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const all = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.equal(/@gmail|@hotmail|@outlook/i.test(all), false, f + ': e-mail no workflow');
    assert.equal(/"chat_id":\s*"?\d{6,}/.test(all), false, f + ': chat_id fixo no workflow');
    assert.equal(/\bbot\d+:|sk-[A-Za-z0-9]{10,}|[A-Za-z0-9]{20,}\.apps\.googleusercontent/.test(all), false, f + ': segredo no workflow');
    // metadados do export do n8n (dono da instância, versões, histórico) e ids de tabelas/credenciais da instância
    for (const campo of ['shared', 'creatorId', 'versionMetadata', 'versionId', 'activeVersionId', 'staticData']) assert.equal(all.includes('"' + campo + '"'), false, f + ': campo ' + campo);
    // ids de Data Tables e credenciais têm de ser placeholders (__DATATABLE:…__ / __CREDENTIAL:…__), nunca o id de uma instância
    const achados = [];
    (function andar(o) {
      if (Array.isArray(o)) return o.forEach(andar);
      if (!o || typeof o !== 'object') return;
      if (o.dataTableId && !String(o.dataTableId.value).startsWith('__DATATABLE:')) achados.push('dataTableId ' + o.dataTableId.value);
      if (o.workflowId && o.workflowId.value && !String(o.workflowId.value).startsWith('__WF_ID:')) achados.push('workflowId ' + o.workflowId.value);
      if (o.credentials) for (const c of Object.values(o.credentials)) if (!String(c.id).startsWith('__CREDENTIAL:')) achados.push('credencial ' + c.id);
      Object.values(o).forEach(andar);
    })(JSON.parse(all));
    assert.deepEqual(achados, [], f + ': ids da instância sem placeholder');
  }
});
