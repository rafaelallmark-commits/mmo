// Parceiro simulado para capturas do calabouço: cria um personagem de nível 20, aceita convites
// de grupo e, quando o líder chega aos Canais, vai até a porta da Última Eclusa e luta junto.
// Uso: node tools/partner.mjs ws://127.0.0.1:7777 NomeDoParceiro
import { SimClient, sleep } from '../test/helpers/client.js';
const [url = 'ws://127.0.0.1:7777', name = 'Parceira'] = process.argv.slice(2);
const c = new SimClient('parceiro');
await c.connect(url);
await c.request('register', { account: `acc_${name}`, password: 'senha123' });
const l = await c.request('login', { account: `acc_${name}`, password: 'senha123' });
let id = l.chars[0]?.id;
if (!id) id = (await c.request('create_char', { name, classId: 'bastion' })).char.id;
const e = await c.request('enter', { charId: id });
c.snap = e.snapshot; c.char = e.char;
await c.request('gm', { cmd: 'xp', level: 20 });
console.log('parceiro pronto:', name);
c.ws.on('message', async (buf) => {
  const m = JSON.parse(buf.toString());
  if (m.t === 'party_invite') { await c.request('party_accept', { from: m.fromId }); await c.request('gm', { cmd: 'teleport', mapId: 'canais_eclusa', x: 101, z: 186 }); }
});
for (;;) {
  await sleep(500);
  const boss = c.snap?.ents.find((x) => x.def === 'lock_custodian');
  if (boss && !c.attacking) { c.attacking = true; await c.request('attack', { target: boss.id }); }
}
