// Carrega e indexa os arquivos de dados do jogo (pasta /data na raiz do repositório).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');

function readJson(dir, name) {
  return JSON.parse(readFileSync(join(dir, name), 'utf8'));
}

export function loadGameData(dir = DEFAULT_DATA_DIR) {
  const classesFile = readJson(dir, 'classes.json');
  const skillsFile = readJson(dir, 'skills.json');
  const itemsFile = readJson(dir, 'items.json');
  const data = {
    attributes: classesFile.attributes,
    pointsPerLevel: classesFile.pointsPerLevel,
    skillPointsPerLevel: classesFile.skillPointsPerLevel,
    levelCap: classesFile.levelCap,
    classes: classesFile.classes,
    origins: classesFile.origins,
    skillRules: skillsFile.rules,
    skills: skillsFile.skills,
    items: itemsFile.items,
    rarities: itemsFile.rarities,
    slots: itemsFile.slots,
    families: itemsFile.families,
    monsters: readJson(dir, 'monsters.json').monsters,
    lootTables: readJson(dir, 'loot_tables.json').tables,
    maps: readJson(dir, 'maps.json').maps,
    xp: readJson(dir, 'xp_table.json'),
    formulas: readJson(dir, 'formulas.json'),
  };
  return data;
}

export const ATTRS = ['str', 'spi', 'tal', 'agi', 'vit'];
