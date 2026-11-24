// Página do jogo e proxy (D152; docs/08-operacao.md §8.8): https://DOMINIO/ no navegador recebe a página
// estática de deploy/site, sem scripts nem recursos de outros sites (a política de privacidade promete avisos
// "no site" e nenhum rastreador), e o Caddyfile continua mandando o WebSocket do jogo ao servidor e /contas ao
// serviço de contas. Conferência de texto dos arquivos de implantação: o roteamento de verdade foi testado com o
// Caddy 2 na frente do servidor e das contas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('a página do jogo é estática, sem rastreadores, e tem os links e o espaço de avisos', () => {
  const html = read('deploy/site/index.html');
  assert.match(html, /<html lang="pt-BR">/);
  assert.doesNotMatch(html, /<script/i, 'sem scripts');
  assert.doesNotMatch(html, /<iframe|<object|<embed/i, 'sem conteúdo embutido');
  assert.doesNotMatch(html, /@import|url\(\s*['"]?https?:/i, 'CSS sem recursos de fora');
  // nenhum recurso carregado de outro site (src/href de imagem, estilo, ícone); só links que o jogador clica
  for (const m of html.matchAll(/<(img|link|source|video|audio)\b[^>]*>/gi)) {
    assert.doesNotMatch(m[0], /(src|href)\s*=\s*["']?(https?:)?\/\//i, `recurso externo: ${m[0]}`);
  }
  assert.match(html, /id="avisos"/, 'espaço dos avisos da equipe');
  for (const href of ['/guia', '/contas/termos', '/contas/privacidade']) assert.ok(html.includes(`href="${href}"`), href);
  assert.match(html, /href="https:\/\/github\.com\/[^"]+\/releases"/, 'link para baixar na página de Releases');
  assert.ok(existsSync(new URL('deploy/site/icone.png', root)), 'ícone da página');
});

test('o Caddyfile separa WebSocket, contas, guia e página, com política de segurança na página', () => {
  const caddy = read('deploy/Caddyfile');
  assert.match(caddy, /handle \/contas\/\* \{\s*uri strip_prefix \/contas\s*reverse_proxy contas:7780/);
  assert.match(caddy, /header_regexp Upgrade \(\?i\)\^websocket\$/);
  assert.match(caddy, /handle @jogo \{\s*reverse_proxy servidor:7777/);
  assert.match(caddy, /handle \/guia \{\s*root \* \{\$CINZAS_DOCS:\/srv\/docs\}\s*rewrite \* \/GUIA\.md/);
  assert.match(caddy, /Content-Security-Policy "default-src 'none';/);
  // Avisos e guia: o navegador confere a cada visita (sem Cache-Control ele reaproveitaria a cópia guardada por
  // até 10% da idade do arquivo, sem perguntar, e quem voltou à página não via o aviso novo)
  const block = (start) => { const b = caddy.slice(caddy.indexOf(start)); return b.slice(0, b.indexOf('\n\t\tfile_server')); };
  assert.match(block('\n\thandle {'), /\n\t\t\tCache-Control no-cache(\n|$)/, 'página do jogo');
  assert.match(block('handle /guia {'), /\n\t\theader Cache-Control no-cache(\n|$)/, 'guia');
  // a página é o bloco "handle" sem condição: o Caddy o põe depois dos que têm caminho ou matcher, então um
  // pedido de WebSocket nunca cai nela
  assert.match(caddy, /\n\thandle \{\s*root \* \{\$CINZAS_SITE:\/srv\/site\}/);
  const compose = read('deploy/docker-compose.yml');
  assert.match(compose, /- \.\/site:\/srv\/site:ro/);
  assert.match(compose, /- \.\.\/docs:\/srv\/docs:ro/);
});
