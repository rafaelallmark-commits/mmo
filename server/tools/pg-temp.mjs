// Cluster PostgreSQL temporário para testes e medições: initdb num diretório temporário, servidor só
// por soquete Unix (listen_addresses vazio: nada de TCP), banco "cinzas", tudo apagado no fim.
//
//   import { startTempPostgres } from './pg-temp.mjs'   -> { url, stop(), ... }
//   node tools/pg-temp.mjs [--duravel] -- <comando> [args...]
//       sobe o cluster, roda o comando com CINZAS_PG_URL=<url> ({url} nos argumentos vira a URL),
//       para e apaga o cluster; sem comando, fica no ar até Ctrl+C.
//
// Sem --duravel (testes) o cluster roda com fsync/synchronous_commit desligados; com --duravel
// (medições, ex. teste de carga) fica com os padrões do PostgreSQL.
// Binários: CINZAS_PG_BIN, pg_config --bindir ou /usr/lib/postgresql/<versão>/bin.
// Como root: o PostgreSQL se recusa a rodar como root, então initdb/pg_ctl rodam como um usuário comum
// (CINZAS_PG_USER, senão "postgres", senão "nobody"); o diretório temporário passa a ser dele.
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, chownSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

export function findPgBin(explicit = process.env.CINZAS_PG_BIN) {
  const dirs = [];
  if (explicit) dirs.push(explicit);
  const pc = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  if (pc.status === 0) dirs.push(pc.stdout.trim());
  if (existsSync('/usr/lib/postgresql')) {
    for (const v of readdirSync('/usr/lib/postgresql').sort((a, b) => Number(b) - Number(a))) dirs.push(`/usr/lib/postgresql/${v}/bin`);
  }
  dirs.push('/usr/local/pgsql/bin', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin');
  for (const d of dirs) if (existsSync(join(d, 'initdb')) && existsSync(join(d, 'pg_ctl'))) return d;
  throw new Error('initdb/pg_ctl não encontrados: instale o PostgreSQL ou aponte CINZAS_PG_BIN para a pasta bin');
}

function unprivilegedUser() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return null;
  for (const name of [process.env.CINZAS_PG_USER, 'postgres', 'nobody'].filter(Boolean)) {
    const u = spawnSync('id', ['-u', name], { encoding: 'utf8' });
    const g = spawnSync('id', ['-g', name], { encoding: 'utf8' });
    if (u.status === 0 && g.status === 0) return { name, uid: Number(u.stdout.trim()), gid: Number(g.stdout.trim()) };
  }
  throw new Error('rodando como root: o PostgreSQL não roda como root e não há usuário comum (postgres/nobody); defina CINZAS_PG_USER');
}

export async function startTempPostgres({ durable = false, maxConnections = 300 } = {}) {
  const bin = findPgBin();
  const tmp = tmpdir().length > 60 ? '/tmp' : tmpdir(); // caminho do soquete tem limite (~107 bytes)
  const base = mkdtempSync(join(tmp, 'cinzas-pg-'));
  const data = join(base, 'data');
  const sock = join(base, 'sock');
  const logFile = join(base, 'postgres.log');
  mkdirSync(sock);
  const as = unprivilegedUser();
  if (as) { chownSync(base, as.uid, as.gid); chownSync(sock, as.uid, as.gid); }
  const run = (cmd, args) => {
    const r = spawnSync(join(bin, cmd), args, { cwd: base, encoding: 'utf8', ...(as ? { uid: as.uid, gid: as.gid } : {}) });
    if (r.status !== 0) throw new Error(`${cmd} falhou (${r.status ?? r.signal ?? r.error?.message}): ${(r.stderr || r.stdout || '').trim()}`);
    return r.stdout;
  };
  const port = 5432; // só nomeia o soquete (.s.PGSQL.5432) dentro do diretório temporário: não colide
  const stop = () => {
    if (stop.done) return;
    stop.done = true;
    try { run('pg_ctl', ['-D', data, '-m', 'fast', '-w', '-t', '60', 'stop']); } catch {
      try { process.kill(Number(readFileSync(join(data, 'postmaster.pid'), 'utf8').split('\n')[0]), 'SIGQUIT'); } catch { /* já parado */ }
    }
    rmSync(base, { recursive: true, force: true });
  };
  try {
    const init = ['-D', data, '-U', 'cinzas', '--auth=trust', '--encoding=UTF8', ...(durable ? [] : ['--no-sync'])];
    try { run('initdb', [...init, '--locale=C.UTF-8']); } catch {
      rmSync(data, { recursive: true, force: true });
      run('initdb', [...init, '--locale=C']); // sistemas sem C.UTF-8 (lower() só em ASCII)
    }
    const opts = [`-k ${sock}`, `-p ${port}`, "-c listen_addresses=''", `-c max_connections=${maxConnections}`,
      ...(durable ? [] : ['-c fsync=off', '-c synchronous_commit=off', '-c full_page_writes=off'])].join(' ');
    run('pg_ctl', ['-D', data, '-l', logFile, '-w', '-t', '60', '-o', opts, 'start']);
    run('createdb', ['-h', sock, '-p', String(port), '-U', 'cinzas', 'cinzas']);
  } catch (e) {
    let log = '';
    try { log = readFileSync(logFile, 'utf8').slice(-2000); } catch { /* sem log */ }
    stop();
    throw new Error(`${e.message}${log ? `\n--- postgres.log ---\n${log}` : ''}`);
  }
  const url = `postgresql://cinzas@localhost/cinzas?host=${encodeURIComponent(sock)}&port=${port}`;
  return { url, dir: base, bin, port, socketDir: sock, user: as?.name ?? null, durable, logFile, stop };
}

// ---------- linha de comando ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sep = process.argv.indexOf('--');
  const cmd = sep === -1 ? [] : process.argv.slice(sep + 1);
  const pg = await startTempPostgres({ durable: process.argv.slice(2, sep === -1 ? undefined : sep).includes('--duravel') });
  console.log(`PostgreSQL temporário${pg.durable ? ' (durável)' : ''}${pg.user ? ` como ${pg.user}` : ''}: ${pg.url}`);
  let code = 0;
  if (!cmd.length) {
    console.log('No ar. Ctrl+C para parar e apagar.');
    await new Promise((r) => { process.on('SIGINT', r); process.on('SIGTERM', r); });
  } else {
    const child = spawn(cmd[0], cmd.slice(1).map((a) => a.replaceAll('{url}', pg.url)), { stdio: 'inherit', env: { ...process.env, CINZAS_PG_URL: pg.url } });
    for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
    code = await new Promise((r) => child.on('exit', (c) => r(c ?? 1)));
  }
  pg.stop();
  process.exit(code);
}
