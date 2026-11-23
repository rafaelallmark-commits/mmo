// Bancada das provas de classe: joga a prova de cada classe no nível 10 com o kit inicial e com o da
// faixa 5, em várias sementes, e mostra quantas vence (e, com --sem-habilidade, sem usar a do nível 10).
// Uso: npm run provas -- [--classes breaker,bastion] [--faixas 1,5] [--sementes 10] [--sem-habilidade] [--detalhe]
import { loadGameData } from '../src/data.js';
import { rodarProva } from './lib/provas/bancada.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(`--${k}`);
if (flag('ajuda') || flag('help')) {
  console.log('Uso: npm run provas -- [--classes a,b] [--faixas 1,5] [--sementes N] [--sem-habilidade] [--detalhe]');
  process.exit(0);
}
const data = loadGameData();
const classes = (arg('classes') ?? Object.keys(data.classes).join(',')).split(',');
const faixas = (arg('faixas') ?? '1,5').split(',').map(Number);
const sementes = Number(arg('sementes') ?? 6);
const semHabilidade = flag('sem-habilidade');
const detalhe = flag('detalhe');

console.log(`Provas de classe no nível 10${semHabilidade ? ', SEM a habilidade do nível 10' : ''}: ${sementes} semente(s) por classe e faixa.`);
let falhas = 0;
for (const classId of classes) {
  const cfg = data.maps.arena_prova.trial.classes[classId];
  for (const faixa of faixas) {
    const res = [];
    for (let s = 1; s <= sementes; s++) res.push(rodarProva({ classId, faixa, seed: s * 7 + 1, semHabilidade }));
    const venc = res.filter((r) => r.success);
    const t = venc.length ? Math.round(venc.reduce((a, r) => a + r.segundos, 0) / venc.length) : 0;
    const hp = Math.round(res.reduce((a, r) => a + r.minHpPct, 0) / res.length);
    falhas += res.length - venc.length;
    console.log(`${data.classes[classId].name.padEnd(24)} ${cfg.title.padEnd(26)} faixa ${String(faixa).padEnd(2)} venceu ${venc.length}/${res.length}  tempo médio ${t} s  vida mínima média ${hp}%`);
    if (detalhe) for (const r of res) console.log(`    semente ${r.seed}: ${r.success ? 'venceu' : 'perdeu'} em ${r.segundos} s — ${r.message} | ${r.ultimoStatus?.text ?? ''} · ${r.ultimoStatus?.sub ?? ''} | habilidades ${JSON.stringify(r.usadas)}`);
  }
}
process.exit(semHabilidade ? 0 : falhas ? 1 : 0);
