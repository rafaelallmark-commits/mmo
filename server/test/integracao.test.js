// Integração das frentes: o que só aparece quando duas mudanças independentes se encontram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGameData } from '../src/data.js';
import { createStore } from '../src/db.js';
import { Zone } from '../src/zone.js';
import { makeRng } from '../src/rng.js';

const data = loadGameData();

test('perigos do mapa (esteira da Oficina) e golpes avisados dos monstros vivem em listas separadas: o tick de toda zona roda', () => {
  // As missões trouxeram perigos do mapa (a esteira) e os monstros trouxeram golpes avisados; os dois usavam
  // zone.hazards com formatos diferentes, e o tick das mecânicas lia h.owner da esteira e derrubava o processo.
  for (const mapId of Object.keys(data.maps)) {
    const zone = new Zone({ mapId, data, store: createStore(':memory:'), rng: makeRng(2), send: () => {}, broadcast: () => {}, hooks: { hazardWanted: () => true } });
    assert.ok(Array.isArray(zone.hazards), `${mapId}: lista dos golpes avisados`);
    assert.ok(Array.isArray(zone.mapHazards), `${mapId}: lista dos perigos do mapa`);
    assert.ok(zone.hazards.every((h) => h.owner || h.posthumous), `${mapId}: só golpe de monstro em zone.hazards`);
    for (let i = 0; i < 50; i++) zone.tick(100);
  }
  const oficina = new Zone({ mapId: 'oficina_soterrada', data, store: createStore(':memory:'), rng: makeRng(3), send: () => {}, broadcast: () => {} });
  assert.ok(oficina.mapHazards.length >= 1, 'a Oficina tem a esteira');
});

test('ninho dos Besouros-Brasa (território das mecânicas) longe dos resgates do tutorial e da estrada segura', async () => {
  // As mecânicas deram território ao Besouro-Brasa (morde quem chega a 2,5 m) e o tutorial pôs Caio dentro da Encosta
  // Morna: quem ia buscá-lo apanhava dos besouros do ninho. As conferências de alcance contam o território como
  // agressão de perto (D172) e o ninho foi para o norte, junto ao leito seco.
  const { validate, loadBuilds } = await import('../tools/validate-data.js');
  assert.deepEqual(validate(data, loadBuilds()).errors, []);
  const old = structuredClone(data);
  Object.assign(old.maps.estrada_velha.spawns.find((s) => s.monster === 'ember_beetle'), { x: 52, z: 32, radius: 8 });
  const errs = validate(old, loadBuilds()).errors;
  assert.ok(errs.some((e) => /resgate caio: Besouro-Brasa .* alcança quem vai buscá-lo/.test(e)), errs.join('\n'));
  assert.ok(errs.some((e) => /Besouro-Brasa .* alcança a estrada segura/.test(e)), errs.join('\n'));
});
