// Backup e ensaio de restauração: tools/backup.mjs (SQLite e, no npm run test:pg, PostgreSQL), a rotação de
// 14 dias da política de privacidade, a métrica para o node-exporter, o modo agendado do serviço "backup" do
// compose, o deploy/backup-postgres.sh do serviço "backup-banco" (com pg_dump de mentira e, no test:pg, de
// verdade) e o deploy/copia-externa.sh (com rclone de mentira). Cada ensaio restaura a cópia e confere os
// dados pelo Store.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store.js';
import { PgStore } from '../src/store-pg.js';
import { createStore, testSchemaFor } from '../src/db.js';
import { findPgBin } from '../tools/pg-temp.mjs';
import { sleep } from './helpers/client.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = join(ROOT, 'tools', 'backup.mjs');
const PG_SCRIPT = join(ROOT, '..', 'deploy', 'backup-postgres.sh');
const H = 3_600_000, D = 86_400_000;
// sem CINZAS_DB nem métrica herdados do ambiente de quem roda os testes
const ENV = { ...process.env, CINZAS_DB: '', CINZAS_BACKUP_METRICA: '', CINZAS_DB_PASSWORD_FILE: '' };

const tmp = () => mkdtempSync(join(tmpdir(), 'cinzas-backup-'));
const stampOf = (ms) => new Date(ms).toISOString().replace(/[:.]/g, '-').slice(0, 19);
const atOf = (stamp) => Date.parse(stamp.replace(/T(\d\d)-(\d\d)-(\d\d)$/, 'T$1:$2:$3Z'));
const run = (args, env = {}) => spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', BACKUP, ...args], { env: { ...ENV, ...env }, encoding: 'utf8', timeout: 60_000 });
// date -d (GNU) é o que o script do compose usa na imagem postgres:17 (Debian)
const GNU_DATE = spawnSync('sh', ['-c', 'date -u -d "2026-01-02 03:04:05" +%s'], { encoding: 'utf8' }).stdout.trim() === '1767323045';

// processos de longa duração (modo agendado): os que um teste com falha deixar para trás morrem no fim
const running = new Set();
after(() => { for (const c of running) c.kill('SIGKILL'); });

function startProc(cmd, args, env = {}) {
  const child = spawn(cmd, args, { env: { ...ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  running.add(child);
  child.on('exit', () => running.delete(child));
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
  const waitFor = async (re, ms = 20_000) => {
    const t0 = Date.now();
    while (!re.test(out)) {
      if (Date.now() - t0 > ms) { child.kill('SIGKILL'); throw new Error(`esperava ${re} na saída; veio:\n${out}`); }
      await sleep(25);
    }
  };
  return { child, exited, waitFor, output: () => out };
}

// conta com dois personagens, itens, ouro, nível, missão e auditoria
function populate(st) {
  const acc = st.createAccount('ensaio', 'senha-forte-1', { email: 'ensaio@exemplo.com' });
  for (const [name, classId, gold, level, x] of [['Brasa', 'warden', 1234, 7, 10.5], ['Nacarina', 'singer', 99, 12, 77.25]]) {
    const id = st.createCharacter({ accountId: acc, name, classId, hp: 100, mp: 50, mapId: 'estrada_velha', x, z: 20.125,
      kit: { equip: ['espada_curta'], bag: [['tonico_vida_p', 5]] }, slotFor: () => 'main' });
    const c = st.loadCharacter(id);
    Object.assign(c, { gold, level, xp: 321 });
    st.saveCharacter(c);
    st.saveQuest(id, 'c0_chegada', 'done', { kills: 3 });
  }
  st.audit('account_created', { accountId: acc, ip: '127.0.0.1' });
  return acc;
}

// o que importa da conta, para comparar o banco de antes com o restaurado
function snapshot(st, acc) {
  return st.listCharacters(acc).map((r) => {
    const c = st.loadCharacter(r.id);
    const items = [...c.items.values()].map(({ id, defId, qty, enh, loc, slot }) => ({ id, defId, qty, enh, loc, slot })).sort((a, b) => (a.id < b.id ? -1 : 1));
    const quests = st.loadQuests(c.id).map((q) => ({ quest: q.quest_id, state: q.state, progress: JSON.parse(q.progress_json) }));
    return { id: c.id, name: c.name, classId: c.classId, level: c.level, xp: c.xp, gold: c.gold, mapId: c.mapId, x: c.x, z: c.z, items, quests };
  });
}

// arquivo .prom -> { métrica: valor } (e as linhas de HELP, para comparar os dois gravadores)
function readMetric(file) {
  const text = readFileSync(file, 'utf8');
  const values = {};
  for (const m of text.matchAll(/^(cinzas_[a-z_]+)\{db="(\w+)"\} (\S+)$/gm)) values[m[1]] = Number(m[3]);
  return { text, values, db: /\{db="(\w+)"\}/.exec(text)?.[1], help: text.split('\n').filter((l) => l.startsWith('# HELP')) };
}

// a regra da rotação (D148), escrita de novo aqui: as N mais novas, a mais nova de cada dia (UTC), nada com mais de 14 dias
function expectedKept(stamps, keepN, daily, now = Date.now()) {
  const all = [...stamps].sort().reverse();
  const keep = new Set(all.slice(0, keepN));
  if (daily) {
    const days = new Set();
    for (const s of all) if (!days.has(s.slice(0, 10))) { days.add(s.slice(0, 10)); keep.add(s); }
  }
  return all.filter((s) => keep.has(s) && atOf(s) >= now - 14 * D).sort();
}

const copyStamps = (dir, prefix, ext) => readdirSync(dir).map((f) => new RegExp(`^${prefix}-(\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2})\\${ext}$`).exec(f)?.[1]).filter(Boolean).sort();

test('ensaio de restauração (SQLite): backup a quente com o banco aberto, cópia no lugar do banco e os dados conferidos pelo Store', () => {
  const dir = tmp();
  try {
    const dbPath = join(dir, 'cinzas.db');
    const bdir = join(dir, 'backups');
    const metric = join(dir, 'metricas', 'backup-sqlite.prom');
    const st = new Store(dbPath); // o servidor no ar: banco aberto, em WAL, com o que acabou de gravar
    const acc = populate(st);
    const before = snapshot(st, acc);
    const t0 = Date.now();
    const r = run(['--db', dbPath, '--para', bdir, '--manter', '3', '--metrica', metric]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /backup: .*cinzas-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db \(.*2 personagens, integridade: ok.*\); 1 cópia guardada/);
    // o jogo continua gravando depois do backup: a cópia é a foto do momento
    const c = st.loadCharacter(before[0].id);
    c.gold = 5000;
    st.saveCharacter(c);
    st.close();
    const files = readdirSync(bdir);
    assert.equal(files.length, 1, 'uma cópia, sem .parcial sobrando');
    // restauração como no guia (§8.8): servidor parado, cópia no lugar do banco, sem os -wal/-shm antigos
    copyFileSync(join(bdir, files[0]), dbPath);
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    const restored = new Store(dbPath);
    try {
      assert.deepEqual(snapshot(restored, acc), before, 'personagens, itens, ouro e missões iguais aos do momento do backup');
      assert.equal(restored.findAccount('ensaio').email, 'ensaio@exemplo.com');
      assert.ok(restored.verifyAccount('ensaio', 'senha-forte-1'), 'a senha continua valendo');
      assert.ok(restored.auditTail(10).some((a) => a.kind === 'account_created'), 'auditoria junto');
    } finally { restored.close(); }
    // métrica para o node-exporter
    const m = readMetric(metric);
    assert.equal(m.db, 'sqlite');
    assert.ok(m.values.cinzas_backup_last_success_timestamp_seconds >= Math.floor(t0 / 1000) - 1 && m.values.cinzas_backup_last_success_timestamp_seconds <= Date.now() / 1000 + 1);
    assert.equal(m.values.cinzas_backup_last_failure_timestamp_seconds, 0);
    assert.equal(m.values.cinzas_backup_copies, 1);
    assert.equal(m.values.cinzas_backup_last_size_bytes, statSync(join(bdir, files[0])).size);
    assert.equal(m.values.cinzas_backup_oldest_copy_timestamp_seconds, Math.round(atOf(files[0].slice(7, 26)) / 1000));
    assert.match(m.text, /# TYPE cinzas_backup_last_success_timestamp_seconds gauge/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('rotação: ficam as N mais novas e a mais nova de cada dia, nada com mais de 14 dias; o resto da pasta não é tocado', () => {
  const dir = tmp();
  try {
    const dbPath = join(dir, 'cinzas.db');
    new Store(dbPath).close();
    const bdir = join(dir, 'backups');
    mkdirSync(bdir);
    const now = Date.now();
    const fakes = [1 * H, 2 * H, 3 * H, 5 * H, 1 * D, 1 * D + 2 * H, 2 * D, 6 * D, 13 * D, 15 * D, 20 * D].map((d) => stampOf(now - d));
    for (const s of fakes) writeFileSync(join(bdir, `cinzas-${s}.db`), 'x');
    const others = ['restaurar.db', 'cinzas-antiga.db', 'outro-2020-01-01T00-00-00.db', 'notas.txt', `cinzas-${stampOf(now - 30 * D)}.dump`];
    for (const f of others) writeFileSync(join(bdir, f), 'x');
    // sobras de backup interrompido: a de mais de 1 h sai; a recente fica (pode ser um backup em andamento)
    const oldPartial = join(bdir, `cinzas-${stampOf(now - 3 * H)}.db.parcial`);
    const newPartial = join(bdir, `cinzas-${stampOf(now - 60_000)}.db.parcial`);
    writeFileSync(oldPartial, 'x');
    writeFileSync(newPartial, 'x');
    utimesSync(oldPartial, (now - 2 * H) / 1000, (now - 2 * H) / 1000);
    const r = run(['--db', dbPath, '--para', bdir, '--manter', '3', '--diarias', '--dias', '14']);
    assert.equal(r.status, 0, r.stderr);
    const kept = copyStamps(bdir, 'cinzas', '.db');
    const created = kept.find((s) => !fakes.includes(s));
    assert.ok(created, 'a cópia nova está lá');
    assert.deepEqual(kept, expectedKept([...fakes, created], 3, true));
    assert.ok(!kept.some((s) => atOf(s) < now - 14 * D), 'nenhuma com mais de 14 dias');
    for (const f of others) assert.ok(existsSync(join(bdir, f)), `${f} continua`);
    assert.equal(existsSync(oldPartial), false, '.parcial velho apagado');
    assert.ok(existsSync(newPartial), '.parcial recente mantido');
    // sem --diarias: só as N mais novas
    const r2 = run(['--db', dbPath, '--para', bdir, '--manter', '2']);
    assert.equal(r2.status, 0, r2.stderr);
    const kept2 = copyStamps(bdir, 'cinzas', '.db');
    assert.equal(kept2.length, 2);
    assert.deepEqual(kept2, [...new Set([...kept, ...kept2])].sort().slice(-2), 'as duas mais novas');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('falha: banco corrompido ou ausente sai com erro, não apaga cópia nenhuma e a métrica guarda o último sucesso', () => {
  const dir = tmp();
  try {
    const dbPath = join(dir, 'cinzas.db');
    const st = new Store(dbPath);
    populate(st);
    st.close();
    const bdir = join(dir, 'backups');
    const metric = join(dir, 'm.prom');
    assert.equal(run(['--db', dbPath, '--para', bdir, '--metrica', metric]).status, 0);
    const ok = readMetric(metric).values;
    const files = readdirSync(bdir);
    // o arquivo do banco estragado (disco com defeito, cópia pela metade)
    rmSync(`${dbPath}-wal`, { force: true });
    rmSync(`${dbPath}-shm`, { force: true });
    writeFileSync(dbPath, 'isto não é um banco SQLite '.repeat(200));
    const r = run(['--db', dbPath, '--para', bdir, '--metrica', metric, '--manter', '1']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /backup falhou/);
    assert.deepEqual(readdirSync(bdir), files, 'nenhuma cópia apagada nem .parcial sobrando');
    const bad = readMetric(metric).values;
    assert.equal(bad.cinzas_backup_last_success_timestamp_seconds, ok.cinzas_backup_last_success_timestamp_seconds, 'o último sucesso continua');
    assert.equal(bad.cinzas_backup_copies, ok.cinzas_backup_copies);
    assert.ok(bad.cinzas_backup_last_failure_timestamp_seconds >= ok.cinzas_backup_last_success_timestamp_seconds, 'a falha fica marcada (alerta BackupFalhou)');
    // caminho errado: falha sem criar um banco vazio ali (que viraria um "backup" de nada)
    const missing = join(dir, 'nao-existe.db');
    const r2 = run(['--db', missing, '--para', bdir]);
    assert.equal(r2.status, 1);
    assert.match(r2.stderr, /não existe/);
    assert.equal(existsSync(missing), false);
    // opções inválidas
    for (const args of [['--manter', '0'], ['--a-cada'], ['--a-cada', '0'], ['--metrica'], ['--dias', 'x'], ['--para']]) {
      const u = run(['--db', dbPath, ...args]);
      assert.equal(u.status, 2, `${args.join(' ')}: ${u.stderr}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('agendado (serviço do compose): com cópia recente espera o intervalo e semeia a métrica; sem cópia, copia na hora', async () => {
  const dir = tmp();
  try {
    const dbPath = join(dir, 'cinzas.db');
    const st = new Store(dbPath);
    populate(st);
    st.close();
    // reinício do contêiner com uma cópia de 10 min atrás: nada de cópia nova agora
    const bdir = join(dir, 'b1');
    mkdirSync(bdir);
    const recent = stampOf(Date.now() - 10 * 60_000);
    writeFileSync(join(bdir, `cinzas-${recent}.db`), 'cópia');
    const metric = join(dir, 'm1.prom');
    const p = startProc(process.execPath, ['--disable-warning=ExperimentalWarning', BACKUP, '--db', dbPath, '--para', bdir, '--a-cada', '3600', '--metrica', metric]);
    await p.waitFor(/backup agendado: .*próximo em (49|50) min \(cópia mais nova: cinzas-/);
    assert.deepEqual(readdirSync(bdir), [`cinzas-${recent}.db`]);
    const m = readMetric(metric).values;
    assert.equal(m.cinzas_backup_last_success_timestamp_seconds, Math.round(atOf(recent) / 1000), 'métrica semeada com a cópia que já existe');
    assert.equal(m.cinzas_backup_copies, 1);
    assert.equal(m.cinzas_backup_last_size_bytes, Buffer.byteLength('cópia'));
    p.child.kill('SIGTERM');
    assert.equal((await p.exited).code, 0, 'SIGTERM encerra limpo');
    // pasta vazia: o primeiro backup sai na hora
    const bdir2 = join(dir, 'b2');
    const metric2 = join(dir, 'm2.prom');
    const p2 = startProc(process.execPath, ['--disable-warning=ExperimentalWarning', BACKUP, '--db', dbPath, '--para', bdir2, '--a-cada', '3600', '--metrica', metric2]);
    await p2.waitFor(/backup: .*cinzas-.*\.db/);
    assert.equal(copyStamps(bdir2, 'cinzas', '.db').length, 1);
    assert.ok(readMetric(metric2).values.cinzas_backup_last_success_timestamp_seconds > 0);
    p2.child.kill('SIGTERM');
    assert.equal((await p2.exited).code, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--somente-sqlite com o banco no PostgreSQL: não faz nada, apaga a métrica antiga e, agendado, fica parado no ar', async () => {
  const dir = tmp();
  try {
    const metric = join(dir, 'backup-sqlite.prom');
    writeFileSync(metric, 'cinzas_backup_last_success_timestamp_seconds{db="sqlite"} 1\n');
    const pg = { CINZAS_DB: 'postgres://cinzas@banco:5432/cinzas' };
    const r = run(['--somente-sqlite', '--metrica', metric, '--para', join(dir, 'b')], pg);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /o banco é o PostgreSQL/);
    assert.equal(existsSync(metric), false, 'a métrica do SQLite não engana o alerta de backup atrasado');
    assert.equal(existsSync(join(dir, 'b')), false);
    const p = startProc(process.execPath, ['--disable-warning=ExperimentalWarning', BACKUP, '--somente-sqlite', '--a-cada', '3600'], pg);
    await p.waitFor(/backup do SQLite parado/);
    await sleep(300);
    assert.equal(p.child.exitCode, null, 'continua no ar (sem reinícios em série do contêiner)');
    p.child.kill('SIGTERM');
    assert.equal((await p.exited).code, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('--saude (verificação de saúde do serviço "backup" no compose): 0 com backup em dia, 1 sem backup, atrasado ou com falha depois', () => {
  const dir = tmp();
  try {
    const dbPath = join(dir, 'cinzas.db');
    const st = new Store(dbPath);
    populate(st);
    st.close();
    const metric = join(dir, 'metricas', 'backup-sqlite.prom');
    const saude = (extra = [], env = {}) => run(['--db', dbPath, '--saude', '--metrica', metric, '--somente-sqlite', ...extra], env);
    let r = saude();
    assert.equal(r.status, 1, 'sem métrica: nenhum backup ainda');
    assert.match(r.stdout, /nenhum backup conferido/);
    assert.equal(run(['--db', dbPath, '--para', join(dir, 'b'), '--metrica', metric]).status, 0);
    r = saude();
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /backup em dia: o último conferido é de .* há 0 min/);
    assert.equal(readdirSync(join(dir, 'b')).length, 1, '--saude não copia nada');
    // atrasado: o último sucesso de 3 h atrás passa do limite padrão (7500 s) e de um --idade-max menor
    const secs = Math.round(Date.now() / 1000);
    const write = (ok, bad) => writeFileSync(metric, `cinzas_backup_last_success_timestamp_seconds{db="sqlite"} ${ok}\ncinzas_backup_last_failure_timestamp_seconds{db="sqlite"} ${bad}\n`);
    write(secs - 3 * 3600, 0);
    r = saude();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /há 180 min \(limite: 125 min\)/);
    assert.equal(saude(['--idade-max', String(4 * 3600)]).status, 0);
    // falha depois do último sucesso: doente até o próximo backup conferido
    write(secs - 600, secs - 60);
    r = saude();
    assert.equal(r.status, 1);
    assert.match(r.stdout, /o último backup falhou/);
    write(secs - 60, secs - 600);
    assert.equal(saude().status, 0, 'falha antiga, sucesso depois: em dia');
    // banco no PostgreSQL: o serviço fica parado de propósito e conta como saudável
    rmSync(metric);
    r = run(['--saude', '--metrica', metric, '--somente-sqlite'], { CINZAS_DB: 'postgres://cinzas@banco:5432/cinzas' });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /parado de propósito/);
    assert.equal(run(['--db', dbPath, '--saude']).status, 2, '--saude sem --metrica');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// pg_dump e pg_restore de mentira: o script do compose roda sem PostgreSQL (rotação, métrica, falhas)
function fakePgTools(dir) {
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'pg_dump'), `#!/bin/sh
out=''
while [ $# -gt 0 ]; do case "$1" in --file) out=$2; shift ;; esac; shift; done
if [ -n "\${STUB_FALHA:-}" ]; then echo "pg_dump: conexão recusada" >&2; exit 1; fi
printf 'PGDMP de teste: %s %s' "$PGDATABASE" "\${PGPASSWORD:-sem-senha}" > "$out"
`);
  writeFileSync(join(bin, 'pg_restore'), `#!/bin/sh
[ "$1" = "--list" ] || exit 2
head -c 5 "$2" | grep -q PGDMP || { echo "pg_restore: arquivo inválido" >&2; exit 1; }
printf ';\\n2; 0 0 TABLE DATA public characters cinzas\\n3; 0 0 TABLE DATA public accounts cinzas\\n'
`);
  chmodSync(join(bin, 'pg_dump'), 0o755);
  chmodSync(join(bin, 'pg_restore'), 0o755);
  return bin;
}

test('deploy/backup-postgres.sh (serviço backup-banco): dump conferido, mesma rotação, mesma métrica do backup.mjs e falha sem apagar nada', { skip: GNU_DATE ? false : 'precisa do date -d do GNU (o da imagem postgres:17)' }, async () => {
  const dir = tmp();
  try {
    const bin = fakePgTools(dir);
    const bdir = join(dir, 'backups');
    mkdirSync(bdir);
    const metric = join(dir, 'metricas', 'backup-postgres.prom');
    const senha = join(dir, 'senha');
    writeFileSync(senha, 'segredo do banco\n');
    const env = { PATH: `${bin}${delimiter}${process.env.PATH}`, PGDATABASE: 'cinzas', PGHOST: 'banco', BACKUP_DIR: bdir, BACKUP_METRICA: metric,
      BACKUP_MANTER: '3', BACKUP_DIARIAS: '1', BACKUP_DIAS: '14', BACKUP_SENHA_ARQUIVO: senha };
    const now = Date.now();
    const fakes = [1 * H, 2 * H, 4 * H, 1 * D, 3 * D, 13 * D, 16 * D].map((d) => stampOf(now - d));
    for (const s of fakes) writeFileSync(join(bdir, `cinzas-${s}.dump`), 'PGDMP antigo');
    writeFileSync(join(bdir, 'cinzas-2026-01-01T00-00-00.db'), 'cópia do SQLite: não é deste script');
    const t0 = Date.now();
    const r = spawnSync('sh', [PG_SCRIPT, '--uma-vez'], { env: { ...ENV, ...env }, encoding: 'utf8', timeout: 60_000 });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /backup: .*cinzas-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.dump \(\d+ bytes, pg_dump -Fc de cinzas, 2 tabelas com dados/);
    const kept = copyStamps(bdir, 'cinzas', '.dump');
    const created = kept.find((s) => !fakes.includes(s));
    assert.ok(created);
    assert.deepEqual(kept, expectedKept([...fakes, created], 3, true));
    assert.equal(readFileSync(join(bdir, `cinzas-${created}.dump`), 'utf8'), 'PGDMP de teste: cinzas segredo do banco', 'senha do arquivo, sem a quebra de linha');
    assert.ok(existsSync(join(bdir, 'cinzas-2026-01-01T00-00-00.db')), 'a cópia do SQLite não entra na rotação dos dumps');
    const m = readMetric(metric);
    assert.equal(m.db, 'postgres');
    assert.ok(m.values.cinzas_backup_last_success_timestamp_seconds >= Math.floor(t0 / 1000) - 1);
    assert.equal(m.values.cinzas_backup_copies, kept.length);
    assert.equal(m.values.cinzas_backup_oldest_copy_timestamp_seconds, Math.round(atOf(kept[0]) / 1000));
    assert.equal(m.values.cinzas_backup_last_size_bytes, statSync(join(bdir, `cinzas-${created}.dump`)).size);
    // os mesmos nomes e textos do backup.mjs: o node-exporter junta os dois arquivos sem conflito
    const sq = join(dir, 'sqlite');
    mkdirSync(sq);
    new Store(join(sq, 'cinzas.db')).close();
    assert.equal(run(['--db', join(sq, 'cinzas.db'), '--para', join(sq, 'b'), '--metrica', join(sq, 'm.prom')]).status, 0);
    assert.deepEqual(m.help, readMetric(join(sq, 'm.prom')).help);
    // falha do pg_dump: sai com 1, não apaga nada e marca a falha mantendo o último sucesso
    const before = readdirSync(bdir).sort();
    const f = spawnSync('sh', [PG_SCRIPT, '--uma-vez'], { env: { ...ENV, ...env, STUB_FALHA: '1', BACKUP_MANTER: '1' }, encoding: 'utf8' });
    assert.equal(f.status, 1);
    assert.match(f.stderr, /backup falhou: pg_dump do banco cinzas/);
    assert.deepEqual(readdirSync(bdir).sort(), before);
    const mf = readMetric(metric).values;
    assert.equal(mf.cinzas_backup_last_success_timestamp_seconds, m.values.cinzas_backup_last_success_timestamp_seconds);
    assert.ok(mf.cinzas_backup_last_failure_timestamp_seconds >= mf.cinzas_backup_last_success_timestamp_seconds);
    // variável inválida não sobe
    const bad = spawnSync('sh', [PG_SCRIPT, '--uma-vez'], { env: { ...ENV, ...env, BACKUP_DIAS: 'catorze' }, encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /BACKUP_DIAS precisa ser um número inteiro/);
    // agendado: com cópia recente espera o intervalo; métrica apagada é semeada com as cópias da pasta
    rmSync(metric);
    const p = startProc('sh', [PG_SCRIPT], { ...env, BACKUP_A_CADA: '3600' });
    await p.waitFor(/backup agendado: banco cinzas em banco a cada 3600 s .*próximo em (59|60) min/);
    assert.deepEqual(readdirSync(bdir).sort(), before, 'nenhum dump novo ao (re)subir');
    assert.equal(readMetric(metric).values.cinzas_backup_last_success_timestamp_seconds, Math.round(atOf(created) / 1000));
    p.child.kill('SIGTERM');
    assert.equal((await p.exited).code, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('deploy/copia-externa.sh (perfil copia-externa): sync que espelha só as cópias, cifra exigida (ou recusada de propósito), métrica e falha', async () => {
  const dir = tmp();
  try {
    // rclone de mentira: anota os argumentos e o remoto cifrado; "obscure -" devolve a senha embaralhada
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    const calls = join(dir, 'chamadas.txt');
    writeFileSync(join(bin, 'rclone'), `#!/bin/sh
if [ "$1" = obscure ]; then printf 'embaralhada(%s)' "$(cat)"; exit 0; fi
printf '%s|%s|%s|%s\\n' "$*" "\${RCLONE_CONFIG_CIFRADO_TYPE:-}" "\${RCLONE_CONFIG_CIFRADO_REMOTE:-}" "\${RCLONE_CONFIG_CIFRADO_PASSWORD:-}" >> "${calls}"
[ -n "\${STUB_FALHA:-}" ] && exit 1
[ "$1" = cat ] && printf 'conteúdo de %s' "$2"
exit 0
`);
    chmodSync(join(bin, 'rclone'), 0o755);
    const script = join(ROOT, '..', 'deploy', 'copia-externa.sh');
    const origem = join(dir, 'backups');
    mkdirSync(origem);
    writeFileSync(join(origem, 'cinzas-2026-11-20T10-00-00.db'), 'x');
    const metric = join(dir, 'copia-externa.prom');
    const env = { PATH: `${bin}${delimiter}${process.env.PATH}`, COPIA_ORIGEM: origem, COPIA_DESTINO: 'balde/cinzas', COPIA_METRICA: metric };
    const sh = (args, extra = {}) => spawnSync('sh', [script, ...args], { env: { ...ENV, ...env, ...extra }, encoding: 'utf8' });
    // sem destino, ou sem senha da cifra (e sem dizer que é de propósito), não sobe
    let r = sh(['--uma-vez'], { COPIA_DESTINO: '' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /defina COPIA_DESTINO/);
    r = sh(['--uma-vez']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /defina COPIA_SENHA_CIFRA/);
    assert.equal(existsSync(calls), false, 'nada foi mandado');
    // sem cifra de propósito: sync direto para o remoto "externo", só as cópias com o nome que os backups dão
    r = sh(['--uma-vez'], { COPIA_SEM_CIFRA: 'sim' });
    assert.equal(r.status, 0, r.stderr);
    let log = readFileSync(calls, 'utf8').trim().split('\n');
    const pattern = '*-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]-[0-9][0-9]-[0-9][0-9].{db,dump}';
    assert.equal(log.at(-1).split('|')[0], `sync ${origem} externo:balde/cinzas --include ${pattern} --stats 0 -v`);
    // o padrão lido com a sintaxe do rclone (* sem barra, [classe], {a,b}): entram as cópias que a rotação de 14 dias
    // apaga; o .parcial de um backup em andamento, a cópia trazida para um ensaio de restauração e qualquer outro
    // arquivo da pasta ficam na máquina (lá fora ficariam para sempre, passando dos 14 dias da política de privacidade)
    const globRe = new RegExp(`^${pattern.replace(/[.+^$()|\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\{([^}]*)\}/g, (_, alts) => `(?:${alts.split(',').join('|')})`)}$`);
    for (const f of ['cinzas-2026-11-20T10-00-00.db', 'cinzas-2026-11-20T10-00-00.dump', 'cinzas-teste-2026-11-20T10-00-00.dump']) assert.match(f, globRe, `${f} vai para fora`);
    for (const f of ['restaurar.db', 'cinzas-2026-11-20T10-00-00.db.parcial', 'cinzas-antes-da-migracao.db', 'cinzas.db', 'notas.txt']) assert.doesNotMatch(f, globRe, `${f} fica na máquina`);
    const m = readFileSync(metric, 'utf8');
    assert.match(m, /^cinzas_offsite_copy_last_success_timestamp_seconds \d{10}$/m);
    assert.match(m, /^cinzas_offsite_copy_last_failure_timestamp_seconds 0$/m);
    const okAt = Number(/^cinzas_offsite_copy_last_success_timestamp_seconds (\d+)$/m.exec(m)[1]);
    // com cifra: remoto "cifrado" (crypt) por cima do externo, senha embaralhada pelo rclone obscure
    r = sh(['--uma-vez'], { COPIA_SENHA_CIFRA: 's3nha' });
    assert.equal(r.status, 0, r.stderr);
    log = readFileSync(calls, 'utf8').trim().split('\n');
    assert.deepEqual(log.at(-1).split('|'), [`sync ${origem} cifrado: --include ${pattern} --stats 0 -v`, 'crypt', 'externo:balde/cinzas', 'embaralhada(s3nha)']);
    // baixar: a cópia vai para a saída padrão (já decifrada pelo rclone)
    r = sh(['baixar', 'cinzas-2026-11-20T10-00-00.db'], { COPIA_SENHA_CIFRA: 's3nha' });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'conteúdo de cifrado:cinzas-2026-11-20T10-00-00.db');
    assert.equal(sh(['baixar'], { COPIA_SENHA_CIFRA: 's3nha' }).status, 2, 'baixar sem arquivo');
    r = sh(['baixar', 'cinzas-2026-11-20T10-00-00.db'], { COPIA_SEM_CIFRA: 'sim' });
    assert.equal(r.stdout, 'conteúdo de externo:balde/cinzas/cinzas-2026-11-20T10-00-00.db');
    // falha: sai com 1 e marca a hora da falha; o último sucesso continua o de antes, mesmo num processo novo (o
    // contêiner reiniciado que falha logo na primeira tentativa não zera a hora do último sucesso, senão o alerta
    // CopiaExternaAtrasada dispararia na hora dizendo que nada dá certo há mais de 3 h)
    writeFileSync(metric, readFileSync(metric, 'utf8').replace(/^(cinzas_offsite_copy_last_success_timestamp_seconds) \d+$/m, '$1 1700000000'));
    r = sh(['--uma-vez'], { STUB_FALHA: '1', COPIA_SENHA_CIFRA: 's3nha' });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a cópia para cifrado: falhou/);
    const failed = readFileSync(metric, 'utf8');
    assert.match(failed, /^cinzas_offsite_copy_last_failure_timestamp_seconds \d{10}$/m);
    assert.match(failed, /^cinzas_offsite_copy_last_success_timestamp_seconds 1700000000$/m, 'o último sucesso continua');
    assert.ok(okAt > 1700000000);
    // agendado: copia logo ao subir e o TERM encerra limpo
    const p = startProc('sh', [script], { ...env, COPIA_A_CADA: '3600', COPIA_SEM_CIFRA: 'sim' });
    await p.waitFor(/cópia em externo:balde\/cinzas em dia/);
    assert.match(p.output(), /aviso: COPIA_SEM_CIFRA=sim: as cópias vão sem cifra/);
    p.child.kill('SIGTERM');
    assert.equal((await p.exited).code, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------- PostgreSQL de verdade (npm run test:pg) ----------
const PG_URL = process.env.CINZAS_TEST_PG;
let pgBin = null;
if (PG_URL) {
  try {
    pgBin = findPgBin();
    if (!['pg_dump', 'pg_restore', 'createdb', 'dropdb'].every((b) => existsSync(join(pgBin, b)))) pgBin = null;
  } catch { pgBin = null; }
}

test('ensaio de restauração (PostgreSQL): pg_dump do esquema pelo backup.mjs e pelo script do compose, pg_restore num banco novo e os dados conferidos pelo PgStore', {
  skip: !PG_URL ? 'só no npm run test:pg' : !pgBin ? 'sem pg_dump/pg_restore/createdb' : false,
}, (t) => {
  const dir = tmp();
  const u = new URL(PG_URL);
  const host = u.searchParams.get('host') || u.hostname;
  const port = u.searchParams.get('port') || u.port || '5432';
  const user = decodeURIComponent(u.username);
  const pgEnv = { ...ENV, ...(u.password ? { PGPASSWORD: decodeURIComponent(u.password) } : {}) };
  const pg = (cmd, args) => spawnSync(join(pgBin, cmd), ['-h', host, '-p', port, '-U', user, ...args], { env: pgEnv, encoding: 'utf8' });
  const dbs = [];
  try {
    const dbPath = join(dir, 'ensaio-pg.db');
    const st = createStore(dbPath); // PgStore num esquema só deste teste
    const { schema } = testSchemaFor(dbPath);
    // o pg_dump recusa servidor de versão mais nova que a dele (ex.: cliente 16 da máquina e servidor 17 do CI)
    const serverMajor = Math.floor(Number(st.query('SHOW server_version_num')[0].server_version_num) / 10000);
    const dumpMajor = Number(/(\d+)(?:\.\d+)?/.exec(spawnSync(join(pgBin, 'pg_dump'), ['--version'], { encoding: 'utf8' }).stdout)?.[1]);
    if (!(dumpMajor >= serverMajor)) {
      st.close();
      t.skip(`pg_dump ${dumpMajor} é mais velho que o servidor ${serverMajor}`);
      return;
    }
    const acc = populate(st);
    const before = snapshot(st, acc);
    st.close();
    const restoreAndCheck = (dump) => {
      const name = `restaurado_${process.pid}_${dbs.length}`;
      dbs.push(name);
      let c = pg('createdb', [name]);
      assert.equal(c.status, 0, c.stderr);
      c = pg('pg_restore', ['--no-owner', '-d', name, dump]);
      assert.equal(c.status, 0, c.stderr);
      const url = new URL(PG_URL);
      url.pathname = `/${name}`;
      url.searchParams.set('schema', schema);
      const restored = new PgStore(url.toString(), { migrate: false });
      try {
        assert.deepEqual(snapshot(restored, acc), before, `${dump}: dados iguais aos de antes`);
        assert.ok(restored.verifyAccount('ensaio', 'senha-forte-1'));
      } finally { restored.close(); }
    };
    // 1) npm run backup (tools/backup.mjs) com ?schema=
    const bdir = join(dir, 'backups');
    const metric = join(dir, 'm.prom');
    const src = new URL(PG_URL);
    src.searchParams.set('schema', schema);
    const r = run(['--db', src.toString(), '--para', bdir, '--pg-bin', pgBin, '--metrica', metric]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /conferido com pg_restore --list/);
    const dump = readdirSync(bdir).find((f) => f.endsWith('.dump'));
    assert.match(dump, new RegExp(`^cinzas-${schema}-\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}\\.dump$`));
    assert.equal(readMetric(metric).db, 'postgres');
    restoreAndCheck(join(bdir, dump));
    // 2) o script do serviço backup-banco, com o pg_dump de verdade
    if (GNU_DATE) {
      const bdir2 = join(dir, 'backups-compose');
      const senha = join(dir, 'senha');
      writeFileSync(senha, `${pgEnv.PGPASSWORD ?? ''}\n`);
      const s = spawnSync('sh', [PG_SCRIPT, '--uma-vez'], {
        env: { ...ENV, PATH: `${pgBin}${delimiter}${process.env.PATH}`, PGHOST: host, PGPORT: port, PGUSER: user, PGDATABASE: decodeURIComponent(u.pathname.slice(1)) || user,
          BACKUP_ESQUEMA: schema, BACKUP_DIR: bdir2, BACKUP_METRICA: join(dir, 'm2.prom'), ...(pgEnv.PGPASSWORD ? { BACKUP_SENHA_ARQUIVO: senha } : {}) },
        encoding: 'utf8', timeout: 120_000,
      });
      assert.equal(s.status, 0, s.stderr + s.stdout);
      const dump2 = readdirSync(bdir2).find((f) => f.endsWith('.dump'));
      assert.ok(dump2, 'dump do script');
      restoreAndCheck(join(bdir2, dump2));
    }
  } finally {
    for (const name of dbs) pg('dropdb', ['--if-exists', name]);
    rmSync(dir, { recursive: true, force: true });
  }
});
