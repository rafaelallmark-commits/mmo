extends Node
## Navegação do cliente (docs/07-navegacao.md):
## Título → Entrar → Personagens ⇄ Criação → Carregando → Mundo (+ menu de pausa e opções).
## Guarda o estado recebido do servidor (definições, ficha, diário, grupo).
## Argumentos (após "--"): --server=ws://host:7777 --account=x --password=y --autotest --navshots=pasta --sceneshots=pasta ...

const WorldScript = preload("res://scripts/world.gd")
const HudScript = preload("res://scripts/hud.gd")
const MenuScene = preload("res://scripts/menu_scene.gd")
const Theme_ = preload("res://scripts/ui_theme.gd")

const SETTINGS_PATH := "user://opcoes.cfg"
const TIPS := [
	"Passe o mouse num item: o que estiver em vermelho você ainda não tem.",
	"Monstros acima do seu nível dão mais XP — e batem mais forte.",
	"Em grupo, cura, proteção e controle também rendem XP.",
	"Caiu? Você volta ao posto de guarda com metade da vida. Nada se perde.",
	"Cães de Ferrugem chamam os vizinhos quando você bate em um.",
	"O mestre da sua classe ensina a ler os requisitos dos itens.",
]

var _kicked_reason := ""  # motivo da última expulsão (mostrado no lugar do aviso genérico de queda)
var _transfer := {}         # várias zonas: transferência em curso { url, token, mapId }
var _after_login_note := "" # aviso mostrado na lista de personagens depois de refazer o login
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
var chars_cache := []
var classes_cache := []
var settings := {"camera_sensitivity": 1.0, "show_names": true, "ui_scale": 1.0}
var snap_cache := {}   # entidades conhecidas (snapshots por diferença do servidor)
const PROTOCOL := 3    # versão do protocolo que este cliente fala (o servidor manda no "hello")
var server_hello := {}
var _hello_waiters: Array = []
var accounts_url := ""  # serviço de contas (teste público); vazio = deduzido do endereço do servidor
var state := "title"

var ui: CanvasLayer
var screen: Control
var status_label: Label
var world: Node3D
var hud: CanvasLayer
var menu_scene: Node3D
var pause_menu: Control
var options_panel: Control
var loading: Control
var autotest = null

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var s: String = a.trim_prefix("--")
		var kv := s.split("=", true, 1)
		args[kv[0]] = kv[1] if kv.size() > 1 else "true"
	# endereço padrão do campo "Servidor": a release do teste público grava cinzas/servidor_padrao no projeto
	server_url = str(ProjectSettings.get_setting("cinzas/servidor_padrao", server_url))
	server_url = args.get("server", server_url)
	accounts_url = args.get("accounts", accounts_url)
	account = args.get("account", "")
	password = args.get("password", "")
	_load_settings()
	Net.connected.connect(_on_connected)
	Net.disconnected.connect(_on_disconnected)
	Net.message.connect(_on_message)
	ui = CanvasLayer.new()
	ui.layer = 10
	add_child(ui)
	if args.has("faceprobe"):
		var fp = preload("res://scripts/face_probe.gd").new()
		add_child(fp)
		fp.start(args["faceprobe"])
		return
	if args.has("lightprobe"):
		var lp = preload("res://scripts/light_probe.gd").new()
		add_child(lp)
		lp.start()
		return
	if args.has("vrmprobe"):
		var vp = preload("res://scripts/vrm_probe.gd").new()
		add_child(vp)
		vp.start(args["vrmprobe"])
		return
	if args.has("gallery"):
		var g = preload("res://scripts/gallery.gd").new()
		add_child(g)
		g.start(args["gallery"])
		return
	if args.has("poseprobe"):
		var pp = preload("res://scripts/pose_probe.gd").new()
		add_child(pp)
		pp.start(args["poseprobe"], args.get("only", ""), int(args.get("focus", "-1")), int(args.get("group", "0")))
		return
	if args.has("sceneshots"):
		autotest = preload("res://scripts/autotest.gd").new()
		add_child(autotest)
		autotest.start_scene(self)
		return
	if args.has("autotest") and not args.has("navshots"):
		autotest = preload("res://scripts/autotest.gd").new()
		add_child(autotest)
		autotest.start(self)
		return
	_ensure_menu_scene()
	show_title()
	if args.has("navshots"):
		autotest = preload("res://scripts/autotest.gd").new()
		add_child(autotest)
		autotest.start_nav(self)

# ---------------- opções ----------------
func _load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) == OK:
		for k in settings.keys():
			settings[k] = cfg.get_value("opcoes", k, settings[k])
	_apply_settings()

func _save_settings() -> void:
	var cfg := ConfigFile.new()
	for k in settings.keys():
		cfg.set_value("opcoes", k, settings[k])
	cfg.save(SETTINGS_PATH)
	_apply_settings()

func _apply_settings() -> void:
	get_tree().root.content_scale_factor = float(settings["ui_scale"])

# ---------------- utilidades de tela ----------------
func _ensure_menu_scene() -> void:
	if menu_scene == null:
		menu_scene = MenuScene.new()
		add_child(menu_scene)

func _clear_screen() -> void:
	if screen:
		screen.queue_free()
		screen = null
	status_label = null

## Tela de menu: fundo 3D visível, painel com título do jogo e subtítulo.
func _menu_panel(subtitle: String, align := "center", width := 420.0) -> VBoxContainer:
	_clear_screen()
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	screen = root
	ui.add_child(root)
	var shade := ColorRect.new()
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.color = Color(0.05, 0.03, 0.06, 0.25)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(shade)
	var holder: Container
	if align == "center":
		holder = CenterContainer.new()
		holder.set_anchors_preset(Control.PRESET_FULL_RECT)
	else:
		holder = MarginContainer.new()
		holder.set_anchors_preset(Control.PRESET_LEFT_WIDE if align == "left" else Control.PRESET_RIGHT_WIDE)
		holder.add_theme_constant_override("margin_left", 40)
		holder.add_theme_constant_override("margin_right", 40)
		holder.add_theme_constant_override("margin_top", 40)
		holder.add_theme_constant_override("margin_bottom", 40)
		if align == "right":
			holder.offset_left = -width - 80
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(holder)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Theme_.panel_style(0.88))
	holder.add_child(panel)
	var box := VBoxContainer.new()
	box.custom_minimum_size = Vector2(width, 0)
	box.add_theme_constant_override("separation", 10)
	panel.add_child(box)
	var t := Label.new()
	t.text = "CINZAS DO MERIDIANO"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 26)
	t.add_theme_color_override("font_color", Theme_.AMBER)
	t.add_theme_color_override("font_outline_color", Color("#2a1810"))
	t.add_theme_constant_override("outline_size", 6)
	box.add_child(t)
	var sub := Label.new()
	sub.text = subtitle
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_color_override("font_color", Theme_.MUTED)
	box.add_child(sub)
	return box

func _button(box: Container, text: String, cb: Callable, primary := false) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 38)
	b.add_theme_stylebox_override("normal", Theme_.button_style(primary, false))
	b.add_theme_stylebox_override("hover", Theme_.button_style(primary, true))
	b.add_theme_stylebox_override("pressed", Theme_.button_style(primary, true))
	b.pressed.connect(cb)
	box.add_child(b)
	return b

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
	if bad:
		Sfx.ui("ui_error")

# ---------------- TÍTULO ----------------
func show_title() -> void:
	state = "title"
	_ensure_menu_scene()
	menu_scene.set_view("title")
	Sfx.set_mood("title")   # abertura: o primeiro e o segundo toque dos sinos
	_clear_screen()
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	screen = root
	ui.add_child(root)
	var col := VBoxContainer.new()
	col.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	col.position = Vector2(70, -150)
	col.add_theme_constant_override("separation", 12)
	root.add_child(col)
	var t := Label.new()
	t.text = "CINZAS DO\nMERIDIANO"
	t.add_theme_font_size_override("font_size", 56)
	t.add_theme_color_override("font_color", Color("#ffd9a0"))
	t.add_theme_color_override("font_outline_color", Color("#3a1a10"))
	t.add_theme_constant_override("outline_size", 14)
	col.add_child(t)
	var sub := Label.new()
	sub.text = "Os sinos voltaram a tocar debaixo da terra."
	sub.add_theme_color_override("font_color", Color("#fff2dc"))
	sub.add_theme_color_override("font_outline_color", Color("#3a1a10"))
	sub.add_theme_constant_override("outline_size", 6)
	col.add_child(sub)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 18)
	col.add_child(gap)
	var btns := VBoxContainer.new()
	btns.custom_minimum_size = Vector2(240, 0)
	btns.add_theme_constant_override("separation", 8)
	col.add_child(btns)
	_button(btns, "Jogar", show_login, true)
	_button(btns, "Opções", show_options)
	_button(btns, "Sair", func(): get_tree().quit())
	var cred := Label.new()
	cred.text = "Personagens: Seed-san © VirtualCast, Inc. · amostra VRM © 2022 pixiv Inc. (VRM Public License 1.0)"
	cred.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	cred.position = Vector2(20, -34)
	cred.add_theme_font_size_override("font_size", 12)
	cred.add_theme_color_override("font_color", Color(1, 1, 1, 0.65))
	root.add_child(cred)
	var ver := Label.new()
	ver.text = "Teste público · protocolo %d" % PROTOCOL
	ver.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	ver.position = Vector2(-170, -34)
	ver.add_theme_color_override("font_color", Color(1, 1, 1, 0.6))
	root.add_child(ver)

# ---------------- ENTRAR ----------------
var _pending_register := false

func show_login() -> void:
	state = "login"
	_ensure_menu_scene()
	menu_scene.set_view("login")
	var box := _menu_panel("Entrar")
	var e_url := _field(box, "Servidor", server_url)
	var e_acc := _field(box, "Conta", account)
	var e_pass := _field(box, "Senha", password, true)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	box.add_child(row)
	var b1 := _button(row, "Entrar", func():
		server_url = e_url.text.strip_edges(); account = e_acc.text.strip_edges(); password = e_pass.text
		connect_and_login(false), true)
	b1.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var b2 := _button(row, "Criar conta", func():
		server_url = e_url.text.strip_edges(); account = e_acc.text.strip_edges(); password = e_pass.text
		connect_and_login(true))
	b2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_button(box, "Esqueci a senha", func():
		server_url = e_url.text.strip_edges()
		show_forgot_accounts())
	_button(box, "Voltar", func():
		Net.close()
		show_title())
	_status(box)
	e_pass.text_submitted.connect(func(_t): b1.pressed.emit())

func connect_and_login(register: bool) -> void:
	_pending_register = register
	_kicked_reason = ""
	server_hello = {}
	set_status("Conectando a %s..." % server_url)
	if Net.is_open():
		_after_connect()
	else:
		Net.connect_to(server_url)

func _on_connected() -> void:
	if not _transfer.is_empty():
		_send_transfer()  # chegada na outra zona (várias zonas)
		return
	if autotest != null and not reconnecting and not args.has("navshots"):
		return
	_after_connect()

func _after_connect() -> void:
	if _pending_register:
		_pending_register = false
		_when_hello(func():
			if str(server_hello.get("auth", "both")) == "token":
				show_register_accounts()
				return
			Net.request("register", {"account": account, "password": password}, func(r):
				if not r["ok"] and r.get("code", "") != "account_exists":
					set_status(r["reason"], true)
					return
				_login()))
	else:
		_login()

# ---------------- CONTA (serviço de contas do teste público) ----------------
func show_register_accounts() -> void:
	state = "login"
	var box := _menu_panel("Criar conta")
	var e_acc := _field(box, "Conta", account)
	var e_mail := _field(box, "E-mail", "")
	var e_pass := _field(box, "Senha (8 ou mais caracteres)", password, true)
	# aceite dos termos (o serviço de contas recusa o cadastro sem ele)
	var agree := CheckBox.new()
	agree.text = "Tenho 13 anos ou mais e aceito os Termos de Uso e a Política de Privacidade"
	agree.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	agree.custom_minimum_size = Vector2(360, 0)
	box.add_child(agree)
	var links := HBoxContainer.new()
	box.add_child(links)
	for spec in [["Ler os Termos de Uso", "/termos"], ["Ler a Política de Privacidade", "/privacidade"]]:
		var lb := LinkButton.new()
		lb.text = spec[0]
		var path: String = spec[1]
		lb.pressed.connect(func(): OS.shell_open(_accounts_base() + path))
		links.add_child(lb)
	_button(box, "Criar e receber o código", func():
		if not agree.button_pressed:
			set_status("Para criar a conta, marque a confirmação de idade e de aceite dos termos.", true)
			return
		account = e_acc.text.strip_edges(); password = e_pass.text
		_accounts_post("/contas", {"conta": account, "email": e_mail.text.strip_edges(), "senha": password, "aceite": true}, func(ok: bool, b: Dictionary):
			if ok:
				show_verify_accounts(str(b.get("mensagem", "")))
			else:
				set_status(str(b.get("erro", "Não foi possível criar a conta.")), true)), true)
	_button(box, "Voltar", show_login)
	_status(box)

func show_verify_accounts(msg := "") -> void:
	var box := _menu_panel("Confirmar e-mail")
	var info := Label.new()
	info.text = msg if msg != "" else "Digite o código de 6 dígitos que enviamos para o seu e-mail."
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(info)
	var e_code := _field(box, "Código", "")
	_button(box, "Confirmar", func():
		_accounts_post("/contas/verificar", {"conta": account, "codigo": e_code.text.strip_edges()}, func(ok: bool, b: Dictionary):
			if ok:
				show_login()
				set_status(str(b.get("mensagem", "Conta confirmada.")))
			else:
				set_status(str(b.get("erro", "Código incorreto.")), true)), true)
	_button(box, "Reenviar código", func():
		_accounts_post("/contas/reenviar", {"conta": account}, func(_ok: bool, b: Dictionary):
			set_status(str(b.get("mensagem", "Pedido enviado.")))))
	_button(box, "Voltar", show_login)
	_status(box)

func show_forgot_accounts() -> void:
	var box := _menu_panel("Esqueci a senha")
	var e_mail := _field(box, "E-mail", "")
	_button(box, "Enviar código", func():
		_accounts_post("/senha/esqueci", {"email": e_mail.text.strip_edges()}, func(_ok: bool, b: Dictionary):
			set_status(str(b.get("mensagem", "Se o e-mail tiver conta, enviamos um código.")))), true)
	var e_code := _field(box, "Código", "")
	var e_new := _field(box, "Nova senha", "", true)
	_button(box, "Trocar a senha", func():
		_accounts_post("/senha/redefinir", {"email": e_mail.text.strip_edges(), "codigo": e_code.text.strip_edges(), "senha": e_new.text}, func(ok: bool, b: Dictionary):
			if ok:
				show_login()
				set_status("Senha trocada. Entre com a nova senha.")
			else:
				set_status(str(b.get("erro", "Não foi possível trocar a senha.")), true)))
	_button(box, "Voltar", show_login)
	_status(box)

## Exclusão da própria conta (privacidade), confirmada com a senha.
func show_delete_account() -> void:
	var box := _menu_panel("Excluir conta")
	var warn := Label.new()
	warn.text = "Isto apaga a conta %s, os personagens, os itens e o e-mail. Não dá para desfazer." % account
	warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	warn.add_theme_color_override("font_color", Color("#ff8a7a"))
	box.add_child(warn)
	var e_pass := _field(box, "Senha", "", true)
	_button(box, "Excluir para sempre", func():
		Net.request("delete_account", {"password": e_pass.text}, func(r):
			if r["ok"]:
				account = ""; password = ""
				show_title()
			else:
				set_status(r["reason"], true)))
	_button(box, "Cancelar", func(): show_chars())
	_status(box)

## Espera o "hello" do servidor (versão e modo de login) antes de seguir.
func _when_hello(cb: Callable) -> void:
	if not server_hello.is_empty():
		cb.call()
	else:
		_hello_waiters.append(cb)

func _login() -> void:
	_when_hello(func():
		if str(server_hello.get("auth", "both")) == "token":
			_login_with_accounts()
		else:
			Net.request("login", {"account": account, "password": password, "delta": true}, _on_login))

## Teste público: conta e senha vão ao serviço de contas, que devolve um token de uso único para a zona.
func _login_with_accounts() -> void:
	set_status("Entrando pelo serviço de contas...")
	_accounts_post("/sessoes", {"conta": account, "senha": password}, func(ok: bool, body: Dictionary):
		if not ok:
			set_status(str(body.get("erro", "Não foi possível entrar.")), true)
			return
		Net.request("login_token", {"token": body["token"], "delta": true}, _on_login))

func _accounts_base() -> String:
	if accounts_url != "":
		return accounts_url.trim_suffix("/")
	var u := server_url
	var host := u.get_slice("://", 1).get_slice("/", 0).get_slice(":", 0)
	if u.begins_with("wss://"):
		return "https://%s/contas" % host
	return "http://%s:7780" % host

func _accounts_post(path: String, body: Dictionary, cb: Callable) -> void:
	var http := HTTPRequest.new()
	add_child(http)
	http.timeout = 15.0
	http.request_completed.connect(func(result: int, code: int, _h: PackedStringArray, raw: PackedByteArray):
		http.queue_free()
		var data = JSON.parse_string(raw.get_string_from_utf8()) if raw.size() > 0 else null
		var d: Dictionary = data if data is Dictionary else {}
		if result != HTTPRequest.RESULT_SUCCESS:
			d = {"erro": "Serviço de contas indisponível (%s)." % _accounts_base()}
		cb.call(result == HTTPRequest.RESULT_SUCCESS and code >= 200 and code < 300 and d.get("ok", false), d))
	var err := http.request(_accounts_base() + path, ["Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify(body))
	if err != OK:
		http.queue_free()
		cb.call(false, {"erro": "Não foi possível falar com o serviço de contas."})

func _on_login(r: Dictionary) -> void:
	if not r["ok"]:
		set_status(r["reason"], true)
		return
	chars_cache = r["chars"]
	classes_cache = r["classes"]
	if reconnecting and char_id >= 0 and state == "world":
		enter_world(char_id)
	else:
		reconnecting = false
		show_chars()
		if _after_login_note != "":
			set_status(_after_login_note, true)
			_after_login_note = ""

# ---------------- PERSONAGENS ----------------
var _selected_char := -1

func show_chars(select_id := -1) -> void:
	state = "chars"
	_ensure_menu_scene()
	menu_scene.set_view("chars")
	var box := _menu_panel("Personagens de %s" % account, "left", 340)
	if chars_cache.is_empty():
		var l := Label.new()
		l.text = "Nenhum personagem ainda.\nCrie um voluntário das caravanas."
		l.add_theme_color_override("font_color", Theme_.MUTED)
		box.add_child(l)
	if select_id < 0 and not chars_cache.is_empty():
		select_id = int(chars_cache[0]["id"])
	_selected_char = select_id
	for c in chars_cache:
		var cid := int(c["id"])
		var cls_name: String = defs.get("classes", {}).get(c["classId"], {}).get("name", c["classId"])
		var map_name: String = defs.get("maps", {}).get(c.get("mapId", ""), {}).get("name", "")
		var b := _button(box, "%s\n%s · nível %d · %s" % [c["name"], cls_name, int(c["level"]), map_name], func(): show_chars(cid), cid == select_id)
		b.custom_minimum_size = Vector2(0, 54)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		if cid == select_id:
			menu_scene.show_character(c["classId"], _kit_weapon_family(c["classId"]))
	box.add_child(HSeparator.new())
	if _selected_char >= 0:
		_button(box, "Jogar", func(): enter_world(_selected_char), true)
	if chars_cache.size() < 4:
		_button(box, "Criar novo personagem", show_create)
	_button(box, "Excluir conta", show_delete_account)
	_button(box, "Voltar", func():
		Net.close()
		show_login())
	_status(box)

func _kit_weapon_family(class_id: String) -> String:
	var kit: Dictionary = defs.get("classes", {}).get(class_id, {}).get("startingKit", {})
	for id in kit.get("equip", []):
		var d: Dictionary = defs["items"].get(id, {})
		if d.get("slot", "") == "weapon":
			return d.get("family", "")
	return ""

# ---------------- CRIAÇÃO ----------------
var _create_class := ""

func show_create() -> void:
	state = "create"
	menu_scene.set_view("create")
	if _create_class == "" and not classes_cache.is_empty():
		_create_class = classes_cache[0]["id"]
	_build_create()

func _build_create(name_text := "") -> void:
	var box := _menu_panel("Novo voluntário das caravanas", "left", 380)
	for origin in ["amber", "nacre"]:
		var ol := Label.new()
		var od: Dictionary = defs.get("origins", {}).get(origin, {})
		ol.text = "%s — %s" % [od.get("name", origin), od.get("city", "")]
		ol.add_theme_color_override("font_color", Theme_.AMBER if origin == "amber" else Theme_.NACRE)
		box.add_child(ol)
		var grid := GridContainer.new()
		grid.columns = 2
		grid.add_theme_constant_override("h_separation", 6)
		grid.add_theme_constant_override("v_separation", 6)
		box.add_child(grid)
		for c in classes_cache:
			if c["origin"] != origin:
				continue
			var cid: String = c["id"]
			var b := _button(grid, c["name"], func():
				_create_class = cid
				_build_create(_name_edit_text()), cid == _create_class)
			b.custom_minimum_size = Vector2(184, 36)
	var cls: Dictionary = defs.get("classes", {}).get(_create_class, {})
	menu_scene.show_character(_create_class, _kit_weapon_family(_create_class))
	var info := Label.new()
	var fams := []
	for f in cls.get("weaponFamilies", []):
		fams.append(defs.get("families", {}).get(f, f))
	info.text = "%s\nArmas: %s" % [cls.get("role", ""), ", ".join(fams)]
	info.autowrap_mode = TextServer.AUTOWRAP_WORD
	info.custom_minimum_size = Vector2(370, 0)
	info.add_theme_color_override("font_color", Theme_.TEXT)
	box.add_child(info)
	var e_name := _field(box, "Nome", name_text if name_text != "" else args.get("name", ""))
	e_name.name = "NameEdit"
	_button(box, "Criar personagem", func():
		Net.request("create_char", {"name": e_name.text.strip_edges(), "classId": _create_class}, func(r):
			if not r["ok"]:
				set_status(r["reason"], true)
				return
			Net.request("list_chars", {}, func(r2):
				chars_cache = r2["chars"]
				show_chars(int(r["char"]["id"])))), true)
	_button(box, "Voltar", func(): show_chars(_selected_char))
	_status(box)

func _name_edit_text() -> String:
	if screen == null:
		return ""
	var e = screen.find_child("NameEdit", true, false)
	return e.text if e else ""

# ---------------- CARREGANDO ----------------
func show_loading(map_name: String) -> void:
	hide_loading()
	loading = ColorRect.new()
	loading.color = Color("#17121a")
	loading.set_anchors_preset(Control.PRESET_FULL_RECT)
	ui.add_child(loading)
	var c := CenterContainer.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	loading.add_child(c)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	c.add_child(v)
	var t := Label.new()
	t.text = map_name
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 40)
	t.add_theme_color_override("font_color", Color("#ffd9a0"))
	v.add_child(t)
	var tip := Label.new()
	tip.text = TIPS[randi() % TIPS.size()]
	tip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tip.add_theme_color_override("font_color", Theme_.MUTED)
	v.add_child(tip)
	var bar := ProgressBar.new()
	bar.custom_minimum_size = Vector2(420, 8)
	bar.show_percentage = false
	bar.add_theme_stylebox_override("fill", Theme_.bar_style(Theme_.AMBER))
	bar.add_theme_stylebox_override("background", Theme_.bar_bg())
	v.add_child(bar)
	var tw := create_tween()
	tw.tween_property(bar, "value", 100.0, 0.6)

func hide_loading(delay := 0.0) -> void:
	if loading == null:
		return
	var l := loading
	loading = null
	if delay <= 0.0:
		l.queue_free()
	else:
		var tw := create_tween()
		tw.tween_interval(delay)
		tw.tween_property(l, "modulate:a", 0.0, 0.3)
		tw.tween_callback(l.queue_free)

# ---------------- MUNDO ----------------
func enter_world(cid: int) -> void:
	char_id = cid
	var row: Dictionary = {}
	for c in chars_cache:
		if int(c["id"]) == cid:
			row = c
	show_loading(defs.get("maps", {}).get(row.get("mapId", "estrada_velha"), {}).get("name", "Cinzas do Meridiano"))
	Net.request("enter", {"charId": cid}, func(r):
		if not r["ok"]:
			hide_loading()
			set_status(r["reason"], true)
			return
		if r.get("transfer") is Dictionary:
			# várias zonas: o mapa salvo é de outra zona; a conexão segue para lá
			_follow_transfer(r["transfer"])
			return
		_enter_ok(r))

## Chegada ao mundo (resposta do "enter" ou do "login_transfer"): mundo novo, ficha, snapshot, saques e
## diário. A interface (chat, painéis) e as opções continuam as mesmas.
func _enter_ok(r: Dictionary) -> void:
	reconnecting = false
	state = "world"
	_clear_screen()
	if menu_scene:
		menu_scene.queue_free()
		menu_scene = null
	map_id = r["char"].get("mapId", "estrada_velha")
	_rebuild_world()
	Sfx.set_zone(map_id)
	if hud == null:
		hud = HudScript.new()
		hud.main = self
		add_child(hud)
	hud.visible = true
	set_char(r["char"])
	snap_cache = {}
	world.apply_snapshot(r["snapshot"])
	for l in r["loot"]:
		world.add_loot(l)
	journal = r.get("journal", {})
	hud.refresh_quests()
	hud.hide_disconnect()
	if r.get("restoredFromDeath", false):
		hud.system("Você voltou ao posto de guarda depois de cair.")
	hud.system("Local: %s." % map_def().get("name", "?"))
	in_world = true
	hide_loading(0.5)

## Várias zonas: o personagem vai para um mapa de outra zona (resposta do "enter" ou mensagem "transfer"
## ao cruzar um portal). Tela Carregando, conexão nova no endereço recebido e "login_transfer"; a chegada
## segue pelo mesmo caminho do "enter".
func _follow_transfer(tr: Dictionary) -> void:
	_transfer = tr.duplicate()
	in_world = false
	_kicked_reason = ""
	var dest: String = defs.get("maps", {}).get(str(tr.get("mapId", "")), {}).get("name", "Cinzas do Meridiano")
	show_loading(dest)
	Sfx.ui("portal")
	server_hello = {}
	_hello_waiters.clear()
	Net.close()
	Net.connect_to(str(tr.get("url", "")))
	var token := str(tr.get("token", ""))
	get_tree().create_timer(20.0).timeout.connect(func():
		if not _transfer.is_empty() and str(_transfer.get("token", "")) == token:
			_transfer_failed("a outra área não respondeu."))

func _send_transfer() -> void:
	var token := str(_transfer.get("token", ""))
	_when_hello(func():
		if str(_transfer.get("token", "")) != token:
			return
		Net.request("login_transfer", {"token": token, "delta": true}, func(r):
			if str(_transfer.get("token", "")) != token:
				return
			_transfer = {}
			if not r["ok"]:
				_transfer_failed(str(r.get("reason", "transferência recusada.")))
				return
			_enter_ok(r)))

## A transferência falhou: volta para a lista de personagens (login refeito pelo servidor de entrada)
## mostrando o motivo.
func _transfer_failed(reason: String) -> void:
	_transfer = {}
	var msg := "Não foi possível entrar na outra área: %s" % reason
	if autotest != null and autotest.has_method("transfer_failed"):
		autotest.transfer_failed(msg)
		return
	_after_login_note = msg
	leave_world(false)

## Snapshot por diferença → estado completo: "full" recomeça o conjunto, cada entrada traz os grupos
## de campos que mudaram, "gone" lista quem saiu do raio de interesse. "_u" marca quem foi
## atualizado neste snapshot (os demais não recebem amostra nova de movimento).
func _merge_snap(m: Dictionary) -> Dictionary:
	if int(m.get("full", 0)) == 1:
		snap_cache = {}
	var now := float(m.get("now", 0))
	var updated := {}
	for d in m.get("ents", []):
		var eid: String = d["id"]
		var e: Dictionary = snap_cache.get(eid, {})
		for k in d.keys():
			e[k] = d[k]
		if d.has("x"):
			# base da previsão por velocidade (o servidor faz a mesma conta para decidir quando corrigir)
			e["_px"] = float(d["x"])
			e["_pz"] = float(d["z"])
			e["_pt"] = now
		snap_cache[eid] = e
		updated[eid] = true
	for eid in m.get("gone", []):
		snap_cache.erase(eid)
	var ents := []
	for eid in snap_cache.keys():
		var e: Dictionary = snap_cache[eid]
		var moving: bool = float(e.get("vx", 0.0)) != 0.0 or float(e.get("vz", 0.0)) != 0.0
		if not updated.has(eid) and moving and e.has("_pt"):
			var dts: float = (now - float(e["_pt"])) / 1000.0
			e["x"] = float(e["_px"]) + float(e["vx"]) * dts
			e["z"] = float(e["_pz"]) + float(e["vz"]) * dts
		e["_u"] = updated.has(eid) or moving
		ents.append(e)
	return {"t": "snap", "now": m.get("now", 0), "map": m.get("map", ""), "ents": ents}

func map_def() -> Dictionary:
	return defs.get("maps", {}).get(map_id, defs.get("map", {}))

func _rebuild_world() -> void:
	if world != null:
		world.queue_free()
	world = WorldScript.new()
	world.main = self
	add_child(world)

## Troca de zona (portal, prova de classe): tela Carregando + mundo novo.
func _on_zone(m: Dictionary) -> void:
	map_id = m["mapId"]
	snap_cache = {}
	show_loading(map_def().get("name", map_id))
	Sfx.ui("portal")
	_rebuild_world()
	Sfx.set_zone(map_id)
	set_char(m["char"])
	world.apply_snapshot(m["snapshot"])
	for l in m.get("loot", []):
		world.add_loot(l)
	hud.system("Local: %s." % map_def().get("name", map_id))
	hide_loading(0.4)

## Sai do mundo e volta para Personagens (login refeito) ou para o Título.
func leave_world(to_title: bool) -> void:
	in_world = false
	state = "leaving"
	close_pause_menu()
	if world:
		world.queue_free()
		world = null
	if hud:
		hud.queue_free()
		hud = null
	party = null
	journal = {}
	Net.close()
	Sfx.set_zone("")
	Sfx.set_mood("title")
	_ensure_menu_scene()
	if to_title:
		show_title()
	else:
		show_loading("Personagens")
		_pending_register = false
		state = "login"
		Net.connect_to(server_url)
		get_tree().create_timer(0.3).timeout.connect(func(): hide_loading(0.2))

func set_char(c: Dictionary) -> void:
	ch = c
	if hud:
		hud.refresh_char()
		if c.get("dead", false):
			hud.show_death()

# ---------------- menu de pausa e opções ----------------
func menu_open() -> bool:
	return pause_menu != null or options_panel != null

func toggle_pause_menu() -> void:
	if pause_menu:
		close_pause_menu()
		return
	Sfx.ui("ui_open")
	pause_menu = ColorRect.new()
	pause_menu.color = Color(0.04, 0.02, 0.05, 0.55)
	pause_menu.set_anchors_preset(Control.PRESET_FULL_RECT)
	ui.add_child(pause_menu)
	var c := CenterContainer.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_menu.add_child(c)
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", Theme_.panel_style())
	c.add_child(p)
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(300, 0)
	v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	var t := Label.new()
	t.text = "Menu"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	t.add_theme_font_size_override("font_size", 22)
	t.add_theme_color_override("font_color", Theme_.AMBER)
	v.add_child(t)
	_button(v, "Continuar", close_pause_menu, true)
	_button(v, "Opções", show_options)
	_button(v, "Trocar de personagem", func(): leave_world(false))
	_button(v, "Sair para o título", func(): leave_world(true))
	_button(v, "Sair do jogo", func(): get_tree().quit())
	var note := Label.new()
	note.text = "O jogo é online: o mundo continua enquanto este menu está aberto."
	note.autowrap_mode = TextServer.AUTOWRAP_WORD
	note.add_theme_font_size_override("font_size", 11)
	note.add_theme_color_override("font_color", Theme_.MUTED)
	v.add_child(note)

func close_pause_menu() -> void:
	if pause_menu:
		pause_menu.queue_free()
		pause_menu = null
		Sfx.ui("ui_close")

func show_options() -> void:
	if options_panel:
		return
	options_panel = ColorRect.new()
	options_panel.color = Color(0.04, 0.02, 0.05, 0.4)
	options_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	ui.add_child(options_panel)
	var c := CenterContainer.new()
	c.set_anchors_preset(Control.PRESET_FULL_RECT)
	options_panel.add_child(c)
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", Theme_.panel_style())
	c.add_child(p)
	var v := VBoxContainer.new()
	v.custom_minimum_size = Vector2(360, 0)
	v.add_theme_constant_override("separation", 8)
	p.add_child(v)
	var t := Label.new()
	t.text = "Opções"
	t.add_theme_font_size_override("font_size", 22)
	t.add_theme_color_override("font_color", Theme_.AMBER)
	v.add_child(t)
	var sens_l := Label.new()
	sens_l.text = "Sensibilidade da câmera"
	v.add_child(sens_l)
	var sens := HSlider.new()
	sens.min_value = 0.3
	sens.max_value = 2.0
	sens.step = 0.1
	sens.value = float(settings["camera_sensitivity"])
	sens.value_changed.connect(func(x): settings["camera_sensitivity"] = x)
	v.add_child(sens)
	var sc_l := Label.new()
	sc_l.text = "Escala da interface"
	v.add_child(sc_l)
	var sc := HSlider.new()
	sc.min_value = 0.8
	sc.max_value = 1.5
	sc.step = 0.05
	sc.value = float(settings["ui_scale"])
	sc.value_changed.connect(func(x): settings["ui_scale"] = x)
	v.add_child(sc)
	var names := CheckBox.new()
	names.text = "Mostrar nomes e vida acima de todos"
	names.button_pressed = bool(settings["show_names"])
	names.toggled.connect(func(on): settings["show_names"] = on)
	v.add_child(names)
	_sound_sliders(v)
	_button(v, "Salvar e fechar", func():
		_save_settings()
		close_options(), true)
	Sfx.ui("ui_open")

## Som: volume geral, da música e dos efeitos (valem na hora; salvos em user://settings.cfg).
func _sound_sliders(v: VBoxContainer) -> void:
	var t := Label.new()
	t.text = "Som"
	t.add_theme_color_override("font_color", Theme_.AMBER)
	v.add_child(t)
	for row in [["master", "Geral"], ["music", "Música"], ["sfx", "Efeitos"]]:
		var kind: String = row[0]
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 8)
		v.add_child(h)
		var l := Label.new()
		l.text = row[1]
		l.custom_minimum_size = Vector2(70, 0)
		h.add_child(l)
		var s := HSlider.new()
		s.min_value = 0.0
		s.max_value = 1.0
		s.step = 0.05
		s.value = Sfx.get_volume(kind)
		s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		s.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		h.add_child(s)
		var pct := Label.new()
		pct.text = "%d%%" % roundi(s.value * 100.0)
		pct.custom_minimum_size = Vector2(44, 0)
		pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		pct.add_theme_color_override("font_color", Theme_.MUTED)
		h.add_child(pct)
		s.value_changed.connect(func(x: float):
			Sfx.set_volume(kind, x)
			pct.text = "%d%%" % roundi(x * 100.0))
		if kind != "music":
			# amostra do volume novo ao soltar o controle
			s.drag_ended.connect(func(_changed: bool): Sfx.ui("loot_coins"))

func close_options() -> void:
	if options_panel:
		options_panel.queue_free()
		options_panel = null
		Sfx.save_settings()
		Sfx.ui("ui_close")

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and (event as InputEventKey).keycode == KEY_ESCAPE:
		if options_panel:
			close_options()
		elif state == "world" and in_world:
			if hud and hud.close_top_panel():
				pass
			else:
				toggle_pause_menu()
		elif state == "create":
			show_chars(_selected_char)
		elif state in ["login"]:
			show_title()
		get_viewport().set_input_as_handled()

# ---------------- mensagens ----------------
func _on_message(m: Dictionary) -> void:
	var t: String = m.get("t", "")
	match t:
		"hello":
			server_hello = m
			if int(m.get("protocol", 0)) != PROTOCOL:
				var why := "Versão incompatível: este cliente fala o protocolo %d e o servidor, o %d. Atualize o jogo." % [PROTOCOL, int(m.get("protocol", 0))]
				set_status(why, true)
				Net.close()
				_hello_waiters.clear()
				if not _transfer.is_empty():
					_transfer_failed(why)
				return
			var waiting := _hello_waiters
			_hello_waiters = []
			for cb in waiting:
				(cb as Callable).call()
		"notice":
			# aviso do servidor (ex.: reinício programado)
			if hud and in_world:
				hud.system(str(m.get("text", "")))
				hud._flash(str(m.get("text", "")), Color("#ffcf7a"))
			else:
				set_status(str(m.get("text", "")))
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
			if world and in_world:
				world.apply_snapshot(_merge_snap(m) if m.has("d") else m)
		"channel_end":
			if hud:
				hud.end_channel(m)
		"escort":
			if hud:
				hud.on_escort(m)
		"hit":
			if world:
				world.on_hit(m)
		"heal":
			if world:
				world.on_heal(m)
		"death":
			if world:
				world.on_death(m["eid"])
		"loot":
			if world:
				world.on_loot_drop(m["loot"])
		"xp":
			if hud:
				hud.system("+%d XP" % int(m["gained"]))
		"char":
			set_char(m["char"])
		"level_up":
			if m["eid"] == ch.get("eid", ""):
				Sfx.ui("level_up")   # fanfarra de sinos
				if hud:
					hud.system("Nível %d! Você ganhou pontos de atributo e de habilidade (C)." % int(m["level"]))
			elif world:
				world.sound_at(m["eid"], "level_up", -8.0)
		"chat":
			if hud:
				var ch_name: String = m.get("channel", "zone")
				if ch_name == "party":
					hud.chat_line("[color=#9fd3d1][Grupo] [b]%s:[/b] %s[/color]" % [m["from"], m["text"]])
				elif ch_name == "clan":
					hud.chat_line("[color=#e3a548][%s] [b]%s:[/b] %s[/color]" % [m.get("tag", "Clã"), m["from"], m["text"]])
				elif ch_name == "whisper":
					hud.chat_line("[color=#d7a8ff][%s → %s] %s[/color]" % [m["from"], m.get("to", ""), m["text"]])
				else:
					hud.chat_line("[b]%s:[/b] %s" % [m["from"], m["text"]])
		"joined":
			if hud:
				hud.chat_line("[color=#9a927f]%s entrou.[/color]" % m["name"])
		"zone":
			_on_zone(m)
		"transfer":
			# várias zonas: o portal (ou teleporte) leva a um mapa de outra zona
			_follow_transfer(m)
		"quest_update":
			Net.request("quests", {}, func(r):
				journal = r["journal"]
				if hud:
					hud.refresh_quests())
			for q in m["quests"]:
				if q.get("ready", false):
					Sfx.ui("quest_done", -6.0)   # objetivos completos: hora de entregar
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
		"trade_invite", "trade", "trade_done", "trade_closed", "clan_invite", "clan_event", "duel_invite", "duel", "duel_start", "duel_end":
			if hud and hud.social:
				hud.social.on_message(m)
		"trial":
			match m["state"]:
				"started":
					Sfx.warn("line")
				"wave":
					Sfx.warn("valve")
				"success":
					Sfx.ui("quest_done")
				"failed":
					Sfx.ui("refine_fail")
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
		"system":
			if hud:
				hud.system(m["text"])
		"player_dead":
			if m["eid"] == ch.get("eid", ""):
				Sfx.ui("player_die")
				if hud:
					ch["dead"] = true
					hud.show_death()
			elif world:
				world.sound_at(m["eid"], "player_die", -8.0)
		"respawn":
			if hud and m["eid"] == ch.get("eid", ""):
				hud.hide_death()
				Sfx.ui("heal_chime" if m.get("revived", false) else "portal")
		"ground":
			if world:
				world.ground_effect(m)
		"cast":
			if world and world.vfx:
				world.vfx.on_cast(m)
		"buff":
			if world and world.vfx:
				world.vfx.on_buff(m)
		"shield":
			if world and world.vfx:
				world.vfx.on_shield(m)
		"warn":
			if world and world.vfx:
				world.vfx.on_warn(m)
		"boss":
			if world:
				world.on_boss(m)
			if hud:
				hud.show_boss(m)
		"kicked":
			# o motivo (ex.: suspensão) fica na tela; o fechamento da conexão que vem depois não o troca
			_kicked_reason = str(m.get("reason", "Desconectado."))
			if hud and state == "world":
				hud.show_disconnect(_kicked_reason)
				Sfx.ui("ui_error")
			else:
				set_status(_kicked_reason, true)  # já toca o som de erro
			in_world = false

func _on_disconnected(reason: String) -> void:
	if not _transfer.is_empty():
		_transfer_failed("a conexão caiu (%s)" % reason)
		return
	if _kicked_reason != "":
		return
	if state == "world" and hud:
		hud.show_disconnect(reason)
		in_world = false
		Sfx.ui("ui_error")
	elif status_label:
		set_status("Sem conexão: %s" % reason, true)

func reconnect() -> void:
	reconnecting = true
	_kicked_reason = ""
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
