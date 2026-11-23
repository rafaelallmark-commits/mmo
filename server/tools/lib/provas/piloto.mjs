// Piloto das provas de classe: joga cada prova como a dica dela ensina, só pelo protocolo (mover, atacar,
// conjurar, beber tônico) e com o que o cliente vê (snapshots, mensagens 'trial' e 'warn'). Usado pelos
// testes (server/test/provas.test.js), pela bancada de provas (npm run provas) e pelo robô da simulação
// de progressão. Não lê o estado interno da zona.
//
// Interface:
//   const piloto = criarPiloto(classId, data, { semHabilidade, miraNoAlvo })
//     semHabilidade: nunca usa a do nível 10; miraNoAlvo: a Ruptura vai com o pilar selecionado (um por vez),
//     como faria quem não descobriu o cone sem alvo
//   piloto.decidir(v, a)
//     v: { agora, eu: entidade do snapshot, ents: Map, char, prova: { iniciada, status }, avisos: [{x, z, radius, ate, kind}] }
//     a: { mover(x, z), atacar(eid), parar(), lancar(skill, { target, x, z, ally }) -> resposta, tonico(), pronta(skill) }

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const norm = (x, z) => { const d = Math.hypot(x, z) || 1; return { x: x / d, z: z / d }; };
const vivos = (v, def) => [...v.ents.values()].filter((e) => e.k === 'm' && e.def === def && !e.dead);
const aliados = (v) => [...v.ents.values()].filter((e) => e.k === 'a');
const perto = (v, list, p) => list.slice().sort((a, b) => dist(a, p) - dist(b, p));
const temFx = (e, kind) => Array.isArray(e.fx) && e.fx.includes(kind);
const ARENA = { min: 1.8, max: 34.2 };
const dentro = (p) => ({ x: clamp(p.x, ARENA.min, ARENA.max), z: clamp(p.z, ARENA.min, ARENA.max) });

// Sai de baixo de um aviso no chão (pedra do teto): passo para fora do círculo, longe do centro.
function fugirDeAviso(v, a, longeDe = null) {
  const eu = v.eu;
  const perigo = v.avisos.find((w) => w.ate > v.agora && dist(eu, w) <= w.radius + 0.7);
  if (!perigo) return false;
  let d = norm(eu.x - perigo.x, eu.z - perigo.z);
  if (dist(eu, perigo) < 0.2) d = longeDe ? norm(longeDe.x - eu.x, longeDe.z - eu.z) : { x: 1, z: 0 };
  let alvo = dentro({ x: perigo.x + d.x * (perigo.radius + 1.6), z: perigo.z + d.z * (perigo.radius + 1.6) });
  // canto da arena: tenta o lado
  if (dist(alvo, perigo) < perigo.radius + 0.8) alvo = dentro({ x: perigo.x - d.z * (perigo.radius + 1.6), z: perigo.z + d.x * (perigo.radius + 1.6) });
  a.mover(alvo.x, alvo.z);
  return true;
}

function beberSePreciso(v, a, frac = 0.4) {
  if (v.eu && !v.eu.dead && v.eu.hp / v.eu.mhp < frac) a.tonico();
}

// ---------------------------------------------------------------- uma regra por classe
const REGRAS = {
  // Quebraferro: parado de frente para dois pilares, Ruptura; com a blindagem rachada, golpes até fechar.
  pillars(v, a, o) {
    const pilares = vivos(v, 'trial_pillar');
    if (!pilares.length) return;
    if (fugirDeAviso(v, a, pilares[0])) return;
    beberSePreciso(v, a);
    const blindados = pilares.filter((p) => temFx(p, 'armor'));
    const rachados = pilares.filter((p) => !temFx(p, 'armor'));
    const mp = v.char?.mp ?? 0;
    // guarda mana para a Ruptura enquanto houver pilar blindado (o nível 10 tem pouca)
    const reserva = blindados.length && !o.semHabilidade ? 20 : 0;
    if (rachados.length && !(blindados.length >= 2 && mp >= 20 && a.pronta('rupture') && !o.semHabilidade)) {
      const alvo = rachados.reduce((b, p) => (p.hp < b.hp ? p : b));
      a.atacar(alvo.id);
      if (a.pronta('deep_cut') && mp - 6 >= reserva && dist(v.eu, alvo) <= 3.2) a.lancar('deep_cut', { target: alvo.id });
      return;
    }
    if (!blindados.length) return;
    if (o.miraNoAlvo && !o.semHabilidade) {
      // como quem clica no pilar e usa a Ruptura com ele selecionado: o cone sai na direção do alvo e racha um
      // pilar por vez; esperando a mana, fica parado (bater na blindagem prende a mana em combate)
      const p = perto(v, blindados, v.eu)[0];
      if (dist(v.eu, p) > 2.4) { const d = norm(v.eu.x - p.x, v.eu.z - p.z); const q = dentro({ x: p.x + d.x * 2.1, z: p.z + d.z * 2.1 }); a.mover(q.x, q.z); return; }
      if (a.pronta('rupture') && mp >= 20) a.lancar('rupture', { target: p.id });
      return;
    }
    // posição para pegar dois blindados no cone (ponto a 2,3 m do meio do par, do lado de cá)
    let melhor = null;
    for (let i = 0; i < blindados.length; i++) {
      for (let j = i + 1; j < blindados.length; j++) {
        const A = blindados[i], B = blindados[j];
        if (dist(A, B) > 4.6) continue;
        const m = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
        let n = norm(-(B.z - A.z), B.x - A.x);
        if ((v.eu.x - m.x) * n.x + (v.eu.z - m.z) * n.z < 0) n = { x: -n.x, z: -n.z };
        const ponto = dentro({ x: m.x + n.x * 2.3, z: m.z + n.z * 2.3 });
        const custo = dist(v.eu, ponto) - (A.hp + B.hp) / 400;
        if (!melhor || custo < melhor.custo) melhor = { ponto, mira: m, custo };
      }
    }
    if (!melhor) {
      const p = perto(v, blindados, v.eu)[0];
      const d = norm(v.eu.x - p.x, v.eu.z - p.z);
      melhor = { ponto: dentro({ x: p.x + d.x * 2.2, z: p.z + d.z * 2.2 }), mira: p };
    }
    if (o.semHabilidade) { a.atacar(perto(v, blindados, v.eu)[0].id); return; } // sem a Ruptura, só resta bater na blindagem
    if (dist(v.eu, melhor.ponto) > 0.45) { a.mover(melhor.ponto.x, melhor.ponto.z); return; }
    // parado (sem bater na blindagem, que segura a mana em combate) até ter mana para a Ruptura
    if (a.pronta('rupture') && mp >= 20) a.lancar('rupture', { x: melhor.mira.x, z: melhor.mira.z });
  },

  // Bastião: perto do aprendiz; Pulso de Atração em quem vai nele, Reforço de Campo antes da investida.
  hold(v, a, o) {
    const al = aliados(v)[0];
    if (!al) return;
    beberSePreciso(v, a);
    const ms = vivos(v, 'trial_construct');
    const alerta = v.prova.status?.alert ?? '';
    const noAliado = ms.filter((m) => m.tgt === al.id);
    const mp = v.char?.mp ?? 0;
    // a mana do nível 10 mal dá para um Reforço de Campo: fica guardada até a investida
    const reserva = !o.semHabilidade && (v.char?.cooldowns?.field_reinforcement ?? 0) === 0 && a.pronta('field_reinforcement') ? 24 : 0;
    if (!o.semHabilidade && a.pronta('field_reinforcement') && mp >= 24 && dist(v.eu, al) <= 6.5 && (alerta.includes('nvestida') || (al.hp / al.mhp < 0.35 && noAliado.length >= 2))) {
      a.lancar('field_reinforcement');
    }
    if (a.pronta('pull_pulse') && mp - 7 >= reserva && ms.some((m) => dist(m, v.eu) <= 6.5 && m.tgt === al.id)) a.lancar('pull_pulse');
    if (a.pronta('dynamic_plate') && mp - 6 >= reserva + 7 && ms.filter((m) => m.tgt === v.eu.id).length >= 2) a.lancar('dynamic_plate');
    if (dist(v.eu, al) > 4.5) {
      const d = norm(v.eu.x - al.x, v.eu.z - al.z);
      a.mover(al.x + d.x * 1.5, al.z + d.z * 1.5);
      return;
    }
    const alvo = perto(v, noAliado.length ? noAliado : ms, v.eu)[0];
    if (alvo) a.atacar(alvo.id);
  },

  // Lanceiro: da ponta da fila, Linha Partida e Estocada ao longo dela; Avanço do Fosso no meio; golpes nos
  // mais feridos (boneco que fica 3 s sem apanhar volta inteiro).
  rows(v, a, o) {
    const cfg = v.prova.cfg;
    const feitas = new Set((v.prova.status?.marks ?? []).filter((m) => m.done).map((m) => m.id));
    const ri = cfg.rows.findIndex((_, i) => !feitas.has(`row${i + 1}`));
    if (ri < 0) return;
    const row = cfg.rows[ri];
    const A = { x: row.from[0], z: row.from[1] }, B = { x: row.to[0], z: row.to[1] };
    const u = norm(B.x - A.x, B.z - A.z);
    const len = dist(A, B);
    const daFila = vivos(v, 'trial_dummy').filter((d) => {
      const t = (d.x - A.x) * u.x + (d.z - A.z) * u.z;
      return t > -1 && t < len + 1 && Math.abs((d.x - A.x) * u.z - (d.z - A.z) * u.x) < 1;
    });
    if (!daFila.length) return;
    const ponta = dentro({ x: A.x - u.x * 1.3, z: A.z - u.z * 1.3 });
    const mp = v.char?.mp ?? 0;
    const meio = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
    const feridos = daFila.filter((d) => d.hp < d.mhp);
    const comeco = feridos.length === 0 && daFila.length === row.count;
    // fosso entre o Lanceiro e a fila: salta com o Avanço do Fosso da beirada (sem ele, dá a volta a pé)
    const fosso = (cfg.blocked ?? []).find((b) => b.z0 >= v.eu.z - 0.2 && b.z1 <= meio.z && meio.x >= b.x0 && meio.x <= b.x1);
    if (fosso && !o.semHabilidade) {
      const beirada = dentro({ x: clamp(meio.x, fosso.x0 + 1, fosso.x1 - 1), z: fosso.z0 - 0.7 });
      if (dist(v.eu, beirada) > 0.5) { a.mover(beirada.x, beirada.z); return; }
      if (mp >= 22 && a.pronta('moat_charge')) a.lancar('moat_charge', { target: perto(v, daFila, meio)[0].id });
      return; // espera a mana na beirada, parado (fora de combate ela volta mais rápido)
    }
    if (comeco) {
      // fila inteira de pé: só começa com mana para a Linha Partida
      if (dist(v.eu, ponta) > 0.5) { a.mover(ponta.x, ponta.z); return; }
      if (mp >= 14 && a.pronta('split_line')) a.lancar('split_line', { x: B.x + u.x, z: B.z + u.z });
      return;
    }
    if (a.pronta('split_line') && mp >= 14 && daFila.length >= 2) {
      if (dist(v.eu, ponta) > 0.5) { a.mover(ponta.x, ponta.z); return; }
      a.lancar('split_line', { x: B.x + u.x, z: B.z + u.z });
      return;
    }
    if (!o.semHabilidade && a.pronta('moat_charge') && mp >= 22) {
      const alvo = perto(v, daFila, meio)[0];
      if (dist(v.eu, alvo) <= 9.5 && dist(v.eu, alvo) > 2) { a.lancar('moat_charge', { target: alvo.id }); return; }
    }
    const alvo = (feridos.length ? feridos : daFila).reduce((b, d) => (d.hp < b.hp ? d : b));
    if (a.pronta('long_thrust') && mp >= 7 && dist(v.eu, alvo) <= 4.5) a.lancar('long_thrust', { target: alvo.id });
    a.atacar(alvo.id);
  },

  // Vigia: no posto de tiro, Chuva de Espinhos à frente da fila, Marca da Trilha e golpes nos mais feridos.
  targets(v, a, o) {
    const cfg = v.prova.cfg, post = cfg.post;
    const alvos = vivos(v, 'trial_target');
    const eu = v.eu;
    const alcance = (v.char?.stats?.range ?? 18) - 0.6;
    const zPosto = post.z1 - 0.5;
    if (!alvos.length) {
      if (eu.z > post.z1 - 0.2 || dist(eu, { x: 18, z: zPosto }) > 3) a.mover(18, zPosto);
      return;
    }
    // fica no posto, embaixo da fila que está passando; só anda quando nada está ao alcance (andar para o tiro)
    const meio = alvos.reduce((s, t) => ({ x: s.x + t.x / alvos.length, z: s.z + t.z / alvos.length }), { x: 0, z: 0 });
    const vx = alvos.reduce((s, t) => s + (t.vx ?? 0), 0) / alvos.length;
    if (eu.z > post.z1 - 0.15) { a.mover(clamp(eu.x, post.x0 + 1, post.x1 - 1), zPosto); return; }
    const noAlcance = alvos.filter((t) => dist(eu, t) <= alcance);
    const mp = v.char?.mp ?? 0;
    if (!o.semHabilidade && a.pronta('thorn_rain') && mp >= 26) {
      // à frente da fila: onde ela vai estar no meio da chuva
      const mira = { x: meio.x + vx * 1.3, z: meio.z };
      const pega = alvos.filter((t) => Math.hypot(t.x + (t.vx ?? 0) * 1.3 - mira.x, t.z - mira.z) <= 4.5).length;
      if (pega >= 3 && dist(eu, mira) <= 17.6) { a.lancar('thorn_rain', { x: mira.x, z: mira.z }); return; }
    }
    if (!noAlcance.length) { a.mover(clamp(meio.x + vx * 2, post.x0 + 1, post.x1 - 1), zPosto); return; }
    // a mana vai primeiro para a Chuva de Espinhos; sobrando, Flecha de Passagem e Marca da Trilha
    const sobra = mp - (o.semHabilidade ? 0 : 26);
    if (a.pronta('passage_arrow') && sobra >= 12) {
      let best = null;
      for (const t of noAlcance) {
        const d = norm(t.x - eu.x, t.z - eu.z);
        const n = alvos.filter((q) => { const al = (q.x - eu.x) * d.x + (q.z - eu.z) * d.z; return al > 0 && al < 20 && Math.abs((q.x - eu.x) * d.z - (q.z - eu.z) * d.x) < 1.2; }).length;
        if (!best || n > best.n) best = { t, n };
      }
      if (best && best.n >= 2) { a.lancar('passage_arrow', { target: best.t.id }); return; }
    }
    if (a.pronta('trail_mark') && sobra >= 6) {
      const m = noAlcance.filter((t) => !temFx(t, 'mark')).sort((x, y) => y.hp - x.hp)[0];
      if (m) { a.lancar('trail_mark', { target: m.id }); return; }
    }
    // o mais ferido; empate: o que está mais perto de escapar (mais longe do começo do trilho)
    const alvo = noAlcance.reduce((b, t) => (t.hp < b.hp || (t.hp === b.hp && Math.abs(t.vx ?? 0) * Math.sign(t.vx ?? 0) * t.x > Math.sign(b.vx ?? 0) * b.x) ? t : b));
    a.atacar(alvo.id);
  },

  // Escudeiro: Juramento no peregrino, atiradores primeiro (só miram nele), construtos que vão nele depois.
  escort(v, a, o) {
    const al = aliados(v)[0];
    if (!al || al.dead) return;
    beberSePreciso(v, a);
    const ms = [...vivos(v, 'trial_construct'), ...vivos(v, 'trial_archer'), ...vivos(v, 'trial_sentinel')];
    if (ms.length) {
      if (!o.semHabilidade && a.pronta('oath') && dist(v.eu, al) <= 9.5) a.lancar('oath', { ally: al.id });
      if (a.pronta('dawn_guard') && dist(v.eu, al) <= 5.5 && al.hp / al.mhp < 0.8) a.lancar('dawn_guard');
      const atir = ms.filter((m) => m.def === 'trial_archer');
      const nela = ms.filter((m) => m.tgt === al.id && m.def !== 'trial_archer');
      // construto batendo nela e perto: um golpe tira a atenção dele; depois os atiradores
      const alvo = (nela.length && dist(perto(v, nela, v.eu)[0], v.eu) < 6 ? perto(v, nela, v.eu)[0] : null) ?? perto(v, atir, v.eu)[0] ?? perto(v, nela, v.eu)[0] ?? perto(v, ms, v.eu)[0];
      a.atacar(alvo.id);
      if (a.pronta('solar_cut') && dist(v.eu, alvo) <= 3) a.lancar('solar_cut', { target: alvo.id });
      return;
    }
    // sem monstros: anda junto, um pouco à frente na direção do portão
    const fim = v.prova.cfg.route.at(-1);
    const d = norm(fim[0] - al.x, fim[1] - al.z);
    const ponto = dentro({ x: al.x + d.x * 2.2, z: al.z + d.z * 2.2 });
    if (dist(v.eu, ponto) > 1.5) a.mover(ponto.x, ponto.z);
  },

  // Andarilha: arremessa no sino aceso de longe e recua quando um perseguidor chega perto.
  course(v, a, o) {
    const sino = vivos(v, 'trial_bell').find((b) => !temFx(b, 'idle'));
    const eu = v.eu;
    beberSePreciso(v, a, 0.5);
    const ps = perto(v, vivos(v, 'trial_runner'), eu);
    const dmin = ps.length ? dist(ps[0], eu) : 99;
    const fuga = () => {
      let fx = 0, fz = 0;
      for (const p of ps) { const d = Math.max(0.5, dist(p, eu)); fx += (eu.x - p.x) / (d * d); fz += (eu.z - p.z) / (d * d); }
      // paredes também empurram
      for (const [w, k] of [[eu.x - ARENA.min, 1], [ARENA.max - eu.x, -1]]) if (w < 6) fx += k * (6 - w) * 0.15;
      for (const [w, k] of [[eu.z - ARENA.min, 1], [ARENA.max - eu.z, -1]]) if (w < 6) fz += k * (6 - w) * 0.15;
      // de leve para o lado do sino, para não fugir para longe dele
      if (sino) { const s = norm(sino.x - eu.x, sino.z - eu.z); fx += s.x * 0.04; fz += s.z * 0.04; }
      return norm(fx, fz);
    };
    const mp = v.char?.mp ?? 0;
    // Vento a Favor para os trechos finais, quando os perseguidores já aceleraram
    const sinosFeitos = v.prova.status?.marks?.filter((m) => m.done).length ?? 0;
    if (!o.semHabilidade && a.pronta('tailwind') && dmin < 10 && mp >= 24 && sinosFeitos >= 2) a.lancar('tailwind');
    if (dmin < 2.4 && a.pronta('side_step') && mp >= 8) {
      const d = fuga();
      a.lancar('side_step', { x: eu.x + d.z, z: eu.z - d.x }); // lateral de (d.z, -d.x) = d
      return;
    }
    const ds = sino ? dist(eu, sino) : 99;
    // bate: o arremesso sai na hora em que chega ao alcance; recua até o próximo poder sair
    const intervalo = (v.char?.stats?.attackIntervalMs ?? 1100) + 100;
    if (sino && ds <= 13.2 && v.agora - (v.ultimoGolpe ?? -1e9) >= intervalo && dmin > 3) {
      a.atacar(sino.id);
      if (a.pronta('return_throw') && mp >= 9 + (o.semHabilidade ? 0 : 8)) a.lancar('return_throw', { target: sino.id });
      return;
    }
    if (dmin < 6) {
      const d = fuga();
      const p = dentro({ x: eu.x + d.x * 6, z: eu.z + d.z * 6 });
      a.mover(p.x, p.z);
      return;
    }
    if (!sino) return;
    if (ds <= 13.2) return; // esperando o próximo arremesso, sem perseguidor por perto
    // aproxima pelo lado longe dos perseguidores, a 11 m do sino
    let d = norm(eu.x - sino.x, eu.z - sino.z);
    if (ps.length) { const f = fuga(); d = norm(d.x + f.x * 0.7, d.z + f.z * 0.7); }
    const p = dentro({ x: sino.x + d.x * 11, z: sino.z + d.z * 11 });
    a.mover(p.x, p.z);
  },

  // Cantora: Selo do Véu no aprendiz marcado para o jato; Canto de Amparo no mais ferido.
  vigil(v, a, o) {
    const als = aliados(v).filter((x) => !x.dead);
    if (!als.length) return;
    const eu = v.eu;
    const centro = als.reduce((s, x) => ({ x: s.x + x.x / als.length, z: s.z + x.z / als.length }), { x: 0, z: 0 });
    if (dist(eu, centro) > 2) { a.mover(centro.x, centro.z); }
    const jato = v.prova.status?.jet;
    const alvoJato = jato ? als.find((x) => x.id === jato.eid) : null;
    if (alvoJato && !o.semHabilidade && a.pronta('veil_seal') && !(alvoJato.sh > 0)) { a.lancar('veil_seal', { ally: alvoJato.id }); return; }
    if (!a.pronta('sustain_chant')) return;
    // quem vai levar o jato precisa de vida para o que passar do selo
    if (alvoJato && alvoJato.hp < alvoJato.mhp * 0.75) { a.lancar('sustain_chant', { ally: alvoJato.id }); return; }
    const ferido = als.reduce((b, x) => (x.hp / x.mhp < b.hp / b.mhp ? x : b));
    if (ferido.mhp - ferido.hp >= 30 || ferido.hp / ferido.mhp < 0.6) a.lancar('sustain_chant', { ally: ferido.id });
  },

  // Tecelão: Círculo de Fuligem quando a onda chega a 5 m, Chão em Brasa à frente dela, Faísca na que escapa.
  waves(v, a, o) {
    const cfg = v.prova.cfg;
    const eu = v.eu;
    beberSePreciso(v, a);
    const fag = vivos(v, 'trial_spark');
    const cons = vivos(v, 'trial_construct');
    const linha = cfg.line;
    if (!fag.length) {
      const c = perto(v, cons, eu)[0];
      if (c) { a.atacar(c.id); if (a.pronta('glass_spark')) a.lancar('glass_spark', { target: c.id }); return; }
      if (dist(eu, { x: 18, z: linha + 5 }) > 1.5) a.mover(18, linha + 5);
      return;
    }
    // as fagulhas convergem para a saída: perto da linha elas passam todas a poucos metros do meio
    const posto = { x: 18, z: linha + 3.5 };
    const mp = v.char?.mp ?? 0;
    const lead = fag.reduce((b, f) => (f.z < b.z ? f : b));
    const perto5 = fag.filter((f) => dist(f, eu) <= 4.7);
    if (!o.semHabilidade && a.pronta('soot_circle') && mp >= 30
      && (perto5.length >= Math.max(2, Math.ceil(fag.length * 0.7)) || (perto5.length >= 1 && lead.z < linha + 2.5))) { a.lancar('soot_circle'); return; }
    // Chão em Brasa no bando que vem (lento, ele se junta), guardando mana para o Círculo
    const reserva = !o.semHabilidade && (a.pronta('soot_circle') || mp < 60) ? 30 : 0;
    if (a.pronta('ember_ground') && mp - 24 >= reserva) {
      const vindo = fag.filter((f) => f.z > linha + 7 && f.z < linha + 22);
      if (vindo.length >= 3) {
        const m = vindo.reduce((s, f) => ({ x: s.x + f.x / vindo.length, z: s.z + f.z / vindo.length }), { x: 0, z: 0 });
        const mira = dentro({ x: m.x + (18 - m.x) * 0.2, z: m.z - 2.5 });
        if (dist(eu, mira) <= 15.5) { a.lancar('ember_ground', { x: mira.x, z: mira.z }); return; }
      }
    }
    // a Faísca só para a que vai escapar (a mana é do Círculo)
    const solta = fag.filter((f) => !temFx(f, 'root')).sort((x, y) => x.z - y.z)[0] ?? lead;
    if (a.pronta('glass_spark') && dist(eu, solta) <= 15.5 && solta.z < linha + 5 && mp - 12 >= (a.pronta('soot_circle') ? 30 : 0)) a.lancar('glass_spark', { target: solta.id });
    if (dist(eu, posto) > 1) { a.mover(posto.x, posto.z); return; }
    if (dist(eu, solta) <= (v.char?.stats?.range ?? 16) - 0.5) a.atacar(solta.id);
  },
};

export function criarPiloto(classId, data, opcoes = {}) {
  const cfg = data.maps.arena_prova.trial.classes[classId];
  const regra = REGRAS[cfg.kind];
  return {
    kind: cfg.kind,
    cfg,
    decidir(v, a) {
      if (!v.eu || v.eu.dead) return;
      v.prova.cfg = cfg;
      regra(v, a, opcoes);
    },
  };
}
