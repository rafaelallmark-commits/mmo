// Simulação acelerada de progressão solo (Marco 4): um bot por classe caça do nível 1 ao teto
// num GameServer em processo (sem rede, banco temporário, modo dev) e o tempo de cada nível é
// comparado com as metas de data/xp_table.json. Ferramenta de MEDIÇÃO: não muda regra nem dado.
//
// Uso (na pasta server):
//   node --disable-warning=ExperimentalWarning tools/simular-progressao.mjs [--classes a,b]
//     [--ate-nivel 20] [--seed N] [--repeticoes R] [--paralelo P] [--saida arquivo.json]
//     [--md docs/relatorio-progressao.md] [--sem-md] [--sem-prova] [--sem-comparacao]
//     [--comparar-sem-prova] [--viagem-s 60] [--reacao-ms 200] [--pausa-ms 500]
//     [--banco-arquivo] [--detalhe]
//   npm run simular-progressao -- --classes breaker --repeticoes 1
//
// Padrões: todas as classes, teto de nível (data.levelCap, hoje 25), sementes 1..8 (--seed N --repeticoes R usa N..N+R−1),
// prova de classe no nível 10. Numa rodada completa também roda o mesmo lote sem a prova (caça
// pura) para comparar (--sem-comparacao desliga; --comparar-sem-prova liga numa rodada parcial).
// Sem --md, o relatório Markdown só é gravado (em docs/relatorio-progressao.md) quando a execução
// cobre todas as classes até o teto, para não sobrescrever o relatório com uma rodada parcial.
// O JSON (padrão: server/relatorio-progressao.json) é gerado e não vai para o git.
import { Worker } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { loadGameData } from '../src/data.js';
import { agregar, relatorioMarkdown, FAIXA_TOLERANCIA } from './lib/progressao/relatorio.mjs';
import { PADROES } from './lib/progressao/bot.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SERVIDOR = resolve(AQUI, '..');
const RAIZ = resolve(SERVIDOR, '..');

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i === -1 || argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? d : argv[i + 1]; };
const flag = (k) => argv.includes(`--${k}`);
if (flag('ajuda') || flag('help')) {
  console.log('Uso: node --disable-warning=ExperimentalWarning tools/simular-progressao.mjs [--classes a,b] [--ate-nivel 20] [--seed N] [--repeticoes R] [--paralelo P] [--saida arquivo.json] [--md arquivo.md] [--sem-md] [--sem-prova] [--sem-comparacao] [--comparar-sem-prova] [--viagem-s 60] [--reacao-ms 200] [--pausa-ms 500] [--banco-arquivo] [--detalhe]');
  process.exit(0);
}

const data = loadGameData();
const todas = Object.entries(data.classes).filter(([, c]) => ['M1', 'M2'].includes(c.implementedIn)).map(([id]) => id);
const classes = opt('classes') ? opt('classes').split(',').map((s) => s.trim()).filter(Boolean) : todas;
for (const c of classes) if (!todas.includes(c)) { console.error(`Classe inválida: ${c}. Opções: ${todas.join(', ')}`); process.exit(1); }
const ateNivel = Math.max(2, Math.min(data.levelCap, Number(opt('ate-nivel', data.levelCap))));
const seed = Number(opt('seed', 1));
const repeticoes = Math.max(1, Number(opt('repeticoes', 8)));
const paralelo = Math.max(1, Number(opt('paralelo', Math.max(1, Math.min(4, availableParallelism() - 1)))));
const sementes = Array.from({ length: repeticoes }, (_, i) => seed + i);
const opcoes = {
  prova: !flag('sem-prova'),
  viagemPorMapaMs: Number(opt('viagem-s', PADROES.viagemPorMapaMs / 1000)) * 1000,
  reacaoMs: Number(opt('reacao-ms', PADROES.reacaoMs)),
  pausaAposAbateMs: Number(opt('pausa-ms', PADROES.pausaAposAbateMs)),
  detalhe: flag('detalhe'),
};
const completa = classes.length === todas.length && ateNivel === data.levelCap;
// rodada completa com prova: também roda o lote "só caça pura" (sem a prova) para comparar
const comparar = opcoes.prova && ateNivel > 10 && !flag('sem-comparacao') && (completa || flag('comparar-sem-prova'));
const saida = resolve(opt('saida', join(SERVIDOR, 'relatorio-progressao.json')));
const md = flag('sem-md') ? null : opt('md') ? resolve(opt('md')) : completa ? join(RAIZ, 'docs', 'relatorio-progressao.md') : null;

const t0 = performance.now();
const erros = [];

function rodar(t, ops, conta) {
  return new Promise((ok) => {
    const w = new Worker(join(AQUI, 'lib', 'progressao', 'worker.mjs'), {
      workerData: { classId: t.classId, seed: t.seed, ateNivel, opcoes: ops, bancoArquivo: flag('banco-arquivo'), maxHoras: 60 },
      execArgv: ['--disable-warning=ExperimentalWarning'],
    });
    w.on('message', (m) => {
      if (m.tipo === 'nivel' && ops.detalhe) console.log(`  [${m.classId} s${m.seed}] ${m.info.de}→${m.info.para} em ${m.info.minutos.toFixed(1)} min (meta ${data.xp.targetMinutesToNext[m.info.de - 1]}), ${m.info.abates} abates, ${m.info.mortes} mortes`);
      if (m.tipo === 'fim') {
        conta.resultados.push(m.res);
        const r = m.res;
        console.log(`[${++conta.feitas}/${conta.total}] ${data.classes[r.classId].name} (semente ${r.seed}${ops.prova ? '' : ', sem prova'}): ${(r.minutosTotais / 60).toFixed(2)} h até o nível ${r.nivelFinal}${r.concluiu ? '' : ' (NÃO CONCLUIU)'} em ${r.tempoRealS.toFixed(1)} s reais`);
      }
      if (m.tipo === 'erro') { erros.push(m); console.error(`[${++conta.feitas}/${conta.total}] ERRO ${m.classId} semente ${m.seed}:\n${m.erro}`); }
    });
    w.on('error', (e) => { erros.push({ classId: t.classId, seed: t.seed, erro: String(e?.stack ?? e) }); console.error(e); ok(); });
    w.on('exit', () => ok());
  });
}

async function lote(ops) {
  const tarefas = classes.flatMap((classId) => sementes.map((s) => ({ classId, seed: s })));
  const conta = { resultados: [], feitas: 0, total: tarefas.length };
  console.log(`Simulando ${classes.length} classe(s) × ${repeticoes} semente(s) (${sementes.join(', ')}) até o nível ${ateNivel}, ${paralelo} em paralelo${ops.prova ? '' : ', sem prova de classe'}.`);
  const fila = [...tarefas];
  await Promise.all(Array.from({ length: Math.min(paralelo, fila.length) }, async () => { while (fila.length) await rodar(fila.shift(), ops, conta); }));
  return conta.resultados.sort((a, b) => classes.indexOf(a.classId) - classes.indexOf(b.classId) || a.seed - b.seed);
}

const resultados = await lote(opcoes);
if (!resultados.length) { console.error('Nenhuma simulação terminou.'); process.exit(1); }
const semProvaRes = comparar ? await lote({ ...opcoes, prova: false }) : null;
const tempoRealS = (performance.now() - t0) / 1000;

const parametros = {
  geradoEm: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC', classes, ateNivel, sementes, repeticoes, paralelo, tempoRealS: Math.round(tempoRealS),
  prova: opcoes.prova, comparacaoSemProva: !!semProvaRes, viagemPorMapaS: opcoes.viagemPorMapaMs / 1000, reacaoMs: opcoes.reacaoMs, pausaAposAbateMs: opcoes.pausaAposAbateMs, tickMs: 100,
  linhaDeComando: argv.filter((a, i) => !['--saida', '--md'].includes(argv[i - 1]) && !['--saida', '--md', '--detalhe'].includes(a)).join(' '),
};
const rel = agregar(resultados, data, parametros);
const relSem = semProvaRes ? agregar(semProvaRes, data, { ...parametros, prova: false }) : null;
const problemas = problemasEncontrados(rel, resultados);
const extras = textosExtras(rel, resultados, parametros);
if (relSem) extras.comparacao = comparacaoProva(rel, relSem);
writeFileSync(saida, JSON.stringify({
  parametros, metas: data.xp.targetMinutesToNext.slice(0, ateNivel - 1), ...rel, problemas, premissas: extras.premissas,
  semProva: relSem ? { horasMediaClasses: relSem.horasMediaClasses, desvioTotalPct: relSem.desvioTotalPct, classes: relSem.classes, agregado: relSem.agregado } : null,
  execucoes: resultados, execucoesSemProva: semProvaRes, erros,
}, null, 1));
console.log(`\nJSON: ${relative(process.cwd(), saida) || saida}`);
if (md) {
  mkdirSync(dirname(md), { recursive: true });
  writeFileSync(md, relatorioMarkdown(rel, data, parametros, problemas, extras));
  console.log(`Relatório: ${relative(process.cwd(), md) || md}`);
}
console.log(`\nMeta 1→${ateNivel}: ${rel.metaTotalHoras.toFixed(2)} h · média das classes ${rel.horasMediaClasses.toFixed(2)} h (${rel.desvioTotalPct > 0 ? '+' : ''}${rel.desvioTotalPct}%) · tempo real ${(tempoRealS / 60).toFixed(1)} min`);
for (const [c, k] of Object.entries(rel.classes)) console.log(`  ${k.nome.padEnd(24)} ${k.horas.toFixed(2)} h (${k.desvioPct > 0 ? '+' : ''}${k.desvioPct}%)  mortes ${k.mortes}  ouro/h ${k.economia.ouroPorHora}  gasto/h ${k.economia.gastoPorHora}`);
console.log(`  níveis fora de ±${FAIXA_TOLERANCIA}% (média das classes): ${rel.agregado.filter((a) => a.fora).map((a) => `${a.nivel} (${a.desvioPct > 0 ? '+' : ''}${a.desvioPct}%)`).join(', ') || 'nenhum'}`);
if (erros.length) process.exitCode = 1;

// ---------- textos do relatório ----------
function comparacaoProva(com, sem) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const depois10 = (k) => k.niveis.filter((n) => n.nivel >= 10).reduce((s, n) => s + n.minutos, 0);
  const linhas = Object.keys(com.classes).filter((c) => sem.classes[c]).map((c) => {
    const a = com.classes[c], b = sem.classes[c];
    const hab = data.classes[c].skills.map((s) => data.skills[s]).find((s) => s.unlockLevel === 10);
    return { classId: c, nome: a.nome, habilidade: hab?.name ?? '—', comH: a.horas, semH: b.horas, difPct: r1((b.horas / a.horas - 1) * 100), com10: r1(depois10(a)), sem10: r1(depois10(b)), mortesCom: a.mortes, mortesSem: b.mortes };
  });
  const niveis = com.agregado.filter((a) => a.nivel >= 10).map((a) => ({ nivel: a.nivel, meta: a.meta, com: a.mediaMin, sem: sem.agregado.find((x) => x.nivel === a.nivel)?.mediaMin ?? null }));
  return { linhas, niveis, mediaCom: com.horasMediaClasses, mediaSem: sem.horasMediaClasses, desvioCom: com.desvioTotalPct, desvioSem: sem.desvioTotalPct };
}

function nome(c) { return data.classes[c].name; }

// Retrato das mortes a partir das brigas (lutas) e de cada queda registrada pelo bot.
function textoLutas(ks) {
  const com = ks.filter(([, k]) => k.lutas?.atacantesNaMorte != null);
  if (!com.length) return '';
  const todas = com.map(([, k]) => k.lutas);
  const porMorte = [...com].filter(([, k]) => k.lutas.mortesPorGrande != null).sort((a, b) => a[1].lutas.mortesPorGrande - b[1].lutas.mortesPorGrande);
  const ritmo = todas.map((l) => l.grandesPorHora);
  const atac = todas.map((l) => l.atacantesNaMorte);
  const tres = todas.map((l) => l.mortes3maisPct);
  const sem = todas.map((l) => l.semMedioPct).filter((v) => v != null);
  return ` Quase toda queda é numa briga com vários monstros ao mesmo tempo (de ${fmt(Math.min(...atac), 1)} a ${fmt(Math.max(...atac), 1)} atacantes, em média, nos 10 s antes de cair; ${Math.min(...tres)}% a ${Math.max(...tres)}% das mortes com 3 ou mais). Todas as classes entram em brigas com 4 ou mais monstros num ritmo parecido (${fmt(Math.min(...ritmo), 1)} a ${fmt(Math.max(...ritmo), 1)} por hora: assistência dos iguais a até 8 m, agressão por proximidade e monstros que reaparecem perto); o que muda é quanto cada uma aguenta: mortes por briga dessas de ${fmt(porMorte[0][1].lutas.mortesPorGrande, 2)} (${nome(porMorte[0][0])}) a ${fmt(porMorte.at(-1)[1].lutas.mortesPorGrande, 2)} (${nome(porMorte.at(-1)[0])}).${sem.length ? ` Do nível 9 em diante, ${Math.min(...sem)}% a ${Math.max(...sem)}% das mortes acontecem já sem tônico médio na bolsa (o bot só compra o médio quando o ouro paga 40 e segue caçando com os pequenos quando os médios acabam).` : ''}`;
}
function fmt(v, d = 1) { return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }); }

function problemasEncontrados(rel, runs) {
  const out = [];
  const ks = Object.entries(rel.classes);
  const sinal = (v) => `${v > 0 ? '+' : ''}${fmt(v, 0)}%`;
  // 1. recargas herdadas em instâncias (corrigido em D93; continua conferido a cada rodada)
  const anomalas = runs.filter((r) => r.anomalias.some((a) => a.tipo === 'recarga_herdada'));
  if (anomalas.length) {
    const piores = anomalas.flatMap((r) => r.anomalias.flatMap((a) => a.habilidades.map((h) => h.restanteMin)));
    out.push(`**Recargas "herdadas" ao entrar numa instância:** em ${anomalas.length} de ${runs.length} execuções o personagem entrou na Arena da Prova com habilidades em recarga por até ${Math.max(...piores)} min (a maior recarga de classe é 90 s). As recargas deveriam atravessar a troca de zona como tempo restante (D93).`);
  }
  // 2. equilíbrio entre classes
  const ord = [...ks].sort((a, b) => a[1].horas - b[1].horas);
  const rap = ord[0], len = ord.at(-1);
  const fora = ks.filter(([, k]) => Math.abs(k.desvioPct) > FAIXA_TOLERANCIA);
  out.push(`**Equilíbrio entre classes na caça solo:** ${nome(rap[0])} chega ao nível ${ateNivel} em ${fmt(rap[1].horas, 2)} h e ${nome(len[0])} em ${fmt(len[1].horas, 2)} h (${fmt(len[1].horas / rap[1].horas, 1)}×). ${fora.length ? `Fora de ±${FAIXA_TOLERANCIA}% da meta total: ${fora.map(([c, k]) => `${nome(c)} (${sinal(k.desvioPct)})`).join(', ')}.` : `Todas as classes ficam a até ±${FAIXA_TOLERANCIA}% da meta total (de ${sinal(Math.min(...ks.map(([, k]) => k.desvioPct)))} a ${sinal(Math.max(...ks.map(([, k]) => k.desvioPct)))}).`}`);
  // 3. dano: de onde vem e quanto se recebe
  const fonteNome = (f) => ({ basico: 'ataque básico', dot: 'dano contínuo', sacred: 'dano sagrado extra', thorns: 'queimadura do escudo' })[f] ?? data.skills[f]?.name ?? f;
  const dpm = ks.map(([c, k]) => ({ c, causado: k.dano.causadoPorMin, recebido: k.dano.recebidoPorMin, basico: k.dano.fontes.basico ?? 0, top: Object.entries(k.dano.fontes).find(([f]) => f !== 'basico') }));
  const mediaDpm = dpm.reduce((s, x) => s + x.causado, 0) / dpm.length;
  out.push(`**Dano por classe:** ${[...dpm].sort((a, b) => b.causado - a.causado).map((x) => `${nome(x.c)} ${fmt(x.causado, 0)}/min (básico ${fmt(x.basico, 0)}%${x.top ? `, ${fonteNome(x.top[0])} ${fmt(x.top[1], 0)}%` : ''}; recebe ${fmt(x.recebido, 0)}/min)`).join('; ')}. Média: ${fmt(mediaDpm, 0)} de dano causado por minuto.`);
  const basicos = dpm.filter((x) => x.basico >= 80);
  if (basicos.length) out.push(`**Ataque básico ainda é quase todo o dano de:** ${basicos.map((x) => `${nome(x.c)} (${fmt(x.basico, 0)}%)`).join(', ')}.`);
  // 4. Cantora do Véu antes do nível 15 (a Nota Clara, que era do 15, agora vem no 5)
  const cantora = rel.classes.veilsinger;
  if (cantora) {
    const antes = cantora.niveis.filter((n) => n.nivel < 15);
    const lentaEm = rel.agregado.filter((a) => a.nivel < 15 && a.maisLenta.classId === 'veilsinger').map((a) => a.nivel);
    const desvioAntes = (antes.reduce((s, n) => s + n.minutos, 0) / antes.reduce((s, n) => s + n.meta, 0) - 1) * 100;
    out.push(`**Cantora do Véu antes do nível 15:** ${sinal(desvioAntes)} da meta somando os níveis 1–14${lentaEm.length ? `; é a classe mais lenta nos níveis ${lentaEm.join(', ')}` : ''}. ${data.skills.clear_note.name} (nível ${data.skills.clear_note.unlockLevel}) faz ${fmt(cantora.dano.fontes.clear_note ?? 0, 0)}% do dano da rodada inteira; as curas somam ${fmt(cantora.dano.curaPorMin, 0)} de vida por minuto.`);
  }
  // 5. curva de XP
  const rapidos = rel.agregado.filter((a) => a.desvioPct < -FAIXA_TOLERANCIA);
  const lentos = rel.agregado.filter((a) => a.desvioPct > FAIXA_TOLERANCIA);
  const pior = [...rel.agregado].sort((a, b) => Math.abs(b.desvioPct) - Math.abs(a.desvioPct))[0];
  out.push(`**Curva de XP:** ${rapidos.length || lentos.length ? `a média das classes fica ${rapidos.length ? `abaixo de −${FAIXA_TOLERANCIA}% da meta nos níveis ${rapidos.map((a) => `${a.nivel} (${sinal(a.desvioPct)})`).join(', ')}` : ''}${rapidos.length && lentos.length ? ' e ' : ''}${lentos.length ? `acima de +${FAIXA_TOLERANCIA}% nos níveis ${lentos.map((a) => `${a.nivel} (${sinal(a.desvioPct)})`).join(', ')}` : ''}.` : `todos os níveis ficam a até ±${FAIXA_TOLERANCIA}% da meta na média das classes (maior desvio: nível ${pior.nivel}, ${sinal(pior.desvioPct)}).`} O total 1→${ateNivel} fica em ${sinal(rel.desvioTotalPct)} da meta. Ritmo médio: ${fmt(rel.agregado[0].abatesPorMin, 1)} abates/min no nível 1, ${fmt(rel.agregado.reduce((s, a) => s + a.abatesPorMin, 0) / rel.agregado.length, 1)} na média dos níveis.`);
  // 6. mortes
  const mortes = rel.agregado.map((a) => ({ nivel: a.nivel, mortes: a.mortes })).sort((a, b) => b.mortes - a.mortes).slice(0, 4).filter((m) => m.mortes > 0);
  if (mortes.length) {
    const culpa = {};
    for (const [, k] of ks) for (const [d, v] of Object.entries(k.mortesPor)) culpa[d] = (culpa[d] || 0) + v;
    const top = Object.entries(culpa).filter(([d]) => data.monsters[d]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const totalM = ks.reduce((s, [, k]) => s + k.mortes, 0);
    out.push(`**Onde se morre:** níveis com mais mortes: ${mortes.map((m) => `${m.nivel} (${fmt(m.mortes, 2)} por classe)`).join(', ')}. Monstros que mais derrubam (mortes por execução, somando as classes; um monstro conta em toda morte em que estava batendo): ${top.map(([d, v]) => `${data.monsters[d].name} (nv ${data.monsters[d].level}, ${data.monsters[d].aggro === 'aggressive' ? 'agressivo' : 'passivo'}) ${fmt(v, 1)}`).join(', ')}. Mortes por classe (média por execução): ${ord.map(([c, k]) => `${nome(c)} ${fmt(k.mortes, 1)}`).join(', ')} — ${fmt(totalM / ks.length, 1)} em média.${textoLutas(ks)}`);
  }
  // 7. economia
  const eco = ks.map(([c, k]) => ({ c, e: k.economia, pocoes: k.economia.gastoPocoes / Math.max(1, k.economia.ouroGanho), equip: k.economia.gastoEquip / Math.max(1, k.economia.ouroGanho) }));
  const pctF = (v) => `${fmt(v * 100, 0)}%`;
  const maisPocao = eco.reduce((a, b) => (b.pocoes > a.pocoes ? b : a));
  const saldos = eco.map((x) => x.e.ouroFinal);
  out.push(`**Economia:** do ouro ganho (moedas + vendas), os tônicos levam de ${pctF(Math.min(...eco.map((x) => x.pocoes)))} a ${pctF(Math.max(...eco.map((x) => x.pocoes)))} (mais: ${nome(maisPocao.c)}) e o equipamento do armeiro de ${pctF(Math.min(...eco.map((x) => x.equip)))} a ${pctF(Math.max(...eco.map((x) => x.equip)))}; juntos, ${pctF(Math.min(...eco.map((x) => x.pocoes + x.equip)))} a ${pctF(Math.max(...eco.map((x) => x.pocoes + x.equip)))}. As vendas ao comerciante são ${pctF(eco.reduce((s, x) => s + x.e.ouroVendas, 0) / Math.max(1, eco.reduce((s, x) => s + x.e.ouroGanho, 0)))} do ganho. Saldo ao chegar ao nível ${ateNivel}: ${fmt(Math.min(...saldos), 0)} a ${fmt(Math.max(...saldos), 0)} de ouro (inclui o que sobra para o kit da faixa ${ateNivel}, que o bot só compra adiantado com ouro de sobra).`);
  // 8. equipamento: atraso do kit
  const tiers = [...new Set(ks.flatMap(([, k]) => Object.keys(k.equipamento.atrasoKit).map(Number)))].sort((a, b) => a - b);
  const atrasoMedio = (t) => { const v = ks.map(([, k]) => k.equipamento.atrasoKit[t]?.atrasoMin).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  out.push(`**Equipamento comprado no armeiro:** ${fmt(ks.reduce((s, [, k]) => s + k.equipamento.compradas, 0) / ks.length, 1)} peças por classe em média; o kit comum fica completo, em média, ${tiers.map((t) => { const a = atrasoMedio(t); return `${a == null ? '—' : fmt(a, 0)} min depois do nível ${t}`; }).join(', ')} (o atraso é o tempo de juntar o ouro e ir à cidade). Pelo saque chegam ${fmt(ks.reduce((s, [, k]) => s + k.equipamento.saque, 0) / ks.length, 1)} melhorias por classe.`);
  // 9. conjuração (castMs) e recarga global
  const conj = ks.filter(([, k]) => k.conjuracoes?.iniciadas > 0);
  if (conj.length) out.push(`**Conjuração e recarga global:** ${conj.map(([c, k]) => `${nome(c)} conjurou ${fmt(k.conjuracoes.iniciadas, 0)} vezes (${fmt(k.conjuracoes.concluidas, 0)} concluídas, ${fmt(k.conjuracoes.interrompidas, 0)} interrompidas)`).join('; ')}. O bot só começa a conjurar parado e não age durante a conjuração; com a recarga global de ${fmt(data.formulas.skills.globalCooldownMs / 1000, 1)} s ele não tenta outra habilidade antes do fim dela.`);
  return out;
}

function textosExtras(rel, runs, p) {
  const ks = Object.values(rel.classes);
  const realTot = runs.reduce((s, r) => s + r.tempoRealS, 0);
  const simTot = runs.reduce((s, r) => s + r.horasSimuladas, 0);
  const pulados = runs.reduce((s, r) => s + r.zonas.ticksPulados, 0);
  const rodados = runs.reduce((s, r) => s + r.zonas.ticksRodados, 0);
  const proto = runs[0].protocolo;
  const destaques = [];
  const totalT = (k) => Object.values(k.tempos).reduce((a, b) => a + b, 0) || 1;
  const viagem = ks.reduce((s, k) => s + k.tempos.viagem, 0) / ks.reduce((s, k) => s + totalT(k), 0);
  const recup = Object.entries(rel.classes).map(([c, k]) => ({ c, f: k.tempos.descanso / totalT(k) }));
  const altas = recup.filter((x) => x.f > 0.15);
  const baixas = recup.filter((x) => x.f <= 0.15).map((x) => x.f);
  destaques.push(`Viagens (troca de mapa a ${p.viagemPorMapaS} s cada: ir às novas áreas, à loja, ao armeiro e à prova) são ${fmt(viagem * 100, 0)}% do tempo. Recuperação fora de combate (tônico ou descanso) fica em ${fmt(Math.min(...baixas) * 100, 0)}–${fmt(Math.max(...baixas) * 100, 0)}% para ${altas.length ? 'as demais classes' : 'todas as classes'}, porque os bots compram e bebem tônicos em vez de esperar a regeneração (1,5% da vida por segundo)${altas.length ? `; ${altas.map((x) => `${nome(x.c)} passa ${fmt(x.f * 100, 0)}% do tempo recuperando (${['emberweaver', 'veilsinger'].includes(x.c) ? 'mana: o dano vem quase todo de magia' : 'vida'})`).join(', ')}` : ''}.`);
  const it = data.items;
  const precoT = (id) => Math.max(1, (it[id].value || 1) * 2);
  const b0 = ks[0].economia.bandas;
  const ganhoBanda = (i) => ks.reduce((s, k) => s + k.economia.bandas[i].ouroPorHora, 0) / ks.length;
  const economia = [
    `O ouro ganho por hora cresce de ~${fmt(ganhoBanda(0), 0)}/h (níveis ${b0[0].niveis}) para ~${fmt(ganhoBanda(b0.length - 1), 0)}/h (${b0.at(-1).niveis}); o gasto com tônicos acompanha o dano recebido, não o nível: classes de distância que matam antes do contato compram pouco.`,
    `Preço dos tônicos = 2 × valor (Pequeno de Vida ${precoT('potion_hp_s')}, Médio de Vida ${precoT('potion_hp_m')}, Pequeno de Mana ${precoT('potion_mp_s')}, Médio de Mana ${precoT('potion_mp_m')}); peças do armeiro = ${fmt(data.formulas.economy.gearPriceMult, 1)} × valor; venda ao comerciante = ${fmt(data.formulas.economy.sellFraction, 2)} × valor.`,
  ];
  const premissas = [
    `**Só caça.** Nenhuma missão é feita nem entregue (sem XP, ouro ou itens de missão). Exceção modelada: a **prova de classe no nível 10**${p.prova ? '' : ' (desligada nesta rodada com `--sem-prova`)'}, porque é o que libera a habilidade do nível 10. Os pré-requisitos de "Prova de Classe" são marcados como concluídos com o comando de mestre \`quest_done\` (sem recompensas), a missão é aceita no mestre da classe e a prova é lutada de verdade na arena; a missão não é entregue (o XP de 1.800 não entra).`,
    `**Ações só pelo protocolo:** move, attack, stop, cast, use_item, pickup, equip/unequip, allocate, learn_skill, buy, sell, respawn, quest_accept/trial_start e os comandos de mestre teleport/quest_done. As decisões usam a visão montada pelos snapshots e a ficha devolvida pelo pedido \`char\` (o bot não lê o estado interno da zona). Reação a cada ${p.reacaoMs} ms, no máximo uma habilidade por decisão, respeitando a recarga global; habilidades com conjuração só começam com o personagem parado e o bot não age até o fim (\`cast_end\`). ${fmt(p.pausaAposAbateMs / 1000, 1)} s de pausa depois de cada abate antes de escolher o próximo alvo. É um jogador eficiente: um jogador humano tende a ser mais lento (pausas, erros de posicionamento, distração).`,
    `**Viagem entre mapas:** teleporte de mestre até o posto de guarda do mapa (ou ao lado do NPC, na cidade) seguido de ${p.viagemPorMapaS} s parados por troca de mapa no caminho de portais (busca em largura respeitando o nível mínimo de cada portal). Dentro do mapa o bot anda (move/attack) como um jogador.`,
    '**Área de caça:** grupos de monstros normais com nível em [nível−2, nível+1], preferindo o próprio nível, monstros passivos e grupos agressivos menos densos; elites, chefes e elites diárias ficam de fora (só são enfrentados se atacarem). O alvo é o monstro do grupo com menos vizinhos agressivos a 8,5 m (puxar pela borda). Morte vale 3 pontos de perigo e fuga 1; 3 pontos em 10 min fazem o bot caçar um nível abaixo por 20 min, longe daquela área.',
    '**Tônicos:** em combate, vida abaixo de 40% — 50% com dois monstros batendo e 65% com três ou mais, quando a recarga de 3 s dos tônicos é o gargalo (com três ou mais bebe o maior tônico que tem; senão, o menor que aproveita bem a cura); fora de combate, vida abaixo de 55% (sem tônico, descansa com `stop` até 92%). Conjuradores (Tecelão, Cantora): mana abaixo de 20% em combate e de 35% fora (sem tônico, descansa até 85%); as classes físicas não param por mana (lutam com o ataque básico). Tônico Médio só a partir do nível 9 (o servidor confere o nível do item). Foge para o posto abaixo de 20% de vida sem tônico; caído, espera 5 s e volta ao posto (`respawn`, 50% de vida).',
    '**Cidade:** na cidade da classe (Pedrâmbar ou Vau de Nácar), primeiro o armeiro, depois a loja de tônicos. Vai quando restam menos de 5 tônicos e 80% do ouro compra ao menos 40 Pequenos, quando o ouro paga o equipamento que falta (abaixo) ou quando a bolsa enche. Estoque-alvo: 100 tônicos de vida ou o dobro do gasto no nível anterior (até 200); 60 de mana para conjuradores, 10 para os demais. A ida e a volta custam as mesmas trocas de mapa.',
    '**Equipamento:** ao chegar ao nível 5, 9, 13, 17, 21 ou 25 o bot quer as peças comuns da faixa (arma, mão secundária e 4 de armadura; o Cetro da faixa 17 é raro, então a Cantora usa a Varinha comum nessa faixa) e as **compra no armeiro com ouro** (`buy`, valor × `economy.gearPriceMult`), a arma primeiro, guardando antes o ouro de 60 tônicos de vida (40 de mana para conjuradores). Vai à cidade só por isso quando o ouro que sobra paga o kit que falta ou a próxima peça e 60% do resto (no máximo uma ida dessas a cada 10 min). Com o kit completo e ouro além do estoque cheio de tônicos, compra adiantado o kit da próxima faixa (a até 2 níveis dela) e as joias da faixa. Também recolhe do chão as melhorias da própria classe e equipa quando cumpre os requisitos. Sem refino no ferreiro.',
    '**Venda:** materiais, peças de outras classes e peças substituídas são recolhidos do chão (com mais de 5 espaços livres na bolsa) e vendidos ao comerciante (`sell`, valor × `economy.sellFraction`) a cada visita à cidade; o depósito não é usado.',
    `**Atributos e habilidades:** Quebraferro e Tecelão seguem os planos de \`data/example_builds.json\`; as demais classes usam um plano gerado no mesmo espírito (requisitos do kit da próxima faixa espalhados pelos níveis até ela e o resto 2:3 entre o atributo de dano da arma e Vitalidade), conferido nível a nível. Graus de habilidade: um ponto por nível na ordem de prioridade da classe (\`server/tools/lib/progressao/planos.mjs\`).`,
  ];
  const tecnica = [
    `Laço de \`server.step(100)\` (100 ms de jogo por chamada) num GameServer sem \`start()\`: banco SQLite em memória (\`--banco-arquivo\` usa um arquivo temporário), modo dev, sessões falsas e pedidos síncronos por \`server.onMessage\`. ${fmt(simTot, 0)} h de jogo simuladas em ${fmt(realTot / 60, 1)} min de CPU (${fmt((simTot * 3600) / Math.max(1, realTot), 0)}× o tempo real por linha de execução); ${p.paralelo} linhas de execução (\`worker_threads\`) em paralelo, ${fmt(p.tempoRealS / 60, 1)} min de relógio no total.`,
    'Temporizadores do jogo usam `zone.now` (soma dos dt): recargas, conjurações, efeitos, regeneração, tônicos, ataques e reaparecimento funcionam acelerados sem ajuste. `Date.now()` aparece em prazos de relógio de parede (validade do saque de 30 min, dia da elite diária, carimbos do banco, convites e calabouço); dentro da simulação ele segue o tempo simulado, para esses prazos correrem no ritmo do jogo.',
    `Zonas abertas sem jogador param 30 s depois que o último jogador sai e, quando alguém entra, o relógio da zona é adiantado até o tempo global (o valor que teria sem parar), então monstros mortos reaparecem e recargas levadas entre zonas continuam valendo; instâncias não são tocadas. ${fmt((pulados / Math.max(1, pulados + rodados)) * 100, 0)}% dos ticks de zona foram pulados. Um passo com só a zona ativa custa ~20–40 µs.`,
    `Snapshots: o bot pede \`{ delta: true }\` no login. Se o servidor manda diferenças, elas são mescladas como em \`mergeSnap\` (test/helpers/client.js); se manda o snapshot completo, só o último é decodificado, quando o bot olha o mundo. Nesta rodada o servidor mandou ${proto.snapshotsPorDiferenca ? 'diferenças' : 'snapshots completos'}. A sessão falsa nasce por \`server.onConnection\` (com um ws falso) e a simulação desliga o limite de comandos por conexão (\`rateLimit\`), que é medido em tempo real. Mensagens \`hit\`/\`heal\` alimentam a contabilidade de dano e \`cast_end\` encerra a conjuração do bot; as de efeito visual são descartadas sem decodificar.`,
  ];
  return { destaques, economia, premissas, tecnica };
}
