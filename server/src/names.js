// Nomes de personagem e de clã: formato, prefixos que a exclusão usa e palavras da equipe (D125, D145).
// Usado na criação de personagem e de clã e nos comandos de administração que renomeiam.

// Nome de personagem: sem espaços (comandos de chat como /s Nome e /denunciar Nome terminam o nome no
// primeiro espaço) e sem × ÷. Nomes antigos com espaço continuam valendo (o cliente aceita "entre aspas").
export const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9_-]{2,15}$/;
// prefixos que a exclusão de personagem usa para renomear (excluido_<id>, store.deleteCharacter) e que a de conta
// usava (excluida_<id>; hoje ela grava excluida#<id>): reservados para personagem, clã e conta (D125, D176)
export const DELETED_PREFIX_RE = /^exclu[ií]d[oa]_/i;
// Palavras da equipe (D145). Longas: nenhum nome de personagem ou de clã pode ser uma delas, nem começar ou
// terminar com uma. Curtas: só o nome inteiro ou um pedaço separado do resto (GM_Ana, Ana-Mod, Dev1, AdmLia,
// "Clã do GM") — começar ou terminar com elas é comum em nomes de gente (Modesto, Devanir, Admir, Gmelina).
const LONG_WORDS = ['admin', 'equipe', 'moderador', 'moderacao', 'suporte', 'sistema', 'staff', 'mestre'];
const SHORT_WORDS = ['gm', 'adm', 'mod', 'dev'];
const STAFF_WORDS = [...SHORT_WORDS, ...LONG_WORDS];
// pedaço separado que é uma palavra curta, também no plural ("Os GMs", "Ana_Mods")
const SHORT_PARTS = new Set(SHORT_WORDS.flatMap((w) => [w, `${w}s`]));
// siglas de clã que imitam a equipe (além das palavras acima)
const STAFF_TAGS = new Set(['GM', 'ADM', 'MOD', 'DEV', 'STAF', 'EQP']);
// algarismos no lugar de letras ("Adm1n", "M0d"): lidos como as letras que imitam, só para estas comparações
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };
// letras que a decomposição de acentos não separa (Bjørn, Ægir): a letra simples equivalente
const PLAIN = { ø: 'o', Ø: 'O', æ: 'ae', Æ: 'Ae', ß: 'ss', ð: 'd', Ð: 'D', þ: 'th', Þ: 'Th' };

// sem acentos, mantendo maiúsculas e minúsculas
const unaccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[øØæÆßðÐþÞ]/g, (c) => PLAIN[c]);
const leet = (s) => s.replace(/[013457]/g, (d) => LEET[d]);

// Forma de comparação: sem maiúsculas, sem acentos, sem _ - espaço e apóstrofo, algarismos como letras.
export function foldName(s) {
  return leet(unaccent(s).toLowerCase().replace(/[_\-\s'’]/g, ''));
}

// Pedaços do nome (sem acentos, em minúsculas): o que separa é tudo o que não é letra (_ - espaço apóstrofo
// algarismo) e a troca de maiúscula (anaMod, GMJoao; o plural "GMs" fica junto). Duas leituras dos algarismos:
// separador ("Dev1") e a letra que imitam ("M0d_Ana").
export function nameParts(s) {
  const cased = unaccent(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z]{2,})/g, '$1 $2').toLowerCase();
  return [...cased.split(/[^a-z]+/), ...leet(cased).split(/[^a-z]+/)].filter(Boolean);
}

// true se o nome imita a equipe: é uma palavra da equipe; começa ou termina com uma palavra longa; ou tem
// uma palavra curta como pedaço separado
export function hasStaffWord(s) {
  const f = foldName(s);
  if (!f) return false;
  if (STAFF_WORDS.includes(f)) return true;
  if (LONG_WORDS.some((w) => f.startsWith(w) || f.endsWith(w))) return true;
  return nameParts(s).some((p) => SHORT_PARTS.has(p));
}

// sigla de clã (2 a 4 letras ou algarismos, sem separadores): as listadas e as que começam ou terminam com
// uma palavra da equipe, curta ou longa (GMX, XGM, M0D, MODA) — numa sigla não há nome de gente para proteger
function tagHasStaffWord(tag) {
  const f = foldName(tag);
  return !!f && STAFF_WORDS.some((w) => f.startsWith(w) || f.endsWith(w));
}

export const isReservedCharName = (name) => DELETED_PREFIX_RE.test(String(name)) || hasStaffWord(name);
export const isReservedClanName = (name) => DELETED_PREFIX_RE.test(String(name)) || hasStaffWord(name);
export const isReservedClanTag = (tag) => STAFF_TAGS.has(String(tag).toUpperCase()) || tagHasStaffWord(tag);

// Variantes de maiúsculas das letras acentuadas: o banco compara sem diferença de maiúsculas só em A-Z
// (NOCASE), mas o jogo procura nomes em minúsculas Unicode (byName); "Ângela" e "ângela" não podem coexistir.
export function accentCaseVariants(name) {
  let out = [''];
  for (const ch of name) {
    const lo = ch.toLowerCase(), up = ch.toUpperCase();
    const alts = ch.charCodeAt(0) > 127 && lo !== up && lo.length === 1 && up.length === 1 ? [lo, up] : [ch];
    out = out.flatMap((pre) => alts.map((a) => pre + a));
    if (out.length > 16) return [name, name.toLowerCase(), name.toUpperCase()]; // muitos acentos: os extremos bastam
  }
  return out;
}

// Confere um nome de personagem novo (criação ou /gm renomear): { name } ou { err } (resposta de recusa).
// exceptId: o próprio personagem (renomear só trocando maiúsculas ou acentos não conta como duplicata).
export function checkCharName(store, raw, exceptId = null) {
  if (typeof raw !== 'string' || !NAME_RE.test(raw.trim())) return { err: { ok: false, code: 'bad_name', reason: 'Nome: 3 a 16 letras, números, _ ou -, começando por letra e sem espaços.' } };
  const name = raw.trim();
  if (isReservedCharName(name)) return { err: { ok: false, code: 'bad_name', reason: 'Esse nome não pode ser usado (é reservado ou imita a equipe).' } };
  const taken = accentCaseVariants(name).some((v) => {
    const row = store.characterByName(v);
    return row && row.id !== exceptId;
  });
  if (taken) return { err: { ok: false, code: 'name_taken', reason: 'Esse nome já está em uso.' } };
  return { name };
}
