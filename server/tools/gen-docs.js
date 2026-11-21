// Gera docs/03-classes.md e docs/04-progressao-e-formulas.md a partir de /data e das
// funções do servidor. Uso: npm run gen-docs  (rode depois de editar dados).
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGameData, ATTRS } from '../src/data.js';
import { derivedStats, playerAttack, monsterAttack, levelDiffMod, mitigationK, physicalHitChance, splitKillXp, totalAttributePoints } from '../src/rules.js';
import { reachability, runBuild, loadBuilds, TIERS, WEAPON_FAMILIES } from './validate-data.js';

const data = loadGameData();
const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs');
const A = (a) => data.attributes[a].name;
const AB = { str: 'For', spi: 'Esp', tal: 'Tal', agi: 'Agi', vit: 'Vit' };
const cname = (c) => data.classes[c].name;
const fam = (f) => data.families[f] ?? f;
const rar = (r) => data.rarities[r].name;
const reqStr = (req) => Object.entries(req || {}).map(([a, v]) => `${AB[a]} ${v}`).join(', ') || '—';
const n1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const HEADER = '<!-- Arquivo gerado por `npm run gen-docs` (server/tools/gen-docs.js) a partir de /data. Edite os dados, não este arquivo. -->\n\n';

// ---------------------------------------------------------------- 03 classes
function classesDoc() {
  const out = [HEADER, '# 3. Origens e classes\n'];
  out.push('Cada classe define atributos iniciais (soma 60), famílias de arma, mão secundária e peso de armadura. Ganha **5 pontos de atributo** e **1 ponto de habilidade** por nível a partir do 2. Habilidades destravam nos níveis 1, 5, 10 (prova de classe, habilidade marcante), 15 (complementar), 20 (avançada) e 25 (a da Cava Primeira, pós-v1); desbloquear dá o grau 1 de graça, cada grau extra custa 1 ponto, até 5 graus, com teto por faixa de nível:\n');
  out.push(table(['A partir do nível', 'Grau máximo'], data.skillRules.rankCapByLevel.map(([l, c]) => [l, c])));
  const extra = data.skillRules.maxRank - 1;
  const pts20 = 19 * data.skillPointsPerLevel, ptsCap = (data.levelCap - 1) * data.skillPointsPerLevel;
  const n20 = data.skillRules.unlockLevels.filter((l) => l <= 20).length, nAll = data.skillRules.unlockLevels.length;
  out.push(`\nAté o nível 20 são ${pts20} pontos de habilidade para ${n20 * extra} graus extras possíveis: ninguém maximiza tudo e a escolha de graus é parte da build. A habilidade do nível ${data.levelCap} soma mais ${extra} graus e cada nível acima do 20 dá mais um ponto: no teto (nível ${data.levelCap}) os ${ptsCap} pontos cobrem os ${nAll * extra} graus, então a build só se completa no fim da campanha.\n`);
  out.push('Valores por grau seguem a regra "base + porGrau × (grau − 1)". Custos em mana também sobem por grau. "Arma" no alcance significa o alcance da arma equipada (corpo a corpo 2,5 m; lança 3,5 m; azagaia 14 m; arco 18 m; varinha 16 m; cetro 14 m; cajado 18 m).\n');
  out.push('Diferenças que o design preserva: **lança** (Lanceiro) é corpo a corpo de alcance longo e ataques em linha, **azagaia** (Andarilha) é arremessada a distância; **machado** (Quebraferro) é dano alto sem escudo, **garra/martelo** (Bastião) são armas mecânicas de defesa (somam defesa) com escudo; a **Cantora** protege e cura, o **Tecelão** causa dano em área e controla.\n');
  for (const [oid, o] of Object.entries(data.origins)) {
    out.push(`\n## Origem ${o.name} — cidade de ${o.city}\n\n${o.description}\n`);
    for (const [cid, c] of Object.entries(data.classes).filter(([, c]) => c.origin === oid)) {
      out.push(`\n### ${c.name}${c.implementedIn === 'M1' ? ' (jogável no Marco 1)' : ` (jogável no ${c.implementedIn})`}\n`);
      out.push(`**Papel:** ${c.role}\n`);
      out.push(`- **Armas:** ${c.weaponFamilies.map(fam).join(', ')}`);
      out.push(`- **Mão secundária:** ${c.offhandFamilies.length ? c.offhandFamilies.map(fam).join(', ') : 'nenhuma (armas de uma mão sem escudo, ou duas mãos)'}`);
      out.push(`- **Armadura:** ${{ heavy: 'pesada (Força)', light: 'leve (Agilidade e Talento)', robe: 'vestes mágicas (Espírito)' }[c.armorWeight]}`);
      out.push(`- **Atributos iniciais:** ${ATTRS.map((a) => `${A(a)} ${c.start[a]}`).join(' · ')}`);
      const st = derivedStats({ classId: cid, level: 1, alloc: {} }, c.startingKit.equip.map((id) => ({ def: data.items[id] })), data);
      out.push(`- **Nível 1 com o kit inicial:** vida ${st.maxHp}, mana ${st.maxMp}, defesa ${st.defense}, precisão ${st.accuracy}, crítico ${n1(st.crit)}%`);
      out.push(`- **Kit inicial (tutorial adapta à classe):** equipado ${c.startingKit.equip.map((i) => data.items[i].name).join(', ')}; na bolsa ${c.startingKit.bag.map(([i, q]) => `${data.items[i].name}${q > 1 ? ` ×${q}` : ''}`).join(', ')}\n`);
      const rows = c.skills.map((sid) => {
        const s = data.skills[sid];
        const e = s.effect;
        const ranks = [1, 2, 3, 4, 5].map((r) => {
          if (e.pct !== undefined && e.pct) return `${e.pct + (e.pctPerRank || 0) * (r - 1)}%`;
          if (e.flat !== undefined) return `${e.flat + (e.flatPerRank || 0) * (r - 1)}`;
          // o primeiro valor que sobe por grau (no Canto de Vigília é a regeneração, não a defesa fixa); sem nenhum, o primeiro presente.
          // Defesa antes de dano: na Placa Dinâmica, que dá os dois, o principal é a defesa
          const keys = ['defensePct', 'physDamagePct', 'physDamageTakenPct', 'absorbPctMaxHp', 'healPctMaxHp', 'hpPct', 'damageTakenDownPct', 'nextAttackPct', 'evasion', 'critPct', 'regenPctMaxHpPerSec'].filter((k) => e[k] !== undefined);
          const k = keys.find((x) => e[`${x}PerRank`]) ?? keys[0];
          if (k) return `${e[k] + (e[`${k}PerRank`] || 0) * (r - 1)}${k === 'evasion' ? '' : k === 'regenPctMaxHpPerSec' ? '%/s' : '%'}`;
          return '—';
        }).join(' / ');
        const range = s.range === 'weapon' ? 'arma' : s.range === 0 ? 'si' : `${s.range} m`;
        return [`**${s.name}**`, s.unlockLevel, `${s.mp} (+${s.mpPerRank || 0}/grau)`, `${n1(s.cooldownMs / 1000)} s`, range, s.description, ranks, s.implementedIn];
      });
      out.push(table(['Habilidade', 'Nível', 'Mana', 'Recarga', 'Alcance', 'Efeito', 'Valor principal nos graus 1–5', 'Marco'], rows));
    }
  }
  out.push('\nAtaque básico: todas as classes têm, sem custo, com o intervalo e o alcance da arma. Armas mágicas causam dano mágico no ataque básico (rolagem da arma + 20% do Espírito).\n');
  return out.join('\n');
}

// ---------------------------------------------------------------- mecânicas dos monstros
const s1 = (ms) => `${String(Math.round(ms / 10) / 100).replace('.', ',')} s`;
// plural do nome do monstro: só a primeira palavra (Rato-Engrenagem → Ratos-Engrenagem, Ecoante → Ecoantes)
const plural = (name) => name.replace(/^([^\s-]+)/, (w) => (/[aeiou]$/i.test(w) ? `${w}s` : `${w}es`));
const cap = (t) => t[0].toUpperCase() + t.slice(1);
// O que a mecânica faz, com os números dos dados (server/src/mechanics.js aplica as mesmas regras).
function debuffDesc(d) {
  const parts = [];
  if (d.mods?.hitChancePct) parts.push(`${d.mods.hitChancePct}% de acerto`);
  if (d.mods?.moveSpeedPct) parts.push(`${d.mods.moveSpeedPct}% de velocidade`);
  if (d.mpPctPerSec) parts.push(`−${n1(d.mpPctPerSec)}% da mana máxima por segundo`);
  if (d.silence) parts.push('sem habilidades');
  return `**${d.name}** por ${s1(d.durationMs)} (${parts.join(', ').replace(/-/g, '−')})`;
}
function areaDesc(t) {
  const shape = {
    circle: `círculo de ${n1(t.radius)} m em volta do monstro`,
    target_circle: `círculo de ${n1(t.radius)} m onde o alvo está`,
    cone: `cone de ${n1(t.range)} m e ${t.angleDeg}° à frente`,
    line: `linha de ${n1(t.length)} × ${n1(t.width)} m à frente${t.rails ? ', só nos eixos do mapa' : ''}`,
  }[t.shape];
  const fx = [];
  if (t.damagePct > 0) fx.push(`${t.damagePct}% do dano ${t.magic ? 'como dano mágico' : 'físico'}`);
  if (t.dash) fx.push('o monstro corre a linha inteira');
  if (t.pullTo) fx.push(`puxa até ${n1(t.pullTo)} m dele`);
  if (t.stunMs) fx.push(`atordoa ${s1(t.stunMs)} (menos com Vitalidade)`);
  if (t.debuff) fx.push(debuffDesc(t.debuff));
  if (t.spawn) fx.push(`gera ${t.spawn.count === 1 ? `um ${data.monsters[t.spawn.monster].name}` : `${t.spawn.count} ${plural(data.monsters[t.spawn.monster].name)}`}, até ${t.spawn.maxAlive} de uma vez`);
  return `${shape}, avisado ${s1(t.warnMs)} antes; em quem ficou: ${fx.join('; ')}`;
}
function mechanicDesc(m) {
  const k = m.mechanic;
  switch (k.kind) {
    case 'telegraph': {
      const when = `a cada ${s1(k.everyMs)}, a primeira ${k.firstMs ? `${s1(k.firstMs)} depois de entrar em combate` : 'logo ao entrar em combate'}${k.minRange != null ? `, com o alvo a ${n1(k.minRange)}–${n1(k.maxRange)} m` : ''}`;
      return `${cap(areaDesc(k))}. ${cap(when)}.${k.patrolRadius ? ` Patrulha até ${n1(k.patrolRadius)} m de casa.` : ''}`;
    }
    case 'death_burst': return `Ao morrer, explosão de ${n1(k.radius)} m onde caiu, avisada ${s1(k.warnMs)} antes: ${k.damagePct}% do dano ${k.magic ? 'como dano mágico' : 'físico'} em quem ficou.`;
    case 'leech': return `Cada mordida que acerta gruda: ${debuffDesc(k.debuff)}, renovado a cada mordida.`;
    case 'swarm': return `+${k.damagePctPerAlly}% de dano por ${m.name} lutando a até ${n1(k.radius)} m (até +${k.damagePctPerAlly * k.maxAllies}%).`;
    case 'pierce': return `Os golpes ignoram ${k.defensePiercePct}% da defesa.`;
    case 'echo': return `A cada ${s1(k.everyMs)} (a primeira ${s1(k.firstMs ?? k.everyMs)} depois de entrar em combate), no lugar do golpe comum, devolve ${k.pct}% do último golpe que levou nos últimos ${s1(k.memoryMs)} (até ${k.capPct}% do seu dano máximo) a quem o deu, se estiver a até ${k.range} m (senão, em quem ele enfrenta).`;
    case 'summon': return `A cada limiar de vida (${k.thresholdsPct.join('%, ')}%) chama ${k.count === 1 ? `um ${data.monsters[k.monster].name}` : `${k.count} ${plural(data.monsters[k.monster].name)}`}, até ${k.maxAlive} vivos; os reforços dão XP, não deixam saque e somem quando o invocador cai ou desiste.`;
    case 'pressure': return `Pressão alta por ${s1(k.highMs)} (+${k.highDamagePct}% de dano); na virada solta **${k.vent.name}** (${areaDesc(k.vent)}) e passa ${s1(k.lowMs)} em pressão baixa (−${k.lowDefensePct}% de defesa e resistência mágica).`;
    case 'territorial': return `Passivo, mas ataca quem chega a ${n1(k.radius)} m.`;
    default: return '—';
  }
}

function mechanicsSection() {
  const out = ['\n### Mecânicas dos monstros\n'];
  out.push('Cada espécie com mecânica tem um campo `mechanic` em `data/monsters.json` (o servidor aplica em `server/src/mechanics.js`; docs/06 explica como jogar contra elas). Golpes de área são sempre avisados no chão (círculo, cone ou linha) com tempo para sair clicando: quem sai a tempo não leva nada, e atordoar o monstro durante o aviso cancela o golpe. Efeitos negativos são curtos, aparecem na interface e a Alvorada tira um por vez; atordoamento passa pela resistência a controle da Vitalidade.\n');
  const rows = Object.values(data.monsters).filter((m) => m.mechanic).map((m) => [`${m.name} (${m.level}${m.rank === 'normal' ? '' : `, ${{ elite: 'elite', boss: 'chefe' }[m.rank]}`})`, `**${m.mechanic.name}**`, mechanicDesc(m)]);
  out.push(table(['Monstro', 'Mecânica', 'O que faz'], rows));
  out.push('\nO Custódio da Eclusa tem o encontro próprio do calabouço (válvulas, linhas do piso e comportas; docs/02 §5.3). Os demais monstros só perseguem e golpeiam; a assistência vale para todos os agressivos (atingido, chama os iguais parados a até 8 m).\n');
  return out.join('\n');
}

// ---------------------------------------------------------------- 04 progressão
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

function progressionDoc() {
  const out = [HEADER, '# 4. Níveis, XP, equipamento e fórmulas\n'];
  const cum = data.xp.cumulative;
  const cap = data.levelCap;
  const mons = Object.entries(data.monsters);
  // monstro de caça típico do nível: normal, que dá XP, fora de instâncias; sem nenhum no nível, o de nível mais próximo
  const huntable = mons.filter(([, m]) => m.rank === 'normal' && m.xp > 0 && !data.maps[m.area]?.instanced);
  const normalAt = (L) => huntable.find(([, m]) => m.level === L) ?? huntable.reduce((best, e) => (!best || Math.abs(e[1].level - L) < Math.abs(best[1].level - L) ? e : best), null);
  out.push('## 4.1 Pontos de atributo\n');
  out.push('Atributos permanentes = iniciais da classe + pontos distribuídos. São os únicos que contam para requisitos: bônus de itens, tônicos e efeitos temporários nunca liberam um item. A partir do nível 2 o personagem ganha 5 pontos por nível.\n');
  out.push(table(['Nível', ...Array.from({ length: cap }, (_, i) => String(i + 1))], [['Pontos totais', ...Array.from({ length: cap }, (_, i) => totalAttributePoints(i + 1, data))]]));
  out.push(`\n## 4.2 Tabela de XP acumulada (níveis 1–${cap})\n`);
  out.push(`Calibração: a tabela foi montada com ${data.xp.killsPerMinuteSolo} abates por minuto de caça ativa solo contra monstros do mesmo nível (inclui deslocamento e pausas curtas): XP para o próximo nível = meta em minutos × ${data.xp.killsPerMinuteSolo} × XP da curva de referência do nível (4.3), arredondado para dezenas, com meta = 2 + 1,5 × (nível − 1). A mesma regra vale para os níveis 21–${cap} (pós-v1). A simulação do Marco 4 ([relatório](relatorio-progressao.md)) mostrou que, com habilidades, tônicos e o equipamento do armeiro, quem só caça mata bem mais do que ${data.xp.killsPerMinuteSolo} por minuto (de 3 a 10 conforme o nível; perto de 5 na média): em vez de refazer a tabela, o **XP de cada monstro** foi ajustado nível a nível para o tempo só caçando ficar perto da meta. A coluna \"Abates/min para a meta\" mostra o ritmo que cada nível pede com o XP atual. Os tempos são **metas de teste** para o Marco 4 medir e ajustar, não promessas. Missões principais somam cerca de 30% do XP de cada capítulo, então quem faz caça + missões chega ao teto de nível em cerca de 70% do tempo de quem só caça.\n`);
  const rows = [];
  let total = 0;
  for (let L = 1; L <= cap; L++) {
    const need = L < cap ? cum[L] - cum[L - 1] : null;
    const m = L < cap ? normalAt(L) : null;
    const mins = L < cap ? data.xp.targetMinutesToNext[L - 1] : null;
    if (mins) total += mins;
    rows.push([L, cum[L - 1].toLocaleString('pt-BR'), need ? need.toLocaleString('pt-BR') : '—', m ? `${m[1].name} (${m[1].xp})` : '—', need && m ? Math.ceil(need / m[1].xp) : '—', need && m && mins ? n1(Math.ceil(need / m[1].xp) / mins) : '—', mins ? `${n1(mins)} min` : '—', mins ? `${n1(mins * 0.7)} min` : '—', mins ? `${n1(total / 60)} h` : '—']);
  }
  out.push(table(['Nível', 'XP acumulada', 'XP para o próximo', 'Monstro típico do nível (XP)', 'Abates solo', 'Abates/min para a meta', 'Meta só caça', 'Meta caça + missões', 'Acumulado só caça'], rows));
  out.push('\n## 4.3 XP por monstro\n');
  out.push('Curva de referência (a que montou a tabela de XP): round(8 + 6 × nível^1,45). O XP de cada monstro normal, na tabela abaixo, é o dessa curva ajustado pela simulação (4.2); elite vale ×4 e chefe ×20 o XP de um monstro normal do mesmo nível. O XP recebido é multiplicado pela diferença de nível (monstro − jogador): monstros acima do nível dão mais (e batem mais forte); muito abaixo, quase nada.\n');
  const mod = data.formulas.xp.levelDiffMod;
  out.push(table(['Diferença (monstro − jogador)', ...Object.keys(mod).sort((a, b) => a - b).map((k) => (Number(k) > 0 ? `+${k}` : k))], [['Multiplicador', ...Object.keys(mod).sort((a, b) => a - b).map((k) => n1(mod[k]))]]));
  out.push('\nFora da tabela vale o extremo (−6 ou menos: ×0,1; +5 ou mais: ×1,4).\n');
  out.push(table(['Monstro', 'Área', 'Nível', 'Tipo', 'Comportamento', 'Vida', 'Dano', 'Defesa', 'XP base', 'XP p/ jogador 2 níveis acima'], mons.map(([, m]) => [m.name, data.maps[m.area]?.name ?? m.area, m.level, { normal: 'normal', elite: 'elite', boss: 'chefe' }[m.rank], m.aggro === 'aggressive' ? `agressivo (${m.aggroRadius} m)` : m.mechanic?.kind === 'territorial' ? `passivo (ataca a ${n1(m.mechanic.radius)} m)` : 'passivo', m.hp, `${m.damage[0]}–${m.damage[1]}${m.attackIntervalMs !== 1800 && m.damage[1] > 0 ? ` a cada ${n1(m.attackIntervalMs / 1000)} s` : ''}`, m.defense, m.xp, Math.round(m.xp * levelDiffMod(m.level, m.level + 2, data))])));
  out.push(mechanicsSection());
  // exemplos solo e grupo
  out.push('\n### Exemplo solo\n');
  const hound = data.monsters.rust_hound;
  const need3 = cum[3] - cum[2];
  const meta3 = data.xp.targetMinutesToNext[2];
  out.push(`Quebraferro nível 3 caçando **${hound.name}** (nível ${hound.level}, ${hound.xp} XP). Para o nível 4 faltam ${need3} XP → ${Math.ceil(need3 / hound.xp)} abates; a meta de ${n1(meta3)} min pede **${n1(Math.ceil(need3 / hound.xp) / meta3)} abates/min**, o ritmo de um jogador eficiente nesse nível (os cães caem em poucos golpes). Os cães andam em matilha (quem é atingido chama os vizinhos a 8 m), então o solo precisa puxar um por vez pela borda do grupo.\n`);
  out.push('### Exemplo em grupo\n');
  const valve = data.monsters.errant_valve;
  const split = splitKillXp(valve, [{ charId: 1, level: 7, score: 50 }, { charId: 2, level: 7, score: 50 }], data);
  const uneven = splitKillXp(valve, [{ charId: 1, level: 7, score: 55 }, { charId: 2, level: 7, score: 45 }], data);
  const groupKpm = 2 * 3 * 0.95;
  out.push(`Quebraferro e Tecelão, ambos nível 7, caçando **${valve.name}** (nível ${valve.level}, ${valve.xp} XP) no Brejo das Bombas. Com participação igual (50% / 50%) e bônus de cooperação de 10% por participante extra, cada um recebe ${split[0].xp} XP por abate. Em dupla matam ~${n1(groupKpm)} por minuto (o dobro do solo menos 5% de coordenação): **${Math.round(split[0].xp * groupKpm)} XP/min para cada um** contra ${valve.xp * 3} XP/min solo — um pouco mais rápido, com menos tônicos gastos e acesso a pontos com 4–6 monstros juntos que um solo não aguenta. Para o nível 8 (${(cum[7] - cum[6]).toLocaleString('pt-BR')} XP) cada um leva cerca de ${n1((cum[7] - cum[6]) / (split[0].xp * groupKpm))} min. Se a divisão for 55% / 45%, quem causa menos dano recebe ${uneven[1].xp} por abate (${Math.round(uneven[1].xp * groupKpm)} XP/min, abaixo do solo): é por isso que, no M2, cura, proteção e controle contam como participação.\n`);
  out.push(`No M2, a participação também conta cura (×${n1(data.formulas.xp.participation.healing)}), dano absorvido em proteção (×${n1(data.formulas.xp.participation.threatAbsorbed)}) e controle (${data.formulas.xp.participation.controlSeconds} pontos por segundo de controle), para que Bastião e Cantora recebam XP justo sem causar dano. Só recebe quem está a até ${data.formulas.xp.shareRadius} m do monstro na morte.\n`);
  // equipamento
  out.push('\n## 4.4 Equipamento por faixa\n');
  out.push('Faixas nos níveis 1, 5, 9, 13, 17, 21 e 25, com recompensas únicas no 20. Todo item tem nível mínimo explícito. O comum de cada faixa sustenta a evolução; incomum, raro e único têm destaque visual crescente (cinza claro, verde, azul, laranja). "Duas mãos" ocupa também a mão secundária até ser desequipada. Itens podem ser carregados e guardados antes do nível. As faixas 21 e 25 (pós-v1) seguem as mesmas curvas; a 21 fica logo abaixo da única do 20 no atributo principal, para a recompensa do Custódio continuar valendo até o 25.\n');
  const tierNote = { 20: ' — recompensas especiais (chefe da Eclusa e prova final)', 21: ' — A Cava Primeira (pós-v1)', 25: ' — teto de nível (pós-v1)' };
  for (const t of TIERS) {
    out.push(`\n### Faixa ${t}${tierNote[t] ?? ''}\n`);
    const w = WEAPON_FAMILIES.map((f) => data.items[`${f}_t${t}`]);
    out.push(table(['Arma', 'Família', 'Empunhadura', 'Dano', 'Intervalo', 'Alcance', 'Poder mág.', 'Requisitos', 'Classes', 'Raridade'], w.map((d) => [d.name, fam(d.family), d.hands === 2 ? 'duas mãos' : 'uma mão', `${d.damage[0]}–${d.damage[1]} ${d.damageType === 'magic' ? 'mág.' : 'fís.'}`, `${n1(d.attackIntervalMs / 1000)} s`, `${d.range} m`, d.magicPower ?? '—', `nv ${d.level}; ${reqStr(d.req)}`, d.classes.map(cname).join(', '), rar(d.rarity)])));
    out.push('');
    const others = Object.values(data.items).filter((d) => d.level === t && ['armor', 'offhand', 'jewel'].includes(d.kind) && /_t\d+$/.test(d.id));
    out.push(table(['Item', 'Família', 'Espaço', 'Defesa', 'Outros', 'Requisitos', 'Classes'], others.map((d) => [d.name, fam(d.family), data.slots[d.slot], d.defense ?? '—', [d.evasion && `evasão +${d.evasion}`, d.mres && `res. mág. ${d.mres}`, d.magicPower && `poder mág. ${d.magicPower}`, d.accuracy && `precisão +${d.accuracy}`, d.blockPct && `bloqueio ${d.blockPct}%`, d.bonusAttrs && Object.entries(d.bonusAttrs).map(([a, v]) => `+${v} ${AB[a]}`).join(' '), d.bonusMp && `mana +${d.bonusMp}`].filter(Boolean).join(', ') || '—', `nv ${d.level}; ${reqStr(d.req)}`, d.classes ? d.classes.map(cname).join(', ') : 'todas'])));
  }
  out.push('\n### Itens nomeados de outras raridades (exemplos)\n');
  out.push(table(['Item', 'Raridade', 'Nível', 'Requisitos', 'Efeito'], Object.values(data.items).filter((d) => !/_t\d+$/.test(d.id) && d.slot).map((d) => [d.name, rar(d.rarity), d.level, reqStr(d.req), [d.damage && `dano ${d.damage.join('–')}`, d.bonusAttrs && Object.entries(d.bonusAttrs).map(([a, v]) => `+${v} ${AB[a]}`).join(' '), d.note].filter(Boolean).join('; ')])));
  out.push('\n### O catálogo de exemplo da especificação\n');
  out.push('Os oito itens pedidos estão no catálogo com os requisitos originais: Machado de Pedreira (nv5, For 22 Tal 14), Garra de Manivela (nv5, For 18 Tal 18), Pique de Ferro Frio (nv9, For 30 Tal 20, duas mãos), Arco de Freixo Negro (nv9, Agi 30 Tal 18), Espada da Vigília (nv13, For 35 Esp 20), Azagaia da Correnteza (nv13, Agi 35 Tal 24), Cetro do Sino Mudo (nv17, Esp 45 Tal 24, raro, só Cantora) e Cajado da Câmara Rubra (nv20, Esp 55 Tal 28, duas mãos, único, exceção só do Tecelão). A verificação abaixo mostra que **todos cabem** nos pontos disponíveis, inclusive somados às armaduras e à mão secundária da mesma faixa — não foi preciso rebalancear os números. O que foi ajustado: as curvas das demais famílias foram construídas em torno deles (ver docs/DECISOES.md).\n');
  out.push('\n## 4.5 Verificação: cada conjunto de faixa cabe nos pontos da classe\n');
  out.push('Conjunto = arma da família + mão secundária da classe (se a arma for de uma mão) + 4 peças de armadura do peso da classe, todos da mesma faixa, usados ao mesmo tempo. "Gasta" = soma, por atributo, de quanto o maior requisito passa do valor inicial da classe. A folga é o que sobra para Vitalidade e para a identidade da build.\n');
  const rr = reachability(data);
  const byClass = {};
  for (const r of rr) (byClass[`${r.classId}|${r.family}`] ??= []).push(r);
  out.push(table(['Classe / família', ...TIERS.map((t) => `nv ${t}`)], Object.entries(byClass).map(([k, rs]) => {
    const [c, f] = k.split('|');
    return [`${cname(c)} / ${fam(f)}`, ...rs.map((r) => `${r.spend}/${r.available}${r.ok ? '' : ' ✗'}`)];
  })));
  out.push('\nFormato: pontos que o conjunto exige / pontos disponíveis no nível. Nenhuma célula excede o disponível (✗ marcaria falha; o validador `npm run validate-data` e o teste `data.test.js` quebram se isso acontecer).\n');
  // builds
  out.push('\n## 4.6 Exemplos de evolução passo a passo\n');
  for (const b of Object.values(loadBuilds())) {
    const { steps, errors } = runBuild(b, data);
    const c = data.classes[b.classId];
    out.push(`\n### ${b.title}\n`);
    out.push(`Começa com ${ATTRS.map((a) => `${A(a)} ${c.start[a]}`).join(', ')}. Cada linha distribui exatamente os 5 pontos do nível; a coluna "Conjunto da faixa" confere, no nível em que a faixa abre, todos os requisitos com os pontos realmente gastos até ali.${errors.length ? ' **ERROS: ' + errors.join('; ') + '**' : ''}\n`);
    out.push(table(['Nível', 'Distribuição', ...ATTRS.map((a) => AB[a]), 'Gastos / disponíveis', 'Conjunto da faixa'], steps.map((s) => [
      s.level, Object.entries(s.alloc).map(([a, v]) => `+${v} ${AB[a]}`).join(', ') || '—', ...ATTRS.map((a) => s.attrs[a]), `${s.spent}/${s.available}`,
      s.unlocked.length ? s.unlocked.map((u) => `${u.ok ? '✔' : '✗'} ${u.name} (${reqStr(u.req)})`).join('<br>') : '',
    ])));
  }
  // fórmulas
  out.push('\n## 4.7 Fórmulas de combate (dados em data/formulas.json)\n');
  const f = data.formulas;
  // magias que somam só uma fração do poder mágico (effect.magicPowerPct; sem o campo, 100%)
  const fracoes = Object.values(data.skills).filter((s) => s.effect.magicPowerPct !== undefined).map((s) => `${s.name} ${s.effect.magicPowerPct}%`);
  out.push([
    `- **Dano físico bruto** = rolagem(dano mín..máx da arma) + ⌊Σ atributo × coeficiente da família⌋. Ex.: machados ${'For×0,30 + Tal×0,10'} (duas mãos: For×0,35), lanças For×0,30 + Tal×0,15, arcos e azagaias Agi×0,30 + Tal×0,10, espadas For×0,30 + Esp×0,10, garras For×0,25 + Tal×0,15.`,
    '- **Habilidade física** = ⌊bruto × (pct + pctPorGrau × (grau − 1)) / 100⌋; efeitos de reforço (ex.: Ímpeto) multiplicam depois.',
    `- **Dano mágico bruto (magia)** = fixo + fixoPorGrau × (grau − 1) + ⌊Espírito × coefEsp⌋ + ⌊poder mágico (arma + foco) × fração / 100⌋, com a fração do poder mágico em 100% salvo onde a habilidade diz outra (${fracoes.join(', ')}). **Ataque básico mágico** = rolagem da arma + ⌊Espírito × ${f.magic.basicSpiCoef}⌋.`,
    `- **Crítico**: chance física = crítico da arma (+ aljava) + Talento × ${f.crit.talCoef} + Agilidade × ${f.crit.agiCoef} − ${f.crit.levelPenaltyPct} por nível que o alvo tiver acima, teto ${f.crit.cap}%; dano ×${n1(f.crit.physMult)}. Mágica = ${f.crit.magic.base} + Espírito × ${f.crit.magic.spiCoef} + Talento × ${f.crit.magic.talCoef}; dano ×${n1(f.crit.magic.mult)}.`,
    `- **Defesa** = Σ defesa dos itens × (1 + ${f.defense.enhancePct}% por refino) + ⌊Vitalidade × ${f.defense.vitCoef}⌋ + nível. **Resistência mágica** = Σ itens + ⌊Espírito × ${f.magicResist.spiCoef}⌋ + ⌊Vitalidade × ${f.magicResist.vitCoef}⌋.`,
    `- **Mitigação** (vale para defesa e resistência): final = round(bruto × K / (K + defesa)), K = ${f.mitigation.base} + ${f.mitigation.perAttackerLevel} × nível do atacante; mínimo 1. Defesa nunca zera o dano e perde força contra atacantes de nível alto.`,
    `- **Precisão física** = Talento × 1 + Agilidade × 0,5 (corpo a corpo) ou Agilidade × 1 + Talento × 0,5 (distância) + nível × ${f.accuracy.perLevel} + precisão da arma/aljava. **Evasão** = ⌊Agilidade × ${f.evasion.agiCoef}⌋ + nível + evasão dos itens.`,
    `- **Chance de acerto físico** = clamp(${f.accuracy.baseHit} + (precisão − evasão) × ${f.accuracy.diffFactor} + (nívelAtacante − nívelAlvo) × ${f.accuracy.levelDiffPct}, ${f.accuracy.minHit}, ${f.accuracy.maxHit})%. **Magia** não usa evasão: clamp(100 + 4 × (nívelAtacante − nívelAlvo), 60, 100)%.`,
    '- **Vida** = vidaBase da classe + Vitalidade × vidaPorVit + (nível − 1) × vidaPorNível. **Mana** = manaBase + Espírito × manaPorEsp + (nível − 1) × manaPorNível.',
  ].join('\n'));
  // exemplos calculados
  const boar = data.monsters.ash_boar;
  const target = { level: boar.level, defense: boar.defense, mres: boar.mres, evasion: boar.evasion };
  const qf = { classId: 'breaker', level: 5, alloc: { str: 5, tal: 3, vit: 12 } };
  const qfStats = derivedStats(qf, ['axe_1h_t5', 'heavy_armor_t5', 'heavy_helm_t1'].map((id) => ({ def: data.items[id] })), data);
  out.push(`\n### Exemplo 1 — ataque básico físico\n\nQuebraferro nível 5 (For ${qfStats.attrs.str}, Tal ${qfStats.attrs.tal}, Agi ${qfStats.attrs.agi}, Vit ${qfStats.attrs.vit}) com **Machado de Pedreira** (9–15) contra **${boar.name}** (nível ${boar.level}, defesa ${boar.defense}, evasão ${boar.evasion}). Rolagens fixas para o exemplo: acerto 0,30; dano 0,50; crítico 0,95.\n`);
  const r1 = playerAttack(qfStats, target, data, seq(0.30, 0.50, 0.95));
  out.push([
    `1. Precisão = Tal ${qfStats.attrs.tal} × 1 + Agi ${qfStats.attrs.agi} × 0,5 + nível 5 × 2 = **${qfStats.accuracy}**.`,
    `2. Acerto = 80 + (${qfStats.accuracy} − ${boar.evasion}) × 0,4 + (5 − 5) × 2 = **${n1(r1.hitChance)}%**. Rolagem ${n1(r1.hitRoll)} < ${n1(r1.hitChance)} → acerta.`,
    `3. Rolagem da arma: 9 + ⌊0,50 × 7⌋ = **${r1.roll}**. Parte de atributos: ⌊${qfStats.attrs.str} × 0,30 + ${qfStats.attrs.tal} × 0,10⌋ = **${r1.attrPart}**. Bruto = **${r1.raw}**.`,
    `4. Crítico = arma 5 + Tal ${qfStats.attrs.tal} × 0,15 + Agi ${qfStats.attrs.agi} × 0,1 = **${n1(r1.critChance)}%**; rolagem ${n1(r1.critRoll)} → sem crítico.`,
    `5. K = 40 + 8 × 5 = **${r1.mitigationK}**. Final = round(${r1.afterCrit} × ${r1.mitigationK} / (${r1.mitigationK} + ${boar.defense})) = **${r1.damage}**.`,
  ].join('\n'));
  const deep = { def: data.skills.deep_cut, rank: 2 };
  const r2 = playerAttack(qfStats, target, data, seq(0.30, 0.50, 0.02), deep);
  out.push(`\n### Exemplo 2 — habilidade física (Talho Profundo, grau 2) com crítico\n\nMesmo atacante e alvo. Rolagens: acerto 0,30; dano 0,50; crítico 0,02.\n`);
  out.push([
    `1. Acerto ${n1(r2.hitChance)}% (igual ao exemplo 1) → acerta.`,
    `2. Bruto da arma = ${r2.roll} + ${r2.attrPart} = ${r2.roll + r2.attrPart}. Percentual do grau 2 = 150 + 12 × 1 = **${r2.skillPct}%** → ⌊${r2.roll + r2.attrPart} × ${r2.skillPct} / 100⌋ = **${r2.raw}**.`,
    `3. Crítico ${n1(r2.critChance)}%; rolagem ${n1(r2.critRoll)} → **crítico**: ⌊${r2.raw} × 1,6⌋ = **${r2.afterCrit}**.`,
    `4. Final = round(${r2.afterCrit} × ${r2.mitigationK} / (${r2.mitigationK} + ${boar.defense})) = **${r2.damage}**.`,
    `5. Sangramento do grau 2: 4 + 2 × 1 = **6 por segundo durante 3 s** (18 no total, sem mitigação), creditado ao Quebraferro para XP e saque.`,
  ].join('\n'));
  const tc = { classId: 'emberweaver', level: 5, alloc: { spi: 5, tal: 2, vit: 6, agi: 1, str: 0 } };
  const tcStats = derivedStats(tc, ['wand_t5', 'focus_t5', 'robe_t5'].map((id) => ({ def: data.items[id] })), data);
  const sparkDef = data.skills.glass_spark;
  const se = sparkDef.effect;
  const spark = { def: sparkDef, rank: 2 };
  const r3 = playerAttack(tcStats, target, data, seq(0.40, 0.90), spark);
  const coef = (v) => String(v).replace('.', ',');
  out.push(`\n### Exemplo 3 — magia (Faísca de Vidro, grau 2)\n\nTecelão da Brasa nível 5 (Esp ${tcStats.attrs.spi}, Tal ${tcStats.attrs.tal}) com **Varinha de Vidro Fosco** (poder mágico ${data.items.wand_t5.magicPower}) e **Foco de Lente de Bomba** (poder mágico ${data.items.focus_t5.magicPower}) contra o mesmo ${boar.name} (resistência mágica ${boar.mres}). Rolagens: acerto 0,40; crítico 0,90.\n`);
  out.push([
    `1. Magia não usa evasão: acerto = clamp(100 + 4 × (5 − 5), 60, 100) = **${r3.hitChance}%** → acerta.`,
    `2. Fixo do grau 2 = ${se.flat} + ${se.flatPerRank || 0} × 1 = **${r3.flat}**. Espírito: ⌊${tcStats.attrs.spi} × ${coef(se.spiCoef)}⌋ = **${r3.spiPart}**. Poder mágico: ${se.magicPowerPct ?? 100}% de (arma + foco) = ⌊${tcStats.magicPower} × ${se.magicPowerPct ?? 100} / 100⌋ = **${r3.magicPower}**. Bruto = **${r3.raw}**.`,
    `3. Crítico mágico = 3 + ${tcStats.attrs.spi} × 0,05 + ${tcStats.attrs.tal} × 0,1 = **${n1(r3.critChance)}%**; rolagem ${n1(r3.critRoll)} → sem crítico.`,
    `4. Final = round(${r3.afterCrit} × ${r3.mitigationK} / (${r3.mitigationK} + ${boar.mres})) = **${r3.damage}** (custa ${sparkDef.mp + (sparkDef.mpPerRank || 0)} de mana no grau 2; recarga ${n1(sparkDef.cooldownMs / 1000)} s).`,
  ].join('\n'));
  const r4 = monsterAttack(boar, qfStats, data, seq(0.30, 0.50, 0.99));
  out.push(`\n### Exemplo 4 — defesa e precisão do lado do monstro\n\nO ${boar.name} (precisão ${boar.accuracy}, dano ${boar.damage.join('–')}) ataca o Quebraferro do exemplo 1 (Couraça de Bronze de Eclusa 13 + Elmo de Ferro Batido ${data.items.heavy_helm_t1.defense}, Vit ${qfStats.attrs.vit}).\n`);
  out.push([
    `1. Defesa = ⌊13 + ${data.items.heavy_helm_t1.defense}⌋ + ⌊${qfStats.attrs.vit} × 0,3⌋ + 5 = **${qfStats.defense}**. Evasão = ⌊${qfStats.attrs.agi} × 0,5⌋ + 5 = **${qfStats.evasion}**.`,
    `2. Acerto = 80 + (${boar.accuracy} − ${qfStats.evasion}) × 0,4 = **${n1(r4.hitChance)}%**; rolagem ${n1(r4.hitRoll)} → acerta.`,
    `3. Rolagem de dano = **${r4.roll}**; crítico de monstro fixo em 5% (rolagem ${n1(r4.critRoll)} → não).`,
    `4. K = 40 + 8 × ${boar.level} = ${mitigationK(boar.level, data)}. Final = round(${r4.roll} × ${mitigationK(boar.level, data)} / (${mitigationK(boar.level, data)} + ${qfStats.defense})) = **${r4.damage}** de ${qfStats.maxHp} de vida.`,
  ].join('\n'));
  out.push(`\nOs mesmos números saem de \`server/src/rules.js\`; o teste \`rules.test.js\` fixa rolagens e confere os resultados. Crítico físico do exemplo: ${n1(physicalHitChance(qfStats.accuracy, boar.evasion, 5, 5, data))}% de acerto e ${n1(qfStats.crit)}% de crítico por golpe.\n`);
  return out.join('\n');
}

writeFileSync(join(DOCS, '03-classes.md'), classesDoc());
writeFileSync(join(DOCS, '04-progressao-e-formulas.md'), progressionDoc());
console.log('docs/03-classes.md e docs/04-progressao-e-formulas.md gerados.');
