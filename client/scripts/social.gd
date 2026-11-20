extends RefCounted
## Pós-versão 1 no cliente: convites (troca, clã, duelo), janela de troca, painel do clã, aviso de
## duelo e a barra de ações ao clicar em outro jogador. Vive dentro do HUD (hud.social).

const Theme_ = preload("res://scripts/ui_theme.gd")
const ItemText = preload("res://scripts/item_text.gd")
const RANK_NAME := {"leader": "líder", "officer": "oficial", "member": "membro"}

var hud
var main
# convite genérico
var ask_panel: PanelContainer
var ask_label: Label
var ask_yes := Callable()
var ask_no := Callable()
var ask_seq := 0
# troca
var trade_panel: PanelContainer
var trade_title: Label
var trade_mine: RichTextLabel
var trade_theirs: RichTextLabel
var trade_bag: GridContainer
var trade_gold: SpinBox
var trade_lock_btn: Button
var trade_confirm_btn: Button
var trade_hint: Label
var trade: Dictionary = {}
# clã
var clan_panel: PanelContainer
var clan_box: VBoxContainer
var clan: Dictionary = {}
# duelo
var duel_label: Label
var duel_state := ""
var duel_opponent := ""
var duel_until_ms := 0
var duel_last_text := ""
# ações sobre outro jogador
var actions_panel: PanelContainer
var actions_label: Label
var actions_name := ""


func build(h, root: Control) -> void:
	hud = h
	main = h.main
	_build_ask(root)
	_build_trade(root)
	_build_clan(root)
	_build_actions(root)
	duel_label = Label.new()
	duel_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	duel_label.position = Vector2(-200, 150)
	duel_label.custom_minimum_size = Vector2(400, 0)
	duel_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	duel_label.add_theme_color_override("font_color", Color("#ffb07a"))
	duel_label.add_theme_color_override("font_outline_color", Color.BLACK)
	duel_label.add_theme_constant_override("outline_size", 6)
	duel_label.add_theme_font_size_override("font_size", 20)
	duel_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	duel_label.visible = false
	root.add_child(duel_label)

func panels() -> Array:
	return [ask_panel, trade_panel, clan_panel, actions_panel]

## Painéis que o Esc fecha (a troca aberta é cancelada no servidor).
func close_top() -> bool:
	if ask_panel.visible:
		_answer(false)
		return true
	if trade_panel.visible:
		Net.request("trade_cancel")
		trade_panel.visible = false
		return true
	for p in [clan_panel, actions_panel]:
		if p.visible:
			p.visible = false
			return true
	return false

func tick(_dt: float) -> void:
	if duel_state == "countdown":
		var left := maxi(0, duel_until_ms - Time.get_ticks_msec())
		duel_label.text = "Duelo contra %s em %d…" % [duel_opponent_name(), int(ceil(left / 1000.0))]

func duel_opponent_name() -> String:
	var w = main.world
	if w and w.entities.has(duel_opponent):
		return str(w.entities[duel_opponent]["data"].get("n", "?"))
	return "?"

func in_duel_with(eid: String) -> bool:
	return duel_state == "active" and eid == duel_opponent

## Entrou no mundo (inclusive ao reconectar): troca, duelo e convites da conexão anterior acabaram no
## servidor, mas o aviso foi para o soquete morto. Começa limpo.
func reset() -> void:
	ask_seq += 1
	ask_panel.visible = false
	ask_yes = Callable()
	ask_no = Callable()
	trade = {}
	trade_panel.visible = false
	actions_panel.visible = false
	duel_state = ""
	duel_opponent = ""
	duel_label.visible = false

## Nome de personagem no começo de um comando: "Nome resto", ou entre aspas para nomes com espaço
## (criados antes da regra sem espaços): "\"Ana Maria\" resto". Devolve [nome, resto].
static func split_name(rest: String) -> Array:
	rest = rest.strip_edges()
	if rest.begins_with("\""):
		var close := rest.find("\"", 1)
		if close > 1:
			return [rest.substr(1, close - 1).strip_edges(), rest.substr(close + 1).strip_edges()]
	var sp := rest.find(" ")
	if sp < 0:
		return [rest, ""]
	return [rest.substr(0, sp), rest.substr(sp + 1).strip_edges()]

## Comando que só leva um nome (/troca, /duelo, /convidar): o resto inteiro, sem as aspas.
static func name_arg(rest: String) -> String:
	rest = rest.strip_edges()
	if rest.begins_with("\"") and rest.ends_with("\"") and rest.length() > 2:
		return rest.substr(1, rest.length() - 2).strip_edges()
	return rest

## Nome pronto para um comando de chat: entre aspas se tiver espaço.
static func quote_name(n: String) -> String:
	return "\"%s\"" % n if n.contains(" ") else n

# ---------------- mensagens do servidor ----------------
func on_message(m: Dictionary) -> bool:
	match str(m.get("t", "")):
		"trade_invite":
			var fid := int(m["fromId"])
			_ask("%s quer negociar com você." % m["from"],
				func(): Net.request("trade_accept", {"from": fid}, _err),
				func(): Net.request("trade_decline"))
		"trade":
			_on_trade(m["trade"])
		"trade_done":
			if m.has("char"):
				main.set_char(m["char"])
			trade_panel.visible = false
			trade = {}
			hud.system("Troca concluída.")
		"trade_closed":
			trade_panel.visible = false
			trade = {}
			hud.system(str(m.get("reason", "Troca cancelada.")))
		"clan_invite":
			var cid := int(m["clan"]["id"])
			_ask("%s convidou você para o clã [%s] %s." % [m["from"], m["clan"]["tag"], m["clan"]["name"]],
				func(): Net.request("clan_accept", {"clanId": cid}, func(r):
					if r["ok"]:
						clan = r.get("clan", {})
						hud.system("Você entrou no clã [%s]." % clan.get("tag", ""))
						_render_clan()
					else:
						hud.error(r["reason"])),
				func(): Net.request("clan_decline"))
		"clan_event":
			hud.chat_line("[color=#e3a548][lb]Clã] %s[/color]" % hud.esc(m["text"]))
			if m.get("left", false):
				clan = {}
				_render_clan()
			elif clan_panel.visible:
				refresh_clan()
		"duel_invite":
			var fid2 := int(m["fromId"])
			_ask("%s desafiou você para um duelo. Ninguém morre: quem chegaria a 0 fica com 1 de vida e perde." % m["from"],
				func(): Net.request("duel_accept", {"from": fid2}, _err),
				func(): Net.request("duel_decline"))
		"duel":
			_on_duel(m)
		"duel_start":
			var me: String = main.ch.get("eid", "")
			if m["a"] != me and m["b"] != me:
				hud.chat_line("[color=#ffb07a]Duelo: %s × %s[/color]" % [m["names"][0], m["names"][1]])
		"duel_end":
			# quem duelou já viu o resultado pela mensagem "duel"
			if str(m.get("text", "")) != duel_last_text:
				hud.chat_line("[color=#ffb07a]%s[/color]" % hud.esc(m["text"]))
		_:
			return false
	return true

func _err(r) -> void:
	if not r["ok"]:
		hud.error(r["reason"])

# ---------------- convite genérico ----------------
func _build_ask(root: Control) -> void:
	ask_panel = hud._panel_at(root, Control.PRESET_CENTER_TOP, Vector2(-190, 200), Vector2(380, 0))
	var v := VBoxContainer.new()
	ask_panel.add_child(v)
	ask_label = Label.new()
	ask_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	ask_label.custom_minimum_size = Vector2(350, 0)
	v.add_child(ask_label)
	var row := HBoxContainer.new()
	v.add_child(row)
	var yes := Button.new()
	yes.text = "Aceitar"
	yes.pressed.connect(func(): _answer(true))
	row.add_child(yes)
	var no := Button.new()
	no.text = "Recusar"
	no.pressed.connect(func(): _answer(false))
	row.add_child(no)
	ask_panel.visible = false

func _ask(text: String, yes: Callable, no: Callable) -> void:
	ask_seq += 1
	var my_seq := ask_seq
	ask_label.text = text
	ask_yes = yes
	ask_no = no
	ask_panel.visible = true
	# o convite vence no servidor em 30 s
	# (o temporizador é da árvore: se o HUD já saiu, por troca de personagem, não mexe em nada)
	hud.get_tree().create_timer(30.0).timeout.connect(func():
		if ask_seq == my_seq and is_instance_valid(ask_panel) and ask_panel.visible:
			ask_panel.visible = false)

func _answer(yes: bool) -> void:
	ask_panel.visible = false
	var cb: Callable = ask_yes if yes else ask_no
	ask_yes = Callable()
	ask_no = Callable()
	if cb.is_valid():
		cb.call()

# ---------------- troca ----------------
func _build_trade(root: Control) -> void:
	trade_panel = hud._panel_at(root, Control.PRESET_CENTER, Vector2(-300, -230), Vector2(600, 0))
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 8)
	trade_panel.add_child(v)
	trade_title = Label.new()
	trade_title.add_theme_color_override("font_color", Theme_.AMBER)
	trade_title.add_theme_font_size_override("font_size", 16)
	v.add_child(trade_title)
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 12)
	v.add_child(cols)
	trade_mine = _offer_box(cols)
	trade_theirs = _offer_box(cols)
	var bag_title := Label.new()
	bag_title.text = "Sua bolsa (clique para pôr ou tirar da oferta):"
	bag_title.add_theme_color_override("font_color", Theme_.MUTED)
	v.add_child(bag_title)
	var sc := ScrollContainer.new()
	sc.custom_minimum_size = Vector2(570, 120)
	v.add_child(sc)
	trade_bag = GridContainer.new()
	trade_bag.columns = 2
	sc.add_child(trade_bag)
	var grow := HBoxContainer.new()
	v.add_child(grow)
	var gl := Label.new()
	gl.text = "Ouro oferecido:"
	grow.add_child(gl)
	trade_gold = SpinBox.new()
	trade_gold.min_value = 0
	trade_gold.step = 1
	trade_gold.custom_minimum_size = Vector2(120, 0)
	grow.add_child(trade_gold)
	var gset := Button.new()
	gset.text = "Atualizar ouro"
	gset.pressed.connect(func(): _send_offer(_my_items()))
	grow.add_child(gset)
	trade_hint = Label.new()
	trade_hint.autowrap_mode = TextServer.AUTOWRAP_WORD
	trade_hint.custom_minimum_size = Vector2(570, 0)
	trade_hint.add_theme_color_override("font_color", Theme_.MUTED)
	v.add_child(trade_hint)
	var row := HBoxContainer.new()
	v.add_child(row)
	trade_lock_btn = Button.new()
	trade_lock_btn.text = "Travar oferta"
	trade_lock_btn.pressed.connect(func(): Net.request("trade_lock", {}, _err))
	row.add_child(trade_lock_btn)
	trade_confirm_btn = Button.new()
	trade_confirm_btn.text = "Confirmar troca"
	trade_confirm_btn.pressed.connect(func(): Net.request("trade_confirm", {}, _err))
	row.add_child(trade_confirm_btn)
	var cancel := Button.new()
	cancel.text = "Cancelar"
	cancel.pressed.connect(func():
		Net.request("trade_cancel")
		trade_panel.visible = false)
	row.add_child(cancel)
	trade_panel.visible = false

func _offer_box(parent: Container) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.fit_content = true
	r.scroll_active = false
	r.custom_minimum_size = Vector2(280, 110)
	r.add_theme_font_size_override("normal_font_size", 13)
	parent.add_child(r)
	return r

func _my_items() -> Array:
	var out := []
	for it in trade.get("me", {}).get("items", []):
		out.append(it["id"])
	return out

func _send_offer(items: Array) -> void:
	Net.request("trade_offer", {"items": items, "gold": int(trade_gold.value)}, _err)

func _side_text(side: Dictionary, who: String) -> String:
	var s := "[b]%s[/b]" % who
	if side.get("locked", false):
		s += "  [color=#6fd06a]travada[/color]"
	if side.get("confirmed", false):
		s += "  [color=#6fd06a]✓ confirmou[/color]"
	s += "\n"
	var any := false
	for it in side.get("items", []):
		if it.get("gone", false):
			continue
		s += "• %s\n" % ItemText.item_name(main.defs, it)
		any = true
	if not any:
		s += "[color=#9a927f](nenhum item)[/color]\n"
	s += "Ouro: %d" % int(side.get("gold", 0))
	return s

func _on_trade(t: Dictionary) -> void:
	var before: Dictionary = trade.get("them", {})
	var changed: bool = not trade.is_empty() and (int(before.get("gold", 0)) != int(t["them"].get("gold", 0)) or before.get("items", []).size() != t["them"].get("items", []).size())
	trade = t
	trade_panel.visible = true
	trade_title.text = "Troca com %s" % t.get("other", "?")
	trade_mine.text = _side_text(t["me"], "Sua oferta")
	trade_theirs.text = _side_text(t["them"], "Oferta de %s" % t.get("other", "?"))
	trade_gold.max_value = float(main.ch.get("gold", 0))
	if not trade_gold.get_line_edit().has_focus():
		trade_gold.value = float(t["me"].get("gold", 0))
	var mine := _my_items()
	for c in trade_bag.get_children():
		c.queue_free()
	for it in main.ch.get("items", []):
		if it["loc"] != "bag":
			continue
		var b := Button.new()
		var on: bool = it["id"] in mine
		b.text = ("✓ " if on else "") + ItemText.item_name(main.defs, it)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.custom_minimum_size = Vector2(280, 0)
		b.clip_text = true
		var iid: String = it["id"]
		b.pressed.connect(func():
			var items := _my_items()
			if iid in items:
				items.erase(iid)
			else:
				items.append(iid)
			_send_offer(items))
		trade_bag.add_child(b)
	var both_locked: bool = t["me"].get("locked", false) and t["them"].get("locked", false)
	trade_lock_btn.disabled = t["me"].get("locked", false)
	trade_confirm_btn.disabled = not both_locked or t["me"].get("confirmed", false)
	if changed:
		hud._flash("A oferta de %s mudou — confira antes de travar." % t.get("other", "?"), Color("#ffcf7a"))
	if t["me"].get("confirmed", false):
		trade_hint.text = "Você confirmou. Esperando %s confirmar." % t.get("other", "?")
	elif both_locked:
		trade_hint.text = "As duas ofertas estão travadas. Confira e confirme."
	else:
		trade_hint.text = "Monte a oferta e trave. Qualquer mudança destrava os dois lados."

# ---------------- clã ----------------
func _build_clan(root: Control) -> void:
	clan_panel = hud._panel_at(root, Control.PRESET_CENTER, Vector2(-250, -240), Vector2(500, 0))
	var sc := ScrollContainer.new()
	sc.custom_minimum_size = Vector2(480, 440)
	clan_panel.add_child(sc)
	clan_box = VBoxContainer.new()
	clan_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(clan_box)
	clan_panel.visible = false

func toggle_clan() -> void:
	clan_panel.visible = not clan_panel.visible
	if clan_panel.visible:
		refresh_clan()

func refresh_clan() -> void:
	Net.request("clan_info", {}, func(r):
		if r["ok"]:
			clan = r["clan"] if r["clan"] != null else {}
			_render_clan())

func _clan_res(r) -> void:
	if r["ok"]:
		if r.has("clan"):
			clan = r["clan"] if r["clan"] != null else {}
		elif clan_panel.visible:
			refresh_clan()
			return
		if r.has("message"):
			hud.system(r["message"])
		_render_clan()
	else:
		hud.error(r["reason"])

func _render_clan() -> void:
	if clan_box == null:
		return
	hud._clear(clan_box)
	if clan.is_empty():
		hud._title(clan_box, "Clã", 16)
		hud._text(clan_box, "Você não tem clã. Fundar um custa 500 de ouro e exige nível 10. A sigla (2 a 4 letras) aparece antes do seu nome.", Theme_.MUTED)
		var name_e := LineEdit.new()
		name_e.placeholder_text = "Nome do clã"
		name_e.max_length = 24
		clan_box.add_child(name_e)
		var tag_e := LineEdit.new()
		tag_e.placeholder_text = "Sigla (ex.: SAL)"
		tag_e.max_length = 4
		clan_box.add_child(tag_e)
		var b := Button.new()
		b.text = "Fundar clã"
		b.pressed.connect(func(): Net.request("clan_create", {"name": name_e.text, "tag": tag_e.text}, _clan_res))
		clan_box.add_child(b)
		return
	var my_rank: String = clan.get("myRank", "member")
	hud._title(clan_box, "[%s] %s" % [clan["tag"], clan["name"]], 16)
	if str(clan.get("motd", "")) != "":
		hud._text(clan_box, "Mensagem do dia: %s" % clan["motd"], Theme_.NACRE)
	hud._text(clan_box, "Seu cargo: %s · %d membros" % [RANK_NAME.get(my_rank, my_rank), clan["members"].size()], Theme_.MUTED)
	var order := {"leader": 0, "officer": 1, "member": 2}
	var members: Array = clan["members"].duplicate()
	members.sort_custom(func(a, b): return [order.get(a["rank"], 3), not a["online"], a["name"]] < [order.get(b["rank"], 3), not b["online"], b["name"]])
	var my_id := int(main.ch.get("id", -1))
	for m in members:
		var row := HBoxContainer.new()
		clan_box.add_child(row)
		var l := Label.new()
		l.text = "%s %s · nv %d · %s" % ["●" if m["online"] else "○", m["name"], int(m["level"]), RANK_NAME.get(m["rank"], m["rank"])]
		l.add_theme_color_override("font_color", Theme_.GREEN if m["online"] else Theme_.MUTED)
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(l)
		var cid := int(m["charId"])
		if cid == my_id:
			continue
		if my_rank == "leader":
			var promo := Button.new()
			promo.text = "Rebaixar" if m["rank"] == "officer" else "Promover"
			var to: String = "member" if m["rank"] == "officer" else "officer"
			promo.pressed.connect(func(): Net.request("clan_rank", {"charId": cid, "rank": to}, _clan_res))
			row.add_child(promo)
			var lead := Button.new()
			lead.text = "Liderança"
			lead.tooltip_text = "Passar a liderança para %s" % m["name"]
			lead.pressed.connect(func(): Net.request("clan_transfer", {"charId": cid}, _clan_res))
			row.add_child(lead)
		if (my_rank == "leader" and m["rank"] != "leader") or (my_rank == "officer" and m["rank"] == "member"):
			var kick := Button.new()
			kick.text = "Expulsar"
			kick.pressed.connect(func(): Net.request("clan_kick", {"charId": cid}, _clan_res))
			row.add_child(kick)
	if my_rank in ["leader", "officer"]:
		var inv := HBoxContainer.new()
		clan_box.add_child(inv)
		var ie := LineEdit.new()
		ie.placeholder_text = "Nome do jogador"
		ie.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		inv.add_child(ie)
		var ib := Button.new()
		ib.text = "Convidar"
		ib.pressed.connect(func(): Net.request("clan_invite", {"name": ie.text}, _clan_res))
		inv.add_child(ib)
		var mo := HBoxContainer.new()
		clan_box.add_child(mo)
		var me := LineEdit.new()
		me.placeholder_text = "Mensagem do dia"
		me.max_length = 140
		me.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		mo.add_child(me)
		var mb := Button.new()
		mb.text = "Mudar"
		mb.pressed.connect(func(): Net.request("clan_motd", {"text": me.text}, _clan_res))
		mo.add_child(mb)
	hud._text(clan_box, "Chat do clã: /c mensagem", Theme_.MUTED)
	var bottom := HBoxContainer.new()
	clan_box.add_child(bottom)
	var leave := Button.new()
	leave.text = "Sair do clã"
	leave.pressed.connect(func(): Net.request("clan_leave", {}, func(r):
		if r["ok"]:
			clan = {}
			_render_clan()
		else:
			hud.error(r["reason"])))
	bottom.add_child(leave)
	if my_rank == "leader":
		var dis := Button.new()
		dis.text = "Desfazer o clã"
		dis.pressed.connect(func(): Net.request("clan_disband", {}, func(r):
			if r["ok"]:
				clan = {}
				hud.system("O clã foi desfeito.")
				_render_clan()
			else:
				hud.error(r["reason"])))
		bottom.add_child(dis)

# ---------------- duelo ----------------
func _on_duel(m: Dictionary) -> void:
	match str(m.get("state", "")):
		"countdown":
			duel_state = "countdown"
			duel_opponent = str(m.get("opponentEid", ""))
			duel_until_ms = Time.get_ticks_msec() + int(m.get("inMs", 3000))
			duel_label.visible = true
		"active":
			duel_state = "active"
			duel_label.text = "DUELO contra %s — clique nele para atacar" % duel_opponent_name()
			duel_label.visible = true
			hud._flash("Valendo!", Color("#ffb07a"))
		"ended":
			duel_state = ""
			duel_label.visible = false
			duel_last_text = str(m.get("text", ""))
			var col: Color = Theme_.GREEN if m.get("won", false) else (Theme_.TEXT if m.get("draw", false) else Theme_.RED)
			hud._flash(str(m.get("text", "Duelo encerrado.")), col)
			hud.chat_line("[color=#ffb07a]%s[/color]" % hud.esc(m.get("text", "")))
			var w = main.world
			if w and w.selected == duel_opponent:
				w.selected = ""
				hud.refresh_target()
			duel_opponent = ""

# ---------------- ações sobre outro jogador ----------------
func _build_actions(root: Control) -> void:
	actions_panel = hud._panel_at(root, Control.PRESET_CENTER_TOP, Vector2(-230, 60), Vector2(460, 0))
	var v := VBoxContainer.new()
	actions_panel.add_child(v)
	actions_label = Label.new()
	actions_label.add_theme_color_override("font_color", Theme_.AMBER)
	v.add_child(actions_label)
	var row := HBoxContainer.new()
	v.add_child(row)
	for spec in [["Levantar (5 s)", "revive"], ["Trocar", "trade"], ["Duelar", "duel"], ["Grupo", "party"], ["Clã", "clan"], ["Sussurrar", "whisper"], ["×", "close"]]:
		var b := Button.new()
		b.text = spec[0]
		var what: String = spec[1]
		b.pressed.connect(func(): _act(what))
		row.add_child(b)
		if what == "revive":
			revive_btn = b
	actions_panel.visible = false

var revive_btn: Button

## Ações sobre outro jogador; caído, a primeira é levantá-lo (qualquer um, fora de combate).
func show_player_actions(player_name: String, dead := false) -> void:
	actions_name = player_name
	actions_label.text = player_name + (" (caído)" if dead else "")
	if revive_btn:
		revive_btn.visible = dead
	actions_panel.visible = true

func _act(what: String) -> void:
	var n := actions_name
	actions_panel.visible = false
	match what:
		"revive":
			Net.request("revive_ally", {"name": n}, func(r):
				if r["ok"] and r.has("channel"):
					hud.show_channel(str(r["channel"]["text"]), float(r["channel"]["ms"]))
				elif not r["ok"]:
					hud.error(r["reason"]))
		"trade":
			Net.request("trade_request", {"name": n}, _msg_or_err)
		"duel":
			Net.request("duel_request", {"name": n}, _msg_or_err)
		"party":
			Net.request("party_invite", {"name": n}, func(r):
				if r["ok"]:
					hud.system("Convite de grupo enviado a %s." % n)
				else:
					hud.error(r["reason"]))
		"clan":
			Net.request("clan_invite", {"name": n}, _msg_or_err)
		"whisper":
			hud.chat_input.text = "/s %s " % quote_name(n)
			hud.chat_input.grab_focus()
			hud.chat_input.caret_column = hud.chat_input.text.length()

func _msg_or_err(r) -> void:
	if r["ok"]:
		if r.has("message"):
			hud.system(r["message"])
	else:
		hud.error(r["reason"])

# ---------------- comandos de chat ----------------
## /troca Nome · /duelo Nome · /c texto · /cla · /cla criar Nome SIGLA · /cla convidar Nome · /cla sair
## /denunciar Nome motivo · equipe: /gm expulsar|suspender|silenciar|liberar|desbloquear|onde|anunciar
func chat_command(t: String) -> bool:
	if t.begins_with("/bug ") or t == "/bug":
		var text := t.substr(5).strip_edges() if t.length() > 5 else ""
		if text.length() < 5:
			hud.error("Use: /bug o que aconteceu (vai junto o lugar e a hora)")
		else:
			Net.request("bug_report", {"text": text, "client": str(ProjectSettings.get_setting("application/config/version", "dev"))}, _msg_or_err)
	elif t.begins_with("/denunciar "):
		var nr := split_name(t.substr(11))
		if nr[0] == "" or nr[1] == "":
			hud.error("Use: /denunciar Nome motivo (nome com espaço entre aspas)")
		else:
			Net.request("report", {"name": nr[0], "reason": nr[1]}, _msg_or_err)
	elif t.begins_with("/gm "):
		_gm_command(t.substr(4).strip_edges())
	elif t.begins_with("/troca "):
		Net.request("trade_request", {"name": name_arg(t.substr(7))}, _msg_or_err)
	elif t.begins_with("/duelo "):
		Net.request("duel_request", {"name": name_arg(t.substr(7))}, _msg_or_err)
	elif t.begins_with("/c "):
		Net.request("chat", {"channel": "clan", "text": t.substr(3)}, _err)
	elif t == "/cla" or t == "/clã":
		toggle_clan()
	elif t.begins_with("/cla ") or t.begins_with("/clã "):
		var rest := t.substr(t.find(" ") + 1).strip_edges()
		if rest.begins_with("criar "):
			var args := rest.substr(6).strip_edges()
			var sp := args.rfind(" ")
			if sp <= 0:
				hud.error("Use: /cla criar Nome do Clã SIGLA")
			else:
				Net.request("clan_create", {"name": args.substr(0, sp), "tag": args.substr(sp + 1)}, _clan_res)
		elif rest.begins_with("convidar "):
			Net.request("clan_invite", {"name": name_arg(rest.substr(9))}, _msg_or_err)
		elif rest == "sair":
			Net.request("clan_leave", {}, _clan_res)
		else:
			hud.error("Comandos: /cla, /cla criar Nome SIGLA, /cla convidar Nome, /cla sair, /c mensagem")
	else:
		return false
	return true

## Moderação (só contas da equipe): /gm expulsar Nome motivo · /gm suspender Nome horas|perm motivo ·
## /gm desbloquear Nome · /gm silenciar Nome minutos motivo · /gm liberar Nome · /gm onde Nome · /gm anunciar texto
## Nome com espaço (de antes da regra) vai entre aspas: /gm expulsar "Ana Maria" flood.
func _gm_command(rest: String) -> void:
	rest = rest.strip_edges()
	if rest == "":
		return
	var sp := rest.find(" ")
	var cmd := rest if sp < 0 else rest.substr(0, sp)
	var after := "" if sp < 0 else rest.substr(sp + 1).strip_edges()
	var nr := split_name(after)
	var name: String = nr[0]
	var args := split_name(nr[1])  # [primeira palavra, resto]: horas/minutos e motivo
	match cmd:
		"expulsar":
			Net.request("gm", {"cmd": "kick", "name": name, "reason": nr[1]}, _msg_or_err)
		"suspender":
			var h: String = args[0]
			var hours: Variant = h.to_float()
			if h == "perm":
				hours = "perm"
			Net.request("gm", {"cmd": "ban", "name": name, "hours": hours, "reason": args[1]}, _msg_or_err)
		"desbloquear":
			Net.request("gm", {"cmd": "unban", "name": name}, _msg_or_err)
		"silenciar":
			Net.request("gm", {"cmd": "mute", "name": name, "minutes": str(args[0]).to_float(), "reason": args[1]}, _msg_or_err)
		"liberar":
			Net.request("gm", {"cmd": "unmute", "name": name}, _msg_or_err)
		"onde":
			Net.request("gm", {"cmd": "where", "name": name}, _msg_or_err)
		"anunciar":
			Net.request("gm", {"cmd": "announce", "text": after}, _msg_or_err)
		_:
			hud.error("Comandos da equipe: expulsar, suspender, desbloquear, silenciar, liberar, onde, anunciar")
