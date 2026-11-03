// Executa os nós Code do workflow exportado com um ambiente n8n simulado (sem rede, sem DeepSeek/Google reais).
// Uso: cd tests/fluxo-4 && npm install && npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DateTime } = require('luxon');

const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '../../workflows/fluxo-4-agenda-semanal.json'), 'utf8'))[0];
const codeOf = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const run = (name, env) => new Function('DateTime', '$', '$input', '$json', '$now', '$env', codeOf(name))(
  DateTime, env.$, env.$input || { all: () => [] }, env.$json || {}, env.$now || DateTime.now(), { TELEGRAM_CHAT_ID: 'CHAT' });
const wrap = (v) => ({ first: () => ({ json: v }), all: () => (Array.isArray(v) ? v : [{ json: v }]) });

const periodo = (ref) => run('Período', { $json: { ref_date: ref } })[0].json;
const dt = (s) => ({ dateTime: s });
const ev = (o) => ({ status: 'confirmed', ...o });

function montar(ref, calendars) {
  const per = periodo(ref);
  const sel = calendars.map((c, i) => ({ json: { calendar_id: 'id' + i, calendar_label: c.label, list_error: null } }));
  const res = calendars.map((c) => ({ json: c.error ? { error: { message: c.error } } : { items: c.items } }));
  const $ = (n) => wrap(n === 'Período' ? per : sel);
  return run('Montar agenda', { $, $input: { all: () => res } })[0].json;
}
function dividir(m, deepseek) {
  const $ = (n) => {
    if (n === 'Montar agenda') return wrap(m);
    if (deepseek === undefined) throw new Error('nó não executou');
    if (deepseek instanceof Error) throw deepseek;
    return wrap({ choices: [{ message: { content: deepseek } }] });
  };
  return run('Dividir em mensagens', { $ }).map((i) => i.json.text);
}
const flat = (m) => m.header + '\n\n' + m.body + m.footer;

test('janela: segunda 00:00 → segunda seguinte, com offset; mesma de qualquer dia da semana', () => {
  const seg = periodo('2026-10-26');
  const qua = periodo('2026-10-28');
  const dom = periodo('2026-11-01');
  assert.equal(seg.start, '2026-10-26T00:00:00.000-03:00');
  assert.equal(seg.end, '2026-11-02T00:00:00.000-03:00');
  assert.equal(seg.label, '26/10 – 01/11');
  assert.deepEqual(qua, seg);
  assert.deepEqual(dom, seg);
});

test('1. semana vazia → uma mensagem curta', () => {
  const m = montar('2026-10-26', [{ label: 'Pessoal', items: [] }]);
  const msgs = dividir(m);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Nenhum compromisso/);
  assert.ok(msgs[0].length < 200);
});

test('2. eventos simples, "livre" e ordenação; 6. cancelado/recusado fora, recorrente com 🔁', () => {
  const m = montar('2026-10-26', [
    { label: 'Trabalho', items: [
      ev({ summary: 'Reunião X', start: dt('2026-10-26T09:00:00-03:00'), end: dt('2026-10-26T10:00:00-03:00'), recurringEventId: 'r1' }),
      ev({ summary: 'Cancelada', status: 'cancelled', start: dt('2026-10-26T11:00:00-03:00'), end: dt('2026-10-26T12:00:00-03:00') }),
      ev({ summary: 'Recusada', start: dt('2026-10-26T13:00:00-03:00'), end: dt('2026-10-26T14:00:00-03:00'), attendees: [{ self: true, responseStatus: 'declined' }] }),
      ev({ summary: 'Aceita', start: dt('2026-10-26T08:00:00-03:00'), end: dt('2026-10-26T08:30:00-03:00'), attendees: [{ self: true, responseStatus: 'accepted' }] }),
    ] },
    { label: 'Casa', items: [
      ev({ summary: 'Encontro Y', location: 'Salão Z', start: dt('2026-10-26T19:30:00-03:00'), end: dt('2026-10-26T21:00:00-03:00') }),
    ] },
  ]);
  const t = flat(m);
  assert.match(t, /<b>Segunda 26\/10<\/b>\n• 08:00–08:30 Aceita \(Trabalho\)\n• 09:00–10:00 Reunião X 🔁 \(Trabalho\)\n• 19:30–21:00 Encontro Y \(Casa\) — Salão Z/);
  assert.match(t, /<b>Terça 27\/10<\/b> — livre/);
  assert.doesNotMatch(t, /Cancelada|Recusada/);
  assert.equal(m.needs_split, false);
});

test('3. dia inteiro de 1 dia: end exclusivo não gera "dia a mais"; vem antes dos eventos com hora', () => {
  const m = montar('2026-10-26', [{ label: 'Pessoal', items: [
    ev({ summary: 'Reunião', start: dt('2026-10-26T07:00:00-03:00'), end: dt('2026-10-26T08:00:00-03:00') }),
    ev({ summary: 'Feriado local', start: { date: '2026-10-26' }, end: { date: '2026-10-27' } }),
  ] }]);
  const t = flat(m);
  assert.match(t, /Segunda 26\/10<\/b>\n• Dia inteiro: Feriado local \(Pessoal\)\n• 07:00–08:00 Reunião/);
  assert.match(t, /<b>Terça 27\/10<\/b> — livre/);
});

test('4. multi-dia dentro da semana (sexta → domingo)', () => {
  const m = montar('2026-10-26', [{ label: 'Pessoal', items: [
    ev({ summary: 'Viagem', start: dt('2026-10-30T09:00:00-03:00'), end: dt('2026-11-01T16:00:00-03:00') }),
  ] }]);
  const t = flat(m);
  assert.match(t, /Sexta 30\/10<\/b>\n• 09:00 Viagem ▶ até dom 01\/11 16:00 \(Pessoal\)/);
  assert.match(t, /Sábado 31\/10<\/b>\n↳ Viagem \(continua\)/);
  assert.match(t, /Domingo 01\/11<\/b>\n↳ Viagem \(termina 16:00\)/);
  assert.doesNotMatch(t, /Sábado 31\/10<\/b> — livre|Domingo 01\/11<\/b> — livre/);
});

test('5. começa antes de segunda e termina depois de domingo', () => {
  const m = montar('2026-10-26', [{ label: 'Pessoal', items: [
    ev({ summary: 'Workshop', start: dt('2026-10-25T10:00:00-03:00'), end: dt('2026-10-26T12:00:00-03:00') }),
    ev({ summary: 'Longa', start: dt('2026-10-24T10:00:00-03:00'), end: dt('2026-11-02T08:00:00-03:00') }),
  ] }]);
  const t = flat(m);
  assert.match(t, /Segunda 26\/10<\/b>\n↳ Longa \(desde sáb 24\/10, até seg 02\/11 08:00\)\n↳ Workshop \(desde dom 25\/10, até seg 26\/10 12:00\)/);
  assert.match(t, /Terça 27\/10<\/b>\n↳ Longa \(continua\)/);
  assert.match(t, /Domingo 01\/11<\/b>\n↳ Longa \(continua até seg 02\/11 08:00\)/);
});

test('multi-dia de dia inteiro (seg → qua) e que passa do domingo', () => {
  const m = montar('2026-10-26', [{ label: 'Pessoal', items: [
    ev({ summary: 'Congresso', start: { date: '2026-10-27' }, end: { date: '2026-10-30' } }),
    ev({ summary: 'Férias', start: { date: '2026-10-31' }, end: { date: '2026-11-05' } }),
  ] }]);
  const t = flat(m);
  assert.match(t, /Terça 27\/10<\/b>\n• Dia inteiro: Congresso ▶ até qui 29\/10 \(Pessoal\)/);
  assert.match(t, /Quarta 28\/10<\/b>\n↳ Congresso \(continua\)/);
  assert.match(t, /Quinta 29\/10<\/b>\n↳ Congresso \(termina\)/);
  assert.match(t, /Sexta 30\/10<\/b> — livre/);
  assert.match(t, /Sábado 31\/10<\/b>\n• Dia inteiro: Férias ▶ até qua 04\/11/);
  assert.match(t, /Domingo 01\/11<\/b>\n↳ Férias \(continua até qua 04\/11\)/);
});

test('evento que termina à meia-noite não ocupa o dia seguinte', () => {
  const m = montar('2026-10-26', [{ label: 'P', items: [
    ev({ summary: 'Festa', start: dt('2026-10-26T20:00:00-03:00'), end: dt('2026-10-27T00:00:00-03:00') }),
  ] }]);
  const t = flat(m);
  assert.match(t, /• 20:00–00:00 Festa/);
  assert.match(t, /Terça 27\/10<\/b> — livre/);
});

test('7. virada de mês e de ano', () => {
  assert.equal(periodo('2026-12-30').label, '28/12 – 03/01');
  const m = montar('2026-12-30', [{ label: 'P', items: [
    ev({ summary: 'Réveillon', start: dt('2026-12-31T22:00:00-03:00'), end: dt('2027-01-01T03:00:00-03:00') }),
  ] }]);
  const t = flat(m);
  assert.match(t, /Quinta 31\/12<\/b>\n• 22:00 Réveillon ▶ até sex 01\/01 03:00/);
  assert.match(t, /Sexta 01\/01<\/b>\n↳ Réveillon \(termina 03:00\)/);
});

test('9. caracteres HTML escapados', () => {
  const m = montar('2026-10-26', [{ label: 'A&B', items: [
    ev({ summary: 'Café <com> R&D', location: 'Sala <1>', start: dt('2026-10-26T09:00:00-03:00'), end: dt('2026-10-26T10:00:00-03:00') }),
  ] }]);
  const t = flat(m);
  assert.match(t, /Café &lt;com&gt; R&amp;D \(A&amp;B\) — Sala &lt;1&gt;/);
});

test('falha de uma agenda / de todas', () => {
  const some = montar('2026-10-26', [{ label: 'A', error: 'boom' }, { label: 'B', items: [ev({ summary: 'X', start: dt('2026-10-26T09:00:00-03:00'), end: dt('2026-10-26T10:00:00-03:00') })] }]);
  assert.match(flat(some), /Uma das agendas não respondeu: boom/);
  const all = montar('2026-10-26', [{ label: 'A', error: 'boom' }]);
  const msgs = dividir(all);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /Google Calendar indisponível: boom/);
  assert.doesNotMatch(msgs[0], /livre|Nenhum compromisso/);
});

// Semana cheia: ~14 eventos por dia com títulos longos → passa de 3800.
function heavy() {
  const items = [];
  for (let d = 26; d <= 30; d++) {
    for (let h = 6; h < 20; h++) {
      items.push(ev({ summary: 'Compromisso número ' + h + ' do dia ' + d + ' com título bem comprido para ocupar espaço', location: 'Endereço qualquer', start: dt(`2026-10-${d}T${String(h).padStart(2, '0')}:00:00-03:00`), end: dt(`2026-10-${d}T${String(h).padStart(2, '0')}:45:00-03:00`) }));
    }
  }
  return montar('2026-10-26', [{ label: 'Trabalho', items }]);
}
const assertPieces = (m, msgs) => {
  assert.ok(msgs.length > 1);
  for (const t of msgs) assert.ok(t.length <= 3800, 'mensagem de ' + t.length);
  msgs.forEach((t, i) => assert.ok(t.startsWith('📅 <b>Sua semana (' + (i + 1) + '/' + msgs.length + ')</b>')));
  // todo bloco de dia aparece inteiro e uma única vez, na ordem
  const joined = msgs.map((t) => t.split('\n\n').slice(1).join('\n\n')).join('\n\n');
  assert.equal(joined.replace(m.footer, ''), m.body);
};

test('8a. acima do teto, DeepSeek válido → divide entre dias', () => {
  const m = heavy();
  assert.equal(m.needs_split, true);
  const msgs = dividir(m, JSON.stringify({ blocks: [{ first_day: '2026-10-26' }, { first_day: '2026-10-28' }, { first_day: '2026-10-30' }] }));
  assertPieces(m, msgs);
  assert.equal(msgs.length, 3);
  assert.ok(msgs[1].includes('<b>Quarta 28/10</b>'));
});

test('8b. DeepSeek inválido / erro / ausente → fallback determinístico', () => {
  const m = heavy();
  for (const ds of ['não é json', JSON.stringify({ blocks: [{ first_day: '2026-10-28' }] }), JSON.stringify({ blocks: [{ first_day: '2026-10-26' }, { first_day: '2030-01-01' }] }),
    JSON.stringify({ blocks: [{ first_day: '2026-10-26' }] }), new Error('timeout'), undefined]) {
    assertPieces(m, dividir(m, ds));
  }
});

test('8c. dentro do teto não divide nem precisa de DeepSeek', () => {
  const m = montar('2026-10-26', [{ label: 'P', items: [ev({ summary: 'X', start: dt('2026-10-26T09:00:00-03:00'), end: dt('2026-10-26T10:00:00-03:00') })] }]);
  assert.equal(m.needs_split, false);
  const msgs = dividir(m);
  assert.equal(msgs.length, 1);
  assert.ok(msgs[0].startsWith('📅 <b>Sua semana</b> (26/10 – 01/11)'));
});

test('dia maior que o teto é quebrado por linha (último recurso), sem perder linhas', () => {
  const items = [];
  for (let i = 0; i < 150; i++) items.push(ev({ summary: 'Evento ' + i + ' ' + 'x'.repeat(40), start: dt(`2026-10-26T${String(i % 24).padStart(2, '0')}:${i % 2 ? '30' : '00'}:00-03:00`), end: dt(`2026-10-26T${String(i % 24).padStart(2, '0')}:${String(i % 2 ? 45 : 15)}:00-03:00`) }));
  const m = montar('2026-10-26', [{ label: 'P', items }]);
  const msgs = dividir(m);
  for (const t of msgs) assert.ok(t.length <= 3800);
  const text = msgs.join('\n');
  for (let i = 0; i < 150; i++) assert.ok(text.includes('Evento ' + i + ' '));
});
