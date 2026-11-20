// Administração de contas no banco (operação do teste público).
//   node tools/conta.mjs --db cinzas.db --conta nome --papel gm|admin|player
//   node tools/conta.mjs --db cinzas.db --conta nome --excluir
//   node tools/conta.mjs --db cinzas.db --auditoria [--tipo gm] [--n 50]
import { Store } from '../src/store.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); if (i === -1) return d; const v = process.argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const st = new Store(arg('db', process.env.CINZAS_DB ?? 'cinzas.db'));
try {
  if (arg('auditoria', false)) {
    for (const a of st.auditTail(Number(arg('n', 50)), arg('tipo', null) || null).reverse()) {
      console.log(new Date(a.at).toISOString(), a.kind.padEnd(16), `conta=${a.account_id ?? '-'} pers=${a.char_id ?? '-'} ip=${a.ip ?? '-'}`, a.data_json);
    }
  } else {
    const name = arg('conta', null);
    const acc = name ? st.findAccount(name) : null;
    if (!acc) { console.error('conta não encontrada'); process.exit(1); }
    if (arg('excluir', false)) { const n = st.deleteAccount(acc.id); st.audit('account_deleted', { accountId: acc.id, by: 'ferramenta', characters: n }); console.log(`conta ${name} excluída (${n} personagens)`); }
    const role = arg('papel', null);
    if (role) {
      if (!['player', 'gm', 'admin'].includes(role)) { console.error('papel: player, gm ou admin'); process.exit(1); }
      st.setRole(acc.id, role);
      st.audit('role_set', { accountId: acc.id, role, by: 'ferramenta' });
      console.log(`conta ${name}: papel ${role}`);
    }
  }
} finally { st.close(); }
