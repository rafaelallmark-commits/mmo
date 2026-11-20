// Parceiro simulado para o cenário --social do cliente: entra no mesmo ponto, aceita troca, clã e
// duelo, oferece 25 de ouro na troca e confirma quando os dois lados estão travados.
// Uso: node tools/parceiro-social.mjs --url ws://127.0.0.1:7777 --nome Parceira
import { SimClient } from '../test/helpers/client.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const url = args.url || 'ws://127.0.0.1:7777';
const nome = args.nome || 'Parceira';
const c = new SimClient(nome);
await c.connect(url);
const conta = `parceiro_${nome.toLowerCase()}`;
await c.request('register', { account: conta, password: 'senha123' });
await c.request('login', { account: conta, password: 'senha123' });
let list = await c.request('list_chars');
let ch = list.chars.find((x) => x.name === nome);
if (!ch) ch = (await c.request('create_char', { name: nome, classId: 'warden' })).char;
await c.request('enter', { charId: ch.id });
await c.request('gm', { cmd: 'xp', level: 10 });
await c.request('gm', { cmd: 'gold', amount: 500 });
await c.request('gm', { cmd: 'teleport', x: 24.5, z: 50.5 });
console.log(`[parceiro] ${nome} no mundo`);
let offered = false;
let confirmed = false;
const orig = c.onMessage.bind(c);
c.onMessage = (m) => {
  orig(m);
  if (m.t === 'trade_invite') { console.log('[parceiro] aceitando troca'); c.request('trade_accept', { from: m.fromId }); }
  if (m.t === 'trade') {
    const t = m.trade;
    if (!offered) { offered = true; setTimeout(() => c.request('trade_offer', { items: [], gold: 25 }), 300); }
    else if (t.them.locked && !t.me.locked) c.request('trade_lock');
    else if (t.me.locked && t.them.locked && !t.me.confirmed && t.them.confirmed && !confirmed) { confirmed = true; c.request('trade_confirm'); }
  }
  if (m.t === 'trade_done') console.log('[parceiro] troca concluída');
  if (m.t === 'clan_invite') { console.log('[parceiro] entrando no clã'); c.request('clan_accept', { clanId: m.clan.id }); }
  if (m.t === 'duel_invite') { console.log('[parceiro] aceitando duelo'); c.request('duel_accept', { from: m.fromId }); }
  if (m.t === 'duel' && m.state === 'ended') { console.log(`[parceiro] ${m.text}`); setTimeout(() => c.request('gm', { cmd: 'teleport', x: 24.5, z: 50.5 }), 500); }
};
setTimeout(() => process.exit(0), Number(args.segundos || 180) * 1000);
