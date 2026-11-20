// Administração de contas no banco (operação do teste público).
//   node tools/conta.mjs --db cinzas.db --conta nome --papel gm|admin|player
//   node tools/conta.mjs --db cinzas.db --conta nome --excluir
//   node tools/conta.mjs --db cinzas.db --auditoria [--tipo gm] [--n 50]
//   node tools/conta.mjs --db cinzas.db --conta nome --suspender --horas 24 --motivo "..."   (--permanente)
//   node tools/conta.mjs --db cinzas.db --conta nome --retirar-suspensao
//   node tools/conta.mjs --db cinzas.db --conta nome --silenciar --minutos 60 [--motivo "..."]
//   node tools/conta.mjs --db cinzas.db --conta nome --retirar-silencio
//   node tools/conta.mjs --db cinzas.db --denuncias [--n 50]
//   node tools/conta.mjs --db cinzas.db --bugs [--n 50]        (relatos de problema do /bug)
// (--personagem Nome no lugar de --conta acha a conta pelo personagem)
// Suspensões, silêncios e papéis valem no servidor em até 1 minuto (ele confere o banco a cada minuto).
// --db (ou CINZAS_DB) aceita arquivo SQLite ou postgres://usuario:senha@host/banco.
import { createStore } from '../src/db.js';
import { PERMANENT } from '../src/moderation.js';

// texto de jogador impresso no terminal sem caracteres de controle (não dá para forjar linhas)
const safe = (t) => String(t ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '·');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); if (i === -1) return d; const v = process.argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const st = createStore(arg('db', process.env.CINZAS_DB ?? 'cinzas.db'));
try {
  if (arg('bugs', false)) {
    for (const a of st.auditTail(Number(arg('n', 50)), 'bug_report').reverse()) {
      const d = JSON.parse(a.data_json);
      console.log(`${new Date(a.at).toISOString()}  pers=${a.char_id} (${d.classId} nv ${d.level}) ${d.map}${d.instance ? ' [instância]' : ''} (${d.x}, ${d.z}) cliente=${safe(d.client ?? '?')} servidor=${d.server ?? '?'} dados=${d.data ?? '?'}`);
      console.log(`    ${safe(d.text)}`);
    }
  } else if (arg('denuncias', false)) {
    for (const a of st.auditTail(Number(arg('n', 50)), 'report').reverse()) {
      const d = JSON.parse(a.data_json);
      console.log(`${new Date(a.at).toISOString()}  de pers=${a.char_id} contra ${safe(d.targetName)} (pers=${d.target}, conta=${d.targetAccount}) em ${d.map}: ${safe(d.reason)}`);
      for (const l of d.chat ?? []) console.log(`    ${new Date(l.at).toISOString().slice(11, 19)} [${safe(l.channel)}] ${safe(l.text)}`);
    }
  } else if (arg('auditoria', false)) {
    for (const a of st.auditTail(Number(arg('n', 50)), arg('tipo', null) || null).reverse()) {
      console.log(new Date(a.at).toISOString(), a.kind.padEnd(16), `conta=${a.account_id ?? '-'} pers=${a.char_id ?? '-'} ip=${a.ip ?? '-'}`, safe(a.data_json));
    }
  } else {
    let name = arg('conta', null);
    let acc = name ? st.findAccount(name) : null;
    const pers = arg('personagem', null);
    if (!acc && pers) { const row = st.characterByName(pers); acc = row ? st.findAccountById(row.account_id) : null; name = acc?.name; }
    if (!acc) { console.error('conta não encontrada'); process.exit(1); }
    const motivo = arg('motivo', null);
    if (arg('suspender', false)) {
      const perm = !!arg('permanente', false);
      const horas = Number(arg('horas', 0));
      if (!perm && !(horas > 0 && horas <= 24 * 365 * 5)) { console.error('use --horas N (até 5 anos) ou --permanente'); process.exit(1); }
      if (typeof motivo !== 'string') { console.error('informe --motivo'); process.exit(1); }
      const until = perm ? PERMANENT : Date.now() + Math.round(horas * 3600_000);
      st.setBan(acc.id, until, motivo);
      st.audit('mod_ban', { targetAccount: acc.id, until, reason: motivo, by: 'ferramenta' });
      console.log(`conta ${name} suspensa ${perm ? 'sem data para acabar' : `até ${new Date(until).toISOString()}`}`);
    }
    if (arg('retirar-suspensao', false)) { st.setBan(acc.id, null, null); st.audit('mod_unban', { targetAccount: acc.id, by: 'ferramenta' }); console.log(`suspensão de ${name} retirada`); }
    if (arg('silenciar', false)) {
      const min = Number(arg('minutos', 0));
      if (!(min > 0 && min <= 60 * 24 * 30)) { console.error('use --minutos N (até 30 dias)'); process.exit(1); }
      const until = Date.now() + Math.round(min * 60_000);
      st.setMute(acc.id, until);
      st.audit('mod_mute', { targetAccount: acc.id, until, reason: typeof motivo === 'string' ? motivo : '', by: 'ferramenta' });
      console.log(`conta ${name} silenciada até ${new Date(until).toISOString()}`);
    }
    if (arg('retirar-silencio', false)) { st.setMute(acc.id, null); st.audit('mod_unmute', { targetAccount: acc.id, by: 'ferramenta' }); console.log(`${name} pode falar de novo`); }
    if (arg('excluir', false)) { const n = st.deleteAccount(acc.id); st.audit('account_deleted', { accountId: acc.id, by: 'ferramenta', characters: n }); console.log(`conta ${name} excluída (${n} personagens)`); }
    const role = arg('papel', null);
    if (role) {
      if (!['player', 'gm', 'admin'].includes(role)) { console.error('papel: player, gm ou admin'); process.exit(1); }
      st.setRole(acc.id, role);
      st.audit('role_set', { accountId: acc.id, role, by: 'ferramenta' });
      console.log(`conta ${name}: papel ${role} (quem está no jogo recebe o papel novo em até 60 s, sem entrar de novo)`);
    }
  }
} finally { st.close(); }
