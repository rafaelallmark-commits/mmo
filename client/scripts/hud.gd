extends CanvasLayer
## Interface em jogo: vida/mana/XP, alvo, barra de atalhos, mensagens, chat, inventário com
## comparação e requisitos em vermelho, ficha com pontos, morte e aviso de desconexão.

const Theme_ = preload("res://scripts/ui_theme.gd")
const ItemText = preload("res://scripts/item_text.gd")
const Social = preload("res://scripts/social.gd")

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
var cd_until := {}   # habilidade -> fim da recarga (Time.get_ticks_msec)
var gcd_until := 0   # fim da recarga global
var npc_open: Dictionary = {}  # último NPC com quem falou (venda na loja)
var _npc_open_at := -1000000
const SKILL_SLOTS := 6  # todas as habilidades da classe (a 6ª é a do nível 25, pós-v1)
const HOT_SLOTS := SKILL_SLOTS + 2  # 1–6 habilidades, 7–8 tônicos
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
var social  # comércio, clã, duelo e convites (social.gd)
var channel_box: PanelContainer
var channel_label: Label
var channel_bar: ProgressBar
var _channel_total := 0.0
var _channel_left := 0.0
var ping_label: Label
var ping_ms := -1.0          # ida e volta medida (média móvel), em ms
var _ping_in := 0.5

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
	_build_ping(root)
	_build_channel(root)
	social = Social.new()
	social.build(self, root)
	# o aviso de conexão perdida fica por cima de tudo (painéis de troca e convite não cobrem os botões)
	disc_overlay.move_to_front()
	refresh_char()
	# som ao abrir e fechar painéis (tecla, botão Fechar ou Esc: todos passam por "visible")
	for p in [inv_panel, sheet_panel, journal_panel, npc_panel, invite_panel]:
		var panel: Control = p
		panel.visibility_changed.connect(func(): Sfx.ui("ui_open" if panel.visible else "ui_close"))

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
	hint.text = "I inventário · C ficha · J missões · 1-6 habilidades · 7-8 tônicos · Q/E gira · roda zoom"
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
	# 8 botões de 96 px: a barra fica um pouco à direita do centro para não encostar no chat (canto inferior esquerdo)
	p.position = Vector2(-320, -84)
	root.add_child(p)
	hotbar = HBoxContainer.new()
	p.add_child(hotbar)
	for i in HOT_SLOTS:
		var b := Button.new()
		b.custom_minimum_size = Vector2(96, 46)
		b.focus_mode = Control.FOCUS_NONE
		b.autowrap_mode = TextServer.AUTOWRAP_WORD
		b.add_theme_font_size_override("font_size", 10)
		b.set_meta("sfx_silent", true)   # sem clique: a habilidade ou o tônico já soam
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
	p.custom_minimum_size = Vector2(300, 200)
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
	chat_input.placeholder_text = "Enter: conversar (/g /s /convidar)"
	chat_input.tooltip_text = "/g texto: grupo · /s Nome texto: sussurro · /convidar Nome · /sair: sai do grupo\n/c texto: clã · /cla: painel do clã (L) · /troca Nome · /duelo Nome"
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
	death_overlay = _overlay(root, "Você caiu.\nUm aliado pode levantar você: 5 s perto de você, fora de combate.\nSem ajuda, você volta sozinho ao posto em 5 minutos.", "Voltar ao posto deste mapa", func(): Net.request("respawn"))
	var d := _overlay(root, "Conexão perdida.", "Reconectar", func(): main.reconnect())
	disc_overlay = d
	disc_label = d.get_meta("label")
	# saída sempre à mão (conta suspensa, servidor fora do ar): volta ao título
	var out := Button.new()
	out.text = "Sair para o título"
	out.pressed.connect(func(): main.leave_world(true))
	disc_label.get_parent().add_child(out)

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
	# recargas informadas pelo servidor (ao entrar no mundo, trocar de zona ou depois de uma ação)
	var now := Time.get_ticks_msec()
	for k in c.get("cooldowns", {}).keys():
		cd_until[k] = now + int(c["cooldowns"][k])
	var ttl := str(c.get("title", "")) if c.get("title") != null else ""
	name_label.text = "%s — %s, nível %d   ·   %d ouro%s" % [c["name"], cls.get("name", ""), int(c["level"]), int(c["gold"]), ("\n«%s»" % ttl) if ttl != "" else ""]
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

## Indicador de latência no canto inferior direito: ida e volta de um "ping" a cada 2 s.
func _build_ping(root: Control) -> void:
	ping_label = Label.new()
	ping_label.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	ping_label.offset_left = -170.0
	ping_label.offset_right = -10.0
	ping_label.offset_top = -32.0
	ping_label.offset_bottom = -12.0
	ping_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	ping_label.add_theme_font_size_override("font_size", 12)
	ping_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ping_label.tooltip_text = "Tempo de ida e volta até o servidor"
	root.add_child(ping_label)

## Barra de canalização (interações com tempo, como recalibrar um medidor): acima da barra de atalhos.
func _build_channel(root: Control) -> void:
	channel_box = PanelContainer.new()
	channel_box.add_theme_stylebox_override("panel", Theme_.panel_style(0.85))
	channel_box.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	channel_box.offset_left = -170.0
	channel_box.offset_right = 170.0
	channel_box.offset_top = -150.0
	channel_box.offset_bottom = -104.0
	channel_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	channel_box.visible = false
	root.add_child(channel_box)
	var v := VBoxContainer.new()
	channel_box.add_child(v)
	channel_label = Label.new()
	channel_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	channel_label.add_theme_color_override("font_color", Theme_.AMBER)
	v.add_child(channel_label)
	channel_bar = _bar(v, Color("#ffb347"), 320.0)
	channel_bar.max_value = 1.0

func show_channel(text: String, ms: float) -> void:
	_channel_total = maxf(ms / 1000.0, 0.1)
	_channel_left = _channel_total
	channel_label.text = "%s... (não se mova)" % text
	channel_bar.value = 0.0
	channel_box.visible = true

func end_channel(m: Dictionary) -> void:
	channel_box.visible = false
	_channel_left = 0.0
	if m.get("ok", false):
		_flash("Concluído!", Theme_.AMBER)
	else:
		error(str(m.get("reason", "Interrompido.")))

func _tick_channel(delta: float) -> void:
	if not channel_box or not channel_box.visible:
		return
	_channel_left = maxf(0.0, _channel_left - delta)
	channel_bar.value = 1.0 - _channel_left / _channel_total

## Mensagens da escolta: viram linha no chat e, as importantes, aviso no centro.
func on_escort(m: Dictionary) -> void:
	var text := str(m.get("text", ""))
	system(text)
	if m.has("ambush"):
		_flash("Emboscada!", Color("#ff6a5a"))
	elif m.get("broken", false):
		_flash("A carroça quebrou!", Color("#ff6a5a"))
	elif m.get("arrived", false):
		_flash("A carroça chegou!", Theme_.AMBER)

func _tick_ping(delta: float) -> void:
	_ping_in -= delta
	if _ping_in > 0.0 or main == null or not main.in_world:
		return
	_ping_in = 2.0
	var t0 := Time.get_ticks_usec()
	Net.request("ping", {}, func(_r):
		var ms := float(Time.get_ticks_usec() - t0) / 1000.0
		ping_ms = ms if ping_ms < 0.0 else lerpf(ping_ms, ms, 0.5)
		if ping_label:
			ping_label.text = "ping %d ms" % int(round(ping_ms))
			var c := Color("#7fd47f") if ping_ms < 80.0 else (Theme_.AMBER if ping_ms < 150.0 else Color("#ff6a5a"))
			ping_label.add_theme_color_override("font_color", c))

func _process(delta: float) -> void:
	if social:
		social.tick(delta)
	# recargas na barra de atalhos (a cada 0,1 s)
	_cd_acc += delta
	if _cd_acc >= 0.1:
		_cd_acc = 0.0
		if not cd_until.is_empty() or gcd_until > Time.get_ticks_msec() - 200:
			_refresh_hotbar()
	_tick_ping(delta)
	_tick_channel(delta)
	# mantém o inventário inteiro dentro da tela, qualquer que seja a largura do conteúdo
	if inv_panel and inv_panel.visible:
		var vw := get_viewport().get_visible_rect().size.x
		inv_panel.position.x = maxf(8.0, vw - inv_panel.size.x - 8.0)

func _hot_actions() -> Array:
	var skills: Array = main.class_skills()
	var acts := []
	for i in SKILL_SLOTS:
		acts.append({"kind": "skill", "id": skills[i] if skills.size() > i else ""})
	acts.append({"kind": "potion", "id": _best_potion(["potion_hp_m", "potion_hp_s"])})
	acts.append({"kind": "potion", "id": _best_potion(["potion_mp_m", "potion_mp_s"])})
	return acts

## O tônico mais forte que o personagem pode usar e tem na bolsa (ou o pequeno, para mostrar x0).
func _best_potion(ids: Array) -> String:
	var lvl := int(main.ch.get("level", 1))
	for id in ids:
		if int(main.defs["items"].get(id, {}).get("level", 1)) > lvl:
			continue
		for it in main.ch.get("items", []):
			if it["defId"] == id and it["loc"] == "bag":
				return id
	return ids[ids.size() - 1]

func _refresh_hotbar() -> void:
	var acts := _hot_actions()
	for i in HOT_SLOTS:
		var a: Dictionary = acts[i]
		var b: Button = hot_buttons[i]
		if a["kind"] == "skill":
			var s: Dictionary = main.defs["skills"].get(a["id"], {})
			var rank := int(main.ch.get("skills", {}).get(a["id"], 0))
			var locked_text := "nível %d" % int(s.get("unlockLevel", 1))
			if int(s.get("unlockLevel", 1)) == 10 and int(main.ch.get("level", 1)) >= 10:
				locked_text = "prova de classe"
			var left := _cd_left(a["id"])
			var info: String = ("grau %d · %d mana" % [rank, int(s.get("mp", 0))]) if rank > 0 else locked_text
			if rank > 0 and str(main.ch.get("trialSkill", "")) == a["id"]:
				info = "emprestada · %d mana" % int(s.get("mp", 0))  # prova de classe: grau 1 só durante a prova
			if rank > 0 and left > 0.05:
				info = "recarga %.1f s" % left
			b.text = "%d · %s\n%s" % [i + 1, s.get("name", "—"), info]
			b.disabled = rank == 0
			b.modulate = Color(1, 1, 1, 0.55) if rank > 0 and left > 0.05 else Color.WHITE
		else:
			var count := 0
			for it in main.ch.get("items", []):
				if it["defId"] == a["id"] and it["loc"] == "bag":
					count += int(it["qty"])
			b.text = "%d · %s\nx%d" % [i + 1, main.defs["items"].get(a["id"], {}).get("name", a["id"]), count]
			b.disabled = count == 0

var _cd_acc := 0.0

## Segundos que faltam para a habilidade poder sair (recarga própria ou recarga global).
func _cd_left(skill_id: String) -> float:
	var now := Time.get_ticks_msec()
	var end := maxi(int(cd_until.get(skill_id, 0)), gcd_until)
	if int(cd_until.get(skill_id, 0)) <= now:
		cd_until.erase(skill_id)
	return maxf(0.0, (end - now) / 1000.0)

## Resposta do servidor a "cast": recarga, recarga global e barra de conjuração.
func on_cast_result(m: Dictionary) -> void:
	var now := Time.get_ticks_msec()
	if m.get("ok", false):
		if m.has("gcdMs"):
			gcd_until = now + int(m["gcdMs"])
		if m.has("casting"):
			show_channel("Conjurando %s" % str(m["casting"].get("name", "")), float(m["casting"]["ms"]))
			_casting = true
		elif m.has("cooldownMs") and m.has("skill"):
			cd_until[str(m["skill"])] = now + int(m["cooldownMs"])
	_refresh_hotbar()

## Fim de uma conjuração (sucesso ou interrupção).
func on_cast_end(m: Dictionary) -> void:
	if _casting:
		channel_box.visible = false
		_channel_left = 0.0
		_casting = false
	if m.get("ok", false):
		if m.has("cooldownMs"):
			cd_until[str(m["skill"])] = Time.get_ticks_msec() + int(m["cooldownMs"])
	elif str(m.get("code", "")) != "switched":  # trocar de habilidade não é erro
		error(str(m.get("reason", "Conjuração interrompida.")))
		gcd_until = mini(gcd_until, Time.get_ticks_msec() + 300)
	_refresh_hotbar()

var _casting := false

func _hotkey(i: int) -> void:
	var a: Dictionary = _hot_actions()[i]
	if a["kind"] == "skill":
		if a["id"] != "":
			main.world.use_skill(a["id"])
	else:
		var it: Dictionary = main.my_item(a["id"])
		if not it.is_empty():
			_use_item(it["id"])

## Usa um consumível (tônico); o gole soa quando o servidor confirma.
func _use_item(iid: String) -> void:
	Net.request("use_item", {"instance": iid}, func(r):
		if r.get("ok", false):
			Sfx.ui("potion"))

func refresh_target() -> void:
	var w = main.world
	if w == null or w.selected == "" or not w.entities.has(w.selected):
		target_box.visible = false
		return
	var d: Dictionary = w.entities[w.selected]["data"]
	target_box.visible = true
	var md: Dictionary = main.defs["monsters"].get(d.get("def", ""), {})
	var rank := ""
	var rank_names := {"elite": "elite", "boss": "chefe"}
	if md.get("rank", "normal") != "normal":
		rank = " (%s)" % rank_names.get(md["rank"], md["rank"])
	if d.get("k", "") == "p":
		rank = " (caído)" if d.get("dead", false) else " (duelo)"
	target_label.text = "%s · nível %d%s" % [md.get("name", d.get("n", "?")), int(d["lvl"]), rank]
	target_bar.max_value = float(d["mhp"])
	target_bar.value = float(d["hp"])

func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	if chat_input.has_focus() or main.menu_open():
		return
	var k := (event as InputEventKey).keycode
	match k:
		KEY_I:
			inv_panel.visible = not inv_panel.visible
			if inv_panel.visible and npc_panel.visible:
				npc_panel.visible = false  # a bolsa é larga: o painel do NPC sai da frente (a venda continua valendo)
			if inv_panel.visible:
				_refresh_inventory()
		KEY_C:
			sheet_panel.visible = not sheet_panel.visible
			if sheet_panel.visible:
				pending_alloc = {}
				_refresh_sheet()
		KEY_ENTER, KEY_KP_ENTER:
			chat_input.grab_focus()
		KEY_1, KEY_2, KEY_3, KEY_4, KEY_5, KEY_6, KEY_7, KEY_8:
			_hotkey(k - KEY_1)
		KEY_J:
			journal_panel.visible = not journal_panel.visible
			if journal_panel.visible:
				refresh_quests()
		KEY_L:
			social.toggle_clan()
		_:
			return
	get_viewport().set_input_as_handled()

## Esc: fecha o painel aberto mais alto. Retorna false se não havia nenhum (o main abre o menu).
func close_top_panel() -> bool:
	if _bag_menu_node and is_instance_valid(_bag_menu_node):
		_close_bag_menu()
		return true
	if social and social.close_top():
		return true
	for p in [invite_panel, npc_panel, journal_panel, inv_panel, sheet_panel]:
		if p and p.visible:
			p.visible = false
			return true
	return false

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
	# tween preso ao rótulo: se ele sair antes (excesso de mensagens), o tween morre junto
	var tw := l.create_tween()
	tw.tween_interval(3.0)
	tw.tween_property(l, "modulate:a", 0.0, 0.8)
	tw.tween_callback(l.queue_free)

func system(text: String) -> void:
	_flash(text, Theme_.TEXT)
	chat_line("[color=#9a927f]%s[/color]" % esc(text))

func error(text: String) -> void:
	_flash(text, Theme_.RED)
	Sfx.ui("ui_error")

func chat_line(bb: String) -> void:
	if chat_log:
		chat_log.append_text(bb + "\n")

# Texto livre de jogador (fala, mensagem do dia) entra no chat como texto, nunca como BBCode:
# «[» vira «[lb]», então ninguém muda fonte, cor ou imagem na tela dos outros nem imita o sistema.
static func esc(t) -> String:
	return str(t).replace("[", "[lb]")

func show_death() -> void:
	death_overlay.visible = true

func hide_death() -> void:
	death_overlay.visible = false

func show_disconnect(reason: String) -> void:
	disc_label.text = "Conexão perdida.\n%s" % reason
	disc_overlay.visible = true
	# troca, duelo e convites acabaram com a sessão no servidor (o aviso não chega por um soquete morto)
	if social:
		social.reset()

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
			b.pressed.connect(func(): Net.request("unequip", {"slot": slot}, func(r):
				if r.get("ok", false):
					Sfx.ui("loot_item", -3.0)))
			inv_equip.add_child(b)
	var used := 0
	for it in main.ch.get("items", []):
		if it["loc"] == "bag":
			used += 1
			var b := _item_button(it)
			var inst: Dictionary = it
			b.pressed.connect(func(): _bag_click(inst))
			# botão direito: usar/equipar, vender (com a loja aberta) ou descartar
			b.gui_input.connect(func(ev: InputEvent):
				if ev is InputEventMouseButton and ev.pressed and (ev as InputEventMouseButton).button_index == MOUSE_BUTTON_RIGHT:
					_bag_menu(inst))
			inv_bag.add_child(b)
	for it in main.ch.get("items", []):
		if it["loc"] == "recovery":
			var b := _item_button(it, "[recuperação] ")
			var iid: String = it["id"]
			b.pressed.connect(func(): Net.request("claim_recovery", {"instance": iid}))
			inv_bag.add_child(b)
	inv_title.text = "Bolsa %d/%d (clique: equipar ou usar · botão direito: vender ou descartar)" % [used, int(main.ch.get("bagCapacity", 30))]

## Último comerciante (loja ou ferreiro) com quem você falou nos últimos 5 min: dá para vender a ele
## (o servidor confere se você ainda está perto).
func _merchant_open() -> bool:
	return str(npc_open.get("role", "")) in ["shop", "smith", "armorer"] and Time.get_ticks_msec() - _npc_open_at < 300000

func _sell_price(inst: Dictionary) -> int:
	var d: Dictionary = main.defs["items"].get(inst["defId"], {})
	return maxi(1, int(d.get("value", 1)) / 2) * int(inst.get("qty", 1))

func _bag_menu(inst: Dictionary) -> void:
	# menu de contexto feito com painéis do próprio HUD: um fundo transparente em tela cheia fecha ao clicar fora
	_close_bag_menu()
	var d: Dictionary = main.defs["items"].get(inst["defId"], {})
	var root: Control = inv_panel.get_parent()
	var backdrop := Control.new()
	backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	backdrop.mouse_filter = Control.MOUSE_FILTER_STOP
	backdrop.gui_input.connect(func(ev: InputEvent):
		if ev is InputEventMouseButton and ev.pressed:
			_close_bag_menu())
	root.add_child(backdrop)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Theme_.panel_style(0.97))
	backdrop.add_child(panel)
	var v := VBoxContainer.new()
	panel.add_child(v)
	var title := Label.new()
	title.text = ItemText.item_name(main.defs, inst)
	title.add_theme_color_override("font_color", Theme_.AMBER)
	v.add_child(title)
	var usable: bool = d.get("kind", "") == "consumable" or d.get("slot", null) != null
	if usable:
		_menu_button(v, "Usar" if d.get("kind", "") == "consumable" else "Equipar", func(): _on_bag_menu(0, inst))
	if _merchant_open():
		var label := "Vender%s a %s por %d de ouro" % [" (x%d)" % int(inst["qty"]) if int(inst.get("qty", 1)) > 1 else "", str(npc_open.get("name", "comerciante")).get_slice(",", 0), _sell_price(inst)]
		_menu_button(v, label, func(): _on_bag_menu(1, inst))
	else:
		var off := _menu_button(v, "Vender (fale com um comerciante)", func(): pass)
		off.disabled = true
	_menu_button(v, "Descartar…", func(): _on_bag_menu(2, inst))
	_menu_button(v, "Cancelar", func(): pass)
	# na posição do mouse, sem sair da tela
	var vp := get_viewport().get_visible_rect().size
	var mp := get_viewport().get_mouse_position()
	panel.reset_size()
	var sz := panel.get_combined_minimum_size()
	panel.position = Vector2(clampf(mp.x, 8.0, vp.x - sz.x - 8.0), clampf(mp.y, 8.0, vp.y - sz.y - 8.0))
	_bag_menu_node = backdrop

var _bag_menu_node: Control = null

func _menu_button(box: Container, text: String, cb: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.pressed.connect(func():
		_close_bag_menu()
		cb.call())
	box.add_child(b)
	return b

func _close_bag_menu() -> void:
	if _bag_menu_node and is_instance_valid(_bag_menu_node):
		_bag_menu_node.queue_free()
	_bag_menu_node = null

func _on_bag_menu(id: int, inst: Dictionary) -> void:
	if id == 0:
		_bag_click(inst)
	elif id == 1:
		_sell_item(str(inst["id"]))
	elif id == 2:
		_confirm_discard(inst)

func _sell_item(iid: String) -> void:
	Net.request("sell", {"npc": npc_open.get("id", ""), "instance": iid}, func(r):
		if r.get("ok", false):
			Sfx.ui("loot_coins")
			system(str(r.get("message", "Vendido.")))
		else:
			error(str(r.get("reason", "Não foi possível vender."))))

func _confirm_reset_attrs() -> void:
	var dlg := ConfirmationDialog.new()
	dlg.title = "Redistribuir tudo"
	dlg.dialog_text = "Devolver todos os pontos de atributo para distribuir de novo?\nGrátis durante o teste. Itens que deixarem de atender aos requisitos voltam para a bolsa."
	dlg.ok_button_text = "Redistribuir"
	dlg.cancel_button_text = "Cancelar"
	add_child(dlg)
	dlg.confirmed.connect(func():
		Net.request("reset_attrs", {}, func(r):
			if r["ok"] and r["moved"].size() > 0:
				system("%d item(ns) voltaram para a bolsa." % r["moved"].size())
			elif not r["ok"]:
				error(str(r.get("reason", "Não foi possível redistribuir.")))))
	dlg.visibility_changed.connect(func():
		if not dlg.visible:
			dlg.queue_free())
	dlg.popup_centered()

func _confirm_discard(inst: Dictionary) -> void:
	var dlg := ConfirmationDialog.new()
	dlg.title = "Descartar"
	dlg.dialog_text = "Descartar %s? Não dá para desfazer." % ItemText.item_name(main.defs, inst)
	dlg.ok_button_text = "Descartar"
	dlg.cancel_button_text = "Cancelar"
	add_child(dlg)
	var iid: String = inst["id"]
	dlg.confirmed.connect(func():
		Net.request("discard", {"instance": iid}, func(r):
			if r.get("ok", false):
				system(str(r.get("message", "Descartado.")))
			else:
				error(str(r.get("reason", "Não foi possível descartar.")))))
	dlg.visibility_changed.connect(func():
		if not dlg.visible:
			dlg.queue_free())
	dlg.popup_centered()

func _bag_click(inst: Dictionary) -> void:
	var d: Dictionary = main.defs["items"].get(inst["defId"], {})
	if d.get("kind", "") == "consumable":
		_use_item(inst["id"])
	elif d.get("slot", null) != null:
		Net.request("equip", {"instance": inst["id"]}, func(r):
			if r["ok"]:
				Sfx.ui("loot_item")
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
	reset.tooltip_text = "Grátis durante o teste. Devolve todos os pontos; itens que deixarem de atender aos requisitos voltam para a bolsa."
	reset.pressed.connect(_confirm_reset_attrs)
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
	if social.chat_command(t):
		return
	var cb := func(r):
		if not r["ok"]:
			error(r["reason"])
	if t.begins_with("/g "):
		Net.request("chat", {"channel": "party", "text": t.substr(3)}, cb)
	elif t.begins_with("/s "):
		var nr: Array = Social.split_name(t.substr(3))
		if nr[0] == "" or nr[1] == "":
			error("Use: /s Nome mensagem (nome com espaço entre aspas)")
			return
		Net.request("chat", {"channel": "whisper", "to": nr[0], "text": nr[1]}, cb)
	elif t.begins_with("/convidar "):
		Net.request("party_invite", {"name": Social.name_arg(t.substr(10))}, func(r):
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
	npc_open = npc
	_npc_open_at = Time.get_ticks_msec()
	_title(npc_box, npc["name"], 18)
	var quests: Dictionary = r.get("quests", {})
	for q in quests.get("active", []):
		_title(npc_box, "%s (em andamento)" % q["title"], 14)
		_text(npc_box, "\"%s\"" % (q["dialogue"]["progress"]), Theme_.MUTED)
		_text(npc_box, _objectives_text(q))
		if q["ready"] and q["turnIn"] == npc["id"]:
			var b := Button.new()
			b.text = "Entregar (%s)" % _rewards_text(q["rewards"])
			var qid: String = q["id"]
			b.pressed.connect(func():
				Net.request("quest_turnin", {"quest": qid, "npc": npc["id"]}, func(res):
					if res["ok"]:
						Sfx.ui("quest_done")
						system("Missão concluída: %s" % res["quest"]["title"])
						if res.has("dialogue"):
							chat_line("[color=#ffe39a]%s: \"%s\"[/color]" % [npc["name"], res["dialogue"]])
						npc_panel.visible = false
					else:
						error(res["reason"])))
			npc_box.add_child(b)
	if r.get("choice", null) != null:
		# escolha de resposta (ex.: "Duas Razões"): muda falas futuras e dá um título
		var ch: Dictionary = r["choice"]
		_text(npc_box, str(ch.get("prompt", "")), Theme_.AMBER)
		for op in ch.get("options", []):
			var cb := Button.new()
			cb.text = str(op["text"])
			cb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			cb.custom_minimum_size = Vector2(380, 0)
			var opt_id: String = op["id"]
			var quest_id: String = ch["quest"]
			cb.pressed.connect(func():
				Net.request("quest_choice", {"quest": quest_id, "option": opt_id, "npc": npc["id"]}, func(res):
					if res["ok"]:
						chat_line("[color=#ffe39a]%s: \"%s\"[/color]" % [npc["name"], str(res.get("reply", ""))])
						if res.get("title") != null:
							system("Título recebido: «%s»" % str(res["title"]))
						if res.has("journal"):
							main.journal = res["journal"]
							refresh_quests()
						npc_panel.visible = false
					else:
						error(res["reason"])))
			npc_box.add_child(cb)
	for q in quests.get("offer", []):
		_title(npc_box, "Nova missão: %s" % q["title"], 14)
		_text(npc_box, "\"%s\"" % q["dialogue"]["offer"])
		_text(npc_box, _objectives_text(q), Theme_.MUTED)
		_text(npc_box, "Recompensa: %s" % _rewards_text(q["rewards"]), Theme_.MUTED)
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
		# o mestre conta a prova antes: nome, tempo, objetivo, dica e a habilidade emprestada (server.js trialBrief)
		var tr: Dictionary = r.get("trial", {}) if r.get("trial", null) is Dictionary else {}
		if not tr.is_empty():
			_title(npc_box, "Prova de classe: %s (%d s)" % [str(tr.get("title", "")), int(tr.get("ms", 0)) / 1000], 14)
			_text(npc_box, str(tr.get("objective", "")))
			_text(npc_box, "%s Durante a prova, %s fica emprestada no grau 1; vencer a libera de vez." % [str(tr.get("hint", "")), str(tr.get("skillName", ""))], Theme_.MUTED)
		var tb := Button.new()
		tb.text = "Iniciar a prova de classe"
		tb.pressed.connect(func():
			Net.request("trial_start", {"npc": npc["id"]}, func(res):
				if not res["ok"]:
					error(res["reason"]))
			npc_panel.visible = false)
		npc_box.add_child(tb)
	if r.get("shop", null) != null:
		var armorer: bool = npc.get("role", "") == "armorer"
		_title(npc_box, "Armeiro: peças da sua faixa e da próxima" if armorer else "Loja", 14)
		_text(npc_box, "Para vender: abra a bolsa (I) e clique com o botão direito no item.", Theme_.MUTED)
		for item in r["shop"]:
			var row := HBoxContainer.new()
			npc_box.add_child(row)
			var l := Label.new()
			var d: Dictionary = main.defs["items"][item["defId"]]
			if item.get("gear", false):
				var missing: Array = ItemText.missing_requirements(main.defs, d, main.ch)
				l.text = "%s (nv %d) — %d ouro%s" % [d["name"], int(d.get("level", 1)), int(item["price"]), "" if missing.is_empty() else "  (requisitos)"]
				if not missing.is_empty():
					l.add_theme_color_override("font_color", Theme_.RED.lerp(Theme_.TEXT, 0.4))
			else:
				l.text = "%s — %d ouro" % [d["name"], int(item["price"])]
			l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			l.custom_minimum_size = Vector2(250, 0)
			l.mouse_filter = Control.MOUSE_FILTER_PASS
			row.add_child(l)
			for qty in ([1] if item.get("gear", false) else [1, 5]):
				var b := Button.new()
				b.text = "Comprar" if item.get("gear", false) else "Comprar %d" % qty
				var def_id: String = item["defId"]
				var q_amount: int = qty
				b.pressed.connect(func():
					Net.request("buy", {"npc": npc["id"], "item": def_id, "qty": q_amount}, func(res):
						if res["ok"]:
							Sfx.ui("loot_coins")
							system("Comprado por %d ouro." % int(res["cost"]))
						else:
							error(res["reason"])))
				row.add_child(b)
	var role: String = npc.get("role", "")
	if role == "smith":
		_smith_ui(npc)
	elif role == "storage":
		_storage_ui(npc)
	if quests.get("active", []).is_empty() and quests.get("offer", []).is_empty() and r.get("shop", null) == null and not r.get("trialAvailable", false) and r.get("choice", null) == null and not role in ["smith", "storage"]:
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
			_text(journal_box, "%s — nível %d (fale com %s)" % [q["title"], int(q["level"]), q.get("npcName", q["npc"])], Theme_.MUTED)
		_title(journal_box, "Concluídas: %d" % j.get("done", []).size(), 14)

func refresh_party() -> void:
	_clear(party_box)
	var party = main.party
	if party == null:
		party_panel.visible = false
		return
	party_panel.visible = true
	_title(party_box, "Grupo", 14)
	var me_id := int(main.ch.get("id", -1))
	var i_lead := int(party["leader"]) == me_id
	for m in party["members"]:
		var row := HBoxContainer.new()
		party_box.add_child(row)
		var l := Label.new()
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var lead := " ★" if int(m["charId"]) == int(party["leader"]) else ""
		if m.get("online", false):
			var where := ""
			if m["mapId"] != main.map_id:
				where = " (outro mapa)"
			elif int(m["charId"]) != me_id and m.has("x"):
				where = " · %d m" % int(round(Vector2(float(m["x"]), float(m["z"])).distance_to(Vector2(float(main.ch.get("x", 0)), float(main.ch.get("z", 0))))))
			var fallen := " · CAÍDO" if m.get("dead", false) else ""
			l.text = "%s%s nv%d%s%s" % [m["name"], lead, int(m["level"]), fallen, where]
			if m.get("dead", false):
				l.add_theme_color_override("font_color", Theme_.RED)
		else:
			l.text = "%s%s (desconectado)" % [m["name"], lead]
		l.add_theme_font_size_override("font_size", 12)
		row.add_child(l)
		if i_lead and int(m["charId"]) != me_id:
			var kick := Button.new()
			kick.text = "Expulsar"
			kick.add_theme_font_size_override("font_size", 10)
			var kid := int(m["charId"])
			var kname: String = m["name"]
			kick.pressed.connect(func(): Net.request("party_kick", {"charId": kid}, func(r):
				if r["ok"]:
					system("%s saiu do grupo." % kname)
				else:
					error(r["reason"])))
			row.add_child(kick)
		if m.get("online", false):
			var bar := _bar(party_box, Theme_.HP, 196)
			bar.custom_minimum_size.y = 6
			bar.max_value = float(m["mhp"])
			bar.value = float(m["hp"])
			if m.has("mmp") and float(m["mmp"]) > 0:
				var mb := _bar(party_box, Theme_.MP, 196)
				mb.custom_minimum_size.y = 4
				mb.max_value = float(m["mmp"])
				mb.value = float(m.get("mp", 0))
	var leave := Button.new()
	leave.text = "Sair do grupo"
	leave.pressed.connect(func(): Net.request("party_leave"))
	party_box.add_child(leave)

func show_invite(from: String, from_id: int) -> void:
	invite_from = from_id
	invite_label.text = "%s convidou você para um grupo." % from
	invite_panel.visible = true


# ---------------- ferreiro e depósito ----------------
const ENHANCEABLE_KINDS := ["weapon", "armor", "offhand", "jewel"]

## Ferreiro: lista as peças (equipadas e na bolsa); cada uma mostra custo, chance e prévia.
func _smith_ui(npc: Dictionary) -> void:
	_title(npc_box, "Refino (até +6)", 14)
	_text(npc_box, "Até +3, a falha só gasta o ouro e os materiais. Para ir a +4, +5 e +6, a falha derruba um grau — a menos que você use um Selo de Proteção, que só é gasto quando segura uma falha.", Theme_.MUTED)
	# a cotação fica logo abaixo do texto, antes da lista (sempre à vista)
	var quote_box := VBoxContainer.new()
	npc_box.add_child(quote_box)
	for it in main.ch.get("items", []):
		if not it["loc"] in ["bag", "equip"]:
			continue
		var d: Dictionary = main.defs["items"].get(it["defId"], {})
		if not d.get("kind", "") in ENHANCEABLE_KINDS:
			continue
		var b := Button.new()
		b.text = "%s%s" % [ItemText.item_name(main.defs, it), "  (equipado)" if it["loc"] == "equip" else ""]
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var iid: String = it["id"]
		b.pressed.connect(func(): _smith_quote(npc, iid, quote_box))
		npc_box.add_child(b)

func _smith_quote(npc: Dictionary, iid: String, box: VBoxContainer) -> void:
	Net.request("enhance_quote", {"npc": npc["id"], "instance": iid}, func(r):
		_clear(box)
		if not r["ok"]:
			_text(box, r["reason"], Theme_.RED)
			return
		var mat: String = main.defs["items"][r["material"]]["name"]
		_text(box, "+%d → +%d: chance %d%%, %d ouro (você tem %d), %d × %s (você tem %d)" % [int(r["from"]), int(r["to"]), int(r["chancePct"]), int(r["gold"]), int(r["goldHave"]), int(r["materialQty"]), mat, int(r["materialHave"])])
		var pv: Dictionary = r["preview"]
		var lines := []
		for k in pv["before"].keys():
			lines.append("%s: %s → %s" % [{"damage": "dano", "defense": "defesa", "magicPower": "poder mágico"}.get(k, k), str(pv["before"][k]), str(pv["after"][k])])
		if not lines.is_empty():
			_text(box, "Prévia: " + ", ".join(lines), Theme_.GREEN)
		var seal: CheckBox = null
		if r.get("downgradeOnFail", false):
			_text(box, "Risco: se falhar, a peça cai para +%d." % (int(r["from"]) - 1), Theme_.RED)
			if r.get("protectItem") != null:
				seal = CheckBox.new()
				var have := int(r.get("protectHave", 0))
				seal.text = "Usar %s (você tem %d)" % [main.defs["items"].get(r["protectItem"], {}).get("name", "Selo de Proteção"), have]
				seal.disabled = have <= 0
				seal.button_pressed = have > 0
				box.add_child(seal)
		var go := Button.new()
		go.text = "Refinar"
		go.pressed.connect(func():
			var protect: bool = seal != null and seal.button_pressed
			Net.request("enhance", {"npc": npc["id"], "instance": iid, "protect": protect}, func(res):
				if res.has("char"):
					main.set_char(res["char"])
				if res["ok"]:
					if res["success"]:
						Sfx.ui("refine_ok")
						system(res["message"])
					else:
						Sfx.ui("refine_fail")
						_flash(res["message"], Theme_.RED)
					_smith_quote(npc, iid, box)
				else:
					error(res["reason"])))
		box.add_child(go))

## Depósito da conta: o que está guardado (de qualquer personagem) e o que dá para guardar.
func _storage_ui(npc: Dictionary) -> void:
	var box := VBoxContainer.new()
	npc_box.add_child(box)
	_storage_refresh(npc, box)

func _storage_refresh(npc: Dictionary, box: VBoxContainer) -> void:
	Net.request("storage_list", {"npc": npc["id"]}, func(r):
		_clear(box)
		if not r["ok"]:
			_text(box, r["reason"], Theme_.RED)
			return
		var st: Dictionary = r["storage"]
		_title(box, "Depósito da conta (%d/%d)" % [st["items"].size(), int(st["capacity"])], 14)
		for it in st["items"]:
			var b := Button.new()
			b.text = "Pegar: %s%s  (guardado por %s)" % [ItemText.item_name(main.defs, it), (" ×%d" % int(it["qty"])) if int(it["qty"]) > 1 else "", it["owner"]]
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			var iid: String = it["id"]
			b.pressed.connect(func():
				Net.request("storage_take", {"npc": npc["id"], "instance": iid}, func(res):
					if res.has("char"):
						main.set_char(res["char"])
					if not res["ok"]:
						error(res["reason"])
					else:
						Sfx.ui("loot_item")
					_storage_refresh(npc, box)))
			box.add_child(b)
		_title(box, "Da bolsa", 13)
		for it in main.ch.get("items", []):
			if it["loc"] != "bag":
				continue
			var b2 := Button.new()
			b2.text = "Guardar: %s%s" % [ItemText.item_name(main.defs, it), (" ×%d" % int(it["qty"])) if int(it["qty"]) > 1 else ""]
			b2.alignment = HORIZONTAL_ALIGNMENT_LEFT
			var iid2: String = it["id"]
			b2.pressed.connect(func():
				Net.request("storage_put", {"npc": npc["id"], "instance": iid2}, func(res):
					if res.has("char"):
						main.set_char(res["char"])
					if not res["ok"]:
						error(res["reason"])
					else:
						Sfx.ui("loot_item", -2.0)
					_storage_refresh(npc, box)))
			box.add_child(b2))


# ---------------- chefe ----------------
var boss_label: Label

## Ao trocar de mapa (saída da Eclusa, reconexão): o painel do chefe não fica preso na tela.
func clear_boss() -> void:
	if boss_label:
		boss_label.text = ""
		boss_label.visible = false

## Painel do chefe no alto da tela: fase, vida e o que fazer agora.
func show_boss(m: Dictionary) -> void:
	if boss_label == null:
		boss_label = Label.new()
		boss_label.add_theme_font_size_override("font_size", 18)
		boss_label.add_theme_color_override("font_color", Color("#ffcf9a"))
		boss_label.add_theme_color_override("font_outline_color", Color("#1a1210"))
		boss_label.add_theme_constant_override("outline_size", 6)
		boss_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		boss_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
		boss_label.position = Vector2(-320, 86)
		boss_label.size = Vector2(640, 60)
		add_child(boss_label)
	boss_label.visible = true
	var st: String = m.get("state", "")
	if st == "victory":
		boss_label.text = "O Custódio parou. A saída está aberta (anel na entrada)."
		return
	if st == "reset":
		boss_label.text = "Falha: %s" % m.get("reason", "")
		return
	var pct := int(round(100.0 * float(m.get("hp", 0)) / maxf(1.0, float(m.get("mhp", 1)))))
	var tip := ""
	match int(m.get("phase", 1)):
		1:
			tip = "PROTEGIDO (−90%) — quando uma válvula ventilar, acerte o Custódio pelo lado dela" if m.get("protected", false) else "Proteção rompida! Bata agora"
		2:
			tip = "Saia das linhas do piso que acenderem em vermelho"
		3:
			var g: Array = m.get("gates", [])
			var parts := []
			for x in g:
				parts.append("%d%%" % int(round(float(x["progress"]) * 100.0)))
			tip = "Comportas descendo: %s — destrua as travas, bata no Braço de Comando" % " · ".join(parts)
	boss_label.text = "O Custódio da Eclusa — fase %d — %d%%\n%s" % [int(m.get("phase", 1)), pct, tip]


# ---------------- prova de classe ----------------
var trial_panel: PanelContainer
var trial_title: Label
var trial_goal: Label
var trial_prog: Label
var trial_bar: ProgressBar
var trial_bar_text: Label
var trial_alert: Label
var trial_hint: Label
var _trial_skill := ""
var _trial_hint_until := 0

## Painel da prova à esquerda, abaixo do quadro de vida e mana (o centro do alto é do quadro do alvo e das
## mensagens): título e tempo, objetivo, progresso com barra, aviso urgente (investida, jato de vapor,
## emboscada, fora do posto) e a dica da habilidade emprestada.
func _build_trial() -> void:
	trial_panel = PanelContainer.new()
	trial_panel.add_theme_stylebox_override("panel", Theme_.panel_style(0.82))
	trial_panel.set_anchors_preset(Control.PRESET_TOP_LEFT)
	trial_panel.position = Vector2(12, 126)
	trial_panel.custom_minimum_size = Vector2(400, 0)
	trial_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(trial_panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 3)
	trial_panel.add_child(v)
	trial_title = Label.new()
	trial_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	trial_title.add_theme_color_override("font_color", Theme_.AMBER)
	trial_title.add_theme_font_size_override("font_size", 17)
	v.add_child(trial_title)
	trial_goal = Label.new()
	trial_goal.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	trial_goal.autowrap_mode = TextServer.AUTOWRAP_WORD
	trial_goal.add_theme_font_size_override("font_size", 13)
	v.add_child(trial_goal)
	trial_prog = Label.new()
	trial_prog.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	trial_prog.add_theme_color_override("font_color", Theme_.NACRE)
	trial_prog.add_theme_font_size_override("font_size", 15)
	v.add_child(trial_prog)
	trial_bar = _bar(v, Theme_.XP, 376)
	trial_bar_text = _overlay_label(trial_bar)
	trial_alert = Label.new()
	trial_alert.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	trial_alert.autowrap_mode = TextServer.AUTOWRAP_WORD
	trial_alert.add_theme_color_override("font_color", Color("#ffb347"))
	trial_alert.add_theme_color_override("font_outline_color", Color("#1a1210"))
	trial_alert.add_theme_constant_override("outline_size", 5)
	trial_alert.add_theme_font_size_override("font_size", 15)
	v.add_child(trial_alert)
	trial_hint = Label.new()
	trial_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	trial_hint.autowrap_mode = TextServer.AUTOWRAP_WORD
	trial_hint.add_theme_color_override("font_color", Theme_.MUTED)
	trial_hint.add_theme_font_size_override("font_size", 11)
	v.add_child(trial_hint)
	trial_panel.visible = false

func show_trial(m: Dictionary) -> void:
	if trial_panel == null:
		_build_trial()
	trial_panel.visible = true
	_trial_skill = str(m.get("skill", ""))
	trial_title.set_meta("base", "Prova de classe — %s" % str(m.get("title", "")))
	trial_title.text = trial_title.get_meta("base")
	trial_goal.text = str(m.get("objective", ""))
	trial_hint.text = "%s (%s emprestada no grau 1)" % [str(m.get("hint", "")), str(m.get("skillName", ""))]
	trial_prog.text = ""
	trial_alert.text = ""
	trial_alert.visible = false
	trial_bar.value = trial_bar.max_value
	trial_bar_text.text = ""
	trial_hint.visible = true
	_trial_hint_until = Time.get_ticks_msec() + 15000  # a dica sai depois de 15 s (fica no chat)
	_refresh_hotbar()
	_place_party_panel.call_deferred()

func update_trial(m: Dictionary) -> void:
	if trial_panel == null or not trial_panel.visible:
		return
	var left := int(ceil(float(m.get("left", 0)) / 1000.0))
	trial_title.text = "%s · %d:%02d" % [str(trial_title.get_meta("base", "")), left / 60, left % 60]
	var sub := str(m.get("sub", ""))
	trial_prog.text = str(m.get("text", "")) + ("\n" + sub if sub != "" else "")
	var frac := clampf(float(m.get("frac", 1.0)), 0.0, 1.0)
	trial_bar.value = trial_bar.max_value * frac
	trial_bar_text.text = "%s %d%%" % [str(m.get("bar", "")), int(round(frac * 100.0))]
	var alert = m.get("alert", null)
	trial_alert.visible = alert != null and str(alert) != ""
	trial_alert.text = str(alert) if trial_alert.visible else ""
	trial_hint.visible = Time.get_ticks_msec() < _trial_hint_until
	_place_party_panel.call_deferred()

func hide_trial() -> void:
	if trial_panel:
		trial_panel.visible = false
	_trial_skill = ""
	_place_party_panel()

## O painel do grupo fica no mesmo canto: com o painel da prova aberto, desce para baixo dele.
func _place_party_panel() -> void:
	if party_panel == null:
		return
	var below := trial_panel != null and trial_panel.visible
	party_panel.position.y = (trial_panel.position.y + trial_panel.size.y + 8.0) if below else 128.0

## "120 XP, 40 ouro, Anel de Nácar, 3× Tônico de Vida Pequeno, +1 grau em habilidade"
func _rewards_text(rw: Dictionary) -> String:
	var parts := ["%d XP" % int(rw.get("xp", 0))]
	if int(rw.get("gold", 0)) > 0:
		parts.append("%d ouro" % int(rw["gold"]))
	for it in rw.get("items", []):
		# nos dados cada item é [defId, quantidade]
		var did := ""
		var qty := 1
		if it is Array and it.size() > 0:
			did = str(it[0])
			qty = int(it[1]) if it.size() > 1 else 1
		elif it is Dictionary:
			did = str(it.get("defId", ""))
			qty = int(it.get("qty", 1))
		else:
			did = str(it)
		var nm: String = main.defs["items"].get(did, {}).get("name", did)
		parts.append(("%d× %s" % [qty, nm]) if qty > 1 else nm)
	if int(rw.get("skillRank", 0)) > 0:
		parts.append("+%d grau em habilidade" % int(rw["skillRank"]))
	return ", ".join(parts)
