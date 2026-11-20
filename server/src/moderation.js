// Moderação do teste público: suspensão (ban) e silêncio (mute) por conta, expulsão, anúncio,
// "onde está" e denúncias com o contexto do chat. Comandos de mestre (papel gm/admin) e a ferramenta
// tools/conta.mjs mexem no banco; o servidor confere o banco a cada minuto, então uma suspensão feita
// pela ferramenta derruba quem estiver on-line em até 60 s. Tudo vai para a auditoria.
export const PERMANENT = 253402300799000; // 31/12/9999: suspensão sem data para acabar
const CHAT_KEEP = 20;          // últimas falas por personagem guardadas para dar contexto às denúncias
const REPORTS_PER_HOUR = 5;
const MAX_GM_BAN_H = 72;       // mestre suspende até 72 h; acima disso (ou permanente), só admin

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
    this.lastSweep = 0;
  }

  get st() { return this.s.store; }

  // no login: guarda o silêncio na sessão (o chat não consulta o banco a cada fala)
  onLogin(s, acc) { s.mutedUntil = acc.muted_until ?? 0; }

  // gancho do chat: recusa se a conta está silenciada; senão guarda a fala para as denúncias
  chatBlocked(p, channel, text) {
    const sess = this.s.byChar.get(p.char.id);
    if (sess?.mutedUntil > Date.now()) return { ok: false, code: 'muted', reason: `Você está silenciado ${untilText(sess.mutedUntil)}.` };
    if (typeof text === 'string') {
      const log = this.chatLog.get(p.char.id) ?? [];
      log.push({ at: Date.now(), channel, text: text.slice(0, 200) });
      if (log.length > CHAT_KEEP) log.shift();
      this.chatLog.set(p.char.id, log);
    }
    return null;
  }

  forget(charId) { this.chatLog.delete(charId); }

  // a cada minuto: aplica suspensões e silêncios feitos fora do servidor (ferramenta, outro processo)
  sweep(now = Date.now()) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    // falas com mais de 1 h saem do contexto de denúncia
    for (const [charId, log] of this.chatLog) if (now - log[log.length - 1].at > 3600_000) this.chatLog.delete(charId);
    for (const s of [...this.s.sessions]) {
      if (s.accountId == null) continue;
      const acc = this.st.findAccountById(s.accountId);
      if (!acc) continue;
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

  // alvo por nome de personagem: on-line (sessão) ou só a conta (fora do jogo)
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
    return row ? { charId: row.id, name: row.name, accountId: row.account_id, sess: null, p: null } : null;
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
      for (const s of this.s.sessions) if (s.charId != null) this.s.sendTo(s, { t: 'notice', kind: 'announce', text: `Aviso da equipe: ${text}` });
      return { ok: true, cache: false };
    }
    const t = this.findTarget(msg.name);
    if (!t) return { ok: false, code: 'not_found', reason: `Personagem ${msg.name ?? ''} não encontrado.` };
    const reason = typeof msg.reason === 'string' ? msg.reason.trim().slice(0, 140) : '';
    switch (cmd) {
      case 'where':
        return t.p ? { ok: true, message: `${t.name}: ${t.p.zone.mapId}${t.p.zone.instanceId ? ' (instância)' : ''} em (${t.p.char.x.toFixed(1)}, ${t.p.char.z.toFixed(1)}), nível ${t.p.char.level}.`, cache: false }
          : { ok: true, message: `${t.name} não está on-line.`, cache: false };
      case 'kick':
        if (!t.sess) return { ok: false, code: 'offline', reason: `${t.name} não está on-line.` };
        this.st.audit('mod_kick', { ...by, target: t.charId, reason });
        this.kickSession(t.sess, `Você foi desconectado pela equipe.${reason ? ` Motivo: ${reason}.` : ''}`);
        return { ok: true, message: `${t.name} desconectado.`, cache: false };
      case 'ban': {
        const permanent = msg.hours === 'perm' || msg.permanent === true;
        const hours = Number(msg.hours);
        if (!permanent && !(hours > 0)) return { ok: false, code: 'bad_request', reason: 'Use: /gm ban Nome horas motivo (ou "perm").' };
        if ((permanent || hours > MAX_GM_BAN_H) && role !== 'admin') return { ok: false, code: 'forbidden', reason: `Mestres suspendem até ${MAX_GM_BAN_H} h; acima disso, só administradores.` };
        if (!reason) return { ok: false, code: 'bad_request', reason: 'Informe o motivo da suspensão.' };
        const until = permanent ? PERMANENT : Date.now() + hours * 3600_000;
        this.st.setBan(t.accountId, until, reason);
        this.st.audit('mod_ban', { ...by, targetAccount: t.accountId, target: t.charId, until, reason });
        // derruba todas as sessões da conta
        const s = this.s.byAccount.get(t.accountId);
        if (s) this.kickSession(s, `Conta suspensa ${untilText(until)}. Motivo: ${reason}.`);
        return { ok: true, message: `Conta de ${t.name} suspensa ${untilText(until)}.`, cache: false };
      }
      case 'unban':
        this.st.setBan(t.accountId, null, null);
        this.st.audit('mod_unban', { ...by, targetAccount: t.accountId, target: t.charId });
        return { ok: true, message: `Suspensão da conta de ${t.name} retirada.`, cache: false };
      case 'mute': {
        const minutes = Number(msg.minutes);
        if (!(minutes > 0)) return { ok: false, code: 'bad_request', reason: 'Use: /gm mute Nome minutos motivo.' };
        const until = Date.now() + minutes * 60_000;
        this.st.setMute(t.accountId, until);
        if (t.sess) { t.sess.mutedUntil = until; this.s.sendTo(t.sess, { t: 'system', text: `Você foi silenciado ${untilText(until)}.${reason ? ` Motivo: ${reason}.` : ''}` }); }
        this.st.audit('mod_mute', { ...by, targetAccount: t.accountId, target: t.charId, until, reason });
        return { ok: true, message: `${t.name} silenciado ${untilText(until)}.`, cache: false };
      }
      case 'unmute':
        this.st.setMute(t.accountId, null);
        if (t.sess) t.sess.mutedUntil = 0;
        this.st.audit('mod_unmute', { ...by, targetAccount: t.accountId, target: t.charId });
        return { ok: true, message: `${t.name} pode falar de novo.`, cache: false };
    }
    return null;
  }

  // /denunciar Nome motivo: grava na auditoria com as últimas falas do denunciado
  report(p, { name, reason }) {
    const now = Date.now();
    const recent = (this.reports.get(p.char.id) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= REPORTS_PER_HOUR) return { ok: false, code: 'too_many', reason: 'Você já enviou muitas denúncias nesta hora.' };
    const t = this.findTarget(name);
    if (!t) return { ok: false, code: 'not_found', reason: `Personagem ${name ?? ''} não encontrado.` };
    if (t.charId === p.char.id) return { ok: false, code: 'self', reason: 'Você não pode denunciar a si mesmo.' };
    const why = typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
    if (!why) return { ok: false, code: 'bad_request', reason: 'Diga o motivo: /denunciar Nome motivo.' };
    recent.push(now);
    this.reports.set(p.char.id, recent);
    const sess = this.s.byChar.get(p.char.id);
    this.st.audit('report', { accountId: sess?.accountId ?? null, charId: p.char.id, ip: sess?.ip ?? null, target: t.charId, targetName: t.name, targetAccount: t.accountId, reason: why, map: p.zone.mapId, chat: this.chatLog.get(t.charId) ?? [] });
    return { ok: true, message: 'Denúncia registrada. A equipe vai analisar. Obrigado.', cache: false };
  }
}
