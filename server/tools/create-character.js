// Cria conta e personagem de teste direto no banco (com o servidor parado ou rodando;
// o personagem não pode estar conectado).
// Uso:
//   npm run create-character -- --account teste1 --password teste123 --name Brakka --class breaker [--level 2] [--give axe_1h_t5 --give ring_furrow] [--db cinzas.db]
import { randomUUID } from 'node:crypto';
import { loadGameData } from '../src/data.js';
import { Store } from '../src/store.js';
import { derivedStats, totalAttributePoints, totalSkillPoints } from '../src/rules.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 ? d : argv[i + 1]; };
const all = (k) => argv.flatMap((a, i) => (a === `--${k}` ? [argv[i + 1]] : []));

const data = loadGameData();
const account = opt('account'), password = opt('password', 'teste123'), name = opt('name'), classId = opt('class', 'breaker');
const level = Math.max(1, Math.min(data.levelCap, Number(opt('level', 1))));
if (!account || !name) {
  console.log('Uso: npm run create-character -- --account CONTA --password SENHA --name NOME --class breaker|emberweaver [--level N] [--give ITEM ...] [--db cinzas.db]');
  process.exit(1);
}
const cls = data.classes[classId];
if (!cls) { console.log(`Classe inexistente: ${classId}. Opções: ${Object.keys(data.classes).join(', ')}`); process.exit(1); }
const store = new Store(opt('db', 'cinzas.db'));
let acc = store.findAccount(account);
if (!acc) { store.createAccount(account, password); acc = store.findAccount(account); console.log(`conta criada: ${account} / ${password}`); }
if (store.characterNameTaken(name)) { console.log(`nome em uso: ${name}`); process.exit(1); }
const map = data.maps.estrada_velha;
const st = derivedStats({ classId, level, alloc: {} }, cls.startingKit.equip.map((id) => ({ def: data.items[id] })), data);
const charId = store.createCharacter({ accountId: acc.id, name, classId, hp: st.maxHp, mp: st.maxMp, mapId: 'estrada_velha', x: map.spawnPoint.x, z: map.spawnPoint.z, kit: cls.startingKit, slotFor: (d) => data.items[d].slot });
const c = store.loadCharacter(charId);
c.level = level; c.xp = data.xp.cumulative[level - 1];
c.unspent = totalAttributePoints(level, data); c.skillPoints = totalSkillPoints(level, data);
for (const sid of cls.skills) if (data.skills[sid].unlockLevel <= level) c.skills[sid] = 1;
store.saveCharacter(c);
for (const defId of all('give')) {
  if (!data.items[defId]) { console.log(`item inexistente ignorado: ${defId}`); continue; }
  store.insertItem({ id: randomUUID(), charId, defId, qty: 1, enh: 0, loc: 'bag', slot: null, source: 'tool' });
}
console.log(`personagem criado: ${name} (${cls.name}) nível ${level}, ${c.unspent} pontos livres${all('give').length ? `, itens extras: ${all('give').join(', ')}` : ''}`);
store.close();
