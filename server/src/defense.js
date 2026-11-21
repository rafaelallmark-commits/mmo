// Defesa (capítulo 2, "O Teste de Pressão"): Joca abre a válvula principal parado no lugar enquanto ondas de
// monstros vêm do canal e miram nele. Reaproveita a escolta (escort.js): a mesma entidade "e" no snapshot,
// os monstros com escortTarget que batem nela até alguém do grupo chamar a atenção (D73), o aviso por
// mensagem "escort" e o crédito para quem está por perto no fim. Vence quem mantiver Joca vivo até o fim do
// cronômetro do servidor; se ele cair (ou o grupo inteiro cair), as ondas somem e ele tenta de novo em 30 s,
// sem perder nada das missões anteriores. Sem ninguém do grupo na zona por 60 s, a defesa acaba (dá para
// recomeçar na válvula).
import { Escort } from './escort.js';

const ABANDON_MS = 60000;
const CREDIT_R = 40;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Defense extends Escort {
  constructor(zone, defId, def, owner, partyId, seq) {
    // a escolta precisa de start/route: a defesa fica parada no próprio ponto
    super(zone, defId, { ...def, start: { x: def.x, z: def.z }, route: [] }, owner, partyId, seq);
    this.isDefense = true;
    this.begin();
  }

  // (re)começa: vida cheia, cronômetro do zero e as ondas desde a primeira
  begin() {
    const z = this.zone;
    this.x = this.def.x; this.z = this.def.z;
    this.hp = this.mhp;
    this.state = 'moving'; // "moving" = defesa em andamento (os monstros só batem fora de broken/arrived)
    this.startedAt = z.now;
    this.wave = 0;
    this.notify(`${this.def.name} começou a abrir a válvula. Segurem as ondas por ${Math.round(this.def.durationMs / 60000)} minutos!`, { started: true, msLeft: this.msLeft() });
    this.spawnDue(); // a primeira onda já vem
  }

  // ondas cujo tempo já chegou
  spawnDue() {
    const waves = this.def.waves ?? [];
    const elapsed = this.zone.now - this.startedAt;
    while (this.wave < waves.length && elapsed >= waves[this.wave].atMs) this.spawnWave(this.wave++);
  }

  msLeft() { return Math.max(0, Math.round(this.def.durationMs - (this.zone.now - this.startedAt))); }

  clearWave() {
    for (const m of this.zone.monsters.values()) if (m.escortTarget === this.eid && m.state !== 'dead') { m.state = 'dead'; m.hp = 0; m.removeAt = this.zone.now; }
  }

  tick() {
    const z = this.zone;
    const all = this.escorts(false);
    if (all.length) this.lastSeenAt = z.now;
    else if (z.now - this.lastSeenAt > ABANDON_MS) return 'abandoned';
    if (this.state === 'arrived') return z.now - this.arrivedAt > 5000 ? 'done' : null;
    if (this.state === 'broken') {
      // caído: depois do intervalo, recomeça assim que alguém do grupo estiver perto
      if (z.now >= this.brokenUntil && all.some((p) => !p.char.dead && dist(p.char, this) <= this.def.followRadius)) this.begin();
      return null;
    }
    // o grupo inteiro caído conta como perder a válvula
    if (all.length && all.every((p) => p.char.dead)) { this.fall('Todos caíram'); return null; }
    this.spawnDue();
    if (z.now - this.startedAt >= this.def.durationMs) this.win();
    return null;
  }

  spawnWave(i) {
    const z = this.zone;
    const w = this.def.waves[i];
    const points = this.def.spawnAt ?? [{ x: this.x + 12, z: this.z }];
    let k = 0;
    for (const [monster, count] of w.monsters) {
      for (let n = 0; n < count; n++, k++) {
        const sp = points[k % points.length];
        const m = z.spawnMonster({ monster, x: sp.x, z: sp.z, radius: 2, count: 1 }, { noRespawn: true });
        m.escortTarget = this.eid;
        m.temp = true;
        m.state = 'chase';
      }
    }
    this.notify(`Onda ${i + 1} de ${this.def.waves.length} vem do canal!`, { wave: i + 1, waves: this.def.waves.length, msLeft: this.msLeft() });
  }

  win() {
    const z = this.zone;
    this.state = 'arrived';
    this.arrivedAt = z.now;
    this.clearWave();
    const credited = this.escorts(false).filter((p) => dist(p.char, this) <= CREDIT_R);
    this.notify(`${this.def.name} abriu a válvula. A pressão se manteve!`, { won: true, arrived: true });
    z.hooks.onEscortArrived?.(this, credited);
  }

  fall(why) {
    const z = this.zone;
    this.state = 'broken';
    this.hp = 0;
    this.brokenUntil = z.now + (this.def.retryMs ?? 30000);
    this.clearWave();
    this.notify(`${why ? `${why}: ` : ''}${this.def.name} caiu e a válvula fechou. Ele tenta de novo em ${Math.round((this.def.retryMs ?? 30000) / 1000)} s.`, { down: true, retryMs: this.def.retryMs ?? 30000 });
  }

  // dano dos monstros (monsterTick da escolta chama)
  damage(amount) {
    if (this.state !== 'moving') return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.fall(null);
  }

  view() {
    return { ...super.view(), npc: this.def.npc ?? null, def: this.def.model ?? 'npc' };
  }
}
