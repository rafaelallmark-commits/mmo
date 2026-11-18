extends CanvasLayer
## Interface em jogo: vida/mana/XP, alvo, barra de atalhos, mensagens, chat, inventário com
## comparação e requisitos em vermelho, ficha com pontos, morte e aviso de desconexão.

const Theme_ = preload("res://scripts/ui_theme.gd")
const ItemText = preload("res://scripts/item_text.gd")

var main
var name_label: Label
var hp_bar: ProgressBar
var mp_bar: ProgressBar
var xp_bar: ProgressBar
var hp_text: Label
var mp_text: Label
var xp_text: Label
var target_box: PanelContainer
var target_label: Label
var target_bar: ProgressBar
var hotbar: HBoxContainer
var hot_buttons := []
var msg_box: VBoxContainer
var chat_log: RichTextLabel
var chat_input: LineEdit
var inv_panel: PanelContainer
var inv_equip: VBoxContainer
var inv_bag: GridContainer
var inv_tip: RichTextLabel
var inv_title: Label
var sheet_panel: PanelContainer
var sheet_box: VBoxContainer
var death_overlay: Control
var disc_overlay: Control
var disc_label: Label
var pending_alloc := {}
var cd_until := {}

func _ready() -> void:
	layer = 5
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	_build_status(root)
	_build_target(root)
	_build_hotbar(root)
	_build_messages(root)
	_build_chat(root)
	_build_inventory(root)
	_build_sheet(root)
	_build_overlays(root)
	refresh_char()

func _bar(parent: Control, color: Color, w := 260.0) -> ProgressBar:
	var b := ProgressBar.new()
	b.custom_minimum_size = Vector2(w, 16)
	b.show_percentage = false
	b.add_theme_stylebox_override("fill", Theme_.bar_style(color))
	b.add_theme_stylebox_override("background", Theme_.bar_bg())
	parent.add_child(b)
	return b

func _overlay_label(bar: ProgressBar) -> Label:
	var l := Label.new()
	l.set_anchors_preset(Control.PRESET_FULL_RECT)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", 11)
	bar.add_child(l)
	return l

func _build_status(root: Control) -> void:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", Theme_.panel_style(0.85))
	p.position = Vector2(12, 12)
	root.add_child(p)
	var v := VBoxContainer.new()
	p.add_child(v)
	name_label = Label.new()
	name_label.add_theme_color_override("font_color", Theme_.AMBER)
	v.add_child(name_label)
	hp_bar = _bar(v, Theme_.HP)
	hp_text = _overlay_label(hp_bar)
	mp_bar = _bar(v, Theme_.MP)
	mp_text = _overlay_label(mp_bar)
	var hint := Label.new()
	hint.text = "I inventário · C ficha · 1-4 atalhos · Q/E ou botão direito gira · roda zoom"
	hint.add_theme_font_size_override("font_size", 10)
	hint.add_theme_color_override("font_color", Theme_.MUTED)
	v.add_child(hint)
	# XP no rodapé
	xp_bar = ProgressBar.new()
	xp_bar.show_percentage = false
	xp_bar.add_theme_stylebox_override("fill", Theme_.bar_style(Theme_.XP))
	xp_bar.add_theme_stylebox_override("background", Theme_.bar_bg())
	xp_bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	xp_bar.offset_top = -10
	root.add_child(xp_bar)
	xp_text = _overlay_label(xp_bar)

func _build_target(root: Control) -> void:
	target_box = PanelContainer.new()
	target_box.add_theme_stylebox_override("panel", Theme_.panel_style(0.85))
	target_box.set_anchors_preset(Control.PRESET_CENTER_TOP)
	target_box.position = Vector2(-150, 12)
	target_box.custom_minimum_size = Vector2(300, 0)
	root.add_child(target_box)
	var v := VBoxContainer.new()
	target_box.add_child(v)
	target_label = Label.new()
	target_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(target_label)
	target_bar = _bar(v, Theme_.HP, 276)
	target_box.visible = false

func _build_hotbar(root: Control) -> void:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", Theme_.panel_style(0.85))
	p.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	p.position = Vector2(-250, -84)
	root.add_child(p)
	hotbar = HBoxContainer.new()
	p.add_child(hotbar)
	for i in 4:
		var b := Button.new()
		b.custom_minimum_size = Vector2(118, 46)
		b.focus_mode = Control.FOCUS_NONE
		b.autowrap_mode = TextServer.AUTOWRAP_WORD
		b.add_theme_font_size_override("font_size", 11)
		var idx := i
		b.pressed.connect(func(): _hotkey(idx))
		hotbar.add_child(b)
		hot_buttons.append(b)

func _build_messages(root: Control) -> void:
	msg_box = VBoxContainer.new()
	msg_box.set_anchors_preset(Control.PRESET_CENTER_TOP)
	msg_box.position = Vector2(-300, 90)
	msg_box.custom_minimum_size = Vector2(600, 0)
	msg_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(msg_box)

func _build_chat(root: Control) -> void:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", Theme_.panel_style(0.6))
	p.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	p.position = Vector2(12, -230)
	p.custom_minimum_size = Vector2(380, 200)
	root.add_child(p)
	var v := VBoxContainer.new()
	p.add_child(v)
	chat_log = RichTextLabel.new()
	chat_log.bbcode_enabled = true
	chat_log.scroll_following = true
	chat_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	chat_log.add_theme_font_size_override("normal_font_size", 12)
	v.add_child(chat_log)
	chat_input = LineEdit.new()
	chat_input.placeholder_text = "Enter para conversar"
	v.add_child(chat_input)
	chat_input.text_submitted.connect(func(t: String):
		if t.strip_edges() != "":
			Net.request("chat", {"text": t})
		chat_input.text = ""
		chat_input.release_focus())

func _build_inventory(root: Control) -> void:
	inv_panel = PanelContainer.new()
	inv_panel.add_theme_stylebox_override("panel", Theme_.panel_style())
	inv_panel.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	inv_panel.position = Vector2(-790, -260)
	inv_panel.custom_minimum_size = Vector2(770, 520)
	root.add_child(inv_panel)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 12)
	inv_panel.add_child(h)
	var left := VBoxContainer.new()
	left.custom_minimum_size = Vector2(230, 0)
	h.add_child(left)
	var t1 := Label.new()
	t1.text = "Equipamento (clique para guardar)"
	t1.add_theme_color_override("font_color", Theme_.AMBER)
	left.add_child(t1)
	inv_equip = VBoxContainer.new()
	left.add_child(inv_equip)
	var mid := VBoxContainer.new()
	mid.custom_minimum_size = Vector2(225, 0)
	h.add_child(mid)
	inv_title = Label.new()
	inv_title.add_theme_color_override("font_color", Theme_.AMBER)
	mid.add_child(inv_title)
	var sc := ScrollContainer.new()
	sc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	mid.add_child(sc)
	inv_bag = GridContainer.new()
	inv_bag.columns = 1
	inv_bag.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(inv_bag)
	inv_tip = RichTextLabel.new()
	inv_tip.bbcode_enabled = true
	inv_tip.custom_minimum_size = Vector2(250, 0)
	inv_tip.fit_content = true
	inv_tip.add_theme_font_size_override("normal_font_size", 12)
	inv_tip.text = "Passe o mouse sobre um item."
	h.add_child(inv_tip)
	inv_panel.visible = false

func _build_sheet(root: Control) -> void:
	sheet_panel = PanelContainer.new()
	sheet_panel.add_theme_stylebox_override("panel", Theme_.panel_style())
	sheet_panel.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	sheet_panel.position = Vector2(20, -270)
	sheet_panel.custom_minimum_size = Vector2(420, 540)
	root.add_child(sheet_panel)
	var sc := ScrollContainer.new()
	sheet_panel.add_child(sc)
	sheet_box = VBoxContainer.new()
	sheet_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(sheet_box)
	sheet_panel.visible = false

func _build_overlays(root: Control) -> void:
	death_overlay = _overlay(root, "Você caiu.", "Voltar ao Posto da Ponte", func(): Net.request("respawn"))
	var d := _overlay(root, "Conexão perdida.", "Reconectar", func(): main.reconnect())
	disc_overlay = d
	disc_label = d.get_meta("label")

func _overlay(root: Control, text: String, button: String, cb: Callable) -> Control:
	var o := ColorRect.new()
	o.color = Color(0, 0, 0, 0.6)
	o.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(o)
	var c := CenterContainer.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	o.add_child(c)
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", Theme_.panel_style())
	c.add_child(p)
	var v := VBoxContainer.new()
	p.add_child(v)
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD
	l.custom_minimum_size = Vector2(320, 0)
	v.add_child(l)
	var b := Button.new()
	b.text = button
	b.pressed.connect(cb)
	v.add_child(b)
	o.set_meta("label", l)
	o.visible = false
	return o

# ---------------- atualização ----------------
func refresh_char() -> void:
	if name_label == null or main == null or main.ch.is_empty():
		return
	var c: Dictionary = main.ch
	var cls: Dictionary = main.defs["classes"].get(c["classId"], {})
	name_label.text = "%s — %s, nível %d   ·   %d ouro" % [c["name"], cls.get("name", ""), int(c["level"]), int(c["gold"])]
	hp_bar.max_value = float(c["stats"]["maxHp"])
	hp_bar.value = float(c["hp"])
	hp_text.text = "Vida %d / %d" % [int(c["hp"]), int(c["stats"]["maxHp"])]
	mp_bar.max_value = float(c["stats"]["maxMp"])
	mp_bar.value = float(c["mp"])
	mp_text.text = "Mana %d / %d" % [int(c["mp"]), int(c["stats"]["maxMp"])]
	if c.get("xpNext", null) != null:
		var start := float(c["xpLevelStart"])
		xp_bar.max_value = float(c["xpNext"]) - start
		xp_bar.value = float(c["xp"]) - start
		xp_text.text = "XP %d / %d" % [int(c["xp"]), int(c["xpNext"])]
	else:
		xp_bar.value = xp_bar.max_value
		xp_text.text = "Nível máximo desta versão"
	_refresh_hotbar()
	if inv_panel.visible:
		var tip := inv_tip.text
		_refresh_inventory()
		inv_tip.text = tip
	if sheet_panel.visible:
		_refresh_sheet()

func _hot_actions() -> Array:
	var skills: Array = main.class_skills()
	return [
		{"kind": "skill", "id": skills[0] if skills.size() > 0 else ""},
		{"kind": "skill", "id": skills[1] if skills.size() > 1 else ""},
		{"kind": "potion", "id": "potion_hp_s"},
		{"kind": "potion", "id": "potion_mp_s"},
	]

func _refresh_hotbar() -> void:
	var acts := _hot_actions()
	for i in 4:
		var a: Dictionary = acts[i]
		var b: Button = hot_buttons[i]
		if a["kind"] == "skill":
			var s: Dictionary = main.defs["skills"].get(a["id"], {})
			var rank := int(main.ch.get("skills", {}).get(a["id"], 0))
			b.text = "%d · %s\n%s" % [i + 1, s.get("name", "—"), ("grau %d · %d mana" % [rank, int(s.get("mp", 0))]) if rank > 0 else ("nível %d" % int(s.get("unlockLevel", 1)))]
			b.disabled = rank == 0
		else:
			var count := 0
			for it in main.ch.get("items", []):
				if it["defId"] == a["id"] and it["loc"] == "bag":
					count += int(it["qty"])
			b.text = "%d · %s\nx%d" % [i + 1, main.defs["items"].get(a["id"], {}).get("name", a["id"]), count]
			b.disabled = count == 0

func _hotkey(i: int) -> void:
	var a: Dictionary = _hot_actions()[i]
	if a["kind"] == "skill":
		if a["id"] != "":
			main.world.use_skill(a["id"])
	else:
		var it: Dictionary = main.my_item(a["id"])
		if not it.is_empty():
			Net.request("use_item", {"instance": it["id"]})

func refresh_target() -> void:
	var w = main.world
	if w == null or w.selected == "" or not w.entities.has(w.selected):
		target_box.visible = false
		return
	var d: Dictionary = w.entities[w.selected]["data"]
	target_box.visible = true
	var md: Dictionary = main.defs["monsters"].get(d.get("def", ""), {})
	var rank := ""
	if md.get("rank", "normal") != "normal":
		rank = " (%s)" % md["rank"]
	target_label.text = "%s · nível %d%s" % [md.get("name", d.get("n", "?")), int(d["lvl"]), rank]
	target_bar.max_value = float(d["mhp"])
	target_bar.value = float(d["hp"])

func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	if chat_input.has_focus():
		return
	var k := (event as InputEventKey).keycode
	match k:
		KEY_I:
			inv_panel.visible = not inv_panel.visible
			if inv_panel.visible:
				_refresh_inventory()
		KEY_C:
			sheet_panel.visible = not sheet_panel.visible
			if sheet_panel.visible:
				pending_alloc = {}
				_refresh_sheet()
		KEY_ESCAPE:
			inv_panel.visible = false
			sheet_panel.visible = false
		KEY_ENTER, KEY_KP_ENTER:
			chat_input.grab_focus()
		KEY_1, KEY_2, KEY_3, KEY_4:
			_hotkey(k - KEY_1)
		_:
			return
	get_viewport().set_input_as_handled()

# ---------------- mensagens ----------------
func _flash(text: String, color: Color) -> void:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_WORD
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color.BLACK)
	l.add_theme_constant_override("outline_size", 6)
	l.add_theme_font_size_override("font_size", 18)
	msg_box.add_child(l)
	if msg_box.get_child_count() > 4:
		msg_box.get_child(0).queue_free()
	var tw := create_tween()
	tw.tween_interval(3.0)
	tw.tween_property(l, "modulate:a", 0.0, 0.8)
	tw.tween_callback(l.queue_free)

func system(text: String) -> void:
	_flash(text, Theme_.TEXT)
	chat_line("[color=#9a927f]%s[/color]" % text)

func error(text: String) -> void:
	_flash(text, Theme_.RED)

func chat_line(bb: String) -> void:
	if chat_log:
		chat_log.append_text(bb + "\n")

func show_death() -> void:
	death_overlay.visible = true

func hide_death() -> void:
	death_overlay.visible = false

func show_disconnect(reason: String) -> void:
	disc_label.text = "Conexão perdida.\n%s" % reason
	disc_overlay.visible = true

func set_disconnect_text(t: String) -> void:
	disc_label.text = t

func hide_disconnect() -> void:
	disc_overlay.visible = false

# ---------------- inventário ----------------
func _item_button(inst: Dictionary, label_prefix := "") -> Button:
	var d: Dictionary = main.defs["items"].get(inst["defId"], {})
	var b := Button.new()
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.text = label_prefix + ItemText.item_name(main.defs, inst)
	var col := Color(ItemText.rarity_color(main.defs, d.get("rarity", "common")))
	if d.get("slot", null) != null and not ItemText.missing_requirements(main.defs, d, main.ch).is_empty():
		b.text += "  (requisitos)"
		col = Theme_.RED.lerp(col, 0.4)
	b.add_theme_color_override("font_color", col)
	b.focus_mode = Control.FOCUS_NONE
	b.mouse_entered.connect(func():
		var cmp = null
		var slot := ItemText.slot_of(d)
		if inst["loc"] != "equip" and slot != "":
			cmp = main.equipped_in("ring1" if slot == "ring" else slot)
		inv_tip.text = ItemText.describe(main.defs, inst, main.ch, cmp))
	return b

func _refresh_inventory() -> void:
	for c in inv_equip.get_children():
		c.queue_free()
	for c in inv_bag.get_children():
		c.queue_free()
	var slots := ["weapon", "offhand", "head", "body", "hands", "feet", "ring1", "ring2", "amulet"]
	var names := {"weapon": "Arma", "offhand": "Mão sec.", "head": "Cabeça", "body": "Corpo", "hands": "Mãos", "feet": "Pés", "ring1": "Anel", "ring2": "Anel", "amulet": "Amuleto"}
	var weapon: Dictionary = main.equipped_in("weapon")
	var two_handed := not weapon.is_empty() and int(main.defs["items"][weapon["defId"]].get("hands", 1)) == 2
	for s in slots:
		var it: Dictionary = main.equipped_in(s)
		if it.is_empty():
			var l := Label.new()
			l.text = "%s: %s" % [names[s], "(ocupada pela arma de duas mãos)" if s == "offhand" and two_handed else "—"]
			l.add_theme_color_override("font_color", Theme_.MUTED)
			inv_equip.add_child(l)
		else:
			var b := _item_button(it, "%s: " % names[s])
			var slot: String = s
			b.pressed.connect(func(): Net.request("unequip", {"slot": slot}))
			inv_equip.add_child(b)
	var used := 0
	for it in main.ch.get("items", []):
		if it["loc"] == "bag":
			used += 1
			var b := _item_button(it)
			var inst: Dictionary = it
			b.pressed.connect(func(): _bag_click(inst))
			inv_bag.add_child(b)
	for it in main.ch.get("items", []):
		if it["loc"] == "recovery":
			var b := _item_button(it, "[recuperação] ")
			var iid: String = it["id"]
			b.pressed.connect(func(): Net.request("claim_recovery", {"instance": iid}))
			inv_bag.add_child(b)
	inv_title.text = "Bolsa %d/%d (clique: equipar ou usar)" % [used, int(main.ch.get("bagCapacity", 30))]

func _bag_click(inst: Dictionary) -> void:
	var d: Dictionary = main.defs["items"].get(inst["defId"], {})
	if d.get("kind", "") == "consumable":
		Net.request("use_item", {"instance": inst["id"]})
	elif d.get("slot", null) != null:
		Net.request("equip", {"instance": inst["id"]}, func(r):
			if r["ok"]:
				system("Equipado: %s" % d["name"]))

# ---------------- ficha ----------------
func _refresh_sheet() -> void:
	for c in sheet_box.get_children():
		c.queue_free()
	var c: Dictionary = main.ch
	var t := Label.new()
	t.text = "Ficha de %s" % c["name"]
	t.add_theme_color_override("font_color", Theme_.AMBER)
	t.add_theme_font_size_override("font_size", 18)
	sheet_box.add_child(t)
	var pend := 0
	for v in pending_alloc.values():
		pend += int(v)
	var pts := Label.new()
	pts.text = "Pontos de atributo livres: %d%s" % [int(c["unspent"]) - pend, ("  (a confirmar: %d)" % pend) if pend > 0 else ""]
	sheet_box.add_child(pts)
	for a in ["str", "spi", "tal", "agi", "vit"]:
		var row := HBoxContainer.new()
		sheet_box.add_child(row)
		var l := Label.new()
		var perm := int(c["permanent"][a])
		var total := int(c["attrs"][a])
		var add := int(pending_alloc.get(a, 0))
		l.text = "%s: %d%s%s" % [main.defs["attributes"][a]["name"], perm + add, (" (+%d)" % add) if add > 0 else "", ("  [com itens: %d]" % (total + add)) if total != perm else ""]
		l.tooltip_text = main.defs["attributes"][a]["description"]
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(l)
		var b := Button.new()
		b.text = "+"
		b.disabled = int(c["unspent"]) - pend <= 0
		var attr: String = a
		b.pressed.connect(func():
			pending_alloc[attr] = int(pending_alloc.get(attr, 0)) + 1
			_refresh_sheet())
		row.add_child(b)
	var row2 := HBoxContainer.new()
	sheet_box.add_child(row2)
	var ok := Button.new()
	ok.text = "Confirmar pontos"
	ok.disabled = pend == 0
	ok.pressed.connect(func():
		var pts_req := pending_alloc.duplicate()
		pending_alloc = {}
		Net.request("allocate", {"points": pts_req}))
	row2.add_child(ok)
	var cancel := Button.new()
	cancel.text = "Desfazer"
	cancel.pressed.connect(func():
		pending_alloc = {}
		_refresh_sheet())
	row2.add_child(cancel)
	var reset := Button.new()
	reset.text = "Redistribuir tudo"
	reset.tooltip_text = "Grátis no Marco 1. Itens que deixarem de atender aos requisitos voltam para a bolsa."
	reset.pressed.connect(func(): Net.request("reset_attrs", {}, func(r):
		if r["ok"] and r["moved"].size() > 0:
			system("%d item(ns) voltaram para a bolsa." % r["moved"].size())))
	row2.add_child(reset)
	sheet_box.add_child(HSeparator.new())
	var s: Dictionary = c["stats"]
	var st := Label.new()
	st.text = "Vida %d · Mana %d\nDefesa %d · Resist. mágica %d · Evasão %d\nPrecisão %d · Crítico %.1f%% · Crítico mágico %.1f%%\nPoder mágico %d · Intervalo de ataque %.2f s · Alcance %s m" % [int(s["maxHp"]), int(s["maxMp"]), int(s["defense"]), int(s["mres"]), int(s["evasion"]), int(s["accuracy"]), float(s["crit"]), float(s["magicCrit"]), int(s["magicPower"]), float(s["attackIntervalMs"]) / 1000.0, str(s["range"])]
	st.add_theme_font_size_override("font_size", 12)
	sheet_box.add_child(st)
	sheet_box.add_child(HSeparator.new())
	var sk := Label.new()
	sk.text = "Habilidades — pontos livres: %d" % int(c["skillPoints"])
	sk.add_theme_color_override("font_color", Theme_.AMBER)
	sheet_box.add_child(sk)
	for sid in main.class_skills():
		var sd: Dictionary = main.defs["skills"][sid]
		var rank := int(c["skills"].get(sid, 0))
		var row := HBoxContainer.new()
		sheet_box.add_child(row)
		var l := Label.new()
		l.text = "%s — %s" % [sd["name"], ("grau %d" % rank) if rank > 0 else ("nível %d" % int(sd["unlockLevel"]))]
		l.tooltip_text = sd["description"]
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if rank == 0:
			l.add_theme_color_override("font_color", Theme_.MUTED)
		row.add_child(l)
		var b := Button.new()
		b.text = "+"
		b.disabled = rank == 0 or int(c["skillPoints"]) <= 0
		var skill_id: String = sid
		b.pressed.connect(func(): Net.request("learn_skill", {"skill": skill_id}))
		row.add_child(b)
