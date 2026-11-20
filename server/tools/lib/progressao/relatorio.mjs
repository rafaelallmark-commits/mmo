// Agregação dos resultados (média por classe e por nível, desvio contra as metas de
// data/xp_table.json) e relatório em Markdown (pt-BR).

const media = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const soma = (xs) => xs.reduce((s, v) => s + v, 0);
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
export const FAIXA_TOLERANCIA = 25; // % em torno da meta

const BANDAS = [[1, 4], [5, 8], [9, 12], [13, 16], [17, 19]];
const TEMPOS = ['combate', 'deslocamento', 'saque', 'espera', 'descanso', 'fuga', 'morto', 'viagem', 'cidade', 'prova'];

export function agregar(execucoes, data, parametros) {
  const metas = data.xp.targetMinutesToNext;
  const ate = parametros.ateNivel;
  const metaTotal = soma(metas.slice(0, ate - 1));
  const porClasse = new Map();
  for (const e of execucoes) {
    if (!porClasse.has(e.classId)) porClasse.set(e.classId, []);
    porClasse.get(e.classId).push(e);
  }
  const classes = {};
  for (const [cid, todas] of porClasse) {
    // médias só com as execuções que chegaram ao nível final (as outras aparecem na contagem)
    const ok = todas.filter((r) => r.concluiu);
    const runs = ok.length ? ok : todas;
    const niveis = [];
    for (let L = 1; L < ate; L++) {
      const ls = runs.map((r) => r.niveis.find((n) => n.nivel === L)).filter((n) => n?.concluido);
      if (!ls.length) continue;
      const m = (f) => media(ls.map(f));
      const minutos = m((n) => n.minutos);
      const monstros = {};
      for (const n of ls) for (const [k, v] of Object.entries(n.monstros)) monstros[k] = (monstros[k] || 0) + v;
      const principal = Object.entries(monstros).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      niveis.push({
        nivel: L, meta: metas[L - 1], minutos: r2(minutos), minMin: r2(Math.min(...ls.map((n) => n.minutos))), maxMin: r2(Math.max(...ls.map((n) => n.minutos))),
        desvioPct: r1((minutos / metas[L - 1] - 1) * 100), fora: Math.abs(minutos / metas[L - 1] - 1) * 100 > FAIXA_TOLERANCIA,
        abates: r1(m((n) => n.abates)), abatesPorMin: r2(soma(ls.map((n) => n.abates)) / soma(ls.map((n) => n.minutos))),
        mortes: r2(m((n) => n.mortes)), fugas: r2(m((n) => n.fugas)), pocoesVida: r1(m((n) => n.pocoesVida)), pocoesMana: r1(m((n) => n.pocoesMana)),
        ouroSaqueado: Math.round(m((n) => n.ouroSaqueado)), ouroGasto: Math.round(m((n) => n.ouroGasto)), xpAbates: Math.round(m((n) => n.xpAbates)),
        danoRecebido: Math.round(m((n) => n.danoRecebido)), danoCausado: Math.round(m((n) => n.danoCausado)),
        tempos: Object.fromEntries(TEMPOS.map((k) => [k, r1(m((n) => n.tempos[k] || 0))])),
        monstro: principal, monstroNome: principal ? data.monsters[principal].name : null, monstroNivel: principal ? data.monsters[principal].level : null,
      });
    }
    const horas = runs.map((r) => r.minutosTotais / 60);
    const tot = (f) => media(runs.map((r) => soma(r.niveis.map(f))));
    const horasTot = media(horas);
    const economia = {
      ouroSaqueado: Math.round(tot((n) => n.ouroSaqueado)), ouroGasto: Math.round(tot((n) => n.ouroGasto)),
      ouroFinal: Math.round(media(runs.map((r) => r.ouroFinal))),
      ouroPorHora: Math.round(tot((n) => n.ouroSaqueado) / horasTot), gastoPorHora: Math.round(tot((n) => n.ouroGasto) / horasTot),
      pocoesVida: Math.round(tot((n) => n.pocoesVida)), pocoesMana: Math.round(tot((n) => n.pocoesMana)),
      comprados: Math.round(media(runs.map((r) => soma(r.compras.map((c) => c.qtd))))),
      viagensCompra: r1(media(runs.map((r) => new Set(r.compras.map((c) => c.minuto)).size))),
      bandas: BANDAS.map(([a, b]) => {
        const sel = (r) => r.niveis.filter((n) => n.nivel >= a && n.nivel <= b && n.concluido);
        const h = media(runs.map((r) => soma(sel(r).map((n) => n.minutos)) / 60));
        const ganho = media(runs.map((r) => soma(sel(r).map((n) => n.ouroSaqueado))));
        const gasto = media(runs.map((r) => soma(sel(r).map((n) => n.ouroGasto))));
        const pv = media(runs.map((r) => soma(sel(r).map((n) => n.pocoesVida + n.pocoesMana))));
        return { niveis: `${a}–${b}`, horas: r2(h), ouroPorHora: h ? Math.round(ganho / h) : 0, gastoPorHora: h ? Math.round(gasto / h) : 0, pocoesPorHora: h ? r1(pv / h) : 0 };
      }),
    };
    const equipamento = {
      kit: r1(media(runs.map((r) => r.equipamento.filter((e) => e.fonte === 'kit' && e.nivel > 1).length))),
      kitFaixa1: r1(media(runs.map((r) => r.equipamento.filter((e) => e.fonte === 'kit' && e.nivel === 1).length))),
      porSaqueAteFaixa: r1(media(runs.map((r) => r.equipamento.filter((e) => e.fonte === 'ja_tinha').length))),
      saque: r1(media(runs.map((r) => r.equipamento.filter((e) => e.fonte === 'saque').length))),
      exemplosSaque: [...new Set(runs.flatMap((r) => r.equipamento.filter((e) => e.fonte === 'saque').map((e) => e.item)))].slice(0, 8),
    };
    const fontes = {};
    for (const r of runs) for (const [k, v] of Object.entries(r.dano.porFonte)) fontes[k] = (fontes[k] || 0) + v;
    const totalDano = soma(Object.values(fontes)) || 1;
    classes[cid] = {
      nome: data.classes[cid].name, execucoes: todas.length, concluidas: ok.length, plano: runs[0].plano,
      horas: r2(horasTot), horasMin: r2(Math.min(...horas)), horasMax: r2(Math.max(...horas)), desvioPct: r1((horasTot * 60 / metaTotal - 1) * 100),
      mortes: r1(tot((n) => n.mortes)), fugas: r1(tot((n) => n.fugas)), abates: Math.round(tot((n) => n.abates)),
      niveis, economia, equipamento,
      tempos: Object.fromEntries(TEMPOS.map((k) => [k, r1(tot((n) => n.tempos[k] || 0) / 60)])),
      // trocas de mapa por motivo (caça = ir/voltar de áreas, incluindo fugir de perigo)
      viagens: ['caca', 'compras', 'deposito', 'prova'].reduce((acc, k) => ((acc[k] = r1(media(runs.map((r) => r.viagensPorMotivo?.[k] ?? 0)))), acc), {}),
      dano: {
        fontes: Object.fromEntries(Object.entries(fontes).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r1((v / totalDano) * 100)])),
        causadoPorMin: Math.round(media(runs.map((r) => r.dano.causado / Math.max(1, r.minutosTotais)))),
        recebidoPorMin: Math.round(media(runs.map((r) => r.dano.recebido / Math.max(1, r.minutosTotais)))),
        acertoPct: r1(media(runs.map((r) => (r.dano.golpes / Math.max(1, r.dano.golpes + r.dano.erros)) * 100))),
        curaPorMin: Math.round(media(runs.map((r) => r.dano.cura / Math.max(1, r.minutosTotais)))),
      },
      prova: {
        vencida: runs.filter((r) => r.provaVencida).length, tentativas: r1(media(runs.map((r) => r.provas.length))),
        duracaoS: Math.round(media(runs.flatMap((r) => r.provas.filter((p) => p.resultado === 'success').map((p) => p.duracaoS)))),
      },
      anomalias: todas.flatMap((r) => r.anomalias.map((a) => ({ ...a, seed: r.seed }))),
      rejeicoes: todas.reduce((acc, r) => { for (const [k, v] of Object.entries(r.rejeicoes)) acc[k] = (acc[k] || 0) + v; return acc; }, {}),
      naoConcluidas: todas.filter((r) => !r.concluiu).map((r) => ({ seed: r.seed, nivelFinal: r.nivelFinal })),
      mortesPor: runs.reduce((acc, r) => { for (const [k, v] of Object.entries(r.mortesPor ?? {})) acc[k] = r2((acc[k] || 0) + v / runs.length); return acc; }, {}),
      destravamentos: soma(todas.map((r) => r.destravamentos)), trocasPorPerigo: r1(media(runs.map((r) => r.trocasPorPerigo))),
      depositados: r1(media(runs.map((r) => r.depositados))), saquesIgnorados: Math.round(media(runs.map((r) => r.saquesIgnorados))),
      atributosFinais: runs[0].atributosFinais, habilidadesFinais: runs[0].habilidadesFinais,
      tempoRealS: r1(soma(todas.map((r) => r.tempoRealS))), horasSimuladas: r2(soma(todas.map((r) => r.horasSimuladas))),
      zonas: runs[0].zonas, protocolo: runs[0].protocolo,
    };
  }
  // média das classes por nível
  const ids = Object.keys(classes);
  const agregado = [];
  for (let L = 1; L < ate; L++) {
    const vals = ids.map((c) => classes[c].niveis.find((n) => n.nivel === L)).filter(Boolean);
    if (!vals.length) continue;
    const mm = media(vals.map((v) => v.minutos));
    const meta = metas[L - 1];
    const lento = vals.reduce((a, b) => (b.minutos > a.minutos ? b : a));
    const rapido = vals.reduce((a, b) => (b.minutos < a.minutos ? b : a));
    agregado.push({
      nivel: L, meta, mediaMin: r2(mm), desvioPct: r1((mm / meta - 1) * 100), fora: Math.abs(mm / meta - 1) * 100 > FAIXA_TOLERANCIA,
      classesFora: vals.filter((v) => v.fora).length,
      maisRapida: { classId: ids.find((c) => classes[c].niveis.includes(rapido)), minutos: rapido.minutos },
      maisLenta: { classId: ids.find((c) => classes[c].niveis.includes(lento)), minutos: lento.minutos },
      abatesPorMin: r2(media(vals.map((v) => v.abatesPorMin))), mortes: r2(media(vals.map((v) => v.mortes))),
    });
  }
  const horasMedia = media(ids.map((c) => classes[c].horas));
  return {
    metaTotalHoras: r2(metaTotal / 60), horasMediaClasses: r2(horasMedia), desvioTotalPct: r1((horasMedia * 60 / metaTotal - 1) * 100),
    classes, agregado,
  };
}

// ---------- Markdown ----------
const num = (v, d = 1) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const int = (v) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const pct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${num(v, 0)}%`);
const tabela = (cab, linhas) => [`| ${cab.join(' | ')} |`, `|${cab.map(() => '---').join('|')}|`, ...linhas.map((l) => `| ${l.join(' | ')} |`)].join('\n');

export function relatorioMarkdown(rel, data, parametros, problemas, extras = {}) {
  const { classes, agregado } = rel;
  const ids = Object.keys(classes);
  const L = [];
  const p = parametros;
  L.push('<!-- Arquivo gerado por `npm run simular-progressao` (server/tools/simular-progressao.mjs). Rode de novo para atualizar. -->');
  L.push('');
  L.push('# Relatório de progressão simulada (Marco 4)');
  L.push('');
  L.push(`Simulação acelerada, em processo, de caça solo do nível 1 ao ${p.ateNivel} para ${ids.length} classes, contra as metas de teste de \`data/xp_table.json\` (\`targetMinutesToNext\`, ver [docs/04](04-progressao-e-formulas.md)). Cada classe foi jogada por um bot que só caça (sem missões), com ${p.repeticoes} ${p.repeticoes === 1 ? 'semente' : 'sementes'} (${p.sementes.join(', ')}). Os números abaixo são **médias das sementes**; a meta é considerada atingida quando o tempo fica a até ±${FAIXA_TOLERANCIA}% dela.`);
  L.push('');
  L.push(`Gerado em ${p.geradoEm} · tempo real ${num(p.tempoRealS / 60, 1)} min (${p.paralelo} linhas de execução) · ${num(soma(ids.map((c) => classes[c].horasSimuladas)), 0)} h de jogo simuladas.`);
  L.push('');
  L.push('```');
  L.push(`cd server && npm run simular-progressao${p.linhaDeComando ? ` -- ${p.linhaDeComando}` : ''}`);
  L.push('```');
  L.push('');
  // resumo
  L.push('## Resumo');
  L.push('');
  L.push(`- Meta só caça do 1 ao ${p.ateNivel}: **${num(rel.metaTotalHoras, 1)} h**. Média das classes: **${num(rel.horasMediaClasses, 2)} h** (${pct(rel.desvioTotalPct)}).`);
  const ordem = [...ids].sort((a, b) => classes[a].horas - classes[b].horas);
  L.push(`- Mais rápida: ${classes[ordem[0]].nome} (${num(classes[ordem[0]].horas, 2)} h); mais lenta: ${classes[ordem.at(-1)].nome} (${num(classes[ordem.at(-1)].horas, 2)} h) — razão ${num(classes[ordem.at(-1)].horas / classes[ordem[0]].horas, 1)}×.`);
  const foraAg = agregado.filter((a) => a.fora);
  L.push(`- Níveis em que a média das classes sai da faixa de ±${FAIXA_TOLERANCIA}%: ${foraAg.length ? foraAg.map((a) => `${a.nivel} (${pct(a.desvioPct)})`).join(', ') : 'nenhum'}.`);
  for (const t of extras.destaques ?? []) L.push(`- ${t}`);
  L.push('');
  L.push(tabela(['Classe', 'Horas 1→' + p.ateNivel + ' (média)', 'Mín–máx', 'Desvio da meta', 'Abates', 'Mortes', 'Fugas', 'Tônicos V/M', 'Ouro/h saqueado', 'Ouro/h em tônicos', 'Prova'],
    ordem.map((c) => {
      const k = classes[c];
      return [k.nome, num(k.horas, 2), `${num(k.horasMin, 2)}–${num(k.horasMax, 2)}`, pct(k.desvioPct), int(k.abates), num(k.mortes, 1), num(k.fugas, 1), `${int(k.economia.pocoesVida)} / ${int(k.economia.pocoesMana)}`, int(k.economia.ouroPorHora), int(k.economia.gastoPorHora), `${k.prova.vencida}/${k.execucoes}`];
    })));
  L.push('');
  L.push('### Para onde vai o tempo');
  L.push('');
  L.push(`Fatia do tempo total de cada classe. Viagens: trocas de mapa a ${num(p.viagemPorMapaS, 0)} s cada, com a quantidade média por motivo (caça inclui trocar de área por perigo).`);
  L.push('');
  L.push(tabela(['Classe', 'Combate', 'Deslocamento e saque', 'Recuperação', 'Viagens', 'Trocas de mapa: caça / compras / prova', 'Cidade e prova', 'Caído e fugindo'],
    ordem.map((c) => {
      const k = classes[c];
      const t = k.tempos;
      const tt = soma(Object.values(t)) || 1;
      const f = (v) => `${num((v / tt) * 100, 0)}%`;
      return [k.nome, f(t.combate), f(t.deslocamento + t.saque + t.espera), f(t.descanso), f(t.viagem), `${num(k.viagens.caca, 0)} / ${num(k.viagens.compras + k.viagens.deposito, 0)} / ${num(k.viagens.prova, 0)}`, f(t.cidade + t.prova), f(t.morto + t.fuga)];
    })));
  L.push('');
  // agregado por nível
  L.push('## Tempo por nível: média das classes × meta');
  L.push('');
  L.push(`Minutos simulados para sair de cada nível. "Fora" marca a média fora de ±${FAIXA_TOLERANCIA}% da meta; a coluna seguinte conta quantas classes, individualmente, ficaram fora.`);
  L.push('');
  L.push(tabela(['Nível', 'Meta (min)', 'Média (min)', 'Desvio', 'Faixa', 'Classes fora', 'Mais rápida', 'Mais lenta', 'Abates/min', 'Mortes'],
    agregado.map((a) => [a.nivel, num(a.meta, 1), num(a.mediaMin, 1), pct(a.desvioPct), a.fora ? '**fora**' : 'ok', `${a.classesFora}/${ids.length}`,
      `${classes[a.maisRapida.classId].nome} ${num(a.maisRapida.minutos, 1)}`, `${classes[a.maisLenta.classId].nome} ${num(a.maisLenta.minutos, 1)}`, num(a.abatesPorMin, 1), num(a.mortes, 2)])));
  L.push('');
  // minutos por classe e nível (matriz)
  L.push('### Minutos por nível e classe');
  L.push('');
  L.push(tabela(['Nível', 'Meta', ...ordem.map((c) => classes[c].nome)],
    agregado.map((a) => [a.nivel, num(a.meta, 1), ...ordem.map((c) => {
      const n = classes[c].niveis.find((x) => x.nivel === a.nivel);
      return n ? (n.fora ? `**${num(n.minutos, 1)}**` : num(n.minutos, 1)) : '—';
    })])));
  L.push('');
  L.push(`Negrito: fora de ±${FAIXA_TOLERANCIA}% da meta.`);
  L.push('');
  // por classe
  L.push('## Detalhe por classe');
  L.push('');
  for (const c of ordem) {
    const k = classes[c];
    L.push(`### ${k.nome} (\`${c}\`)`);
    L.push('');
    const t = k.tempos;
    const ttot = soma(Object.values(t)) || 1;
    const fatia = (x) => `${num((t[x] / ttot) * 100, 0)}%`;
    const fonte = (f) => ({ basico: 'ataque básico', dot: 'dano contínuo', sacred: 'dano sagrado extra', thorns: 'queimadura do escudo' })[f] ?? data.skills[f]?.name ?? f;
    L.push(`${num(k.horas, 2)} h do 1 ao ${p.ateNivel} (${pct(k.desvioPct)} da meta; ${k.concluidas}/${k.execucoes} execuções concluídas). Plano de atributos: ${k.plano}. Tempo: combate ${fatia('combate')}, deslocamento e saque ${num(((t.deslocamento + t.saque + t.espera) / ttot) * 100, 0)}%, recuperação ${fatia('descanso')}, viagens ${fatia('viagem')}, cidade e prova ${num(((t.cidade + t.prova) / ttot) * 100, 0)}%, caído/fugindo ${num(((t.morto + t.fuga) / ttot) * 100, 0)}%. Dano por fonte: ${Object.entries(k.dano.fontes).slice(0, 5).map(([f, v]) => `${fonte(f)} ${num(v, 0)}%`).join(', ')}; acerto ${num(k.dano.acertoPct, 0)}%; ${int(k.dano.causadoPorMin)} de dano causado e ${int(k.dano.recebidoPorMin)} recebido por minuto${k.dano.curaPorMin ? `; ${int(k.dano.curaPorMin)} de cura por minuto` : ''}.`);
    L.push('');
    L.push(tabela(['Nível', 'Min', 'Meta', 'Desvio', 'Abates', 'Abates/min', 'Mortes', 'Fugas', 'Tônicos V/M', 'Ouro saqueado', 'Ouro gasto', 'XP de abates', 'Monstro principal'],
      k.niveis.map((n) => [n.nivel, n.fora ? `**${num(n.minutos, 1)}**` : num(n.minutos, 1), num(n.meta, 1), pct(n.desvioPct), num(n.abates, 0), num(n.abatesPorMin, 1), num(n.mortes, 1), num(n.fugas, 1), `${num(n.pocoesVida, 0)} / ${num(n.pocoesMana, 0)}`, int(n.ouroSaqueado), int(n.ouroGasto), int(n.xpAbates), n.monstroNome ? `${n.monstroNome} (${n.monstroNivel})` : '—'])));
    L.push('');
  }
  // economia
  L.push('## Economia: ouro ganho × gasto em tônicos');
  L.push('');
  L.push('Ouro saqueado inclui só moedas (não há venda de itens no jogo). Gasto = tônicos comprados na loja da cidade com ouro real (`buy`).');
  L.push('');
  L.push(tabela(['Classe', 'Ouro saqueado', 'Gasto em tônicos', 'Saldo no nível ' + p.ateNivel, 'Ouro/h', 'Gasto/h', 'Tônicos usados (V+M)', 'Comprados', 'Idas à loja'],
    ordem.map((c) => { const e = classes[c].economia; return [classes[c].nome, int(e.ouroSaqueado), int(e.ouroGasto), int(e.ouroFinal), int(e.ouroPorHora), int(e.gastoPorHora), int(e.pocoesVida + e.pocoesMana), int(e.comprados), num(e.viagensCompra, 1)]; })));
  L.push('');
  L.push('Por faixa de nível (média das classes): ouro saqueado por hora, gasto por hora e tônicos bebidos por hora.');
  L.push('');
  const bandas = classes[ordem[0]].economia.bandas.map((b) => b.niveis);
  L.push(tabela(['Níveis', 'Ouro/h', 'Gasto/h', 'Tônicos/h', 'Classe que mais gasta (gasto/h)'],
    bandas.map((bn, i) => {
      const bs = ordem.map((c) => ({ c, b: classes[c].economia.bandas[i] }));
      const topo = bs.reduce((a, b) => (b.b.gastoPorHora > a.b.gastoPorHora ? b : a));
      return [bn, int(media(bs.map((x) => x.b.ouroPorHora))), int(media(bs.map((x) => x.b.gastoPorHora))), num(media(bs.map((x) => x.b.pocoesPorHora)), 0), `${classes[topo.c].nome} (${int(topo.b.gastoPorHora)})`];
    })));
  L.push('');
  for (const t of extras.economia ?? []) L.push(`- ${t}`);
  L.push('');
  // prova de classe
  if (extras.comparacao) {
    const cp = extras.comparacao;
    L.push('## Efeito da prova de classe (habilidade do nível 10)');
    L.push('');
    L.push(`A rodada principal faz a prova de classe no nível 10 (premissas). Para medir também a caça pura, sem nenhuma missão, as mesmas sementes foram simuladas **sem a prova**: sem a habilidade marcante do nível 10 e sem o tempo da viagem e da luta na arena. Média das classes: **${num(cp.mediaCom, 2)} h com prova** (${pct(cp.desvioCom)} da meta) e **${num(cp.mediaSem, 2)} h sem prova** (${pct(cp.desvioSem)}).`);
    L.push('');
    L.push(tabela(['Classe', 'Habilidade do nível 10', 'Horas com prova', 'Horas sem prova', 'Diferença', 'Min nos níveis 10–19 (com / sem)', 'Mortes (com / sem)'],
      [...cp.linhas].sort((a, b) => b.difPct - a.difPct).map((l) => [l.nome, l.habilidade, num(l.comH, 2), num(l.semH, 2), pct(l.difPct), `${num(l.com10, 0)} / ${num(l.sem10, 0)}`, `${num(l.mortesCom, 1)} / ${num(l.mortesSem, 1)}`])));
    L.push('');
    L.push(tabela(['Nível', 'Meta (min)', 'Média com prova', 'Média sem prova'], cp.niveis.map((n) => [n.nivel, num(n.meta, 1), num(n.com, 1), num(n.sem, 1)])));
    L.push('');
    const venc = ids.reduce((s, c) => s + classes[c].prova.vencida, 0);
    const exec = ids.reduce((s, c) => s + classes[c].execucoes, 0);
    const tent = media(ids.map((c) => classes[c].prova.tentativas));
    const dur = media(ids.map((c) => classes[c].prova.duracaoS).filter((v) => v > 0));
    L.push(`Prova: ${venc} de ${exec} execuções venceram (${num(tent, 1)} tentativa(s) por execução em média; ${num(dur, 0)} s de luta na arena). A diferença de tempo inclui a ida à cidade da classe e a volta (2 × as trocas de mapa até lá). Com a habilidade extra o bot gasta mana em mais uma habilidade; ele só usa reforços de defesa caros, escudos e áreas em volta de si quando a luta pede (vários atacantes ou vida baixa), e nunca usa área que acorde monstro parado.`);
    L.push('');
  }
  // equipamento
  L.push('## Equipamento');
  L.push('');
  L.push('Peças comuns do kit da faixa (arma + mão secundária + 4 de armadura) obtidas por saque antes do nível da faixa versus modeladas como compradas/obtidas no nível da faixa (comando de mestre `give`, ver premissas).');
  L.push('');
  L.push(tabela(['Classe', 'Kit da faixa 1 completado no início', 'Peças das faixas 5–17 modeladas', 'Peças das faixas 5–17 que já tinha por saque', 'Peças úteis recolhidas do chão', 'Exemplos'],
    ordem.map((c) => { const e = classes[c].equipamento; return [classes[c].nome, num(e.kitFaixa1, 1), num(e.kit, 1), num(e.porSaqueAteFaixa, 1), num(e.saque, 1), e.exemplosSaque.map((x) => `\`${x}\``).join(', ') || '—']; })));
  L.push('');
  // premissas
  L.push('## Premissas do modelo');
  L.push('');
  for (const t of extras.premissas ?? []) L.push(`- ${t}`);
  L.push('');
  // problemas
  L.push('## Problemas e observações encontrados no jogo');
  L.push('');
  problemas.forEach((t, i) => L.push(`${i + 1}. ${t}`));
  L.push('');
  // técnica
  L.push('## Modo acelerado e desempenho da ferramenta');
  L.push('');
  for (const t of extras.tecnica ?? []) L.push(`- ${t}`);
  L.push('');
  return L.join('\n');
}
