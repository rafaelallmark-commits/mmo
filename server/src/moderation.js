// Moderação do teste público: suspensão (ban) e silêncio (mute) por conta, expulsão, anúncio,
// "onde está" e denúncias com o contexto do chat. Comandos de mestre (papel gm/admin) e a ferramenta
// tools/conta.mjs mexem no banco; o servidor confere o banco a cada minuto, então uma suspensão, um
// silêncio ou um papel novo dado pela ferramenta vale para quem estiver on-line em até 60 s. Tudo vai
// para a auditoria. Administração (só admin, D146): renomear personagem e clã e retirar itens e ouro,
// com o personagem on-line (na memória) ou fora do ar (no banco). Denúncia e /bug avisam a equipe on-line.
// Várias zonas: o alvo pode estar em outra zona; expulsão, suspensão e silêncio seguem pela conta
// através do serviço de mundo (server.modRemote), "onde está" pergunta ao mundo e o anúncio e os avisos
// para a equipe vão a todas.
import { checkCharName, accentCaseVariants, DELETED_PREFIX_RE } from './names.js';
import { checkClanName } from './clans.js';

export const PERMANENT = 253402300799000; // 31/12/9999: suspensão sem data para acabar
export const STAFF_ROLES = new Set(['gm', 'admin']); // papéis com a marca [Equipe] e os avisos de denúncia
const CHAT_KEEP = 20;          // últimas falas por personagem guardadas para dar contexto às denúncias
const REPORTS_PER_HOUR = 5;
const BUGS_PER_HOUR = 10;
const MAX_GM_BAN_H = 72;       // mestre suspende até 72 h; acima disso (ou permanente), só admin
const MAX_BAN_H = 24 * 365 * 5;     // prazo máximo com data: 5 anos (acima disso, "perm")
const MAX_MUTE_MIN = 60 * 24 * 30;  // silêncio: até 30 dias
const CHANNELS = new Set(['zone', 'party', 'whisper', 'clan']);
const HOUR = 3600_000;
const ROLE_LEVEL = { player: 0, gm: 1, admin: 2 };
const ROLE_NAME = { player: 'jogador', gm: 'mestre', admin: 'administrador' };
const MOD_CMDS = new Set(['kick', 'ban', 'unban', 'mute', 'unmute', 'where', 'announce', 'rename', 'rename_clan', 'take_item', 'take_gold']);
// administração que muda nome, itens ou ouro de um jogador: só admin (ou --dev), como os comandos de cenário (D138)
const ADMIN_CMDS = new Set(['rename', 'rename_clan', 'take_item', 'take_gold']);
const TAKE_GOLD_MAX = 1_000_000_000;
// texto vindo do jogador, sem caracteres de controle (não mexe no terminal de quem lê a auditoria)
export const cleanText = (t, max) => (typeof t === 'string' ? t.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, max) : '');

// trecho do texto do jogador no aviso para a equipe (o texto inteiro fica na auditoria)
const short = (t, max = 80) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);
const fmt = (ms) => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
const untilText = (ms) => (ms >= PERMANENT ? 'sem data para acabar' : `até ${fmt(ms)}`);

// Mensagem de recusa do login, ou null se a conta não está suspensa.
export function banMessage(acc, now = Date.now()) {
  if (!acc?.banned_until || acc.banned_until <= now) return null;
  return `Conta suspensa ${untilText(acc.banned_until)}.${acc.ban_reason ? ` Motivo: ${acc.ban_reason}.` : ''}`;
}

export class Moderation {
  constructor(server) {
    this.s = server;
    this.chatLog = new Map();   // charId -> [{ at, channel, text }]
    this.reports = new Map();   // charId denunciante -> [instantes]
    this.bugs = new Map();      // charId -> [instantes] (relatos de problema)
    this.lastSweep = 0;
  }

  get st() { return this.s.store; }

  // no login: guarda o silêncio na sessão (o chat não consulta o banco a cada fala)
  onLogin(s, acc) { s.mutedUntil = acc.muted_until ?? 0; }

  // Aviso curto para a equipe on-line (papéis gm e admin) desta zona e, com várias zonas, das outras.
  notifyStaff(text, { remote = true } = {}) {
    for (const s of this.s.sessions) if (STAFF_ROLES.has(s.role)) this.s.sendTo(s, { t: 'notice', kind: 'staff', text });
    if (remote) this.s.world?.notify('staff', { text });
  }

  // gancho do chat: recusa se a conta está silenciada. A fala só é guardada (remember) depois de entregue,
  // com quem a recebeu: sussurro para quem não está on-line ou grupo inexistente não viram contexto.
  chatBlocked(p) { return this.mutedReason(p); }

  // silenciado? (vale para chat e para textos que o clã inteiro recebe, como a mensagem do dia)
  mutedReason(p) {
    const sess = this.s.byChar.get(p.char.id);
    if (sess?.mutedUntil > Date.now()) return { ok: false, code: 'muted', reason: `Você está silenciado ${untilText(sess.mutedUntil)}.` };
    return null;
  }

  // Guarda uma fala entregue, para dar contexto às denúncias (também as que chegam de outras zonas:
  // sussurro, grupo e clã). to = ids dos personagens que a receberam; null = fala do mapa (pública). A
  // denúncia leva só o que o denunciante podia ver: as falas do mapa e as que chegaram a ele (D86).
  remember(charId, channel, text, to = null, at = Date.now()) {
    const t = cleanText(text, 200);
    if (!t) return;
    const ch = CHANNELS.has(channel) ? channel : 'outro';
    const ids = Array.isArray(to) ? to.filter(Number.isInteger) : null;
    const log = (this.chatLog.get(charId) ?? []).filter((l) => at - l.at <= HOUR);
    const last = log[log.length - 1];
    // a mesma fala chegando aos poucos (de outra zona, um destinatário por vez): junta quem recebeu
    if (ids && last && last.channel === ch && last.text === t && Array.isArray(last.to) && at - last.at < 2000) {
      for (const id of ids) if (!last.to.includes(id)) last.to.push(id);
    } else {
      log.push({ at, channel: ch, text: t, ...(ids ? { to: ids } : {}) });
      if (log.length > CHAT_KEEP) log.shift();
    }
    this.chatLog.set(charId, log);
  }

  // o que o denunciante podia ver: fala do mapa, ou fala que chegou a ele (sussurro, grupo e clã dele)
  static visibleTo(line, charId) {
    return line.channel === 'zone' || (Array.isArray(line.to) && line.to.includes(charId));
  }

  // várias zonas: as falas recentes chegam com o personagem transferido (sem repetir as que já temos)
  adopt(charId, list) {
    if (!Array.isArray(list) || !list.length) return;
    const now = Date.now();
    const seen = new Set();
    const all = [...(this.chatLog.get(charId) ?? []), ...list].filter((l) => {
      const k = `${l.at}|${l.text}`;
      if (seen.has(k) || now - l.at > HOUR) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => a.at - b.at);
    if (all.length) this.chatLog.set(charId, all.slice(-CHAT_KEEP));
  }

  forget(charId) { this.chatLog.delete(charId); }

  // a cada minuto: aplica suspensões e silêncios feitos fora do servidor (ferramenta, outro processo)
  sweep(now = Date.now()) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    // falas com mais de 1 h saem do contexto de denúncia
    for (const [charId, log] of this.chatLog) {
      const keep = log.filter((l) => now - l.at <= HOUR);
      if (keep.length) this.chatLog.set(charId, keep); else this.chatLog.delete(charId);
    }
    const sessions = [...this.s.sessions].filter((s) => s.accountId != null);
    if (!sessions.length) return;
    // uma consulta para todas as sessões (no PostgreSQL, uma ida e volta em vez de uma por jogador)
    const accounts = new Map(this.st.findAccountsByIds(sessions.map((s) => s.accountId)).map((a) => [a.id, a]));
    for (const s of sessions) {
      const acc = accounts.get(s.accountId);
      // conta excluída fora deste servidor (serviço de contas, ferramenta): a sessão cai
      if (!acc) { this.kickSession(s, 'Esta conta foi excluída.'); continue; }
      s.mutedUntil = acc.muted_until ?? 0;
      const ban = banMessage(acc, now);
      if (ban) { this.kickSession(s, ban); continue; }
      this.applyRole(s, acc.role ?? 'player');
    }
  }

  // Papel relido do banco (varredura de cada minuto): rebaixar um mestre on-line tira o poder sem novo login,
  // e a marca [Equipe] do personagem acompanha o papel.
  applyRole(s, role) {
    if (s.role === role) return;
    const was = s.role;
    s.role = role;
    const p = s.charId != null ? this.s.playerOf(s.charId) : null;
    if (p) p.char.staff = STAFF_ROLES.has(role);
    this.s.log(`papel da conta ${s.accountId}: ${was} -> ${role}`);
    if (s.charId != null) this.s.sendTo(s, { t: 'system', text: `Seu papel na equipe mudou: agora você é ${ROLE_NAME[role] ?? role}.` });
  }

  kickSession(s, reason) {
    this.s.sendTo(s, { t: 'kicked', reason });
    this.s.dropSession(s);
    try { s.ws.close(4003, 'moderação'); } catch { /* já fechada */ }
  }

  // alvo por nome de personagem: on-line (sessão), on-line em outra zona (remote) ou só a conta
  findTarget(name) {
    const key = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!key) return null;
    const charId = this.s.byName.get(key);
    if (charId != null) {
      const sess = this.s.byChar.get(charId);
      const p = this.s.playerOf(charId);
      return { charId, name: p?.char.name ?? name, accountId: sess?.accountId ?? p?.char.accountId, sess, p };
    }
    // (o banco só iguala maiúsculas em A-Z: as variantes das letras acentuadas acham "Ângela" por "ângela")
    const row = accentCaseVariants(name.trim()).map((v) => this.st.characterByName?.(v)).find(Boolean);
    // personagem excluído (excluido_<id>) não é alvo: renomeá-lo o traria de volta à lista da conta
    if (!row || DELETED_PREFIX_RE.test(row.name)) return null;
    const remote = this.s.remoteChar?.(name);
    return { charId: row.id, name: row.name, accountId: row.account_id, sess: null, p: null, remote: remote?.charId === row.id };
  }

  // Comandos de mestre de moderação e de administração. Devolve null se o comando não é deles.
  gm(p, msg, sess) {
    const cmd = msg.cmd;
    if (!MOD_CMDS.has(cmd)) return null;
    const by = { accountId: sess?.accountId ?? null, charId: p.char.id, ip: sess?.ip ?? null };
    const role = this.s.opts.dev ? 'admin' : sess?.role;
    if (ADMIN_CMDS.has(cmd) && role !== 'admin') return { ok: false, code: 'forbidden', reason: 'Renomear e retirar itens ou ouro são comandos só para administradores.' };
    if (cmd === 'rename_clan') return this.renameClan(msg, by);
    if (cmd === 'announce') {
      const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 200) : '';
      if (!text) return { ok: false, code: 'empty', reason: 'Anúncio vazio.' };
      this.announce(`Aviso da equipe: ${text}`);
      this.s.worldAnnounce?.(`Aviso da equipe: ${text}`); // várias zonas: as outras também avisam
      return { ok: true, cache: false };
    }
    const t = this.findTarget(msg.name);
    if (!t) return { ok: false, code: 'not_found', reason: `Personagem ${msg.name ?? ''} não encontrado.` };
    const reason = cleanText(msg.reason, 140);
    // ninguém modera quem tem papel igual ou maior (mestre não mexe em mestre nem em admin)
    if (cmd !== 'where' && t.accountId != null) {
      const tacc = this.st.findAccountById(t.accountId);
      if (tacc && (ROLE_LEVEL[tacc.role] ?? 0) >= (ROLE_LEVEL[role] ?? 0) && !this.s.opts.dev) return { ok: false, code: 'forbidden', reason: 'Você não pode moderar uma conta da equipe com papel igual ou maior que o seu.' };
      // suspensão longa ou sem data é coisa de admin: mestre não a retira
      if (cmd === 'unban' && role !== 'admin' && tacc?.banned_until && tacc.banned_until - Date.now() > MAX_GM_BAN_H * HOUR) return { ok: false, code: 'forbidden', reason: 'Só administradores retiram suspensões longas ou sem data.' };
    }
    switch (cmd) {
      case 'where':
        if (t.remote) return this.s.worldWhere(t.name);
        return t.p ? { ok: true, message: `${t.name}: ${t.p.zone.mapId}${t.p.zone.instanceId ? ' (instância)' : ''} em (${t.p.char.x.toFixed(1)}, ${t.p.char.z.toFixed(1)}), nível ${t.p.char.level}.`, cache: false }
          : { ok: true, message: `${t.name} não está on-line.`, cache: false };
      case 'kick': {
        if (!t.sess && !t.remote) return { ok: false, code: 'offline', reason: `${t.name} não está on-line.` };
        this.st.audit('mod_kick', { ...by, target: t.charId, reason });
        const text = `Você foi desconectado pela equipe.${reason ? ` Motivo: ${reason}.` : ''}`;
        if (t.sess) this.kickSession(t.sess, text);
        else this.s.modRemote({ accountId: t.accountId, kick: text }); // na zona onde ele está
        return { ok: true, message: `${t.name} desconectado.`, cache: false };
      }
      case 'ban': {
        const permanent = msg.hours === 'perm' || msg.permanent === true;
        const hours = Number(msg.hours);
        if (!permanent && !(hours > 0 && hours <= MAX_BAN_H)) return { ok: false, code: 'bad_request', reason: `Use: /gm suspender Nome horas motivo (1 a ${MAX_BAN_H} h) ou "perm".` };
        if ((permanent || hours > MAX_GM_BAN_H) && role !== 'admin') return { ok: false, code: 'forbidden', reason: `Mestres suspendem até ${MAX_GM_BAN_H} h; acima disso, só administradores.` };
        if (!reason) return { ok: false, code: 'bad_request', reason: 'Informe o motivo da suspensão.' };
        const until = permanent ? PERMANENT : Date.now() + Math.round(hours * 3600_000);
        // mestre não encurta uma suspensão maior que já existe (a de um admin, por exemplo): só admin
        if (role !== 'admin') {
          const cur = this.st.findAccountById(t.accountId)?.banned_until ?? 0;
          if (cur > until) return { ok: false, code: 'forbidden', reason: `A conta de ${t.name} já está suspensa ${untilText(cur)}; só administradores encurtam uma suspensão.` };
        }
        this.st.setBan(t.accountId, until, reason);
        this.st.audit('mod_ban', { ...by, targetAccount: t.accountId, target: t.charId, until, reason });
        // derruba todas as sessões da conta (nesta zona e, com várias zonas, nas outras)
        const s = this.s.byAccount.get(t.accountId);
        if (s) this.kickSession(s, `Conta suspensa ${untilText(until)}. Motivo: ${reason}.`);
        this.s.modRemote?.({ accountId: t.accountId, kick: `Conta suspensa ${untilText(until)}. Motivo: ${reason}.` });
        return { ok: true, message: `Conta de ${t.name} suspensa ${untilText(until)}.`, cache: false };
      }
      case 'unban':
        this.st.setBan(t.accountId, null, null);
        this.st.audit('mod_unban', { ...by, targetAccount: t.accountId, target: t.charId });
        return { ok: true, message: `Suspensão da conta de ${t.name} retirada.`, cache: false };
      case 'mute': {
        const minutes = Number(msg.minutes);
        if (!(minutes > 0 && minutes <= MAX_MUTE_MIN)) return { ok: false, code: 'bad_request', reason: `Use: /gm silenciar Nome minutos motivo (1 a ${MAX_MUTE_MIN}).` };
        const until = Date.now() + Math.round(minutes * 60_000);
        this.st.setMute(t.accountId, until);
        const text = `Você foi silenciado ${untilText(until)}.${reason ? ` Motivo: ${reason}.` : ''}`;
        // a conta pode estar on-line com outro personagem (nesta zona) ou em outra zona
        const ms = t.sess ?? this.s.byAccount.get(t.accountId);
        if (ms) { ms.mutedUntil = until; this.s.sendTo(ms, { t: 'system', text }); }
        this.s.modRemote?.({ accountId: t.accountId, mutedUntil: until, text });
        this.st.audit('mod_mute', { ...by, targetAccount: t.accountId, target: t.charId, until, reason });
        return { ok: true, message: `${t.name} silenciado ${untilText(until)}.`, cache: false };
      }
      case 'unmute':
        this.st.setMute(t.accountId, null);
        { const us = t.sess ?? this.s.byAccount.get(t.accountId); if (us) us.mutedUntil = 0; }
        this.s.modRemote?.({ accountId: t.accountId, mutedUntil: 0 });
        this.st.audit('mod_unmute', { ...by, targetAccount: t.accountId, target: t.charId });
        return { ok: true, message: `${t.name} pode falar de novo.`, cache: false };
      case 'rename': return this.renameChar(t, msg, by, reason);
      case 'take_item': return this.takeItem(t, msg, by, reason);
      case 'take_gold': return this.takeGold(t, msg, by, reason);
    }
    return null;
  }

  // ---------- administração (D146): só admin, personagem on-line (memória) ou fora do ar (banco) ----------
  // Personagem on-line em outra zona (várias zonas): a memória de lá é que vale, e ela gravaria por cima do
  // ouro e dos itens mexidos aqui no banco. Nome: o banco muda e ele é desconectado lá (o salvamento não
  // grava o nome); itens e ouro: recusado, com o caminho (/gm onde e o comando na zona dele).
  otherZone(t) {
    return { ok: false, code: 'other_zone', reason: `${t.name} está on-line em outra zona: veja onde com /gm onde ${t.name} e use o comando de lá, ou espere ele sair.`, cache: false };
  }

  // /gm renomear Nome NovoNome: as regras de nome da criação (formato, reservados, duplicata)
  renameChar(t, msg, by, reason) {
    const v = checkCharName(this.st, msg.newName, t.charId);
    if (v.err) return { ...v.err, cache: false };
    const old = t.name;
    if (v.name === old) return { ok: false, code: 'same', reason: 'O nome novo é igual ao atual.', cache: false };
    try { this.st.renameCharacter(t.charId, v.name); } catch { return { ok: false, code: 'name_taken', reason: 'Esse nome já está em uso.', cache: false }; }
    if (t.p) this.s.renameOnline(t.p, v.name);
    else if (t.remote) this.s.modRemote?.({ accountId: t.accountId, kick: `A equipe renomeou seu personagem para ${v.name}. Entre de novo.` });
    this.st.audit('mod_rename', { ...by, targetAccount: t.accountId, target: t.charId, from: old, to: v.name, reason, online: !!t.p, otherZone: !!t.remote });
    return { ok: true, message: `${old} agora se chama ${v.name}.`, cache: false };
  }

  // /gm renomear_cla SIGLA Novo Nome: as regras da fundação (formato, reservados, duplicata)
  renameClan(msg, by) {
    const tag = typeof msg.tag === 'string' ? msg.tag.trim().toUpperCase() : '';
    const cl = tag ? this.st.clanByTag(tag) : null;
    if (!cl) return { ok: false, code: 'not_found', reason: `Clã ${tag || '(sem sigla)'} não encontrado.`, cache: false };
    const v = checkClanName(this.st, msg.newName, cl.id);
    if (v.err) return { ...v.err, cache: false };
    if (v.name === cl.name) return { ok: false, code: 'same', reason: 'O nome novo é igual ao atual.', cache: false };
    try { this.st.renameClan(cl.id, v.name); } catch { return { ok: false, code: 'taken', reason: 'Já existe um clã com esse nome.', cache: false }; }
    this.s.clans.notifyClan(cl.id, { t: 'clan_event', text: `A equipe renomeou o clã para ${v.name}.` });
    this.st.audit('mod_rename_clan', { ...by, clan: cl.id, tag: cl.tag, from: cl.name, to: v.name, reason: cleanText(msg.reason, 140) });
    return { ok: true, message: `O clã [${cl.tag}] agora se chama ${v.name}.`, cache: false };
  }

  // /gm retirar Nome defId [qtd]: da bolsa, da caixa de recuperação, do equipamento e do que ele guardou no
  // depósito da conta, nessa ordem; sem quantidade, todas as unidades
  takeItem(t, msg, by, reason) {
    const def = typeof msg.defId === 'string' && Object.hasOwn(this.s.data.items, msg.defId) ? this.s.data.items[msg.defId] : null;
    if (!def) return { ok: false, code: 'bad_item', reason: `Item inexistente: ${cleanText(String(msg.defId ?? ''), 40)}.`, cache: false };
    const want = msg.qty == null ? Infinity : msg.qty;
    if (want !== Infinity && !(Number.isInteger(want) && want >= 1)) return { ok: false, code: 'bad_request', reason: 'Use: /gm retirar Nome item [quantidade].', cache: false };
    if (t.remote) return this.otherZone(t);
    const r = this.s.takeItemsOf(t.charId, def.id, want);
    if (!r.qty) return { ok: false, code: 'not_found', reason: `${t.name} não tem ${def.name}.`, cache: false };
    this.st.audit('mod_take_item', { ...by, targetAccount: t.accountId, target: t.charId, item: def.id, qty: r.qty, instances: r.instances, reason, online: !!t.p });
    return { ok: true, message: `Retirado de ${t.name}: ${def.name} ×${r.qty}.`, qty: r.qty, cache: false };
  }

  // /gm retirar_ouro Nome N: até o que ele tem
  takeGold(t, msg, by, reason) {
    const n = Number(msg.amount);
    if (!Number.isInteger(n) || n < 1 || n > TAKE_GOLD_MAX) return { ok: false, code: 'bad_request', reason: 'Use: /gm retirar_ouro Nome quantia (número inteiro).', cache: false };
    if (t.remote) return this.otherZone(t);
    const r = this.s.takeGoldOf(t.charId, n);
    if (!r.taken) return { ok: false, code: 'no_gold', reason: `${t.name} não tem ouro.`, cache: false };
    this.st.audit('mod_take_gold', { ...by, targetAccount: t.accountId, target: t.charId, amount: r.taken, goldAfter: r.gold, reason, online: !!t.p });
    return { ok: true, message: `Retirado de ${t.name}: ${r.taken} de ouro (ficou com ${r.gold}).`, cache: false };
  }

  // aviso da equipe para quem está no mundo nesta zona
  announce(text) {
    for (const s of this.s.sessions) if (s.charId != null) this.s.sendTo(s, { t: 'notice', kind: 'announce', text });
  }

  // várias zonas: expulsão, suspensão ou silêncio que outra zona mandou para a sessão desta conta aqui
  applyRemote({ accountId, kick, mutedUntil, text }) {
    const s = this.s.byAccount.get(accountId);
    if (!s) return;
    if (typeof mutedUntil === 'number') {
      s.mutedUntil = mutedUntil;
      if (text && s.charId != null) this.s.sendTo(s, { t: 'system', text });
    }
    if (typeof kick === 'string') this.kickSession(s, kick);
  }

  // /bug texto: relato de problema do teste público, com mapa, posição e versões (cliente, servidor e dados)
  bugReport(p, { text, client }) {
    const now = Date.now();
    const recent = (this.bugs.get(p.char.id) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= BUGS_PER_HOUR) return { ok: false, code: 'too_many', reason: 'Você já mandou muitos relatos nesta hora. Obrigado pela paciência!' };
    const t = cleanText(text, 500);
    if (t.length < 5) return { ok: false, code: 'bad_request', reason: 'Descreva o problema: /bug o que aconteceu.' };
    recent.push(now);
    this.bugs.set(p.char.id, recent);
    const sess = this.s.byChar.get(p.char.id);
    const c = p.char;
    this.st.audit('bug_report', { accountId: sess?.accountId ?? null, charId: c.id, ip: sess?.ip ?? null, text: t, map: p.zone.mapId, instance: p.zone.instanceId ?? null,
      x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, level: c.level, classId: c.classId, client: cleanText(client, 40) || null,
      server: this.s.serverVersion ?? null, data: this.s.dataVersion ?? null });
    this.s.metrics.bugReportsTotal++;
    this.notifyStaff(`Novo /bug de ${c.name} em ${p.zone.mapId}: ${short(t)} (npm run conta -- --bugs)`);
    return { ok: true, message: 'Obrigado! O problema foi registrado com o lugar e a hora em que você está.', cache: false };
  }

  // /denunciar Nome motivo: grava na auditoria com as últimas falas do denunciado
  report(p, { name, reason }) {
    const now = Date.now();
    const recent = (this.reports.get(p.char.id) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= REPORTS_PER_HOUR) return { ok: false, code: 'too_many', reason: 'Você já enviou muitas denúncias nesta hora.' };
    const t = this.findTarget(name);
    if (!t) return { ok: false, code: 'not_found', reason: `Personagem ${name ?? ''} não encontrado.` };
    if (t.charId === p.char.id) return { ok: false, code: 'self', reason: 'Você não pode denunciar a si mesmo.' };
    const why = cleanText(reason, 200);
    if (!why) return { ok: false, code: 'bad_request', reason: 'Diga o motivo: /denunciar Nome motivo.' };
    recent.push(now);
    this.reports.set(p.char.id, recent);
    const sess = this.s.byChar.get(p.char.id);
    // só a última hora (política de privacidade) e só o que o denunciante podia ver: as falas do mapa e as
    // que chegaram a ele; sussurros, grupo e clã de outras pessoas não vão para a denúncia
    const chat = (this.chatLog.get(t.charId) ?? []).filter((l) => now - l.at <= HOUR && Moderation.visibleTo(l, p.char.id))
      .map(({ at, channel, text }) => ({ at, channel, text }));
    this.st.audit('report', { accountId: sess?.accountId ?? null, charId: p.char.id, ip: sess?.ip ?? null, target: t.charId, targetName: t.name, targetAccount: t.accountId, reason: why, map: p.zone.mapId, chat });
    this.s.metrics.reportsTotal++;
    this.notifyStaff(`Nova denúncia de ${p.char.name} contra ${t.name}: ${short(why)} (npm run conta -- --denuncias)`);
    return { ok: true, message: 'Denúncia registrada. A equipe vai analisar. Obrigado.', cache: false };
  }
}
