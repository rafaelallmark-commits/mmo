// Nomes de personagem e de clã: formato, prefixos que a exclusão usa e palavras da equipe (D125, D145).
// Usado na criação de personagem e de clã e nos comandos de administração que renomeiam.

// Nome de personagem: sem espaços (comandos de chat como /s Nome e /denunciar Nome terminam o nome no
// primeiro espaço) e sem × ÷. Nomes antigos com espaço continuam valendo (o cliente aceita "entre aspas").
export const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ0-9_-]{2,15}$/;
// prefixos que a exclusão de conta e de personagem usa para renomear (store.deleteAccount/deleteCharacter)
export const DELETED_PREFIX_RE = /^exclu[ií]d[oa]_/i;
// palavras da equipe: nenhum nome de personagem ou de clã pode ser uma delas, nem começar ou terminar com uma
const STAFF_WORDS = ['gm', 'adm', 'admin', 'equipe', 'moderador', 'moderacao', 'mod', 'suporte', 'sistema', 'staff', 'dev', 'mestre'];
// siglas de clã que imitam a equipe (além das palavras acima)
const STAFF_TAGS = new Set(['GM', 'ADM', 'MOD', 'DEV', 'STAF', 'EQP']);
// algarismos no lugar de letras ("Adm1n", "M0d"): lidos como as letras que imitam
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't' };

// Forma de comparação: sem maiúsculas, sem acentos, sem _ - espaço e apóstrofo, algarismos como letras.
export function foldName(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[_\-\s'’]/g, '').replace(/[013457]/g, (d) => LEET[d]);
}

// true se o nome é, começa ou termina com uma palavra da equipe
export function hasStaffWord(s) {
  const f = foldName(s);
  return !!f && STAFF_WORDS.some((w) => f.startsWith(w) || f.endsWith(w));
}

export const isReservedCharName = (name) => DELETED_PREFIX_RE.test(String(name)) || hasStaffWord(name);
export const isReservedClanName = (name) => DELETED_PREFIX_RE.test(String(name)) || hasStaffWord(name);
export const isReservedClanTag = (tag) => STAFF_TAGS.has(String(tag).toUpperCase()) || hasStaffWord(tag);

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
