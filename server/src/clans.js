// Clãs (pós-versão 1): criar (nível 10, 500 de ouro), convidar, entrar, sair, expulsar, promover,
// passar a liderança, desfazer, mensagem do dia e canal de chat do clã. A sigla aparece no nome.
const NAME_RE = /^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 '-]{2,23}$/;
const TAG_RE = /^[A-Z0-9]{2,4}$/;
const CREATE_LEVEL = 10;
const CREATE_GOLD = 500;
const MAX_MEMBERS = 50;
const INVITE_MS = 60000;
const RANK_ORDER = { leader: 3, officer: 2, member: 1 };

export class ClanManager {
  constructor(server) {
    this.s = server;
    this.invites = new Map(); // charId convidado -> { clanId, from, at }
  }

  get st() { return this.s.store; }

  // ao entrar no mundo: guarda o clã no personagem (sigla nos snapshots)
  attach(char) {
    const c = this.st.clanOfChar(char.id);
    char.clanId = c?.id ?? null;
    char.clanTag = c?.tag ?? null;
    char.clanRank = c?.rank ?? null;
  }

  refreshOnline(clanId) {
    const members = this.st.clanMembers(clanId);
    for (const m of members) {
      const p = this.s.playerOf(m.char_id);
      if (p) this.attach(p.char);
    }
    this.s.clanRemote({ clanId, attach: members.map((m) => m.char_id) }); // várias zonas: membros nas outras
  }

  // fromCharId: quem falou (chat do clã), para as outras zonas guardarem a fala como contexto de denúncia
  notifyClan(clanId, msg, exceptCharId = null, fromCharId = null) {
    for (const m of this.st.clanMembers(clanId)) {
      if (m.char_id === exceptCharId) continue;
      const s = this.s.byChar.get(m.char_id);
      if (s) this.s.sendTo(s, msg);
    }
    this.s.clanRemote({ clanId, msg, except: exceptCharId, from: fromCharId }); // várias zonas: membros nas outras
  }

  create(p, { name, tag }) {
    const c = p.char;
    if (c.clanId) return { ok: false, code: 'in_clan', reason: 'Saia do seu clã antes de criar outro.' };
    if (c.level < CREATE_LEVEL) return { ok: false, code: 'level', reason: `Nível ${CREATE_LEVEL} exigido para fundar um clã.` };
    if (c.gold < CREATE_GOLD) return { ok: false, code: 'no_gold', reason: `Fundar um clã custa ${CREATE_GOLD} de ouro.` };
    name = typeof name === 'string' ? name.trim() : '';
    tag = typeof tag === 'string' ? tag.trim().toUpperCase() : '';
    if (!NAME_RE.test(name)) return { ok: false, code: 'bad_name', reason: 'Nome do clã: 3 a 24 letras, números, espaços, hífen ou apóstrofo.' };
    if (!TAG_RE.test(tag)) return { ok: false, code: 'bad_tag', reason: 'Sigla: 2 a 4 letras ou números.' };
    if (this.st.clanByNameOrTag(name, tag)) return { ok: false, code: 'taken', reason: 'Já existe um clã com esse nome ou sigla.' };
    let id;
    this.st.tx(() => {
      id = this.st.createClan(name, tag, c.id);
      c.gold -= CREATE_GOLD;
      this.st.saveCharacter(c);
    });
    this.attach(c);
    this.s.audit('clan_create', { charId: c.id, clan: id, name, tag, gold: CREATE_GOLD });
    return { ok: true, clan: this.info(p), char: p.zone.charView(p) };
  }

  myRank(p) { return p.char.clanId ? this.st.clanOfChar(p.char.id)?.rank ?? null : null; }

  invite(p, { name }) {
    const rank = this.myRank(p);
    if (!rank || RANK_ORDER[rank] < 2) return { ok: false, code: 'forbidden', reason: 'Só líder e oficiais convidam.' };
    const tid = typeof name === 'string' ? this.s.byName.get(name.trim().toLowerCase()) : null;
    const t = tid != null ? this.s.playerOf(tid) : null;
    const remote = t ? null : this.s.remoteChar(name);
    if (remote) return this.inviteRemote(p, remote);
    if (!t) return { ok: false, code: 'offline', reason: 'Jogador não está on-line.' };
    if (t.char.clanId) return { ok: false, code: 'in_clan', reason: `${t.char.name} já tem clã.` };
    if (this.st.clanMembers(p.char.clanId).length >= MAX_MEMBERS) return { ok: false, code: 'full', reason: `O clã já tem ${MAX_MEMBERS} membros.` };
    const clan = this.st.clanById(p.char.clanId);
    this.invites.set(t.char.id, { clanId: clan.id, from: p.char.id, at: Date.now() });
    this.s.sendTo(this.s.byChar.get(t.char.id), { t: 'clan_invite', clan: { id: clan.id, name: clan.name, tag: clan.tag }, from: p.char.name });
    return { ok: true, message: `Convite enviado a ${t.char.name}.` };
  }

  // várias zonas: convidado em outra zona; o convite fica guardado na zona dele, onde ele aceita
  inviteRemote(p, t) {
    if (this.st.clanOfChar(t.charId)) return { ok: false, code: 'in_clan', reason: `${t.name} já tem clã.` };
    if (this.st.clanMembers(p.char.clanId).length >= MAX_MEMBERS) return { ok: false, code: 'full', reason: `O clã já tem ${MAX_MEMBERS} membros.` };
    const clan = this.st.clanById(p.char.clanId);
    this.s.worldSend(t.charId, { t: 'clan_invite', clan: { id: clan.id, name: clan.name, tag: clan.tag }, from: p.char.name }, { kind: 'clan_invite', clanId: clan.id, from: p.char.id });
    return { ok: true, message: `Convite enviado a ${t.name}.` };
  }

  accept(p, { clanId }) {
    const inv = this.invites.get(p.char.id);
    if (!inv || inv.clanId !== clanId || Date.now() - inv.at > INVITE_MS) return { ok: false, code: 'no_invite', reason: 'Convite vencido.' };
    this.invites.delete(p.char.id);
    if (p.char.clanId) return { ok: false, code: 'in_clan', reason: 'Você já tem clã.' };
    if (!this.st.clanById(clanId)) return { ok: false, code: 'gone', reason: 'O clã não existe mais.' };
    if (this.st.clanMembers(clanId).length >= MAX_MEMBERS) return { ok: false, code: 'full', reason: 'O clã está cheio.' };
    this.st.addClanMember(clanId, p.char.id);
    this.attach(p.char);
    this.notifyClan(clanId, { t: 'clan_event', text: `${p.char.name} entrou no clã.` }, p.char.id);
    this.s.audit('clan_join', { charId: p.char.id, clan: clanId });
    return { ok: true, clan: this.info(p) };
  }

  decline(p) { this.invites.delete(p.char.id); return { ok: true }; }

  leave(p) {
    const cl = this.st.clanOfChar(p.char.id);
    if (!cl) return { ok: false, code: 'no_clan', reason: 'Você não tem clã.' };
    const members = this.st.clanMembers(cl.id);
    if (cl.rank === 'leader' && members.length > 1) return { ok: false, code: 'leader', reason: 'Passe a liderança antes de sair (ou desfaça o clã).' };
    if (members.length <= 1) return this.disband(p);
    this.st.removeClanMember(p.char.id);
    this.attach(p.char);
    this.notifyClan(cl.id, { t: 'clan_event', text: `${p.char.name} saiu do clã.` });
    return { ok: true };
  }

  target(p, charId, need) {
    const cl = this.st.clanOfChar(p.char.id);
    if (!cl) return { err: { ok: false, code: 'no_clan', reason: 'Você não tem clã.' } };
    const m = this.st.clanMembers(cl.id).find((x) => x.char_id === charId);
    if (!m) return { err: { ok: false, code: 'not_member', reason: 'Essa pessoa não é do seu clã.' } };
    if (RANK_ORDER[cl.rank] < need || RANK_ORDER[cl.rank] <= RANK_ORDER[m.rank]) return { err: { ok: false, code: 'forbidden', reason: 'Seu cargo não permite isso.' } };
    return { cl, m };
  }

  kick(p, { charId }) {
    const { err, cl, m } = this.target(p, charId, 2);
    if (err) return err;
    this.st.removeClanMember(charId);
    const t = this.s.playerOf(charId);
    const gone = { t: 'clan_event', text: `Você foi removido do clã ${cl.name}.`, left: true };
    if (t) { this.attach(t.char); this.s.sendTo(this.s.byChar.get(charId), gone); }
    else this.s.clanRemote({ clanId: cl.id, attach: [charId], direct: [{ charId, msg: gone }] });
    this.notifyClan(cl.id, { t: 'clan_event', text: `${m.name} foi removido do clã.` });
    this.s.audit('clan_kick', { charId: p.char.id, clan: cl.id, target: charId });
    return { ok: true, clan: this.info(p) };
  }

  setRank(p, { charId, rank }) {
    if (!['officer', 'member'].includes(rank)) return { ok: false, code: 'bad_rank', reason: 'Cargo: oficial ou membro.' };
    const { err, cl, m } = this.target(p, charId, 3);
    if (err) return err;
    this.st.setClanRank(charId, rank);
    this.refreshOnline(cl.id);
    this.notifyClan(cl.id, { t: 'clan_event', text: `${m.name} agora é ${rank === 'officer' ? 'oficial' : 'membro'}.` });
    return { ok: true, clan: this.info(p) };
  }

  transfer(p, { charId }) {
    const { err, cl, m } = this.target(p, charId, 3);
    if (err) return err;
    this.st.tx(() => {
      this.st.setClanLeader(cl.id, charId);
      this.st.setClanRank(charId, 'leader');
      this.st.setClanRank(p.char.id, 'officer');
    });
    this.refreshOnline(cl.id);
    this.notifyClan(cl.id, { t: 'clan_event', text: `${m.name} é o novo líder do clã.` });
    this.s.audit('clan_transfer', { charId: p.char.id, clan: cl.id, target: charId });
    return { ok: true, clan: this.info(p) };
  }

  disband(p) {
    const cl = this.st.clanOfChar(p.char.id);
    if (!cl) return { ok: false, code: 'no_clan', reason: 'Você não tem clã.' };
    if (cl.rank !== 'leader') return { ok: false, code: 'forbidden', reason: 'Só o líder desfaz o clã.' };
    const members = this.st.clanMembers(cl.id);
    this.st.tx(() => this.st.deleteClan(cl.id));
    const remote = [];
    for (const m of members) {
      const t = this.s.playerOf(m.char_id);
      if (t) { this.attach(t.char); if (m.char_id !== p.char.id) this.s.sendTo(this.s.byChar.get(m.char_id), { t: 'clan_event', text: `O clã ${cl.name} foi desfeito.`, left: true }); }
      else remote.push(m.char_id);
    }
    if (remote.length) this.s.clanRemote({ clanId: cl.id, attach: remote, direct: remote.map((charId) => ({ charId, msg: { t: 'clan_event', text: `O clã ${cl.name} foi desfeito.`, left: true } })) });
    this.s.audit('clan_disband', { charId: p.char.id, clan: cl.id, name: cl.name });
    return { ok: true };
  }

  motd(p, { text }) {
    const cl = this.st.clanOfChar(p.char.id);
    if (!cl || RANK_ORDER[cl.rank] < 2) return { ok: false, code: 'forbidden', reason: 'Só líder e oficiais mudam a mensagem do dia.' };
    const t = typeof text === 'string' ? text.trim().slice(0, 140) : '';
    this.st.setClanMotd(cl.id, t);
    this.notifyClan(cl.id, { t: 'clan_event', text: `Mensagem do dia: ${t}` });
    return { ok: true, clan: this.info(p) };
  }

  info(p) {
    const cl = this.st.clanOfChar(p.char.id);
    if (!cl) return null;
    return {
      id: cl.id, name: cl.name, tag: cl.tag, motd: cl.motd, myRank: cl.rank,
      members: this.st.clanMembers(cl.id).map((m) => ({ charId: m.char_id, name: m.name, level: m.level, classId: m.class_id, rank: m.rank, online: this.s.isOnline(m.char_id) })),
    };
  }

  // canal de chat do clã: todos os membros on-line
  chat(p, text) {
    if (!p.char.clanId) return { ok: false, code: 'no_clan', reason: 'Você não tem clã.' };
    this.notifyClan(p.char.clanId, { t: 'chat', channel: 'clan', from: p.char.name, eid: p.eid, text, tag: p.char.clanTag }, null, p.char.id);
    return { ok: true };
  }
}
