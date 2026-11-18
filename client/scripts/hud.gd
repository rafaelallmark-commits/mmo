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
var npc_panel: PanelContainer
var npc_box: VBoxContainer
var journal_panel: PanelContainer
var journal_box: VBoxContainer
var tracker: RichTextLabel
var party_panel: PanelContainer
var party_box: VBoxContainer
var invite_panel: PanelContainer
var invite_label: Label
var invite_from := -1

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
	_build_m2(root)
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
	hint.text = "I inventário · C ficha · J missões · 1-5 atalhos · Q/E gira · roda zoom"
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
	p.position = Vector2(-310, -84)
	root.add_child(p)
	hotbar = HBoxContainer.new()
	p.add_child(hotbar)
	for i in 5:
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
	chat_input.placeholder_text = "Enter: conversar · /g grupo · /s Nome sussurro · /convidar Nome · /sair"
	chat_input.text_submitted.connect(func(t: String):
		_chat_command(t.strip_edges())
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

func _process(_delta: float) -> void:
	# mantém o inventário inteiro dentro da tela, qualquer que seja a largura do conteúdo
	if inv_panel and inv_panel.visible:
		var vw := get_viewport().get_visible_rect().size.x
		inv_panel.position.x = maxf(8.0, vw - inv_panel.size.x - 8.0)

func _hot_actions() -> Array:
	var skills: Array = main.class_skills()
	return [
		{"kind": "skill", "id": skills[0] if skills.size() > 0 else ""},
		{"kind": "skill", "id": skills[1] if skills.size() > 1 else ""},
		{"kind": "skill", "id": skills[2] if skills.size() > 2 else ""},
		{"kind": "potion", "id": "potion_hp_s"},
		{"kind": "potion", "id": "potion_mp_s"},
	]

func _refresh_hotbar() -> void:
	var acts := _hot_actions()
	for i in 5:
		var a: Dictionary = acts[i]
		var b: Button = hot_buttons[i]
		if a["kind"] == "skill":
			var s: Dictionary = main.defs["skills"].get(a["id"], {})
			var rank := int(main.ch.get("skills", {}).get(a["id"], 0))
			var locked_text := "nível %d" % int(s.get("unlockLevel", 1))
			if int(s.get("unlockLevel", 1)) == 10 and int(main.ch.get("level", 1)) >= 10:
				locked_text = "prova de classe"
			b.text = "%d · %s\n%s" % [i + 1, s.get("name", "—"), ("grau %d · %d mana" % [rank, int(s.get("mp", 0))]) if rank > 0 else locked_text]
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
			npc_panel.visible = false
			journal_panel.visible = false
		KEY_ENTER, KEY_KP_ENTER:
			chat_input.grab_focus()
		KEY_1, KEY_2, KEY_3, KEY_4, KEY_5:
			_hotkey(k - KEY_1)
		KEY_J:
			journal_panel.visible = not journal_panel.visible
			if journal_panel.visible:
				refresh_quests()
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


# ---------------- M2: comandos de chat ----------------
func _chat_command(t: String) -> void:
	if t == "":
		return
	var cb := func(r):
		if not r["ok"]:
			error(r["reason"])
	if t.begins_with("/g "):
		Net.request("chat", {"channel": "party", "text": t.substr(3)}, cb)
	elif t.begins_with("/s "):
		var rest := t.substr(3).strip_edges()
		var sp := rest.find(" ")
		if sp <= 0:
			error("Use: /s Nome mensagem")
			return
		Net.request("chat", {"channel": "whisper", "to": rest.substr(0, sp), "text": rest.substr(sp + 1)}, cb)
	elif t.begins_with("/convidar "):
		Net.request("party_invite", {"name": t.substr(10).strip_edges()}, func(r):
			if r["ok"]:
				system("Convite enviado.")
			else:
				error(r["reason"]))
	elif t == "/sair":
		Net.request("party_leave", {}, cb)
	else:
		Net.request("chat", {"text": t}, cb)

# ---------------- M2: painéis ----------------
func _panel_at(root: Control, preset: int, pos: Vector2, size: Vector2) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", Theme_.panel_style())
	p.set_anchors_preset(preset)
	p.position = pos
	p.custom_minimum_size = size
	root.add_child(p)
	return p

func _build_m2(root: Control) -> void:
	npc_panel = _panel_at(root, Control.PRESET_CENTER, Vector2(-240, -220), Vector2(480, 0))
	var sc := ScrollContainer.new()
	sc.custom_minimum_size = Vector2(460, 380)
	npc_panel.add_child(sc)
	npc_box = VBoxContainer.new()
	npc_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(npc_box)
	npc_panel.visible = false
	journal_panel = _panel_at(root, Control.PRESET_CENTER, Vector2(-260, -240), Vector2(520, 0))
	var sc2 := ScrollContainer.new()
	sc2.custom_minimum_size = Vector2(500, 440)
	journal_panel.add_child(sc2)
	journal_box = VBoxContainer.new()
	journal_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc2.add_child(journal_box)
	journal_panel.visible = false
	tracker = RichTextLabel.new()
	tracker.bbcode_enabled = true
	tracker.fit_content = true
	tracker.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tracker.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	tracker.position = Vector2(-300, 12)
	tracker.custom_minimum_size = Vector2(288, 0)
	tracker.add_theme_font_size_override("normal_font_size", 12)
	root.add_child(tracker)
	party_panel = _panel_at(root, Control.PRESET_TOP_LEFT, Vector2(12, 128), Vector2(220, 0))
	party_box = VBoxContainer.new()
	party_panel.add_child(party_box)
	party_panel.visible = false
	invite_panel = _panel_at(root, Control.PRESET_CENTER_TOP, Vector2(-170, 140), Vector2(340, 0))
	var iv := VBoxContainer.new()
	invite_panel.add_child(iv)
	invite_label = Label.new()
	invite_label.autowrap_mode = TextServer.AUTOWRAP_WORD
	iv.add_child(invite_label)
	var row := HBoxContainer.new()
	iv.add_child(row)
	var acc := Button.new()
	acc.text = "Aceitar"
	acc.pressed.connect(func():
		Net.request("party_accept", {"from": invite_from}, func(r):
			if not r["ok"]:
				error(r["reason"]))
		invite_panel.visible = false)
	row.add_child(acc)
	var dec := Button.new()
	dec.text = "Recusar"
	dec.pressed.connect(func():
		Net.request("party_decline", {})
		invite_panel.visible = false)
	row.add_child(dec)
	invite_panel.visible = false

func _clear(box: Container) -> void:
	for c in box.get_children():
		c.queue_free()

func _title(box: Container, text: String, size := 16) -> void:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD
	l.add_theme_color_override("font_color", Theme_.AMBER)
	l.add_theme_font_size_override("font_size", size)
	box.add_child(l)

func _text(box: Container, text: String, color := Theme_.TEXT) -> void:
	var l := Label.new()
	l.text = text
	l.autowrap_mode = TextServer.AUTOWRAP_WORD
	l.custom_minimum_size = Vector2(420, 0)
	l.add_theme_color_override("font_color", color)
	box.add_child(l)

func _objectives_text(q: Dictionary) -> String:
	var lines := []
	for o in q["objectives"]:
		lines.append(("✔ " if o["done"] else "• ") + "%s (%d/%d)" % [o["text"], int(o["cur"]), int(o["need"])])
	return "\n".join(lines)

## Diálogo com NPC: missões a aceitar/entregar, loja e prova de classe.
func show_npc(r: Dictionary) -> void:
	_clear(npc_box)
	var npc: Dictionary = r["npc"]
	_title(npc_box, npc["name"], 18)
	var quests: Dictionary = r.get("quests", {})
	for q in quests.get("active", []):
		_title(npc_box, "%s (em andamento)" % q["title"], 14)
		_text(npc_box, "\"%s\"" % (q["dialogue"]["progress"]), Theme_.MUTED)
		_text(npc_box, _objectives_text(q))
		if q["ready"] and q["turnIn"] == npc["id"]:
			var b := Button.new()
			b.text = "Entregar (+%d XP, +%d ouro)" % [int(q["rewards"]["xp"]), int(q["rewards"].get("gold", 0))]
			var qid: String = q["id"]
			b.pressed.connect(func():
				Net.request("quest_turnin", {"quest": qid, "npc": npc["id"]}, func(res):
					if res["ok"]:
						system("Missão concluída: %s" % res["quest"]["title"])
						if res.has("dialogue"):
							chat_line("[color=#ffe39a]%s: \"%s\"[/color]" % [npc["name"], res["dialogue"]])
						npc_panel.visible = false
					else:
						error(res["reason"])))
			npc_box.add_child(b)
	for q in quests.get("offer", []):
		_title(npc_box, "Nova missão: %s" % q["title"], 14)
		_text(npc_box, "\"%s\"" % q["dialogue"]["offer"])
		_text(npc_box, _objectives_text(q), Theme_.MUTED)
		_text(npc_box, "Recompensa: %d XP, %d ouro" % [int(q["rewards"]["xp"]), int(q["rewards"].get("gold", 0))], Theme_.MUTED)
		var b := Button.new()
		b.text = "Aceitar"
		var qid: String = q["id"]
		b.pressed.connect(func():
			Net.request("quest_accept", {"quest": qid, "npc": npc["id"]}, func(res):
				if res["ok"]:
					system("Missão aceita: %s" % res["quest"]["title"])
					npc_panel.visible = false
				else:
					error(res["reason"])))
		npc_box.add_child(b)
	if r.get("trialAvailable", false):
		var tb := Button.new()
		tb.text = "Iniciar a prova de classe"
		tb.pressed.connect(func():
			Net.request("trial_start", {"npc": npc["id"]}, func(res):
				if not res["ok"]:
					error(res["reason"]))
			npc_panel.visible = false)
		npc_box.add_child(tb)
	if r.get("shop", null) != null:
		_title(npc_box, "Loja", 14)
		for item in r["shop"]:
			var row := HBoxContainer.new()
			npc_box.add_child(row)
			var l := Label.new()
			l.text = "%s — %d ouro" % [main.defs["items"][item["defId"]]["name"], int(item["price"])]
			l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			row.add_child(l)
			for qty in [1, 5]:
				var b := Button.new()
				b.text = "Comprar %d" % qty
				var def_id: String = item["defId"]
				var q_amount: int = qty
				b.pressed.connect(func():
					Net.request("buy", {"npc": npc["id"], "item": def_id, "qty": q_amount}, func(res):
						if res["ok"]:
							system("Comprado por %d ouro." % int(res["cost"]))
						else:
							error(res["reason"])))
				row.add_child(b)
	if quests.get("active", []).is_empty() and quests.get("offer", []).is_empty() and r.get("shop", null) == null and not r.get("trialAvailable", false):
		_text(npc_box, "Nada para você agora.", Theme_.MUTED)
	var close := Button.new()
	close.text = "Fechar"
	close.pressed.connect(func(): npc_panel.visible = false)
	npc_box.add_child(close)
	npc_panel.visible = true

func refresh_quests() -> void:
	if tracker == null:
		return
	var j: Dictionary = main.journal
	var t := ""
	for q in j.get("active", []):
		t += "[b][color=#e3a548]%s[/color][/b]%s\n" % [q["title"], "  [color=#6fd06a](entregar)[/color]" if q["ready"] else ""]
		for o in q["objectives"]:
			t += "[color=%s]  %s %d/%d[/color]\n" % ["#6fd06a" if o["done"] else "#cfc8b8", o["text"], int(o["cur"]), int(o["need"])]
	tracker.text = t
	if journal_panel.visible:
		_clear(journal_box)
		_title(journal_box, "Diário de missões", 18)
		for q in j.get("active", []):
			_title(journal_box, "Cap. %d · %s" % [int(q["chapter"]), q["title"]], 14)
			_text(journal_box, _objectives_text(q))
		_title(journal_box, "Disponíveis", 14)
		for q in j.get("available", []):
			_text(journal_box, "%s — nível %d (fale com %s)" % [q["title"], int(q["level"]), q["npc"]], Theme_.MUTED)
		_title(journal_box, "Concluídas: %d" % j.get("done", []).size(), 14)

func refresh_party() -> void:
	_clear(party_box)
	var party = main.party
	if party == null:
		party_panel.visible = false
		return
	party_panel.visible = true
	_title(party_box, "Grupo", 14)
	for m in party["members"]:
		var l := Label.new()
		var lead := " ★" if int(m["charId"]) == int(party["leader"]) else ""
		if m.get("online", false):
			l.text = "%s%s nv%d · %d/%d%s" % [m["name"], lead, int(m["level"]), int(m["hp"]), int(m["mhp"]), "" if m["mapId"] == main.map_id else " (outro mapa)"]
		else:
			l.text = "%s%s (desconectado)" % [m["name"], lead]
		l.add_theme_font_size_override("font_size", 12)
		party_box.add_child(l)
		if m.get("online", false):
			var bar := _bar(party_box, Theme_.HP, 196)
			bar.custom_minimum_size.y = 6
			bar.max_value = float(m["mhp"])
			bar.value = float(m["hp"])
	var leave := Button.new()
	leave.text = "Sair do grupo"
	leave.pressed.connect(func(): Net.request("party_leave"))
	party_box.add_child(leave)

func show_invite(from: String, from_id: int) -> void:
	invite_from = from_id
	invite_label.text = "%s convidou você para um grupo." % from
	invite_panel.visible = true
