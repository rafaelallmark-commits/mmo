// Bot de caça solo para a simulação de progressão. Joga como um jogador razoável da classe:
// distribui atributos pelo plano, compra graus de habilidade, escolhe a área de caça do nível,
// puxa monstros pela borda do grupo, usa habilidades (respeitando a recarga global e conjurando
// parado) e tônicos, recolhe o saque, vende o que não usa, compra o equipamento da faixa no armeiro,
// equipa melhorias, descansa, foge quando vai morrer e volta do posto depois de cair.
// Toda AÇÃO sai como mensagem do protocolo (move, attack, cast, use_item, pickup, equip,
// allocate, learn_skill, buy, sell, respawn, gm...). As DECISÕES usam o que um cliente sabe: a visão
// montada pelos snapshots e a ficha do personagem que o servidor devolve (pedido 'char').
import { IMPLEMENTED_KINDS } from '../../../src/skills.js';
import { requirementFailures } from '../../../src/equipment.js';
import { ClienteEmProcesso } from './cliente.mjs';
import {
  FAIXAS, kitPadrao, kitDaFaixa, joiasDaFaixa, planoAtributos, prioridadeHabilidades, valorItem,
  grafoMapas, rota, cidadeDaClasse, areasDeCaca, escolherArea,
} from './planos.mjs';

export const PADROES = {
  reacaoMs: 200, // o bot decide a cada 200 ms (tempo de reação)
  pausaAposAbateMs: 500, // depois de cada abate, meio segundo para "procurar" o próximo alvo
  viagemPorMapaMs: 60_000, // custo fixo de cada troca de mapa (teleporte de mestre + espera)
  esperaMorteMs: 5_000, // tempo caído antes de pedir o retorno ao posto
  pocaoVidaPct: 0.4, // tônico de vida abaixo de 40% em combate
  recuperarVidaPct: 0.55, // fora de combate, abaixo de 55%: tônico; sem tônico, descansa...
  vidaAlvoPct: 0.92, // ... até 92%
  fugaVidaPct: 0.2, // foge abaixo de 20% sem tônico disponível
  estoqueVida: 100, // na loja, compra até ter 100 tônicos de vida (até 80% do ouro)
  estoqueManaConjurador: 60,
  estoqueManaOutros: 10,
  minimoParaComprar: 5, // vai à cidade quando sobram menos de 5...
  reservaPocoes: 15, // ...e fora de combate só bebe tônico se tiver mais que essa reserva
  estoqueMinimoVida: 60, // no armeiro, guarda ouro para ao menos 60 tônicos de vida antes do equipamento
  folgaBolsaSucata: 5, // só recolhe sucata (para vender) com mais de 5 espaços livres na bolsa
  intervaloIdaEquipMs: 10 * 60_000, // no máximo uma ida à cidade só por equipamento a cada 10 min
  prova: true, // faz a prova de classe no nível 10 (libera a habilidade do nível 10)
  semAbateMaxMs: 15 * 60_000, // sem abate por 15 min simulados: vigia destrava (posto + outra área)
  detalhe: false,
};

const CONJURADORES = new Set(['emberweaver', 'veilsinger']);
const DANO = new Set(['strike', 'spell', 'cone_strike', 'line_strike', 'aoe_strike', 'aoe_spell', 'ground_aoe', 'delayed_aoe', 'charge', 'aura_damage', 'pull']);
const DEFESA = new Set(['buff_self', 'party_buff', 'guard_ally', 'taunt_area', 'shield_self', 'shield_ally']);
const POCOES_VIDA = ['potion_hp_m', 'potion_hp_s'];
const POCOES_MANA = ['potion_mp_m', 'potion_mp_s'];
const TEMPOS = ['combate', 'deslocamento', 'saque', 'espera', 'descanso', 'fuga', 'morto', 'viagem', 'cidade', 'prova'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const SAQUE_VALIDADE_MS = 30 * 60_000; // o saque no chão vence em 30 min (LOOT_TTL_MS de zone.js)

function cadeiaDe(questId, quests, out = []) {
  for (const pr of quests[questId]?.prereq ?? []) { cadeiaDe(pr, quests, out); if (!out.includes(pr)) out.push(pr); }
  return out;
}

export class BotProgressao {
  constructor({ server, classId, seed = 1, ateNivel = 20, opcoes = {}, aoNivel = null }) {
    this.server = server;
    this.data = server.data;
    this.classId = classId;
    this.seed = seed;
    this.ateNivel = Math.min(ateNivel, this.data.levelCap);
    this.op = { ...PADROES, ...opcoes };
    this.aoNivel = aoNivel;
    // o bot é determinístico: a aleatoriedade vem só do RNG semeado do servidor (seed)
    this.cli = new ClienteEmProcesso(server, `b${classId.slice(0, 4)}${seed}`);
    this.cli.aoEvento = (m) => this.evento(m);
    this.cli.aoCombate = (m) => this.combate(m);
    this.dano = { porFonte: {}, causado: 0, golpes: 0, erros: 0, criticos: 0, recebido: 0, golpesRecebidos: 0, errosRecebidos: 0, cura: 0 };
    this.cls = this.data.classes[classId];
    this.plano = planoAtributos(classId, this.data);
    this.prioridade = prioridadeHabilidades(classId, this.data);
    this.kit = kitPadrao(classId, this.data);
    this.adj = grafoMapas(this.data);
    this.areas = areasDeCaca(this.data);
    this.cidade = cidadeDaClasse(classId, this.data);
    this.cadeiaProva = cadeiaDe('c3_trial', this.data.quests);
    this.conjurador = CONJURADORES.has(classId);
    this.distancia = this.data.items[`${this.kit.arma}_t1`].range > 5;
    this.ordemCombate = this.montarOrdemCombate();
    this.pickupRange = this.data.formulas.movement.pickupRange;
    this.tolerancia = this.data.formulas.movement.rangeTolerance;
    // estado
    this.now = 0; this.ultimoTick = 0; this.proximoPensar = 0;
    this.char = null; this.charEm = -1e9; this.eid = null; this.level = 1; this.mapa = null; this.instancia = null;
    this.nivelAlocado = 1; this.kitVerificado = new Set();
    this.atividade = 'espera'; this.esperaAte = 0;
    this.alvoId = null; this.alvoDesde = 0; this.alvoVidaInicio = 0; this.evitarAlvo = new Map();
    this.andando = null; this.descansando = false; this.descansoDesde = 0; this.fuga = null;
    this.cd = {}; this.buffAte = {}; this.potPronto = 0;
    this.gcdAte = 0; this.conjurando = null; // recarga global e conjuração em andamento ({ skill, ate })
    this.ultimaIdaEquip = -1e9;
    this.saque = new Map(); this.falhasSaque = new Map();
    this.area = null; this.reavaliarArea = true; this.ajuste = 0; this.ajusteAte = 0; this.evitarArea = new Map();
    this.tarefa = null; this.tentativasProva = 0; this.provaInicio = 0;
    this.pendenteNivel = false; this.morto = false; this.morteEm = 0;
    this.ultimoAbate = 0; this.terminou = false;
    // métricas
    this.niveis = new Map();
    this.equipamento = []; this.provas = []; this.rejeicoes = {}; this.ignorados = 0; this.viagens = 0;
    this.destravamentos = 0; this.compras = []; this.vendas = { itens: 0, ouro: 0 }; this.anomalias = []; this.viagensPorMotivo = {}; this.mortesPor = {};
    // golpes recebidos e tônicos de vida bebidos nos últimos 10 s (para descrever cada morte)
    this.mortesDetalhe = []; this.golpesRecentes = []; this.golesRecentes = [];
    this.lutas = {}; this.luta = null; // lutas por maior número de atacantes ao mesmo tempo (6 = 6 ou mais)
    this.conjuracoes = { iniciadas: 0, concluidas: 0, interrompidas: 0 };
    this.faixas = {}; // faixa -> { nivel, minutoNivel, minutoKitCompleto }
  }

  log(...a) { if (this.op.detalhe) console.log(`[${this.classId} ${(this.now / 60000).toFixed(1)}min nv${this.level}]`, ...a); }

  // ---------- métricas ----------
  met(L = this.level) {
    let m = this.niveis.get(L);
    if (!m) {
      m = { nivel: L, inicioMs: this.now, fimMs: null, abates: 0, xpAbates: 0, mortes: 0, fugas: 0, pocoesVida: 0, pocoesMana: 0, pocoesFora: 0, ouroSaqueado: 0, ouroDropado: 0, ouroVendas: 0, ouroGasto: 0, ouroGastoPocoes: 0, ouroGastoEquip: 0, viagens: 0, danoCausado: 0, danoRecebido: 0, cura: 0, monstros: {}, tempos: Object.fromEntries(TEMPOS.map((k) => [k, 0])) };
      this.niveis.set(L, m);
    }
    return m;
  }

  rejeitou(acao, r) {
    const k = `${acao}:${r.code}`;
    this.rejeicoes[k] = (this.rejeicoes[k] || 0) + 1;
  }

  // ---------- conexão ----------
  iniciar() {
    const conta = `sim_${this.classId}_${this.seed}`.slice(0, 20);
    this.cli.pedir('register', { account: conta, password: 'simulacao' });
    const l = this.cli.pedir('login', { account: conta, password: 'simulacao', delta: true });
    if (!l.ok) throw new Error(`login: ${l.reason}`);
    const nome = `Sim_${this.classId}`.slice(0, 16); // nomes de personagem não têm espaço (D125)
    const c = this.cli.pedir('create_char', { name: nome, classId: this.classId });
    if (!c.ok) throw new Error(`create_char: ${c.reason}`);
    const e = this.cli.pedir('enter', { charId: c.char.id });
    if (!e.ok) throw new Error(`enter: ${e.reason}`);
    this.recebeChar(e.char);
    this.eid = e.char.eid; this.mapa = e.char.mapId;
    this.met(1);
    this.gerenciarPersonagem();
  }

  recebeChar(ch) {
    if (!ch) return;
    this.char = ch;
    this.charEm = this.now;
    // a ficha traz o tempo restante de toda habilidade já usada (0 = pronta). A que está sendo
    // conjurada só ganha recarga no servidor quando a conjuração termina: até lá vale a do bot (sem
    // isso, um "0" antigo liberava a habilidade de novo e o bot recomeçava a conjuração sem fim)
    for (const [sid, ms] of Object.entries(ch.cooldowns || {})) if (this.conjurando?.skill !== sid) this.cd[sid] = this.now + ms;
    if (ch.level > this.level) this.subiuNivel(ch.level);
  }

  atualizarChar() {
    const r = this.cli.pedir('char');
    if (r.ok) this.recebeChar(r.char);
  }

  // ---------- eventos do servidor (só registram; as ações ficam para pensar()) ----------
  evento(m) {
    switch (m.t) {
      case 'xp': {
        const met = this.met();
        met.abates++; met.xpAbates += m.gained;
        met.monstros[m.monster] = (met.monstros[m.monster] || 0) + 1;
        this.ultimoAbate = this.now;
        this.pausaAte = this.now + this.op.pausaAposAbateMs;
        if (m.level > this.level) this.subiuNivel(m.level);
        break;
      }
      case 'char': this.recebeChar(m.char); break;
      case 'level_up': if (m.eid === this.eid && m.level > this.level) this.subiuNivel(m.level); break;
      case 'loot':
        if (m.loot?.gold) this.met().ouroDropado += m.loot.gold;
        if (this.querSaque(m.loot)) this.saque.set(m.loot.id, { ...m.loot, visto: this.now }); else this.ignorados++;
        break;
      case 'zone':
        this.mapa = m.mapId; this.instancia = m.instance ?? null;
        if (m.instance) {
          // recargas maiores que a maior recarga da classe ao entrar numa instância
          const maior = Math.max(...this.cls.skills.map((s) => this.data.skills[s].cooldownMs));
          const presas = Object.entries(m.char.cooldowns || {}).filter(([, ms]) => ms > maior + 1000);
          if (presas.length) this.anomalias.push({ tipo: 'recarga_herdada', nivel: this.level, mapa: m.mapId, minutoSimulado: Math.round(this.now / 60000), habilidades: presas.map(([s, ms]) => ({ habilidade: s, restanteMin: Math.round(ms / 60000) })) });
        }
        this.recebeChar(m.char);
        // o servidor manda o saque ainda não recolhido (e não vencido) deste mapa: o que ficou no
        // chão numa fuga, morte ou ida à cidade volta para a lista
        this.saque = new Map((m.loot || []).filter((l) => this.querSaque(l)).map((l) => [l.id, { ...l, visto: this.now }]));
        this.alvoId = null; this.andando = null; this.descansando = false; this.fuga = null; this.conjurando = null;
        break;
      case 'player_dead':
        if (m.eid === this.eid && !this.morto) {
          this.morto = true; this.morteEm = this.now;
          this.met().mortes++;
          // quem estava batendo (visão da última decisão) leva a "culpa"
          const culpados = this.ultimosAtacantes?.length ? this.ultimosAtacantes : [this.area?.monster ?? '?'];
          for (const d of new Set(culpados)) this.mortesPor[d] = (this.mortesPor[d] || 0) + 1;
          // retrato da morte: quantos monstros bateram nos últimos 10 s, quanto dano e com quantos tônicos
          const recentes = this.golpesRecentes.filter((g) => this.now - g.em <= 10_000);
          this.mortesDetalhe.push({
            nivel: this.level, mapa: this.mapa, area: this.area?.monster ?? null, minuto: Math.round(this.now / 60000),
            atacantes: new Set(recentes.filter((g) => !g.errou).map((g) => g.src)).size, dano10s: recentes.reduce((s, g) => s + g.dmg, 0),
            golpes10s: recentes.filter((g) => !g.errou).length, errosBloqueios10s: recentes.filter((g) => g.errou).length,
            vidaMax: this.char?.stats?.maxHp ?? null, tonicosVida: this.bolsa(POCOES_VIDA), medios: this.bolsa(['potion_hp_m']), goles10s: this.golesRecentes.filter((g) => this.now - g.em <= 10_000).map((g) => g.cura), culpados: [...new Set(culpados)],
          });
          this.registrarPerigo(3);
          this.log('caiu');
        }
        break;
      case 'respawn': if (m.eid === this.eid) this.morto = false; break;
      case 'cast_end': {
        // fim da conjuração (só o conjurador recebe): concluída, a recarga começa agora; interrompida,
        // nada foi gasto e a habilidade pode ser tentada de novo logo
        const s = this.data.skills[m.skill];
        if (m.ok) {
          this.conjuracoes.concluidas++;
          this.cd[m.skill] = this.now + (m.cooldownMs ?? s?.cooldownMs ?? 0);
          if (s?.effect.durationMs) this.buffAte[m.skill] = this.now + s.effect.durationMs;
        } else {
          this.conjuracoes.interrompidas++;
          this.cd[m.skill] = this.now + 1500;
        }
        if (this.conjurando?.skill === m.skill) this.conjurando = null;
        break;
      }
      case 'trial': {
        if (m.char) this.recebeChar(m.char);
        if (m.state === 'success' || m.state === 'failed') {
          this.provas.push({ nivel: this.level, tentativa: this.tentativasProva, resultado: m.state, duracaoS: Math.round((this.now - this.provaInicio) / 1000), mensagem: m.message });
          this.log('prova', m.state, m.message);
          this.pendenteNivel = true;
        }
        break;
      }
      default: break;
    }
  }

  // contabilidade de combate a partir dos eventos 'hit' e 'heal'
  combate(m) {
    const d = this.dano;
    if (m.t === 'heal') { if (m.src === this.eid) { d.cura += m.amount; this.met().cura += m.amount; } return; }
    if (m.src === this.eid) {
      if (m.miss) { d.erros++; return; }
      const k = m.skill ?? 'basico';
      d.porFonte[k] = (d.porFonte[k] || 0) + m.dmg;
      d.causado += m.dmg; d.golpes++;
      if (m.crit) d.criticos++;
      this.met().danoCausado += m.dmg;
    } else if (m.dst === this.eid) {
      if (this.golpesRecentes.length > 60) this.golpesRecentes = this.golpesRecentes.filter((g) => this.now - g.em <= 10_000);
      this.golpesRecentes.push({ em: this.now, src: m.src, dmg: m.miss ? 0 : m.dmg, errou: !!m.miss });
      if (m.miss) { d.errosRecebidos++; if (m.block) d.bloqueiosRecebidos = (d.bloqueiosRecebidos || 0) + 1; return; }
      d.recebido += m.dmg; d.golpesRecebidos++;
      this.met().danoRecebido += m.dmg;
    }
  }

  subiuNivel(L) {
    if (L <= this.level) return;
    const fim = this.met(this.level);
    fim.fimMs = this.now;
    this.aoNivel?.({ de: this.level, para: L, minutos: (fim.fimMs - fim.inicioMs) / 60000, abates: fim.abates, mortes: fim.mortes });
    for (let k = this.level + 1; k <= L; k++) this.met(k);
    this.level = L;
    this.pendenteNivel = true;
    this.reavaliarArea = true;
    this.ajuste = Math.min(0, this.ajuste + 1);
    if (L >= this.ateNivel) this.terminou = true;
  }

  // ---------- laço ----------
  tick(now) {
    const dt = now - this.ultimoTick;
    this.ultimoTick = now;
    this.now = now;
    this.met().tempos[this.instancia ? 'prova' : this.atividade] += dt;
    if (this.terminou || now < this.proximoPensar) return;
    this.proximoPensar = now + this.op.reacaoMs;
    this.pensar();
  }

  pensar() {
    const mundo = this.cli.mundo();
    const eu = mundo.get(this.eid);
    if (!eu) return;
    if (this.esperaAte > this.now) return;
    // parado no lugar? (para detectar caminhos que não chegam)
    if (!this.ultimaPos || dist(eu, this.ultimaPos) > 0.3) { this.ultimaPos = { x: eu.x, z: eu.z }; this.paradoDesde = this.now; }
    if (eu.dead || this.morto) return this.tratarMorte();
    // conjurando: fica parado (andar, atacar, outra habilidade ou tônico interrompem). Só um tônico
    // de emergência interrompe a conjuração.
    if (this.conjurando) {
      if (this.now <= this.conjurando.ate) {
        this.atividade = 'combate';
        if (eu.hp / eu.mhp < 0.3 && this.now >= this.potPronto) this.usarPocao(POCOES_VIDA, eu.mhp - eu.hp, 'pocoesVida', false, true);
        return;
      }
      this.conjurando = null; // o fim não chegou (não deveria acontecer): segue a vida
    }
    if (this.vigiar()) return;
    if (this.pendenteNivel) this.gerenciarPersonagem();
    if (this.now - this.charEm >= 1000) this.atualizarChar();
    if (this.ajuste < 0 && this.now > this.ajusteAte) { this.ajuste++; this.ajusteAte = this.now + 20 * 60_000; this.reavaliarArea = true; }
    const atac = this.atacantes(mundo);
    this.ultimosAtacantes = atac.map((m) => m.def);
    this.contarLuta(atac.length);
    this.sobreviver(eu, atac);
    // a caminho da cidade, uma briga encerra a coleta do saque antes da viagem
    if (this.tarefa && (atac.length || this.fuga)) this.tarefa.recolheu = true;
    if (this.fuga) return this.fugir(eu, atac);
    if (atac.length || this.alvoVivo(mundo)) return this.lutar(eu, atac, mundo);
    // fora de combate: cidade (compras/depósito/prova) > recuperar > saque > área > caçar
    if (this.tarefa || this.planejarCidade()) {
      // antes de sair do mapa de caça, recolhe o saque que está por perto (o ouro paga as compras)
      if (!this.tarefa.recolheu && !this.instancia && this.mapa !== this.cidade.mapId) {
        if (this.coletar(eu, mundo)) return;
        this.tarefa.recolheu = true;
      }
      return this.executarTarefa(eu, mundo);
    }
    if (this.recuperar(eu, mundo)) return;
    if (!this.instancia && this.coletar(eu, mundo)) return;
    if (this.planejarArea()) return;
    this.cacar(eu, mundo);
  }

  // Vigia de progresso: sem abate por muito tempo (fora de cidade/viagem), zera o estado, evita a
  // área e volta ao posto de guarda do mapa. Contado como "destravamento" no relatório.
  vigiar() {
    if (this.tarefa || this.instancia) { this.progressoEm = this.now; return false; }
    const desde = Math.max(this.ultimoAbate, this.progressoEm ?? 0, this.met().inicioMs);
    if (this.now - desde <= this.op.semAbateMaxMs) return false;
    this.destravamentos++;
    this.progressoEm = this.now;
    this.log('sem abates há muito tempo: destravando');
    if (this.area) this.evitarArea.set(this.area.id, this.now + 30 * 60_000);
    this.saque.clear(); this.andando = null; this.alvoId = null; this.fuga = null; this.descansando = false;
    this.reavaliarArea = true;
    const gp = this.data.maps[this.mapa]?.guardPost;
    if (gp) {
      const r = this.cli.pedir('gm', { cmd: 'teleport', x: gp.x, z: gp.z });
      if (!r.ok) this.rejeitou('teleport', r);
    }
    return true;
  }

  // ---------- leitura da visão ----------
  monstros(mundo) {
    const out = [];
    for (const e of mundo.values()) if (e.k === 'm' && e.hp > 0) out.push(e);
    return out;
  }

  atacantes(mundo) {
    const out = [];
    for (const e of mundo.values()) if (e.k === 'm' && e.hp > 0 && e.tgt === this.eid) out.push(e);
    return out;
  }

  alvoVivo(mundo) {
    if (!this.alvoId) return false;
    const a = mundo.get(this.alvoId);
    return !!a && a.hp > 0 && a.st !== 'return';
  }

  mpPct() { return this.char ? this.char.mp / Math.max(1, this.char.stats.maxMp) : 1; }

  bolsa(defIds) {
    let n = 0;
    for (const it of this.char?.items ?? []) if (it.loc === 'bag' && defIds.includes(it.defId)) n += it.qty;
    return n;
  }

  // ---------- sobrevivência ----------
  sobreviver(eu, atac) {
    const vida = eu.hp / eu.mhp;
    const emCombate = atac.length > 0;
    if (this.now >= this.potPronto) {
      let bebeu = false;
      // cercado, bebe antes: com vários monstros batendo, a recarga compartilhada de 3 s é o gargalo.
      // Com 3 ou mais, o tônico maior: o dano que chega até a próxima dose cobre a sobra da cura
      const cercado = atac.length >= 3;
      const limiarVida = cercado ? 0.65 : atac.length === 2 ? 0.5 : this.op.pocaoVidaPct;
      if (vida < limiarVida && (emCombate || vida < 0.25)) bebeu = this.usarPocao(POCOES_VIDA, eu.mhp - eu.hp, 'pocoesVida', false, cercado);
      const mp = this.mpPct();
      if (!bebeu && emCombate && ((this.conjurador && mp < 0.2) || (!this.conjurador && mp < 0.12 && this.bolsa(POCOES_MANA) > 3))) {
        this.usarPocao(POCOES_MANA, this.char.stats.maxMp - this.char.mp, 'pocoesMana');
      }
    }
    if (vida < this.op.fugaVidaPct && emCombate && !this.fuga && !this.instancia && this.bolsa(POCOES_VIDA) === 0) {
      const gp = this.data.maps[this.mapa].guardPost;
      if (this.moverPara(gp.x, gp.z, 'fuga')) {
        this.fuga = { desde: this.now };
        this.met().fugas++;
        this.registrarPerigo(1);
        this.log('fugindo com', Math.round(vida * 100), '% de vida');
      }
    }
  }

  // Tamanho das lutas: uma luta começa com o primeiro monstro batendo no bot e acaba depois de 3 s
  // sem nenhum; conta quantas lutas chegaram a 1, 2, 3... atacantes ao mesmo tempo (medição).
  contarLuta(n) {
    if (n > 0) {
      if (!this.luta) this.luta = { max: 0 };
      this.luta.max = Math.max(this.luta.max, n);
      this.luta.ultimo = this.now;
    } else if (this.luta && this.now - this.luta.ultimo > 3000) this.fecharLuta();
  }

  fecharLuta() {
    if (!this.luta) return;
    const k = Math.min(this.luta.max, 6);
    this.lutas[k] = (this.lutas[k] || 0) + 1;
    this.luta = null;
  }

  // Morte vale 3, fuga vale 1: 3 pontos em 10 min fazem o bot caçar monstros um nível abaixo
  // por 20 min e evitar a área atual nesse tempo (como um jogador que muda de ponto).
  registrarPerigo(peso) {
    this.perigos = (this.perigos ?? []).filter((p) => this.now - p.em < 10 * 60_000);
    this.perigos.push({ em: this.now, peso });
    if (this.perigos.reduce((s, p) => s + p.peso, 0) < 3) return;
    this.perigos = [];
    this.ajuste = Math.max(-2, this.ajuste - 1);
    this.ajusteAte = this.now + 20 * 60_000;
    if (this.area) this.evitarArea.set(this.area.id, this.now + 20 * 60_000);
    this.reavaliarArea = true;
    this.trocasPorPerigo = (this.trocasPorPerigo ?? 0) + 1;
  }

  usarPocao(tipos, falta, chave, fora = false, maior = false) {
    // tônico médio só a partir do nível dele (o servidor confere o nível do item)
    const usaveis = tipos.filter((id) => this.data.items[id].level <= this.level);
    let escolha = null;
    for (const id of usaveis) {
      const it = this.char.items.find((i) => i.loc === 'bag' && i.defId === id);
      if (!it) continue;
      const cura = this.data.items[id].use.healHp ?? this.data.items[id].use.healMp;
      // o menor tônico que ainda aproveita bem a cura; se nenhum, o maior que houver. Cercado (maior),
      // sempre o maior: a cura que sobraria agora é gasta pelos golpes até a próxima dose
      if (!escolha || (maior ? cura > escolha.cura : (cura <= falta * 1.2 && cura > escolha.cura) || (escolha.cura > falta * 1.2 && cura < escolha.cura))) escolha = { it, cura };
    }
    if (!escolha) return false;
    const r = this.cli.pedir('use_item', { instance: escolha.it.id });
    if (!r.ok) { this.rejeitou('use_item', r); if (r.code === 'cooldown') this.potPronto = this.now + 1000; return false; }
    this.recebeChar(r.char);
    this.potPronto = this.now + this.data.formulas.potions.sharedCooldownMs;
    this.met()[chave]++;
    if (chave === 'pocoesVida') {
      this.golesRecentes = this.golesRecentes.filter((g) => this.now - g.em <= 10_000);
      this.golesRecentes.push({ em: this.now, cura: escolha.cura });
    }
    if (fora) this.met().pocoesFora++;
    return true;
  }

  fugir(eu, atac) {
    this.atividade = 'fuga';
    const gp = this.data.maps[this.mapa].guardPost;
    if (!atac.length || eu.hp / eu.mhp > 0.5) { this.fuga = null; this.andando = null; return; }
    if (dist(eu, gp) < 3 || this.now - this.fuga.desde > 30_000) { this.fuga = null; return this.lutar(eu, atac, this.cli.mundo()); }
    if (!this.andando) this.moverPara(gp.x, gp.z, 'fuga');
  }

  tratarMorte() {
    this.atividade = 'morto';
    this.alvoId = null; this.andando = null; this.fuga = null; this.descansando = false;
    if (!this.morto) { this.morto = true; this.morteEm = this.now; this.met().mortes++; }
    if (this.now - this.morteEm < this.op.esperaMorteMs) { this.esperaAte = this.morteEm + this.op.esperaMorteMs; return; }
    if (this.instancia) return; // na prova, o próprio servidor encerra e devolve à cidade
    const r = this.cli.pedir('respawn');
    if (r.ok) { this.morto = false; this.recebeChar(r.char); this.log('voltou ao posto'); }
    else { this.rejeitou('respawn', r); if (r.code === 'not_dead') this.morto = false; }
  }

  // ---------- combate ----------
  lutar(eu, atac, mundo) {
    this.atividade = 'combate';
    this.descansando = false;
    this.andando = null;
    let alvo = this.alvoId ? mundo.get(this.alvoId) : null;
    if (!alvo || alvo.hp <= 0 || alvo.st === 'return') alvo = null;
    if (!alvo && atac.length) alvo = atac.reduce((b, m) => (!b || m.hp < b.hp || (m.hp === b.hp && dist(eu, m) < dist(eu, b)) ? m : b), null);
    if (!alvo) { this.alvoId = null; return; }
    if (alvo.id !== this.alvoId) { this.alvoId = alvo.id; this.alvoDesde = this.now; this.alvoVidaInicio = alvo.hp; }
    // alvo que não se aproxima nem perde vida (preso atrás de obstáculo): desiste dele por um tempo
    if (alvo.tgt !== this.eid && alvo.hp >= this.alvoVidaInicio && this.now - this.alvoDesde > 25_000) {
      this.evitarAlvo.set(alvo.id, this.now + 60_000);
      this.alvoId = null;
      this.cli.pedir('stop');
      return;
    }
    if (eu.tgt !== alvo.id) {
      const r = this.cli.pedir('attack', { target: alvo.id });
      if (!r.ok) { this.rejeitou('attack', r); this.alvoId = null; return; }
    }
    this.usarHabilidades(eu, alvo, atac, mundo);
  }

  montarOrdemCombate() {
    const cat = (s) => {
      const k = s.effect.kind;
      if (k === 'heal' || k === 'party_heal') return 0;
      if (DEFESA.has(k)) return 1;
      if (k === 'debuff') return 2;
      if (DANO.has(k)) return 3;
      if (k === 'dash') return 4;
      return 9;
    };
    return this.cls.skills.map((id) => this.data.skills[id])
      .filter((s) => IMPLEMENTED_KINDS.has(s.effect.kind) && cat(s) < 9)
      .sort((a, b) => cat(a) - cat(b) || b.cooldownMs - a.cooldownMs)
      .map((s) => s.id);
  }

  alcance(s) { return s.range === 'weapon' ? this.char.stats.range : s.range; }

  usarHabilidades(eu, alvo, atac, mundo) {
    // recarga global (formulas.skills.globalCooldownMs): nenhuma habilidade antes do fim dela
    if (this.now < this.gcdAte) return false;
    const vida = eu.hp / eu.mhp;
    const d = dist(eu, alvo);
    const armaR = this.char.stats.range;
    const engajado = atac.length > 0 || d <= armaR + 4;
    const cura = this.data.skills[this.ordemCombate.find((id) => this.data.skills[id].effect.kind === 'heal')];
    // conjurar exige ficar parado: com o personagem ainda em movimento (perseguindo o alvo), a frenagem
    // passaria dos 0,35 m tolerados e interromperia a conjuração
    const parado = Math.hypot(eu.vx || 0, eu.vz || 0) < 1;
    for (const sid of this.ordemCombate) {
      const rank = this.char.skills[sid] || 0;
      if (rank < 1) continue;
      if ((this.cd[sid] || 0) > this.now) continue;
      const s = this.data.skills[sid];
      if (s.castMs > 0 && !parado) continue;
      const custo = s.mp + (s.mpPerRank || 0) * (rank - 1);
      // a curadora guarda mana para duas curas
      const reserva = cura && s !== cura ? (cura.mp + (cura.mpPerRank || 0) * ((this.char.skills[cura.id] || 1) - 1)) * 2 : 0;
      if (this.char.mp < custo + reserva) continue;
      const payload = this.alvoDaHabilidade(s, eu, alvo, atac, mundo, { vida, d, engajado, custo });
      if (!payload) continue;
      const r = this.cli.pedir('cast', { skill: sid, ...payload });
      if (r.ok) {
        this.gcdAte = this.now + (r.gcdMs ?? 0);
        if (r.casting) {
          // conjuração: a recarga só começa no fim (evento cast_end); até lá o bot fica parado
          this.conjuracoes.iniciadas++;
          this.conjurando = { skill: sid, ate: this.now + r.casting.ms + 500 };
          this.cd[sid] = this.conjurando.ate;
        } else {
          this.cd[sid] = this.now + s.cooldownMs;
          if (s.effect.durationMs) this.buffAte[sid] = this.now + s.effect.durationMs;
        }
        if (r.char) this.recebeChar(r.char);
        return true;
      }
      this.rejeitou(`cast_${this.instancia ? 'prova' : 'mundo'}`, r);
      if (r.code === 'gcd') { this.gcdAte = this.now + 200; return false; }
      if (r.code === 'cooldown') this.cd[sid] = this.now + 1000;
      if (r.code === 'no_mana') this.atualizarChar();
    }
    return false;
  }

  // Monstros que uma habilidade de área atingiria (aproximação da geometria de skills.js).
  atingidos(s, eu, alvo, mundo, payload) {
    const e = s.effect;
    const ms = this.monstros(mundo);
    const dentro = (cx, cz, r) => ms.filter((m) => Math.hypot(m.x - cx, m.z - cz) <= r);
    switch (e.kind) {
      case 'ground_aoe': case 'delayed_aoe': return dentro(payload.x, payload.z, e.radius + 0.5);
      case 'aoe_spell': case 'aoe_strike': case 'aura_damage': return dentro(eu.x, eu.z, (e.radius ?? s.range) + 0.5);
      case 'charge': return [alvo, ...dentro(alvo.x, alvo.z, (e.splashRadius || 2.5) + 0.5)];
      case 'cone_strike': {
        const r = this.alcance(s) + 0.5;
        const dx = alvo.x - eu.x, dz = alvo.z - eu.z, dl = Math.hypot(dx, dz) || 1;
        const cos = Math.cos(((e.angleDeg || 90) / 2) * Math.PI / 180) - 0.05;
        return ms.filter((m) => { const mx = m.x - eu.x, mz = m.z - eu.z, md = Math.hypot(mx, mz); return md <= r && (md < 0.5 || (mx * dx + mz * dz) / (md * dl) >= cos); });
      }
      case 'line_strike': {
        const r = this.alcance(s) + 0.5;
        const dx = alvo.x - eu.x, dz = alvo.z - eu.z, dl = Math.hypot(dx, dz) || 1;
        const ux = dx / dl, uz = dz / dl;
        const lista = ms.filter((m) => { const mx = m.x - eu.x, mz = m.z - eu.z, along = mx * ux + mz * uz; return along >= 0 && along <= r && Math.abs(mx * uz - mz * ux) <= (e.width || 1.5) / 2 + 0.8; })
          .sort((a, b) => Math.hypot(a.x - eu.x, a.z - eu.z) - Math.hypot(b.x - eu.x, b.z - eu.z));
        return e.maxTargets ? lista.slice(0, e.maxTargets) : lista;
      }
      case 'strike': case 'spell': {
        if (!e.bounceTargets) return [alvo];
        const vizinhos = ms.filter((m) => m.id !== alvo.id && dist(m, alvo) <= 6).sort((a, b) => dist(a, alvo) - dist(b, alvo)).slice(0, e.bounceTargets);
        return [alvo, ...vizinhos];
      }
      default: return [alvo];
    }
  }

  alvoDaHabilidade(s, eu, alvo, atac, mundo, ctx) {
    const p = this.alvoDaHabilidadeBruto(s, eu, alvo, atac, mundo, ctx);
    if (!p || !DANO.has(s.effect.kind) || s.effect.kind === 'pull') return p;
    // solo: habilidade de área (ou que ricocheteia/respinga) só se não acordar monstro parado
    const acorda = this.atingidos(s, eu, alvo, mundo, p).some((m) => m.id !== alvo.id && m.tgt !== this.eid);
    if (acorda) { this.areaEvitada = (this.areaEvitada || 0) + 1; return null; }
    return p;
  }

  alvoDaHabilidadeBruto(s, eu, alvo, atac, mundo, { vida, d, engajado, custo }) {
    const e = s.effect;
    const k = e.kind;
    const alc = this.alcance(s) + this.tolerancia - 0.15;
    const ativo = (this.buffAte[s.id] || 0) > this.now;
    const caro = custo > 0.25 * this.char.stats.maxMp; // mais de 1/4 da mana
    switch (k) {
      case 'heal': return vida < 0.65 ? {} : null;
      case 'party_heal': return vida < 0.5 ? {} : null;
      case 'shield_ally': return engajado && !(eu.sh > 0) && (atac.length >= 2 || vida < 0.7) ? {} : null;
      case 'shield_self': return atac.length && !(eu.sh > 0) && (vida < 0.85 || atac.length >= 2) ? {} : null;
      case 'taunt_area': return atac.length >= 2 && !ativo ? {} : null;
      case 'buff_self': case 'party_buff': case 'guard_ally': {
        if (!engajado || ativo) return null;
        const ofensivo = ['physDamagePct', 'attackSpeedPct', 'critPct', 'basicPierce'].some((x) => e[x] !== undefined);
        // reforço de defesa caro só quando a luta pede (vários atacantes ou vida baixa)
        if (!ofensivo) return !caro || atac.length >= 2 || vida < 0.75 ? {} : null;
        return alvo.hp / alvo.mhp > 0.3 || atac.length >= 2 ? {} : null;
      }
      case 'debuff': return d <= alc && !(alvo.fx || []).includes('mark') && alvo.hp / alvo.mhp > 0.3 ? { target: alvo.id } : null;
      case 'dash':
        if (e.distance < 0) return this.distancia && atac.some((m) => dist(eu, m) < 3) ? { target: alvo.id } : null;
        return engajado && d <= this.char.stats.range + 0.5 ? { target: alvo.id } : null;
      case 'pull': {
        if (d > alc) return null;
        // só puxa se não houver monstro extra no raio (solo: puxar três é pedir para cair)
        const extra = this.monstros(mundo).some((m) => m.id !== alvo.id && m.tgt !== this.eid && dist(eu, m) <= s.range + 0.5);
        return extra ? null : { target: alvo.id };
      }
      case 'aoe_strike': case 'aoe_spell': case 'aura_damage': {
        const r = e.radius ?? s.range;
        if (d > r - 0.3) return null;
        // conjurador (mana contada): área em volta de si só com 2+ monstros dentro
        if (this.conjurador && this.monstros(mundo).filter((m) => dist(eu, m) <= r).length < 2) return null;
        return {};
      }
      case 'ground_aoe': case 'delayed_aoe': {
        if (d > alc) return null;
        if (alvo.hp / alvo.mhp < 0.35 && atac.length < 2) return null;
        // monstro parado (já em combate corpo a corpo) ou vários juntos
        return { x: alvo.x, z: alvo.z };
      }
      case 'charge': case 'strike': case 'spell': case 'cone_strike': case 'line_strike':
        return d <= alc ? { target: alvo.id } : null;
      default: return null;
    }
  }

  // ---------- saque ----------
  querSaque(l) {
    if (!l) return false;
    if (l.gold > 0 && !l.defId) return true;
    const def = this.data.items[l.defId];
    if (!def) return false;
    if (def.kind === 'consumable') return this.bolsa([def.id]) < 150;
    if (!this.char) return false;
    const livres = this.char.bagCapacity - this.char.bagUsed;
    // melhoria da própria classe (agora ou para mais tarde) ainda cabe com a bolsa quase cheia
    if (this.serveParaMim(def) && valorItem(def) > this.melhorPossuido(def.slot)) return livres > 1;
    // o resto (materiais, peças de outras classes ou piores) é sucata para vender no comerciante,
    // recolhida só com folga na bolsa, para nunca ocupar o lugar de uma melhoria
    return !def.questItem && (def.value || 0) > 0 && livres > this.op.folgaBolsaSucata;
  }

  // Peça que esta classe usaria: arma da família do kit (ou da de reserva, só na faixa em que a do kit
  // não tem peça comum), mão secundária da família do kit, armadura do seu peso e joias.
  serveParaMim(def) {
    if (!def.slot) return false;
    if (def.classes && !def.classes.includes(this.classId)) return false;
    if (def.slot === 'weapon' && def.family !== this.kit.arma
      && !(this.kit.armas.includes(def.family) && this.data.items[`${this.kit.arma}_t${def.level}`]?.rarity !== 'common')) return false;
    if (def.slot === 'offhand' && def.family !== this.kit.maoSecundaria) return false;
    return true;
  }

  // Melhor peça da própria classe para o espaço (equipada ou na bolsa); sucata não conta.
  melhorPossuido(slot) {
    let best = 0;
    for (const it of this.char?.items ?? []) {
      if (it.loc !== 'bag' && it.loc !== 'equip') continue;
      const d = this.data.items[it.defId];
      if (d.slot === slot && this.serveParaMim(d)) best = Math.max(best, valorItem(d));
    }
    return best;
  }

  // Saque conhecido fica na lista até ser recolhido ou vencer (30 min): o bot busca o que está a até
  // 45 m dele ou dentro da área de caça atual — inclusive o que deixou para trás ao fugir, cair ou
  // ir à cidade; mais longe que isso, fica na lista para quando passar perto. Não vai buscar o que
  // exigiria entrar no raio de agressão de um monstro agressivo parado (o ponto de coleta fica a até
  // 5 m do saque, do lado do bot): esse saque espera o grupo em volta ser abatido.
  coletar(eu, mundo = this.cli.mundo()) {
    if (!this.saque.size) return false;
    const area = this.area && this.area.mapId === this.mapa ? this.area : null;
    const parados = this.monstros(mundo).filter((m) => m.tgt == null && m.st !== 'return' && this.data.monsters[m.def]?.aggro === 'aggressive');
    let best = null, bd = Infinity;
    for (const l of this.saque.values()) {
      if ((l.mapId && l.mapId !== this.mapa) || this.now - (l.visto ?? this.now) > SAQUE_VALIDADE_MS) { this.saque.delete(l.id); continue; }
      const d = dist(eu, l);
      if (d > 45 && !(area && dist(l, area) <= area.radius + 15)) continue;
      if (d > this.pickupRange - 0.5 && parados.length) {
        const k = Math.min(5, d) / (d || 1);
        const ponto = { x: l.x + (eu.x - l.x) * k, z: l.z + (eu.z - l.z) * k };
        if (parados.some((m) => dist(m, ponto) <= (this.data.monsters[m.def].aggroRadius || 8) + 1)) continue;
      }
      if (d < bd) { bd = d; best = l; }
    }
    if (!best) return false;
    this.atividade = 'saque';
    if (bd <= this.pickupRange - 0.5) {
      const defSaque = best.defId ? this.data.items[best.defId] : null;
      const melhoria = !!defSaque?.slot && this.serveParaMim(defSaque) && valorItem(defSaque) > this.melhorPossuido(defSaque.slot);
      const r = this.cli.pedir('pickup', { loot: best.id });
      this.saque.delete(best.id);
      if (!r.ok) {
        this.rejeitou('pickup', r);
        if (r.code === 'too_far' && (this.falhasSaque.get(best.id) || 0) < 3) { this.falhasSaque.set(best.id, (this.falhasSaque.get(best.id) || 0) + 1); this.saque.set(best.id, best); }
        return true;
      }
      this.recebeChar(r.char);
      if (!r.alreadyClaimed) {
        if (r.gold) this.met().ouroSaqueado += r.gold;
        if (melhoria) {
          this.equipamento.push({ nivel: this.level, item: r.defId, fonte: 'saque', minuto: Math.round(this.now / 60000) });
          this.equiparMelhorias();
        }
      }
      this.andando = null;
      return true;
    }
    const indo = this.andando?.motivo === `saque:${best.id}`;
    // caminho que não chega (parado há 2 s fora do alcance): tenta de novo uma vez, depois desiste
    if (indo && this.now - this.paradoDesde > 2000 && this.now - this.andando.desde > 2000) {
      const f = (this.falhasSaque.get(best.id) || 0) + 1;
      this.falhasSaque.set(best.id, f);
      this.andando = null;
      if (f >= 2) { this.saque.delete(best.id); this.rejeitou('pickup', { code: 'inalcancavel' }); return true; }
    }
    if (!indo || !this.andando) {
      if (!this.moverPara(best.x, best.z, `saque:${best.id}`)) this.saque.delete(best.id);
    }
    return true;
  }

  // ---------- recuperação fora de combate: tônico primeiro; sem tônico, descanso ----------
  temPocao(tipos) {
    return (this.char?.items ?? []).some((i) => i.loc === 'bag' && tipos.includes(i.defId) && this.data.items[i.defId].level <= this.level);
  }

  recuperar(eu, mundo) {
    const vida = eu.hp / eu.mhp;
    const mp = this.mpPct();
    const limV = this.op.recuperarVidaPct;
    // classes físicas lutam com o ataque básico quando a mana acaba: não param por mana
    const limM = this.conjurador ? 0.35 : 0;
    if (this.descansando) {
      const alvoM = this.conjurador ? 0.85 : 0;
      if ((vida >= this.op.vidaAlvoPct && mp >= alvoM) || this.now - this.descansoDesde > 180_000) { this.descansando = false; return false; }
    } else if (vida >= limV && mp >= limM) return false;
    // fora de combate, tônico só acima da reserva (o resto fica para emergências em combate)
    if (vida < limV && this.temPocao(POCOES_VIDA) && this.bolsa(POCOES_VIDA) > this.op.reservaPocoes) {
      this.atividade = 'descanso';
      if (this.now >= this.potPronto) this.usarPocao(POCOES_VIDA, eu.mhp - eu.hp, 'pocoesVida', true);
      return true;
    }
    if (mp < limM && this.temPocao(POCOES_MANA) && this.bolsa(POCOES_MANA) > this.op.reservaPocoes) {
      this.atividade = 'descanso';
      if (this.now >= this.potPronto) this.usarPocao(POCOES_MANA, this.char.stats.maxMp - this.char.mp, 'pocoesMana', true);
      return true;
    }
    // sem tônico: descansa longe do alcance de agressão dos monstros que passeiam
    if (!this.descansando && !this.instancia && this.area && this.mapa === this.area.mapId) {
      const perigo = this.monstros(mundo).some((m) => this.data.monsters[m.def]?.aggro === 'aggressive' && dist(eu, m) < 13);
      const p = this.pontoDeEspera(this.area);
      if (perigo && dist(eu, p) > 2.5) {
        this.atividade = 'deslocamento';
        if (!this.andando || this.andando.motivo !== 'abrigo') this.moverPara(p.x, p.z, 'abrigo');
        return true;
      }
    }
    this.descansar();
    return true;
  }

  descansar() {
    this.atividade = 'descanso';
    if (!this.descansando) {
      this.descansando = true; this.descansoDesde = this.now;
      this.andando = null; this.alvoId = null;
      this.cli.pedir('stop');
    }
  }

  // ---------- personagem: atributos, habilidades, kit e equipamento ----------
  gerenciarPersonagem() {
    this.pendenteNivel = false;
    this.atualizarChar();
    while (this.nivelAlocado < this.char.level) {
      const L = this.nivelAlocado + 1;
      const pts = this.plano.porNivel[String(L)] ?? {};
      const r = this.cli.pedir('allocate', { points: pts });
      if (!r.ok) { this.rejeitou('allocate', r); break; }
      this.recebeChar(r.char);
      this.nivelAlocado = L;
    }
    for (const T of FAIXAS) {
      if (T <= this.char.level && !this.kitVerificado.has(T)) { this.chegouNaFaixa(T); this.kitVerificado.add(T); }
    }
    for (let guarda = 0; this.char.skillPoints > 0 && guarda < 10; guarda++) {
      const sid = this.proximaHabilidade();
      if (!sid) break;
      const r = this.cli.pedir('learn_skill', { skill: sid });
      if (!r.ok) { this.rejeitou('learn_skill', r); break; }
      this.recebeChar(r.char);
    }
    this.equiparMelhorias();
  }

  proximaHabilidade() {
    let cap = 0;
    for (const [lvl, c] of this.data.skillRules.rankCapByLevel) if (this.char.level >= lvl) cap = c;
    cap = Math.min(cap, this.data.skillRules.maxRank);
    for (const sid of this.prioridade) {
      const r = this.char.skills[sid] || 0;
      if (r >= 1 && r < cap) return sid;
    }
    return null;
  }

  // Chegou ao nível de uma faixa: as peças comuns que faltam são compradas no armeiro com ouro
  // (planejarCidade decide quando ir). O que já tinha (saque ou compra adiantada) é anotado.
  chegouNaFaixa(T) {
    const min = Math.round(this.now / 60000);
    this.faixas[T] = { nivel: this.level, minutoNivel: min, minutoKitCompleto: null, pecas: kitDaFaixa(this.classId, T, this.data).length };
    if (T === 1) return;
    for (const id of kitDaFaixa(this.classId, T, this.data)) {
      if (this.melhorPossuido(this.data.items[id].slot) >= valorItem(this.data.items[id])) this.equipamento.push({ nivel: this.level, item: id, fonte: 'ja_tinha', minuto: min });
    }
    this.conferirKit();
  }

  faixaAtual() { return FAIXAS.filter((t) => t <= this.level).pop() ?? 1; }

  // Peças comuns da faixa que ainda faltam (nenhuma peça igual ou melhor no espaço), na ordem de compra.
  faltandoDaFaixa(T) {
    if (T == null) return [];
    return kitDaFaixa(this.classId, T, this.data).filter((id) => this.melhorPossuido(this.data.items[id].slot) < valorItem(this.data.items[id]));
  }

  // Marca o minuto em que o kit da faixa atual ficou completo (equipado ou na bolsa à espera dos requisitos).
  conferirKit() {
    const T = this.faixaAtual();
    const f = this.faixas[T];
    if (f && f.minutoKitCompleto == null && !this.faltandoDaFaixa(T).length) f.minutoKitCompleto = Math.round(this.now / 60000);
  }

  precoEquip(defId) { return Math.max(1, Math.round((this.data.items[defId].value || 1) * (this.data.formulas.economy?.gearPriceMult ?? 3))); }

  usavelAgora(def) {
    if (!this.serveParaMim(def)) return false;
    return requirementFailures(this.char, def, this.data).length === 0;
  }

  equiparMelhorias() {
    if (!this.char) return;
    // 'ring' duas vezes: preenche os dois espaços de anel
    for (const slot of ['weapon', 'offhand', 'body', 'head', 'hands', 'feet', 'amulet', 'ring', 'ring']) {
      const itens = this.char.items;
      const valor = (i) => valorItem(this.data.items[i.defId]);
      const equipados = itens.filter((i) => i.loc === 'equip' && this.data.items[i.defId].slot === slot);
      const cheio = equipados.length >= (slot === 'ring' ? 2 : 1);
      // espaço cheio: compara com a pior peça equipada (no anel, é ela que sai)
      const pior = cheio ? equipados.reduce((a, b) => (valor(a) <= valor(b) ? a : b)) : null;
      let cand = null, cv = pior ? valor(pior) : 0;
      for (const it of itens) {
        if (it.loc !== 'bag') continue;
        const def = this.data.items[it.defId];
        if (def.slot !== slot || !this.usavelAgora(def)) continue;
        const v = valorItem(def);
        if (v > cv) { cv = v; cand = it; }
      }
      if (!cand) continue;
      if (slot === 'ring' && pior) {
        const u = this.cli.pedir('unequip', { slot: pior.slot });
        if (!u.ok) { this.rejeitou('unequip', u); continue; }
        this.recebeChar(u.char);
      }
      const r = this.cli.pedir('equip', { instance: cand.id });
      if (!r.ok) { this.rejeitou('equip', r); continue; }
      this.recebeChar(r.char);
      this.log('equipou', cand.defId);
    }
    this.conferirKit();
  }

  // ---------- cidade: compras, depósito e prova de classe ----------
  planejarCidade() {
    if (this.instancia) return false;
    const prova = this.op.prova && this.level >= 10 && !this.char.trialDone && this.tentativasProva < 3;
    // A viagem só vale se o ouro comprar um lote razoável (40 tônicos) que cure mais do que o
    // descanso recuperaria durante a própria ida e volta; senão, o bot descansa.
    const orc = this.char.gold * 0.8;
    const pocao = this.level >= 9 && orc >= this.preco('potion_hp_m') * 40 ? 'potion_hp_m' : 'potion_hp_s';
    const qtd = Math.floor(orc / this.preco(pocao));
    const saltos = rota(this.adj, this.mapa, this.cidade.mapId, this.level)?.length ?? 1;
    const regenNaViagem = this.char.stats.maxHp * (this.data.formulas.regen.hpPctPerSec / 100) * saltos * 2 * (this.op.viagemPorMapaMs / 1000);
    const valeAPena = qtd >= 40 && qtd * this.data.items[pocao].use.healHp >= regenNaViagem;
    const faltaVida = this.bolsa(POCOES_VIDA) < this.op.minimoParaComprar;
    const faltaMana = this.conjurador && this.bolsa(POCOES_MANA) < this.op.minimoParaComprar;
    const bolsaCheia = this.char.bagUsed >= this.char.bagCapacity - 2;
    const equip = this.querIrPorEquipamento();
    if (!prova && !bolsaCheia && !equip && !((faltaVida || faltaMana) && valeAPena)) return false;
    this.tarefa = { prova, armeiro: true, comprar: true, voltarPara: this.area?.mapId ?? this.mapa, motivo: prova ? 'prova' : equip ? 'equipamento' : bolsaCheia ? 'venda' : 'compras' };
    if (equip) this.ultimaIdaEquip = this.now;
    this.log('vai à cidade:', this.tarefa.motivo);
    return true;
  }

  // Ida à cidade só pelo equipamento da faixa: quando o ouro (fora a reserva para tônicos) compra todo
  // o kit que falta, numa viagem só (no máximo uma vez a cada 10 min). Antes disso as peças vão sendo
  // compradas nas idas por tônicos, que acontecem de qualquer jeito.
  querIrPorEquipamento() {
    const falta = this.faltandoDaFaixa(this.faixaAtual());
    if (!falta.length || this.now - this.ultimaIdaEquip < this.op.intervaloIdaEquipMs) return false;
    const custo = falta.reduce((s, id) => s + this.precoEquip(id), 0);
    return this.char.gold - this.reservaPocoes() >= custo;
  }

  preco(defId) { return Math.max(1, (this.data.items[defId].value || 1) * 2); }

  // Tônicos que o bot quer ter na bolsa: o padrão ou 2,5 × o que gastou no nível anterior (o que for
  // maior), até 300 (quem bebe muito leva mais e volta menos à cidade); mana: 60 para conjuradores
  // (ou 2,5 × o gasto, até 300), 10 para os demais.
  alvosPocoes() {
    const uso = (k) => Math.max(this.niveis.get(this.level - 1)?.[k] ?? 0, this.niveis.get(this.level)?.[k] ?? 0);
    return {
      vida: Math.min(300, Math.max(this.op.estoqueVida, Math.ceil(uso('pocoesVida') * 2.5))),
      mana: this.conjurador ? Math.min(300, Math.max(this.op.estoqueManaConjurador, Math.ceil(uso('pocoesMana') * 2.5))) : this.op.estoqueManaOutros,
    };
  }

  // Custo de completar a bolsa de tônicos até `qVida`/`qMana` (tônico médio a partir do nível 9).
  custoPocoes(qVida, qMana) {
    const v = this.level >= 9 ? 'potion_hp_m' : 'potion_hp_s';
    const m = this.level >= 9 ? 'potion_mp_m' : 'potion_mp_s';
    return Math.max(0, qVida - this.bolsa(POCOES_VIDA)) * this.preco(v) + Math.max(0, qMana - this.bolsa(POCOES_MANA)) * this.preco(m);
  }

  // Ouro guardado para tônicos antes de comprar equipamento: o estoque mínimo (60 de vida; 40 de mana
  // para conjuradores), no máximo 60% do ouro — equipamento nunca deixa o bot sem tônico.
  reservaPocoes() {
    return Math.min(this.custoPocoes(this.op.estoqueMinimoVida, this.conjurador ? 40 : 0), this.char.gold * 0.6);
  }

  // Joias da faixa que faltam: amuleto e anéis com valor abaixo dos da faixa (dois espaços de anel).
  joiasFaltando(T) {
    const out = [];
    const joias = joiasDaFaixa(T, this.data);
    const amuleto = joias.find((id) => id.startsWith('amulet'));
    if (amuleto && this.melhorPossuido('amulet') < valorItem(this.data.items[amuleto])) out.push(amuleto);
    const anel = joias.find((id) => id.startsWith('ring'));
    if (anel) {
      const v = valorItem(this.data.items[anel]);
      const tem = (this.char?.items ?? []).filter((i) => (i.loc === 'bag' || i.loc === 'equip') && this.data.items[i.defId].slot === 'ring' && valorItem(this.data.items[i.defId]) >= v).length;
      for (let k = tem; k < 2; k++) out.push(anel);
    }
    return out;
  }

  // Armeiro: kit comum da faixa atual (a arma primeiro: se ela não couber no orçamento, espera por
  // ela), com o ouro que sobra da reserva de tônicos. Com o kit completo e ouro além do estoque cheio
  // de tônicos: o kit da próxima faixa, quando faltam até 2 níveis para ela, e as joias da faixa.
  comprarEquipamento(npc) {
    const T = this.faixaAtual();
    const reservaMin = this.reservaPocoes();
    const alvos = this.alvosPocoes();
    const reservaCheia = this.custoPocoes(alvos.vida, alvos.mana);
    const compra = (id, guardar) => {
      const preco = this.precoEquip(id);
      if (preco > this.char.gold - guardar) return false;
      const r = this.cli.pedir('buy', { npc: npc.id, item: id, qty: 1 });
      if (!r.ok) { this.rejeitou('buy_equip', r); return false; }
      this.recebeChar(r.char);
      this.met().ouroGasto += r.cost; this.met().ouroGastoEquip += r.cost;
      this.equipamento.push({ nivel: this.level, item: id, fonte: 'compra', custo: r.cost, minuto: Math.round(this.now / 60000) });
      return true;
    };
    const kit = (lista, guardar) => {
      for (const id of lista) if (!compra(id, guardar) && this.data.items[id].slot === 'weapon') return;
    };
    kit(this.faltandoDaFaixa(T), reservaMin);
    if (!this.faltandoDaFaixa(T).length) {
      const prox = FAIXAS.find((t) => t > this.level);
      if (prox && prox - this.level <= 2) kit(this.faltandoDaFaixa(prox), reservaCheia);
      for (const id of this.joiasFaltando(T)) compra(id, reservaCheia);
    }
    this.equiparMelhorias();
    this.conferirKit();
  }

  // Sucata: materiais (o bot não refina), peças que a classe não usa e peças da classe que não são
  // melhores que as equipadas no espaço. Peça da classe ainda sem requisito (para mais tarde) fica.
  ehSucata(def) {
    if (def.kind === 'consumable' || def.questItem || !(def.value > 0)) return false;
    if (!def.slot || !this.serveParaMim(def)) return true;
    const equipados = this.char.items.filter((i) => i.loc === 'equip' && this.data.items[i.defId].slot === def.slot).map((i) => valorItem(this.data.items[i.defId]));
    return equipados.length >= (def.slot === 'ring' ? 2 : 1) && Math.min(...equipados) >= valorItem(def);
  }

  // Vende a sucata da bolsa a qualquer comerciante ('sell': valor × economy.sellFraction).
  venderSucata(npc) {
    for (const it of [...this.char.items]) {
      if (it.loc !== 'bag' || !this.ehSucata(this.data.items[it.defId])) continue;
      const r = this.cli.pedir('sell', { npc: npc.id, instance: it.id });
      if (!r.ok) { this.rejeitou('sell', r); continue; }
      this.recebeChar(r.char);
      this.met().ouroVendas += r.gold;
      this.vendas.itens += it.qty; this.vendas.ouro += r.gold;
    }
  }

  executarTarefa(eu, mundo) {
    const t = this.tarefa;
    const c = this.cidade;
    if (this.instancia) return this.lutarNaProva(eu, mundo);
    this.atividade = 'cidade';
    if (this.mapa !== c.mapId) {
      const npc = t.armeiro && c.armeiro ? c.armeiro : t.comprar ? c.loja : c.mestre;
      return this.viajar(c.mapId, npc.x, npc.z + 2, t.motivo);
    }
    // armeiro primeiro (vende a sucata e compra o equipamento com o que sobra da reserva de tônicos),
    // depois a loja de tônicos, a poucos metros
    if (t.armeiro) {
      if (c.armeiro) {
        if (!this.perto(eu, c.armeiro)) return;
        this.venderSucata(c.armeiro);
        this.comprarEquipamento(c.armeiro);
      }
      t.armeiro = false;
      return;
    }
    if (t.comprar) {
      if (!this.perto(eu, c.loja)) return;
      if (!c.armeiro) this.venderSucata(c.loja);
      this.comprar(c.loja);
      t.comprar = false;
      return;
    }
    if (t.prova && !this.char.trialDone && this.tentativasProva < 3) {
      if (!this.perto(eu, c.mestre)) return;
      if (eu.hp / eu.mhp < 0.95 || this.mpPct() < 0.9) { this.descansar(); return; }
      if (!t.missao) {
        this.cli.pedir('gm', { cmd: 'quest_done', quests: this.cadeiaProva });
        const a = this.cli.pedir('quest_accept', { quest: 'c3_trial', npc: c.mestre.id });
        if (!a.ok) this.rejeitou('quest_accept', a);
        t.missao = true;
      }
      this.tentativasProva++;
      this.provaInicio = this.now;
      const r = this.cli.pedir('trial_start', { npc: c.mestre.id });
      if (!r.ok) { this.rejeitou('trial_start', r); this.log('prova recusada:', r.reason); }
      return;
    }
    // terminou na cidade: volta para a caça
    this.tarefa = null;
    this.reavaliarArea = true;
    const destino = escolherArea(this.areas, this.adj, { nivel: this.level, ajuste: this.ajuste, mapaAtual: this.mapa, evitar: this.areasEvitadas() });
    this.area = destino;
    this.reavaliarArea = false;
    this.viajar(destino.mapId, this.data.maps[destino.mapId].guardPost.x, this.data.maps[destino.mapId].guardPost.z, 'caca');
  }

  lutarNaProva(eu, mundo) {
    this.atividade = 'prova';
    const ms = this.monstros(mundo);
    if (!ms.length) return;
    const alvo = ms.reduce((b, m) => (!b || dist(eu, m) < dist(eu, b) ? m : b), null);
    const r = this.cli.pedir('attack', { target: alvo.id });
    if (r.ok) { this.alvoId = alvo.id; this.alvoDesde = this.now; this.alvoVidaInicio = alvo.hp; } else this.rejeitou('attack', r);
  }

  perto(eu, npc) {
    if (dist(eu, npc) <= 4) return true;
    if (!this.andando || this.andando.motivo !== `npc:${npc.id}`) this.moverPara(npc.x, npc.z + 1.5, `npc:${npc.id}`);
    return false;
  }

  comprar(loja) {
    let orcamento = Math.floor(this.char.gold * 0.8); // guarda 20% do ouro
    const compra = (defId, alvoQtd) => {
      let falta = Math.max(0, alvoQtd - this.bolsa([defId]));
      const p = this.preco(defId);
      while (falta > 0) {
        const qtd = Math.min(falta, 50, Math.floor(orcamento / p));
        if (qtd < 1) break;
        const r = this.cli.pedir('buy', { npc: loja.id, item: defId, qty: qtd });
        if (!r.ok) { this.rejeitou('buy', r); break; }
        this.recebeChar(r.char);
        orcamento -= r.cost;
        this.met().ouroGasto += r.cost; this.met().ouroGastoPocoes += r.cost;
        const ultima = this.compras.at(-1);
        if (ultima && ultima.item === defId && ultima.minuto === Math.round(this.now / 60000)) { ultima.qtd += qtd; ultima.custo += r.cost; }
        else this.compras.push({ nivel: this.level, item: defId, qtd, custo: r.cost, minuto: Math.round(this.now / 60000) });
        falta -= qtd;
      }
    };
    // tônico médio (a partir do nível 9) se o orçamento comprar 40 deles; senão o pequeno, que
    // cura menos por gole e custa quase o mesmo por ponto de vida
    const porCompra = this.conjurador ? orcamento / 2 : orcamento;
    const vida = this.level >= 9 && porCompra >= this.preco('potion_hp_m') * 40 ? 'potion_hp_m' : 'potion_hp_s';
    const mana = this.level >= 9 && porCompra >= this.preco('potion_mp_m') * 40 ? 'potion_mp_m' : 'potion_mp_s';
    // estoque: o padrão ou 2,5 × o que gastou no nível anterior (o que for maior), até 300 (alvosPocoes)
    const { vida: alvoVida, mana: alvoMana } = this.alvosPocoes();
    const pedidos = [
      [vida, alvoVida - (this.bolsa(POCOES_VIDA) - this.bolsa([vida]))],
      [mana, alvoMana - (this.bolsa(POCOES_MANA) - this.bolsa([mana]))],
    ];
    if (this.conjurador) {
      // divide o orçamento: metade para cada tipo antes de completar
      const metade = Math.floor(orcamento / 2);
      const total = orcamento;
      orcamento = metade; compra(...pedidos[0]);
      orcamento = total - (metade - orcamento); compra(...pedidos[1]);
      compra(...pedidos[0]);
    } else for (const p of pedidos) compra(...p);
  }

  // ---------- viagem e deslocamento ----------
  viajar(mapId, x, z, motivo) {
    if (mapId === this.mapa) return true;
    const r = rota(this.adj, this.mapa, mapId, this.level) ?? rota(this.adj, this.mapa, mapId, 99);
    const saltos = r ? r.length : 1;
    const res = this.cli.pedir('gm', { cmd: 'teleport', mapId, x, z });
    if (!res.ok) { this.rejeitou('teleport', res); return false; }
    this.viagens++;
    this.met().viagens += saltos;
    this.viagensPorMotivo[motivo] = (this.viagensPorMotivo[motivo] || 0) + saltos;
    this.esperaAte = this.now + saltos * this.op.viagemPorMapaMs;
    this.atividade = 'viagem';
    this.alvoId = null; this.andando = null;
    this.log(`viagem (${motivo}) para ${mapId}: ${saltos} troca(s) de mapa`);
    return true;
  }

  moverPara(x, z, motivo) {
    const r = this.cli.pedir('move', { x, z });
    if (!r.ok) { this.rejeitou('move', r); return false; }
    this.andando = { x: r.dest.x, z: r.dest.z, motivo, desde: this.now };
    this.alvoId = null;
    return true;
  }

  areasEvitadas() {
    const s = new Set();
    for (const [id, ate] of this.evitarArea) if (ate > this.now) s.add(id);
    return s;
  }

  planejarArea() {
    if (!this.area || this.reavaliarArea) {
      const nova = escolherArea(this.areas, this.adj, { nivel: this.level, ajuste: this.ajuste, mapaAtual: this.mapa, evitar: this.areasEvitadas() });
      this.reavaliarArea = false;
      if (nova && nova.id !== this.area?.id) { this.log('área:', nova.mapId, nova.monster, `nv${nova.def.level}`); this.area = nova; this.andando = null; }
    }
    if (this.area && this.area.mapId !== this.mapa) {
      const gp = this.data.maps[this.area.mapId].guardPost;
      this.viajar(this.area.mapId, gp.x, gp.z, 'caca');
      return true;
    }
    return false;
  }

  // Ponto de espera/descanso da área: do lado do posto de guarda, fora do alcance de agressão
  // (8 m) dos monstros que passeiam até 4 m de casa.
  pontoDeEspera(a) {
    const gp = a.guardPost;
    const dx = gp.x - a.x, dz = gp.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    const r = a.radius + (a.def.aggro === 'aggressive' ? 13 : 3);
    return { x: a.x + (dx / d) * r, z: a.z + (dz / d) * r };
  }

  cacar(eu, mundo) {
    const a = this.area;
    if (!a || this.now < (this.pausaAte ?? 0)) { this.atividade = 'espera'; return; }
    const p = this.pontoDeEspera(a);
    const longe = dist(eu, p) > 30;
    // alvo: primeiro o monstro da área (o da borda do grupo, perto do bot); outro monstro do
    // nível só se não houver nenhum da área disponível
    let alvo = null, nota = Infinity, alvoOutro = null, notaOutro = Infinity;
    const ms = this.monstros(mundo);
    for (const m of ms) {
      if (m.st === 'return' || (this.evitarAlvo.get(m.id) || 0) > this.now) continue;
      const def = this.data.monsters[m.def];
      if (!def || def.rank !== 'normal' || def.daily) continue;
      const dm = dist(eu, m);
      const daArea = m.def === a.monster && dist(m, a) <= a.radius + 12;
      if (!daArea && (def.level > this.level + 1 || def.level < this.level - 2)) continue;
      if (!daArea && dm > 20) continue;
      if (longe && dm > 25) continue;
      let vizinhos = 0;
      for (const o of ms) {
        if (o === m || o.tgt === this.eid) continue;
        const od = this.data.monsters[o.def];
        if (od?.aggro !== 'aggressive' || dist(o, m) > 8.5) continue;
        vizinhos += o.def === m.def ? 10 : 6;
      }
      const n = dm + vizinhos;
      if (daArea) { if (n < nota) { nota = n; alvo = m; } }
      // outro monstro só quando já está na área (a caminho dela, segue andando)
      else if (!longe && def.level >= this.level - 1 && n < notaOutro) { notaOutro = n; alvoOutro = m; }
    }
    alvo ??= alvoOutro;
    if (alvo) {
      this.atividade = 'deslocamento';
      const r = this.cli.pedir('attack', { target: alvo.id });
      if (r.ok) { this.alvoId = alvo.id; this.alvoDesde = this.now; this.alvoVidaInicio = alvo.hp; this.andando = null; }
      else this.rejeitou('attack', r);
      return;
    }
    if (dist(eu, p) > 2.5) {
      this.atividade = 'deslocamento';
      if (!this.andando || this.andando.motivo !== 'area' || (eu.vx === 0 && eu.vz === 0 && this.now - this.andando.desde > 1500)) {
        if (!this.moverPara(p.x, p.z, 'area')) {
          // ponto bloqueado: tenta o centro da área
          this.moverPara(a.x, a.z, 'area');
        }
      }
      return;
    }
    this.atividade = 'espera';
    this.andando = null;
  }

  // ---------- resultados ----------
  resultados() {
    const metas = this.data.xp.targetMinutesToNext;
    const niveis = [...this.niveis.values()].sort((a, b) => a.nivel - b.nivel).map((m) => {
      const fim = m.fimMs ?? null;
      const minutos = fim != null ? (fim - m.inicioMs) / 60000 : null;
      const meta = metas[m.nivel - 1] ?? null;
      const min = minutos ?? (this.now - m.inicioMs) / 60000;
      return {
        nivel: m.nivel, concluido: fim != null, minutos: fim != null ? r2(minutos) : null, meta,
        desvioPct: minutos != null && meta ? r1((minutos / meta - 1) * 100) : null,
        abates: m.abates, abatesPorMin: min > 0 ? r2(m.abates / min) : 0, mortes: m.mortes, fugas: m.fugas,
        pocoesVida: m.pocoesVida, pocoesMana: m.pocoesMana, pocoesFora: m.pocoesFora, ouroSaqueado: m.ouroSaqueado, ouroDropado: m.ouroDropado, ouroVendas: m.ouroVendas,
        ouroGasto: m.ouroGasto, ouroGastoPocoes: m.ouroGastoPocoes, ouroGastoEquip: m.ouroGastoEquip,
        xpAbates: m.xpAbates, viagens: m.viagens, danoCausado: m.danoCausado, danoRecebido: m.danoRecebido, cura: m.cura,
        tempos: Object.fromEntries(Object.entries(m.tempos).map(([k, v]) => [k, r1(v / 1000)])),
        monstros: m.monstros,
      };
    });
    const ultimo = niveis.filter((n) => n.concluido && n.nivel < this.ateNivel);
    return {
      classId: this.classId, seed: this.seed, concluiu: this.level >= this.ateNivel, nivelFinal: this.level,
      minutosTotais: r2(ultimo.reduce((s, n) => s + n.minutos, 0)), simMs: this.now,
      plano: this.plano.fonte, niveis, equipamento: this.equipamento, provas: this.provas, compras: this.compras,
      rejeicoes: this.rejeicoes, saquesIgnorados: this.ignorados, trocasDeArea: this.viagens, destravamentos: this.destravamentos,
      vendas: this.vendas, ouroFinal: this.char?.gold ?? 0, anomalias: this.anomalias, dano: this.dano,
      trocasPorPerigo: this.trocasPorPerigo ?? 0, viagensPorMotivo: this.viagensPorMotivo, mortesPor: this.mortesPor, mortesDetalhe: this.mortesDetalhe, lutas: this.lutas,
      habilidadesDeAreaEvitadas: this.areaEvitada ?? 0, conjuracoes: this.conjuracoes, faixas: this.faixas,
      equipadoFinal: (this.char?.items ?? []).filter((i) => i.loc === 'equip').map((i) => i.defId),
      protocolo: { ...this.cli.contagem, snapshotsPorDiferenca: this.cli.delta },
      atributosFinais: this.char?.permanent ?? null, habilidadesFinais: this.char?.skills ?? null, provaVencida: !!this.char?.trialDone,
    };
  }
}

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
