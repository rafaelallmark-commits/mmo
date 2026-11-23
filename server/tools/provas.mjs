// Bancada das provas de classe: joga a prova de cada classe no nível 10 com o kit inicial e com o da
// faixa 5, em várias sementes, e mostra quantas vence (e, com --sem-habilidade, sem usar a do nível 10).
// --reacao 400: o piloto só decide a cada 400 ms (perto de um jogador humano); --mira-alvo: a Ruptura do
// Quebraferro vai com o pilar selecionado (um por vez), como faria quem não descobriu o cone sem alvo;
// --bate-blindagem (com --mira-alvo): esperando a mana, ele segue batendo no pilar blindado.
// Uso: npm run provas -- [--classes breaker,bastion] [--faixas 1,5] [--sementes 10] [--reacao 400] [--mira-alvo [--bate-blindagem]] [--sem-habilidade] [--detalhe]
import { loadGameData } from '../src/data.js';
import { rodarProva } from './lib/provas/bancada.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
if (flag('ajuda') || flag('help')) {
  console.log('Uso: npm run provas -- [--classes a,b] [--faixas 1,5] [--sementes N] [--reacao MS] [--mira-alvo [--bate-blindagem]] [--sem-habilidade] [--detalhe]');
  process.exit(0);
}
const data = loadGameData();
const classes = (arg('classes') ?? Object.keys(data.classes).join(',')).split(',');
const faixas = (arg('faixas') ?? '1,5').split(',').map(Number);
const sementes = Number(arg('sementes') ?? 6);
const reacaoMs = Number(arg('reacao') ?? 100);
const semHabilidade = flag('sem-habilidade');
const miraNoAlvo = flag('mira-alvo');
const bateNaBlindagem = flag('bate-blindagem');
const detalhe = flag('detalhe');

console.log(`Provas de classe no nível 10${semHabilidade ? ', SEM a habilidade do nível 10' : ''}: ${sementes} semente(s) por classe e faixa, uma decisão a cada ${reacaoMs} ms${miraNoAlvo ? `, Ruptura no pilar selecionado${bateNaBlindagem ? ' (batendo na blindagem enquanto espera a mana)' : ''}` : ''}.`);
let falhas = 0;
for (const classId of classes) {
  const cfg = data.maps.arena_prova.trial.classes[classId];
  for (const faixa of faixas) {
    const res = [];
    for (let s = 1; s <= sementes; s++) res.push(rodarProva({ classId, faixa, seed: s * 7 + 1, semHabilidade, miraNoAlvo, bateNaBlindagem, reacaoMs }));
    const venc = res.filter((r) => r.success);
    const t = venc.length ? Math.round(venc.reduce((a, r) => a + r.segundos, 0) / venc.length) : 0;
    const hp = Math.round(res.reduce((a, r) => a + r.minHpPct, 0) / res.length);
    // aliados (aprendizes, peregrino): a menor vida vista entre eles, na média e no pior caso
    const al = res.filter((r) => r.minAliadoPct != null).map((r) => r.minAliadoPct);
    const alTxt = al.length ? `  aliado: vida mínima média ${Math.round(al.reduce((a, v) => a + v, 0) / al.length)}% (pior ${Math.min(...al)}%)` : '';
    falhas += res.length - venc.length;
    console.log(`${data.classes[classId].name.padEnd(24)} ${cfg.title.padEnd(26)} faixa ${String(faixa).padEnd(2)} venceu ${venc.length}/${res.length}  tempo médio ${t} s  vida mínima média ${hp}%${alTxt}`);
    if (detalhe) for (const r of res) console.log(`    semente ${r.seed}: ${r.success ? 'venceu' : 'perdeu'} em ${r.segundos} s — ${r.message} | ${r.ultimoStatus?.text ?? ''} · ${r.ultimoStatus?.sub ?? ''} | habilidades ${JSON.stringify(r.usadas)}`);
  }
}
process.exit(semHabilidade ? 0 : falhas ? 1 : 0);
