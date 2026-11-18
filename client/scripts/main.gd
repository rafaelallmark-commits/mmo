extends Node
## Fluxo do cliente: login -> seleção/criação de personagem -> mundo.
## Guarda o estado recebido do servidor (definições e ficha do personagem).
## Argumentos (após "--"): --server=ws://host:7777 --account=x --password=y --autotest --class=breaker --name=Nome

const WorldScript = preload("res://scripts/world.gd")
const HudScript = preload("res://scripts/hud.gd")
const Theme_ = preload("res://scripts/ui_theme.gd")

var defs := {}
var ch := {}
var account := ""
var password := ""
var char_id := -1
var server_url := "ws://127.0.0.1:7777"
var args := {}
var in_world := false
var reconnecting := false
var map_id := "estrada_velha"
var journal := {}
var party = null

var ui: CanvasLayer
var screen: Control
var status_label: Label
var world: Node3D
var hud: CanvasLayer
var autotest = null

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var s: String = a.trim_prefix("--")
		var kv := s.split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else "true"
	server_url = args.get("server", server_url)
	account = args.get("account", "")
	password = args.get("password", "")
	Net.connected.connect(_on_connected)
	Net.disconnected.connect(_on_disconnected)
	Net.message.connect(_on_message)
	ui = CanvasLayer.new()
	ui.layer = 10
	add_child(ui)
	if args.has("autotest"):
		autotest = preload("res://scripts/autotest.gd").new()
		add_child(autotest)
		autotest.start(self)
	else:
		show_login()

# ---------------- telas ----------------
func _clear_screen() -> void:
	if screen:
		screen.queue_free()
		screen = null

func _panel(title: String) -> VBoxContainer:
	_clear_screen()
	var bg := ColorRect.new()
	bg.color = Color("#14110f")
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen = bg
	ui.add_child(bg)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.add_child(center)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Theme_.panel_style())
	center.add_child(panel)
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(440, 0)
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)
	var t := Label.new()
	t.text = "CINZAS DO MERIDIANO"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 30)
	t.add_theme_color_override("font_color", Theme_.AMBER)
	box.add_child(t)
	var sub := Label.new()
	sub.text = title
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_color_override("font_color", Theme_.MUTED)
	box.add_child(sub)
	return box

func _field(box: VBoxContainer, label: String, value: String, secret := false) -> LineEdit:
	var l := Label.new()
	l.text = label
	box.add_child(l)
	var e := LineEdit.new()
	e.text = value
	e.secret = secret
	box.add_child(e)
	return e

func _status(box: VBoxContainer) -> void:
	status_label = Label.new()
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	status_label.add_theme_color_override("font_color", Theme_.MUTED)
	box.add_child(status_label)

func set_status(text: String, bad := false) -> void:
	if status_label:
		status_label.text = text
		status_label.add_theme_color_override("font_color", Theme_.RED if bad else Theme_.MUTED)

func show_login() -> void:
	var box := _panel("Entrar")
	var e_url := _field(box, "Servidor", server_url)
	var e_acc := _field(box, "Conta", account)
	var e_pass := _field(box, "Senha", password, true)
	var row := HBoxContainer.new()
	box.add_child(row)
	var b_login := Button.new()
	b_login.text = "Entrar"
	b_login.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(b_login)
	var b_reg := Button.new()
	b_reg.text = "Criar conta"
	b_reg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(b_reg)
	_status(box)
	b_login.pressed.connect(func():
		server_url = e_url.text.strip_edges(); account = e_acc.text.strip_edges(); password = e_pass.text
		connect_and_login(false))
	b_reg.pressed.connect(func():
		server_url = e_url.text.strip_edges(); account = e_acc.text.strip_edges(); password = e_pass.text
		connect_and_login(true))

var _pending_register := false

func connect_and_login(register: bool) -> void:
	_pending_register = register
	set_status("Conectando a %s..." % server_url)
	if Net.is_open():
		_after_connect()
	else:
		Net.connect_to(server_url)

func _on_connected() -> void:
	if autotest != null and not reconnecting:
		return
	_after_connect()

func _after_connect() -> void:
	if _pending_register:
		_pending_register = false
		Net.request("register", {"account": account, "password": password}, func(r):
			if not r["ok"] and r.get("code", "") != "account_exists":
				set_status(r["reason"], true)
				return
			_login())
	else:
		_login()

func _login() -> void:
	Net.request("login", {"account": account, "password": password}, func(r):
		if not r["ok"]:
			set_status(r["reason"], true)
			return
		if reconnecting and char_id >= 0:
			enter_world(char_id)
		else:
			show_char_select(r["chars"], r["classes"]))

func show_char_select(chars: Array, classes: Array) -> void:
	var box := _panel("Personagens da conta %s" % account)
	if chars.is_empty():
		var l := Label.new()
		l.text = "Nenhum personagem ainda."
		box.add_child(l)
	for c in chars:
		var b := Button.new()
		b.text = "%s — %s, nível %d" % [c["name"], defs.get("classes", {}).get(c["classId"], {}).get("name", c["classId"]), int(c["level"])]
		var cid := int(c["id"])
		b.pressed.connect(func(): enter_world(cid))
		box.add_child(b)
	box.add_child(HSeparator.new())
	var l2 := Label.new()
	l2.text = "Novo voluntário das caravanas"
	l2.add_theme_color_override("font_color", Theme_.AMBER)
	box.add_child(l2)
	var e_name := _field(box, "Nome", args.get("name", ""))
	var opt := OptionButton.new()
	for c in classes:
		opt.add_item("%s (%s)" % [c["name"], defs.get("origins", {}).get(c["origin"], {}).get("name", c["origin"])])
	box.add_child(opt)
	var role := Label.new()
	role.autowrap_mode = TextServer.AUTOWRAP_WORD
	role.add_theme_color_override("font_color", Theme_.MUTED)
	box.add_child(role)
	var upd := func(i: int):
		if i >= 0 and i < classes.size():
			role.text = classes[i]["role"]
	opt.item_selected.connect(upd)
	upd.call(0)
	var b_new := Button.new()
	b_new.text = "Criar personagem"
	box.add_child(b_new)
	_status(box)
	b_new.pressed.connect(func():
		var cls: String = classes[opt.selected]["id"]
		Net.request("create_char", {"name": e_name.text.strip_edges(), "classId": cls}, func(r):
			if not r["ok"]:
				set_status(r["reason"], true)
				return
			Net.request("list_chars", {}, func(r2): show_char_select(r2["chars"], r2["classes"]))))

func enter_world(cid: int) -> void:
	char_id = cid
	Net.request("enter", {"charId": cid}, func(r):
		if not r["ok"]:
			set_status(r["reason"], true)
			return
		reconnecting = false
		_clear_screen()
		map_id = r["char"].get("mapId", "estrada_velha")
		_rebuild_world()
		if hud == null:
			hud = HudScript.new()
			hud.main = self
			add_child(hud)
		set_char(r["char"])
		world.apply_snapshot(r["snapshot"])
		for l in r["loot"]:
			world.add_loot(l)
		journal = r.get("journal", {})
		hud.refresh_quests()
		hud.hide_disconnect()
		if r.get("restoredFromDeath", false):
			hud.system("Você voltou ao Posto da Ponte depois de cair.")
		hud.system("Local: %s." % map_def().get("name", "?"))
		in_world = true)

func map_def() -> Dictionary:
	return defs.get("maps", {}).get(map_id, defs.get("map", {}))

func _rebuild_world() -> void:
	if world != null:
		world.queue_free()
	world = WorldScript.new()
	world.main = self
	add_child(world)

## Troca de zona (portal, prova de classe): reconstrói o mundo com o novo mapa.
func _on_zone(m: Dictionary) -> void:
	map_id = m["mapId"]
	_rebuild_world()
	set_char(m["char"])
	world.apply_snapshot(m["snapshot"])
	for l in m.get("loot", []):
		world.add_loot(l)
	hud.system("Local: %s." % map_def().get("name", map_id))

func set_char(c: Dictionary) -> void:
	ch = c
	if hud:
		hud.refresh_char()
		if c.get("dead", false):
			hud.show_death()

# ---------------- mensagens ----------------
func _on_message(m: Dictionary) -> void:
	var t: String = m.get("t", "")
	match t:
		"defs":
			defs = m
		"res":
			if m.has("char") and in_world:
				set_char(m["char"])
			if m.has("journal") and in_world:
				journal = m["journal"]
				if hud:
					hud.refresh_quests()
			if not m.get("ok", true) and in_world and hud and m.get("req", "") != "pickup":
				hud.error(m.get("reason", "Recusado."))
		"snap":
			if world:
				world.apply_snapshot(m)
		"hit":
			if world:
				world.on_hit(m)
		"death":
			if world:
				world.on_death(m["eid"])
		"loot":
			if world:
				world.add_loot(m["loot"])
		"xp":
			if hud:
				hud.system("+%d XP" % int(m["gained"]))
		"char":
			set_char(m["char"])
		"level_up":
			if hud and m["eid"] == ch.get("eid", ""):
				hud.system("Nível %d! Você ganhou pontos de atributo e de habilidade (C)." % int(m["level"]))
		"chat":
			if hud:
				var ch_name: String = m.get("channel", "zone")
				if ch_name == "party":
					hud.chat_line("[color=#9fd3d1][Grupo] [b]%s:[/b] %s[/color]" % [m["from"], m["text"]])
				elif ch_name == "whisper":
					hud.chat_line("[color=#d7a8ff][%s → %s] %s[/color]" % [m["from"], m.get("to", ""), m["text"]])
				else:
					hud.chat_line("[b]%s:[/b] %s" % [m["from"], m["text"]])
		"zone":
			_on_zone(m)
		"quest_update":
			Net.request("quests", {}, func(r):
				journal = r["journal"]
				if hud:
					hud.refresh_quests())
			for q in m["quests"]:
				if hud:
					var done := 0
					for o in q["objectives"]:
						if o["done"]:
							done += 1
					hud.system("%s: %d/%d objetivos%s" % [q["title"], done, q["objectives"].size(), " — pronto para entregar" if q["ready"] else ""])
		"party":
			party = m["party"]
			if hud:
				hud.refresh_party()
		"party_invite":
			if hud:
				hud.show_invite(m["from"], int(m["fromId"]))
		"trial":
			if hud:
				match m["state"]:
					"started":
						hud.system("Prova de classe: onda 1 de %d. Tempo: %d s." % [int(m["waves"]), int(m["ms"]) / 1000])
					"wave":
						hud.system("Onda %d de %d!" % [int(m["wave"]), int(m["waves"])])
					_:
						hud.system(m.get("message", ""))
				if m.has("char"):
					set_char(m["char"])
		"heal":
			if world:
				world.on_heal(m)
		"system":
			if hud:
				hud.system(m["text"])
		"joined":
			if hud:
				hud.chat_line("[color=#9a927f]%s entrou.[/color]" % m["name"])
		"player_dead":
			if hud and m["eid"] == ch.get("eid", ""):
				ch["dead"] = true
				hud.show_death()
		"respawn":
			if hud and m["eid"] == ch.get("eid", ""):
				hud.hide_death()
		"ground":
			if world:
				world.ground_effect(m)
		"kicked":
			if hud:
				hud.show_disconnect(m.get("reason", "Desconectado."))
			in_world = false

func _on_disconnected(reason: String) -> void:
	if in_world and hud:
		hud.show_disconnect(reason)
	elif status_label:
		set_status("Sem conexão: %s" % reason, true)
	in_world = false

func reconnect() -> void:
	reconnecting = true
	if hud:
		hud.set_disconnect_text("Reconectando...")
	Net.close()
	Net.connect_to(server_url)

# ---------------- ações de jogo (sempre pedidos ao servidor) ----------------
func my_item(defId: String, loc := "bag") -> Dictionary:
	for it in ch.get("items", []):
		if it["defId"] == defId and it["loc"] == loc:
			return it
	return {}

func equipped_in(slot: String) -> Dictionary:
	for it in ch.get("items", []):
		if it["loc"] == "equip" and it.get("slot", "") == slot:
			return it
	return {}

func class_skills() -> Array:
	return defs.get("classes", {}).get(ch.get("classId", ""), {}).get("skills", [])
