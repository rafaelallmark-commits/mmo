// Teste rápido do contêiner (deploy/teste-conteiner.sh; docs/08-operacao.md §8.8): é ele que decide se o CI e a
// release (job imagem, antes de publicar no ghcr.io) passam. Aqui ele roda com um "docker" e um "curl" de mentira
// no PATH, que respondem como o contêiner responderia e anotam cada chamada: confere as decisões do script (versão
// no hello e no registro de início, usuário sem privilégios) e a limpeza, que leva junto o volume anônimo de /data.
// O contêiner de verdade (imagem construída, saúde, backup, SIGTERM) é conferido pelo próprio CI no GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SCRIPT = new URL('../../deploy/teste-conteiner.sh', import.meta.url).pathname;

const FAKE_DOCKER = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
cmd=$1; shift
case "$cmd" in
  run) echo c0ffee ;;
  inspect)
    case "$*" in
      *Health*) echo "\${FAKE_SAUDE:-healthy}" ;;
      *ExitCode*) echo "\${FAKE_CODIGO:-0}" ;;
    esac ;;
  exec)
    esperada=
    if [ "$1" = -e ]; then esperada=\${2#ESPERADA=}; shift 2; fi
    shift
    case "$1" in
      id) echo "\${FAKE_UID:-10001}" ;;
      node)
        if [ "$2" = -p ]; then echo "$FAKE_PKG"
        else
          echo "WebSocket: {\\"t\\":\\"hello\\",\\"version\\":\\"$FAKE_VERSAO\\"}"
          [ "$esperada" = "$FAKE_VERSAO" ] || exit 1
        fi ;;
      npm) echo "backup gravado" ;;
    esac ;;
  logs) printf 'CINZAS DO MERIDIANO %s — servidor ouvindo em ws://0.0.0.0:7777\\nsalvando e encerrando...\\n' "\${FAKE_LOGVER:-$FAKE_VERSAO}" ;;
esac
exit 0
`;

function runScript(args, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cinzas-conteiner-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'docker'), FAKE_DOCKER);
    writeFileSync(join(bin, 'curl'), '#!/usr/bin/env bash\necho \'{"ok":true}\'\n');
    // a espera pela saúde (45 × 2 s) não precisa esperar de verdade aqui
    writeFileSync(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
    for (const f of ['docker', 'curl', 'sleep']) chmodSync(join(bin, f), 0o755);
    const log = join(dir, 'docker.log');
    writeFileSync(log, '');
    const r = spawnSync('bash', [SCRIPT, ...args], {
      cwd: dir, encoding: 'utf8', timeout: 30_000,
      env: { PATH: `${bin}:${process.env.PATH}`, FAKE_LOG: log, FAKE_PKG: '0.1.0', FAKE_VERSAO: '0.1.0', ...env },
    });
    return { status: r.status, out: r.stdout + r.stderr, calls: readFileSync(log, 'utf8').trim().split('\n') };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const removed = (calls) => calls.filter((c) => /^rm -f -v cinzas-teste-\d+$/.test(c));

test('teste do contêiner: versão da release no hello e no registro de início; a limpeza leva o volume de /data', () => {
  const ok = runScript(['cinzas-servidor:ci', '0.4.0-teste.2'], { FAKE_VERSAO: '0.4.0-teste.2' });
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /Teste do contêiner: ok \(versão 0\.4\.0-teste\.2\)/);
  assert.ok(ok.calls.some((c) => /^run -d --name cinzas-teste-\d+ -p 127\.0\.0\.1:9100:9100 cinzas-servidor:ci$/.test(c)), ok.calls.join('\n'));
  assert.equal(removed(ok.calls).length, 1, 'docker rm -f -v ao sair (sem o -v sobra um volume órfão por teste)');
  // outra porta de métricas (a pilha do compose já ocupa a 9100 no VPS)
  const porta = runScript(['cinzas-servidor:local', '0.4.0-teste.2'], { FAKE_VERSAO: '0.4.0-teste.2', CINZAS_TESTE_PORTA: '9101' });
  assert.equal(porta.status, 0, porta.out);
  assert.ok(porta.calls.some((c) => c.includes('-p 127.0.0.1:9101:9100 ')), porta.calls.join('\n'));
  // sem a versão esperada: a do package.json da imagem
  const pkg = runScript(['cinzas-servidor:ci']);
  assert.equal(pkg.status, 0, pkg.out);
  assert.match(pkg.out, /Teste do contêiner: ok \(versão 0\.1\.0\)/);
});

test('teste do contêiner: hello de outra versão, usuário root ou registro sem a versão reprovam (e limpam do mesmo jeito)', () => {
  const outra = runScript(['cinzas-servidor:teste', '0.4.0-teste.2'], { FAKE_VERSAO: '0.4.0-teste.1' });
  assert.equal(outra.status, 1, outra.out);
  assert.match(outra.out, /::error title=Imagem do servidor::o WebSocket não respondeu com o hello da versão 0\.4\.0-teste\.2/);
  assert.equal(removed(outra.calls).length, 1, 'o contêiner sai mesmo quando o teste reprova');
  const root = runScript(['cinzas-servidor:teste'], { FAKE_UID: '0' });
  assert.equal(root.status, 1, root.out);
  assert.match(root.out, /o servidor está rodando como root/);
  const registro = runScript(['cinzas-servidor:teste', '0.4.0-teste.2'], { FAKE_VERSAO: '0.4.0-teste.2', FAKE_LOGVER: '0.1.0' });
  assert.equal(registro.status, 1, registro.out);
  assert.match(registro.out, /o registro de início não mostra a versão 0\.4\.0-teste\.2/);
  const doente = runScript(['cinzas-servidor:teste'], { FAKE_SAUDE: 'unhealthy' });
  assert.equal(doente.status, 1, doente.out);
  assert.match(doente.out, /o contêiner não ficou saudável \(estado: unhealthy\)/);
  assert.equal(removed(doente.calls).length, 1);
});
