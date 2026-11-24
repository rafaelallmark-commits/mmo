// Seções do relatório de telemetria que vêm da auditoria (audit_log): mortes, sessões e desistência,
// calabouço, missões e economia (D171). Separado de tools/telemetria.mjs para ser testável sem banco:
// recebe as linhas { at, kind, char_id, data_json } e devolve o Markdown.
export const AUDIT_KINDS = ['death', 'session_end', 'dungeon', 'quest_accept', 'quest_reward', 'loot', 'sell', 'buy', 'enhance'];

export function auditReport(raw, { now = Date.now(), parouDias = 3 } = {}) {
  const rows = raw.map((r) => ({ ...r, d: typeof r.data_json === 'string' ? JSON.parse(r.data_json || '{}') : (r.data_json ?? {}) }));
  const of = (k) => rows.filter((r) => r.kind === k);
  const count = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); m.set(k, (m.get(k) ?? 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  const top = (pairs, n = 10) => pairs.slice(0, n).map(([k, v]) => `${k} (${v})`).join(', ') || '—';
  const band = (lvl) => { const b = Math.floor((lvl - 1) / 4) * 4 + 1; return `${b}–${b + 3}`; };
  const med = (a) => { const x = [...a].sort((p, q) => p - q); return x.length ? x[Math.floor(x.length / 2)] : 0; };
  const out = [];
  // mortes
  const deaths = of('death');
  const sessions = of('session_end');
  const hours = sessions.reduce((s, r) => s + (r.d.sessionS || 0), 0) / 3600;
  out.push('## Mortes', '');
  if (!deaths.length) out.push('Nenhuma morte registrada.', '');
  else {
    const multi = deaths.filter((r) => (r.d.attackers ?? 0) >= 3).length;
    out.push(`${deaths.length} mortes${hours > 0 ? ` em ${hours.toFixed(1)} h jogadas (${(deaths.length / hours).toFixed(2)} por hora)` : ''}; ${Math.round((multi / deaths.length) * 100)}% cercado por 3 ou mais monstros.`, '');
    out.push(`- **Por mapa:** ${top(count(deaths, (r) => r.d.map))}`);
    out.push(`- **Por faixa de nível:** ${top(count(deaths, (r) => band(r.d.level ?? 1)), 8)}`);
    out.push(`- **Por classe:** ${top(count(deaths, (r) => r.d.classId), 8)}`);
    out.push(`- **Último golpe:** ${top(count(deaths, (r) => r.d.by ?? '?'))}`, '');
  }
  // sessões e desistência
  out.push('## Sessões e desistência', '');
  if (!sessions.length) out.push('Nenhuma sessão encerrada registrada.', '');
  else {
    const last = new Map();
    for (const r of sessions) last.set(r.char_id, r);
    const stopped = [...last.values()].filter((r) => now - r.at > parouDias * 86400000);
    out.push(`${sessions.length} sessões de ${last.size} personagens; sessão mediana de ${Math.round(med(sessions.map((r) => r.d.sessionS || 0)) / 60)} min.`);
    out.push(`Sem voltar há mais de ${parouDias} dias: ${stopped.length} personagens.`, '');
    if (stopped.length) {
      out.push(`- **Nível em que pararam:** ${top(count(stopped, (r) => `nível ${r.d.level}`), 12)}`);
      out.push(`- **Mapa da última sessão:** ${top(count(stopped, (r) => r.d.map))}`);
      out.push(`- **Saíram caídos:** ${stopped.filter((r) => r.d.dead).length}`, '');
    }
  }
  // calabouço
  const dg = of('dungeon');
  out.push('## A Última Eclusa', '');
  if (!dg.length) out.push('Nenhuma tentativa registrada.', '');
  else {
    const starts = dg.filter((r) => r.d.result === 'start').length;
    const wipes = dg.filter((r) => r.d.result === 'wipe');
    const wins = dg.filter((r) => r.d.result === 'victory');
    out.push(`${starts} tentativas, ${wipes.length} quedas e ${wins.length} vitórias (${starts ? Math.round((wins.length / starts) * 100) : 0}% das tentativas).`);
    out.push(`- **Quedas por fase:** ${top(count(wipes, (r) => `fase ${r.d.phase ?? '?'}`))}`);
    out.push(`- **Motivo das quedas:** ${top(count(wipes, (r) => r.d.reason ?? '?'), 5)}`);
    out.push(`- **Tentativa da vitória:** ${top(count(wins, (r) => `${r.d.attempt}ª`), 6)}`, '');
  }
  // missões
  const acc = count(of('quest_accept'), (r) => r.d.quest);
  const done = new Map(count(of('quest_reward'), (r) => r.d.quest));
  out.push('## Missões', '');
  if (!acc.length) out.push('Nenhuma missão aceita registrada.', '');
  else {
    out.push('| Missão | Aceitas | Concluídas | Taxa |', '|---|---|---|---|');
    for (const [q, n] of acc.slice(0, 40)) out.push(`| ${q} | ${n} | ${done.get(q) ?? 0} | ${Math.round(((done.get(q) ?? 0) / n) * 100)}% |`);
    out.push('');
  }
  // economia
  const sum = (list, f) => list.reduce((s, r) => s + (Number(f(r)) || 0), 0);
  const ins = { saque: sum(of('loot'), (r) => r.d.gold), 'missões': sum(of('quest_reward'), (r) => r.d.gold), vendas: sum(of('sell'), (r) => r.d.gold) };
  const outs = { 'compras (tônicos, armeiro, materiais)': sum(of('buy'), (r) => r.d.cost), refino: sum(of('enhance'), (r) => r.d.gold) };
  const tin = Object.values(ins).reduce((a, b) => a + b, 0);
  const tout = Object.values(outs).reduce((a, b) => a + b, 0);
  out.push('## Economia (ouro)', '');
  out.push(`Entrou ${tin} (${Object.entries(ins).map(([k, v]) => `${k} ${v}`).join(', ')}); saiu ${tout} (${Object.entries(outs).map(([k, v]) => `${k} ${v}`).join(', ')}); saldo ${tin - tout}.`, '');
  return out.join('\n');
}

