// Moderação do teste público: suspensão (ban) e silêncio (mute) por conta, expulsão, anúncio,
// "onde está" e denúncias com o contexto do chat. Comandos de mestre (papel gm/admin) e a ferramenta
// tools/conta.mjs mexem no banco; o servidor confere o banco a cada minuto, então uma suspensão feita
// pela ferramenta derruba quem estiver on-line em até 60 s. Tudo vai para a auditoria.
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

  // gancho do chat: recusa se a conta está silenciada; senão guarda a fala para as denúncias
  chatBlocked(p, channel, text) {
    const muted = this.mutedReason(p);
    if (muted) return muted;
    const t = cleanText(text, 200);
    if (t) {
      const now = Date.now();
      const log = (this.chatLog.get(p.char.id) ?? []).filter((l) => now - l.at <= HOUR);
      log.push({ at: now, channel: CHANNELS.has(channel) ? channel : 'outro', text: t });
      if (log.length > CHAT_KEEP) log.shift();
      this.chatLog.set(p.char.id, log);
    }
    return null;
  }

  // silenciado? (vale para chat e para textos que o clã inteiro recebe, como a mensagem do dia)
  mutedReason(p) {
    const sess = this.s.byChar.get(p.char.id);
    if (sess?.mutedUntil > Date.now()) return { ok: false, code: 'muted', reason: `Você está silenciado ${untilText(sess.mutedUntil)}.` };
    return null;
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
    for (const s of [...this.s.sessions]) {
      if (s.accountId == null) continue;
      const acc = this.st.findAccountById(s.accountId);
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
        if (!permanent && !(hours > 0 && hours <= MAX_BAN_H)) return { ok: false, code: 'bad_request', reason: `Use: /gm suspender Nome horas motivo (1 a ${MAX_BAN_H} h) ou "perm".` };
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
        if (!(minutes > 0 && minutes <= MAX_MUTE_MIN)) return { ok: false, code: 'bad_request', reason: `Use: /gm silenciar Nome minutos motivo (1 a ${MAX_MUTE_MIN}).` };
        const until = Date.now() + Math.round(minutes * 60_000);
        this.st.setMute(t.accountId, until);
        // a conta pode estar on-line com outro personagem
        const ms = t.sess ?? this.s.byAccount.get(t.accountId);
        if (ms) { ms.mutedUntil = until; this.s.sendTo(ms, { t: 'system', text: `Você foi silenciado ${untilText(until)}.${reason ? ` Motivo: ${reason}.` : ''}` }); }
        this.st.audit('mod_mute', { ...by, targetAccount: t.accountId, target: t.charId, until, reason });
        return { ok: true, message: `${t.name} silenciado ${untilText(until)}.`, cache: false };
      }
      case 'unmute':
        this.st.setMute(t.accountId, null);
        { const us = t.sess ?? this.s.byAccount.get(t.accountId); if (us) us.mutedUntil = 0; }
        this.st.audit('mod_unmute', { ...by, targetAccount: t.accountId, target: t.charId });
        return { ok: true, message: `${t.name} pode falar de novo.`, cache: false };
    }
    return null;
  }

  // /bug texto: relato de problema do teste público, com mapa, posição e versões (cliente, servidor e dados)
  bugReport(p, { text, client }) {
    const now = Date.now();
    const recent = (this.bugs.get(p.char.id) ?? []).filter((t) => now - t < 3600_000);
    if (recent.length >= BUGS_PER_HOUR) return { ok: false, code: 'too_many', reason: 'Você já mandou muitos relatos nesta hora. Obrigado pela paciência!' };
    const t = typeof text === 'string' ? text.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500) : '';
    if (t.length < 5) return { ok: false, code: 'bad_request', reason: 'Descreva o problema: /bug o que aconteceu.' };
    recent.push(now);
    this.bugs.set(p.char.id, recent);
    const sess = this.s.byChar.get(p.char.id);
    const c = p.char;
    this.st.audit('bug_report', { accountId: sess?.accountId ?? null, charId: c.id, ip: sess?.ip ?? null, text: t, map: p.zone.mapId, instance: p.zone.instanceId ?? null,
      x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, level: c.level, classId: c.classId, client: typeof client === 'string' ? client.slice(0, 40) : null,
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
    const chat = (this.chatLog.get(t.charId) ?? []).filter((l) => now - l.at <= HOUR); // só a última hora (política de privacidade)
    this.st.audit('report', { accountId: sess?.accountId ?? null, charId: p.char.id, ip: sess?.ip ?? null, target: t.charId, targetName: t.name, targetAccount: t.accountId, reason: why, map: p.zone.mapId, chat });
    return { ok: true, message: 'Denúncia registrada. A equipe vai analisar. Obrigado.', cache: false };
  }
}
