// Moderação do teste público: suspensão (ban) e silêncio (mute) por conta, expulsão, anúncio,
// "onde está" e denúncias com o contexto do chat. Comandos de mestre (papel gm/admin) e a ferramenta
// tools/conta.mjs mexem no banco; o servidor confere o banco a cada minuto, então uma suspensão feita
// pela ferramenta derruba quem estiver on-line em até 60 s. Tudo vai para a auditoria.
// Várias zonas: o alvo pode estar em outra zona; expulsão, suspensão e silêncio seguem pela conta
// através do serviço de mundo (server.modRemote), "onde está" pergunta ao mundo e o anúncio vai a todas.
export const PERMANENT = 253402300799000; // 31/12/9999: suspensão sem data para acabar
const CHAT_KEEP = 20;          // últimas falas por personagem guardadas para dar contexto às denúncias
const REPORTS_PER_HOUR = 5;
const BUGS_PER_HOUR = 10;
const MAX_GM_BAN_H = 72;       // mestre suspende até 72 h; acima disso (ou permanente), só admin
const MAX_BAN_H = 24 * 365 * 5;     // prazo máximo com data: 5 anos (acima disso, "perm")
const MAX_MUTE_MIN = 60 * 24 * 30;  // silêncio: até 30 dias
const CHANNELS = new Set(['zone', 'party', 'whisper', 'clan']);
const HOUR = 3600_000;
const ROLE_LEVEL = { player: 0, gm: 1, admin: 2 };
// texto vindo do jogador, sem caracteres de controle (não mexe no terminal de quem lê a auditoria)
export const cleanText = (t, max) => (typeof t === 'string' ? t.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, max) : '');

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
      if (ban) this.kickSession(s, ban);
    }
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
    const row = this.st.characterByName?.(name.trim());
    if (!row) return null;
    const remote = this.s.remoteChar?.(name);
    return { charId: row.id, name: row.name, accountId: row.account_id, sess: null, p: null, remote: remote?.charId === row.id };
  }

  // Comandos de mestre de moderação. Devolve null se o comando não é de moderação.
  gm(p, msg, sess) {
    const cmd = msg.cmd;
    if (!['kick', 'ban', 'unban', 'mute', 'unmute', 'where', 'announce'].includes(cmd)) return null;
    const by = { accountId: sess?.accountId ?? null, charId: p.char.id, ip: sess?.ip ?? null };
    const role = this.s.opts.dev ? 'admin' : sess?.role;
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
    }
    return null;
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
    // client: a versão inteira do cliente (a tag da release, até 64 caracteres como a do servidor; D150)
    this.st.audit('bug_report', { accountId: sess?.accountId ?? null, charId: c.id, ip: sess?.ip ?? null, text: t, map: p.zone.mapId, instance: p.zone.instanceId ?? null,
      x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, level: c.level, classId: c.classId, client: cleanText(client, 64) || null,
      server: this.s.serverVersion ?? null, data: this.s.dataVersion ?? null });
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
    return { ok: true, message: 'Denúncia registrada. A equipe vai analisar. Obrigado.', cache: false };
  }
}
