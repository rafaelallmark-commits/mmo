extends Node
## Teste automático do cliente (roda headless): conecta, cria conta/personagem se preciso,
## entra no mundo pela mesma rotina da interface, anda, ataca um monstro, coleta o saque
## e sai com código 0 em caso de sucesso. Uso:
##   godot --headless --path client -- --autotest --server=ws://127.0.0.1:7777 --account=bot --password=bot123 --class=breaker --name=Robo
## Com --transfer (servidor em várias zonas, --dev): em vez de lutar, atravessa o portal para um mapa de
## outra zona e confere que o cliente reconectou no endereço novo e está no mapa novo.

var main
var step := "connect"
var t0 := 0
var deadline_ms := 150000
var target := ""
var killed := false
var settle_until := 0
var fight_started := 0
var zone_changed := ""
var rescue_i := 0
var wait_until := 0
var log_lines := []
var desc_checked := false
var mech_until := 0
var speed_before := 0.0
# --transfer (várias zonas)
var tr_url := ""
var tr_from := ""
var tr_to := ""
var tr_portal := ""
var tr_hud = null

func say(s: String) -> void:
	print("[autotest] ", s)

func start(m) -> void:
	main = m
	t0 = Time.get_ticks_msec()
	main.account = main.args.get("account", "bot")
	main.password = main.args.get("password", "bot123")
	Net.connected.connect(_connected)
	Net.message.connect(_msg)
	say("conectando a %s" % main.server_url)
	Net.connect_to(main.server_url)

func fail(why: String) -> void:
	say("FALHOU: " + why)
	get_tree().quit(1)

## main.gd avisa quando uma transferência entre zonas falha
func transfer_failed(msg: String) -> void:
	fail(msg)

func _connected() -> void:
	if not main._transfer.is_empty():
		return  # conexão nova de uma transferência (várias zonas): main.gd faz o login_transfer
	# espera o "hello": servidor do teste público (--auth token) entra pelo serviço de contas
	main._when_hello(func():
		if str(main.server_hello.get("auth", "both")) == "token":
			say("servidor pede login por token; usando o serviço de contas em %s" % main._accounts_base())
			main._accounts_post("/sessoes", {"conta": main.account, "senha": main.password}, func(ok: bool, b: Dictionary):
				if not ok:
					fail(str(b.get("erro", "serviço de contas recusou")))
					return
				Net.request("login_token", {"token": b["token"], "delta": true}, _logged))
			return
		Net.request("register", {"account": main.account, "password": main.password}, func(_r):
			Net.request("login", {"account": main.account, "password": main.password, "delta": true}, _logged)))

func _logged(r: Dictionary) -> void:
	if not r["ok"]:
		fail(r["reason"])
		return
	say("login ok; definições recebidas: %d itens, %d classes" % [main.defs["items"].size(), main.defs["classes"].size()])
	if r["chars"].size() > 0:
		_enter(int(r["chars"][0]["id"]))
	else:
		Net.request("create_char", {"name": main.args.get("name", "Robo"), "classId": main.args.get("class", "breaker")}, func(c):
			if not c["ok"]:
				fail(c["reason"])
				return
			say("personagem criado: %s" % c["char"]["name"])
			_enter(int(c["char"]["id"])))

func _enter(cid: int) -> void:
	main.enter_world(cid)
	step = "entering"

func _msg(m: Dictionary) -> void:
	if m.get("t", "") == "death" and m.get("eid", "") == target and target != "":
		killed = true
	if m.get("t", "") == "escort" and m.has("ambush"):
		cap4_ambush = true
	if m.get("t", "") == "party_invite":
		say("convite de grupo recebido de %s; aceitando" % m["from"])
		Net.request("party_accept", {"from": int(m["fromId"])})
	if m.get("t", "") == "zone":
		zone_changed = m["mapId"]

func _process(_d: float) -> void:
	if Time.get_ticks_msec() - t0 > deadline_ms:
		fail("tempo esgotado no passo " + step)
		return
	if step == "nav":
		_nav_tick()
		return
	match step:
		"entering":
			if main.in_world and main.world and not main.world.me().is_empty():
				var c: Dictionary = main.ch
				say("no mundo: %s (%s) nível %d em (%.1f, %.1f); %d entidades visíveis; arma %s" % [c["name"], c["classId"], int(c["level"]), float(c["x"]), float(c["z"]), main.world.entities.size(), c["stats"]["weapon"]])
				if scene_mode:
					step = "scene"
					scene_until = Time.get_ticks_msec() + 2500
					return
				if main.args.has("transfer"):
					step = "tr_prep"
					return
				Net.request("move", {"x": 30.0, "z": 50.0})
				step = "moving"
		"scene":
			_scene_tick()
		"tr_prep":
			# portal da Estrada para o Brejo (ou o contrário, se o personagem já estava lá)
			tr_url = Net.url
			tr_from = main.map_id
			tr_portal = "to_brejo" if tr_from == "estrada_velha" else "to_estrada"
			tr_to = "brejo_bombas" if tr_from == "estrada_velha" else "estrada_velha"
			if not main.world.portal_nodes.has(tr_portal):
				fail("portal %s não existe em %s" % [tr_portal, tr_from])
				return
			var pp: Vector3 = main.world.portal_nodes[tr_portal]["pos"]
			var off := 3.0 if pp.x < 20.0 else -3.0
			step = "tr_wait"
			# nível 5 (exigido no portal do Brejo) e teleporte para perto do portal (servidor --dev)
			Net.request("gm", {"cmd": "xp", "level": 5}, func(_r):
				Net.request("gm", {"cmd": "teleport", "x": pp.x + off, "z": pp.z}, func(r2):
					if not r2["ok"]:
						fail("teleporte recusado: %s" % r2.get("reason", ""))
						return
					wait_until = Time.get_ticks_msec() + 600
					step = "tr_walk"))
		"tr_walk":
			if Time.get_ticks_msec() < wait_until:
				return
			say("em %s (servidor %s); indo ao portal %s, que leva a %s" % [tr_from, tr_url, tr_portal, tr_to])
			tr_hud = main.hud
			_act("portal", tr_portal)
			step = "tr_wait_transfer"
		"tr_wait_transfer":
			if Net.url != tr_url and main.in_world and main.map_id == tr_to and main.world and not main.world.me().is_empty():
				var c: Dictionary = main.ch
				say("transferido: agora em %s pelo servidor %s, em (%.1f, %.1f); %d entidades visíveis" % [main.map_def().get("name", tr_to), Net.url, float(c["x"]), float(c["z"]), main.world.entities.size()])
				if main.hud != tr_hud:
					fail("a interface foi recriada na transferência (chat perdido)")
					return
				var p: Vector3 = main.world.my_pos()
				step = "tr_wait"
				Net.request("move", {"x": p.x + 3.0, "z": p.z}, func(r):
					if not r["ok"]:
						fail("a zona nova recusou o movimento: %s" % r.get("reason", ""))
						return
					say("a zona nova responde (movimento aceito); interface e chat mantidos")
					say("OK")
					get_tree().quit(0))
		"moving":
			var p: Vector3 = main.world.my_pos()
			if Vector2(p.x, p.z).distance_to(Vector2(30, 50)) < 1.0:
				say("chegou em (30, 50) — posição confirmada pelo snapshot do servidor")
				var best := ""
				var bd := 1e9
				for eid in main.world.entities.keys():
					var e: Dictionary = main.world.entities[eid]
					if e["data"]["k"] == "m" and e["data"]["def"] == "furrow_rat":
						var d: float = e["node"].position.distance_to(p)
						if d < bd:
							bd = d
							best = eid
				if best == "":
					fail("nenhum Rato de Sulco visível")
					return
				target = best
				main.world.selected = best
				Net.request("attack", {"target": best})
				say("atacando %s a %.1f m" % [best, bd])
				fight_started = Time.get_ticks_msec()
				step = "fighting"
		"fighting":
			if fight_started > 0 and Time.get_ticks_msec() - fight_started > 1200:
				fight_started = 0
				_shot("combate")
			if not main.world.selected.is_empty() and main.world.selected == target:
				main.hud.refresh_target()
				# o quadro do alvo mostra a descrição do monstro numa linha
				if not desc_checked:
					desc_checked = true
					var want := str(main.defs["monsters"].get("furrow_rat", {}).get("description", ""))
					if want == "" or main.hud.target_desc.text != want or not main.hud.target_desc.visible:
						fail("o quadro do alvo não mostra a descrição do Rato de Sulco (\"%s\")" % main.hud.target_desc.text)
						return
					say("quadro do alvo com a descrição: \"%s\"" % want)
			if killed:
				killed = false
				settle_until = Time.get_ticks_msec() + 600
				step = "settle"
		"settle":
			if Time.get_ticks_msec() >= settle_until:
				say("Rato de Sulco derrotado; saques individuais visíveis: %d" % main.world.loots.size())
				step = "loot"
		"loot":
			if main.world.loots.is_empty():
				step = "mech_fx"
			elif main.world.pending_pickup == "":
				var lid: String = main.world.loots.keys()[0]
				var lp: Vector3 = main.world.loots[lid]["node"].position
				main.world.pending_pickup = lid
				Net.request("move", {"x": lp.x, "z": lp.z})
		"mech_fx":
			# mecânicas dos monstros: os mesmos eventos que o servidor manda, desenhados no lugar do personagem
			speed_before = float(main.ch.get("stats", {}).get("moveSpeed", 5.0))
			_mech_fx()
			mech_until = Time.get_ticks_msec() + 700
			step = "mech_check"
		"mech_check":
			if Time.get_ticks_msec() < mech_until:
				return
			_shot("mecanicas")
			if not main.hud._debuffs.has("disoriented"):
				fail("o efeito negativo (Desorientado) não apareceu na interface")
				return
			if main.world.vfx._warns.has("auto-cancelado"):
				fail("o aviso cancelado continuou desenhado")
				return
			# Atolado: o servidor manda a velocidade nova e a previsão do movimento passa a usá-la
			if absf(main.world.pred.max_speed - speed_before * 0.6) > 0.01 or absf(float(main.ch["stats"]["moveSpeed"]) - speed_before * 0.6) > 0.01:
				fail("a velocidade do Atolado não chegou à previsão (%.2f)" % main.world.pred.max_speed)
				return
			main._on_message({"t": "cleanse", "eid": main.ch["eid"], "id": "disoriented"})
			main._on_message({"t": "speed", "moveSpeed": speed_before})
			if main.hud._debuffs.has("disoriented"):
				fail("a Alvorada não tirou o efeito negativo da interface")
				return
			if absf(main.world.pred.max_speed - speed_before) > 0.01:
				fail("a velocidade não voltou ao normal na previsão")
				return
			say("mecânicas dos monstros: avisos em círculo, cone e linha (e um cancelado), explosão, puxão, drenagem de mana, eco, investida, reforços e pressão desenhados; Desorientado na interface e tirado pela Alvorada; a velocidade do Atolado chegou à previsão do movimento e voltou")
			step = "done"
		"done":
			step = "wait_gm"
			# Em servidor --dev, mostra a descrição de um item de nível 5 (requisitos em vermelho).
			Net.request("gm", {"cmd": "give", "defId": "axe_1h_t5" if main.ch["classId"] == "breaker" else "wand_t5"}, func(r):
				if r["ok"]:
					main.set_char(r["char"])
					for it in main.ch["items"]:
						if it["id"] == r["instanceId"]:
							var slot: String = main.defs["items"][it["defId"]]["slot"]
							main.hud.inv_tip.text = main.hud.ItemText.describe(main.defs, it, main.ch, main.equipped_in(slot))
				step = "panels")
		"panels":
			main.hud.inv_panel.visible = true
			main.hud.sheet_panel.visible = true
			main.hud.refresh_char()
			step = "shot_panels"
			settle_until = Time.get_ticks_msec() + 500
		"shot_panels":
			if Time.get_ticks_msec() < settle_until:
				return
			_shot("paineis")
			Net.request("char", {}, func(r):
				var gold := int(r["char"]["gold"])
				say("coleta concluída; nível %d, XP %d, ouro %d, itens na bolsa %d" % [int(r["char"]["level"]), int(r["char"]["xp"]), gold, int(r["char"]["bagUsed"])])
				main.hud.inv_panel.visible = false
				main.hud.sheet_panel.visible = false
				if main.args.has("m2"):
					step = "m2_talk"
				else:
					say("OK")
					get_tree().quit(0))
			step = "quitting"
		# ---------------- M2 ----------------
		"m2_talk":
			_act("npc", "mara")
			step = "m2_wait_npc"
		"m2_wait_npc":
			if main.hud.npc_panel.visible:
				say("diálogo com Mara aberto pela interface")
				Net.request("quest_accept", {"quest": "tutorial", "npc": "mara"}, func(r):
					say("missão aceita: %s" % r.get("quest", {}).get("title", r.get("reason", "")))
					main.hud.npc_panel.visible = false
					rescue_i = 0
					step = "m2_rescue")
				step = "m2_wait"
		"m2_rescue":
			if rescue_i >= 3:
				step = "m2_turnin"
			elif main.world.pending_action.is_empty() and Time.get_ticks_msec() > wait_until:
				_act("object", ["rescue_bento", "rescue_ligia", "rescue_caio"][rescue_i])
				rescue_i += 1
				wait_until = Time.get_ticks_msec() + 400
		"m2_turnin":
			if main.world.pending_action.is_empty() and Time.get_ticks_msec() > wait_until:
				_act("npc", "mara")
				step = "m2_wait_turnin"
		"m2_wait_turnin":
			if main.hud.npc_panel.visible:
				_shot("missao")
				Net.request("quest_turnin", {"quest": "tutorial", "npc": "mara"}, func(r):
					if not r["ok"]:
						fail("entrega recusada: " + r["reason"])
						return
					say("tutorial entregue: XP agora %d" % int(r["char"]["xp"]))
					main.hud.npc_panel.visible = false
					step = "m2_party")
				step = "m2_wait"
		"m2_party":
			if main.args.has("invite"):
				Net.request("party_invite", {"name": main.args["invite"]}, func(r):
					if r["ok"]:
						step = "m2_wait_party"
					else:
						wait_until = Time.get_ticks_msec() + 1000
						step = "m2_party_retry")
				step = "m2_wait"
			else:
				step = "m2_wait_party"
				wait_until = Time.get_ticks_msec() + 8000
		"m2_party_retry":
			if Time.get_ticks_msec() > wait_until:
				step = "m2_party"
		"m2_wait_party":
			var n := 0
			if main.party != null:
				n = main.party["members"].size()
			if n >= 2:
				say("grupo formado com %d membros" % n)
				_shot("grupo")
				step = "m2_portal"
			elif not main.args.has("invite") and not main.args.has("expect_party") and Time.get_ticks_msec() > wait_until:
				step = "m2_portal"
		"m2_portal":
			var to := "to_pedrambar" if main.ch["classId"] in ["breaker", "bastion", "pikeman", "warden"] else "to_vau"
			_act("portal", to)
			step = "m2_wait_zone"
		"m2_wait_zone":
			if zone_changed != "" and main.world.npc_nodes.size() > 0:
				say("troca de zona: agora em %s (%d NPCs)" % [main.map_def().get("name", zone_changed), main.world.npc_nodes.size()])
				_act("npc", "master_" + main.ch["classId"])
				step = "m2_wait_master"
		"m2_wait_master":
			if main.hud.npc_panel.visible:
				say("conversa com o mestre de classe aberta")
				_shot("mestre")
				main.hud.npc_panel.visible = false
				main.hud.journal_panel.visible = true
				main.hud.refresh_quests()
				wait_until = Time.get_ticks_msec() + 400
				step = "m2_journal"
		"m2_journal":
			if Time.get_ticks_msec() > wait_until:
				_shot("diario")
				say("OK")
				get_tree().quit(0)
				step = "quitting"

## Alimenta o cliente com os eventos das mecânicas dos monstros (como o servidor manda), em volta do
## personagem: avisos em círculo, cone e linha, um aviso cancelado, explosão, puxão, drenagem de mana, eco,
## investida, reforços, pressão e um efeito negativo no próprio personagem.
func _mech_fx() -> void:
	var my_eid: String = main.ch["eid"]
	var p: Vector3 = main.world.my_pos()
	var mon := ""
	for eid in main.world.entities.keys():
		if main.world.entities[eid]["data"]["k"] == "m":
			mon = eid
			break
	var src: String = mon if mon != "" else my_eid
	var x := p.x
	var z := p.z
	var msgs := [
		{"t": "warn", "shape": "circle", "x": x, "z": z, "radius": 3.5, "ms": 1500, "kind": "steam_burst", "name": "Estouro de Vapor", "src": src, "id": "auto-circulo"},
		{"t": "warn", "shape": "cone", "x": x + 3.0, "z": z, "yaw": -PI / 2.0, "range": 6.0, "angleDeg": 70.0, "ms": 1500, "kind": "spark_cone", "name": "Cone de Faíscas", "src": src, "id": "auto-cone"},
		{"t": "warn", "shape": "line", "x": x - 5.0, "z": z + 2.0, "yaw": PI / 2.0, "length": 10.0, "width": 1.6, "ms": 1500, "kind": "rail_rush", "name": "Corrida no Trilho", "src": src, "id": "auto-linha"},
		{"t": "warn", "shape": "circle", "x": x, "z": z + 6.0, "radius": 2.5, "ms": 1750, "kind": "conduit_web", "name": "Fio Condutor", "src": src, "id": "auto-cancelado"},
		{"t": "warn_cancel", "id": "auto-cancelado", "src": src},
		{"t": "mech", "kind": "burst", "eid": src, "x": x + 2.0, "z": z - 3.0, "radius": 3.5, "hits": 1},
		{"t": "mech", "kind": "pull", "eid": src, "dst": [my_eid], "x": x, "z": z},
		{"t": "mech", "kind": "drain", "eid": src, "dst": my_eid, "amount": 7},
		{"t": "mech", "kind": "echo", "eid": src, "dst": my_eid, "magic": false},
		{"t": "mech", "kind": "dash", "eid": src, "x0": x - 4.0, "z0": z - 4.0, "x1": x + 4.0, "z1": z - 4.0},
		{"t": "mech", "kind": "summon", "eid": src, "adds": [], "x": x + 4.0, "z": z + 4.0},
		{"t": "mech", "kind": "vanish", "eid": src},
		{"t": "mech", "kind": "pressure", "eid": src, "phase": "high", "ms": 8000},
		{"t": "debuff", "eid": my_eid, "id": "disoriented", "name": "Desorientado", "ms": 4000, "text": "−25% de acerto, −25% de velocidade"},
		{"t": "debuff", "eid": my_eid, "id": "mired", "name": "Atolado", "ms": 3000, "text": "−40% de velocidade"},
		{"t": "speed", "moveSpeed": snappedf(float(main.ch.get("stats", {}).get("moveSpeed", 5.0)) * 0.6, 0.01)},
	]
	for m in msgs:
		main._on_message(m)

## Com --shots=pasta, salva capturas de tela (precisa de janela/GL; não funciona em --headless).
func _shot(name: String) -> void:
	if not main.args.has("shots") or DisplayServer.get_name() == "headless":
		return
	var path := "%s/%s.png" % [main.args["shots"], name]
	var img := get_viewport().get_texture().get_image()
	img.save_png(path)
	say("captura salva: " + path)

## Simula o clique da interface num NPC, objeto ou portal (mesmo caminho do mouse).
func _act(kind: String, id: String) -> void:
	var nodes: Dictionary = {"npc": main.world.npc_nodes, "object": main.world.object_nodes, "portal": main.world.portal_nodes}[kind]
	if not nodes.has(id):
		fail("%s %s não encontrado no mapa" % [kind, id])
		return
	var pos: Vector3 = nodes[id]["pos"]
	var rng: float = {"npc": 4.5, "object": 2.8, "portal": 2.5}[kind]
	main.world.pending_action = {"kind": kind, "id": id, "pos": pos, "range": rng}
	Net.request("move", {"x": pos.x + 0.8, "z": pos.z + 0.8})


# ---------------- capturas da navegação (--navshots=pasta) ----------------
var nav_step := 0
var nav_until := 0

func start_nav(m) -> void:
	main = m
	t0 = Time.get_ticks_msec()
	deadline_ms = 120000
	step = "nav"
	nav_until = Time.get_ticks_msec() + 1500
	say("capturas de navegação em %s" % main.args["navshots"])

func _nav_shot(name: String) -> void:
	var path := "%s/%s.png" % [main.args["navshots"], name]
	get_viewport().get_texture().get_image().save_png(path)
	say("captura: " + path)

func _nav_tick() -> void:
	if Time.get_ticks_msec() < nav_until:
		return
	var next_wait := 1200
	match nav_step:
		0:
			_nav_shot("01_titulo")
			main.show_options()
		1:
			_nav_shot("02_opcoes")
			main.options_panel.queue_free()
			main.options_panel = null
			main.show_login()
		2:
			_nav_shot("03_entrar")
			main.account = main.args.get("account", "vitrine")
			main.password = main.args.get("password", "vitrine123")
			main.connect_and_login(true)
			next_wait = 2000
		3:
			if main.state != "chars":
				return
			main.show_create()
			main._create_class = main.args.get("class", "emberweaver")
			main._build_create(main.args.get("name", "Vitrine"))
		4:
			_nav_shot("04_criacao")
			if main.chars_cache.is_empty():
				Net.request("create_char", {"name": main.args.get("name", "Vitrine"), "classId": main._create_class}, func(r):
					if not r["ok"]:
						fail("criação recusada: " + r["reason"])
						return
					Net.request("list_chars", {}, func(r2):
						main.chars_cache = r2["chars"]
						main.show_chars(int(r["char"]["id"]))))
			else:
				main.show_chars()
			next_wait = 1500
		5:
			_nav_shot("05_personagens")
			main.enter_world(main._selected_char)
			next_wait = 250
		6:
			_nav_shot("06_carregando")
			next_wait = 2500
		7:
			if not main.in_world:
				return
			Net.request("move", {"x": 30.0, "z": 50.0})
			next_wait = 3500
		8:
			_nav_shot("07_mundo")
			main.world.cam_dist = 11.0
			next_wait = 1200
		9:
			_nav_shot("08_mundo_perto")
			main.toggle_pause_menu()
			next_wait = 600
		10:
			_nav_shot("09_menu_pausa")
			say("OK")
			get_tree().quit(0)
			return
	nav_step += 1
	nav_until = Time.get_ticks_msec() + next_wait


# ---------------- tour do cenário (--sceneshots=pasta, servidor com --dev) ----------------
# Teleporta (comando de mestre) por pontos de cada mapa e salva capturas: visão de jogo, ampla,
# de perto e uma sequência durante a corrida (para conferir a passada e a fluidez).
var scene_mode := false
var scene_step := 0
var scene_until := 0
var scene_i := 0
const SCENE_SPOTS := [
	["estrada_velha", 27.0, 53.5, "estrada_posto"],
	["estrada_velha", 64.0, 60.0, "estrada_ruinas"],
	["brejo_bombas", 54.0, 64.0, "brejo_lagoa"],
	["oficina_soterrada", 28.0, 93.0, "oficina"],
	["galerias_eco", 30.0, 80.0, "galerias"],
	["canais_eclusa", 100.0, 30.0, "canais"],
	["cava_primeira", 50.0, 96.0, "cava"],
	["pedrambar", 34.0, 25.0, "pedrambar"],
	["vau_de_nacar", 25.0, 35.0, "vau"],
]

func start_scene(m) -> void:
	scene_mode = true
	deadline_ms = 600000
	start(m)

func _scene_shot(name: String) -> void:
	var path := "%s/%s.png" % [main.args["sceneshots"], name]
	get_viewport().get_texture().get_image().save_png(path)
	say("captura: " + path)

func _scene_tick() -> void:
	if Time.get_ticks_msec() < scene_until:
		return
	var wait := 1500
	if main.args.has("trial") and scene_i == 0 and not trial_done:
		_trial_tick()
		return
	if main.args.has("dungeon") and scene_i == 0 and not dungeon_done:
		_dungeon_tick()
		return
	if main.args.has("cap4") and scene_i == 0 and not cap4_done:
		_cap4_tick()
		return
	if main.args.has("social") and scene_i == 0 and not social_done:
		_social_tick()
		return
	if scene_i >= SCENE_SPOTS.size() or (scene_i >= 1 and main.args.has("scenequick")):
		say("OK")
		get_tree().quit(0)
		return
	var sp: Array = SCENE_SPOTS[scene_i]
	var tag := "%02d_%s" % [scene_i, sp[3]]
	match scene_step:
		0:
			if main.map_def().get("id", "") != sp[0]:
				Net.request("gm", {"cmd": "teleport", "mapId": sp[0], "x": sp[1], "z": sp[2]})
				wait = 3000
			else:
				Net.request("gm", {"cmd": "teleport", "x": sp[1], "z": sp[2]})
				wait = 1200
		1:
			if not main.in_world or main.world == null or main.map_def().get("id", "") != sp[0] or main.world.me().is_empty():
				return
			main.world.cam_dist = 18.0
			main.world.cam_pitch = 0.8
			wait = 3000
		2:
			_scene_shot(tag + "_jogo")
			main.world.cam_dist = 36.0
			main.world.cam_pitch = 0.6
			wait = 2200
		3:
			_scene_shot(tag + "_amplo")
			main.world.cam_dist = 9.0
			main.world.cam_pitch = 0.42
			main.world.cam_yaw += 1.3
			wait = 2200
		4:
			_scene_shot(tag + "_perto")
			main.world.cam_dist = 13.0
			main.world.cam_pitch = 0.62
			if scene_i != 0:
				main.world.cam_yaw -= 1.3
				scene_i += 1
				scene_step = 0
				scene_until = Time.get_ticks_msec() + 300
				return
			main.world.request_move(float(sp[1]) + 16.0, float(sp[2]) - 1.0)
			main.world.motion_log.clear()
			main.world.log_motion = true
			wait = 450
		5, 6, 7, 8, 9:
			_scene_shot("%s_movimento_%d" % [tag, scene_step - 4])
			wait = 260
			if scene_step == 9:
				main.world.log_motion = false
				_motion_report(main.world.motion_log)
				main.world.cam_yaw -= 1.3
				scene_i += 1
				scene_step = 0
				scene_until = Time.get_ticks_msec() + 1500
				return
	scene_step += 1
	scene_until = Time.get_ticks_msec() + wait


## Fluidez medida no próprio quadro do mundo: velocidade = deslocamento / delta do quadro.
func _motion_report(log: Array) -> void:
	if main.args.has("motiondump"):
		for row in log:
			say("  dt=%.3f relogio=%.1f rate=%.3f desenhado=(%.2f, %.2f) interp=(%.2f, %.2f)" % [float(row[0]), float(row[4]), float(row[3]), row[1].x, row[1].y, row[2].x, row[2].y])
	for series in [[1, "desenhado (previsão)"], [2, "interpolado (snapshots)"]]:
		var idx: int = series[0]
		var speeds := []
		var reversals := 0
		var prev_dir := Vector2.ZERO
		for i in range(1, log.size()):
			var dt: float = float(log[i][0]) * float(log[i][3])
			if dt <= 0.0:
				continue
			var dp: Vector2 = (log[i][idx] as Vector2) - (log[i - 1][idx] as Vector2)
			speeds.append(dp.length() / dt)
			if dp.length() > 0.001:
				var dir := dp.normalized()
				if prev_dir != Vector2.ZERO and dir.dot(prev_dir) < 0.0:
					reversals += 1
				prev_dir = dir
		var cruise := []
		for v in speeds:
			if v > 3.5:
				cruise.append(v)
		var mean := 0.0
		for v in cruise:
			mean += v
		mean /= maxf(1.0, cruise.size())
		var dev := 0.0
		var max_jump := 0.0
		for i in cruise.size():
			dev += pow(cruise[i] - mean, 2.0)
			if i > 0:
				max_jump = maxf(max_jump, absf(cruise[i] - cruise[i - 1]))
		dev = sqrt(dev / maxf(1.0, cruise.size()))
		say("fluidez %s: %d quadros, corrida a %.2f m/s (desvio %.2f, maior salto %.2f), recuos %d" % [series[1], speeds.size(), mean, dev, max_jump, reversals])


# ---------------- prova de classe vista no cliente (--sceneshots=pasta --trial) ----------------
var trial_step := 0
var trial_done := false
var trial_until := 0
var trial_casts := 0

func _trial_tick() -> void:
	if Time.get_ticks_msec() < trial_until:
		return
	var master := "master_" + str(main.ch["classId"])
	var wait := 1500
	match trial_step:
		0:
			Net.request("gm", {"cmd": "xp", "level": 10}, func(r):
				if r["ok"]:
					main.set_char(r["char"]))
			var done := []
			for q in ["tutorial", "c1_count", "c1_rats", "c1_master", "c1_route", "c1_foreman", "c2_water", "c2_pressure", "c2_pages", "c2_group", "c2_signature", "c3_fuses", "c3_rats"]:
				done.append(q)
			Net.request("gm", {"cmd": "quest_done", "quests": done})
			var city := "pedrambar" if main.ch["classId"] in ["breaker", "bastion", "pikeman", "warden"] else "vau_de_nacar"
			var mp: Dictionary = main.defs["maps"][city]
			var mx := 30.0
			var mz := 14.0
			for n in mp["npcs"]:
				if n["id"] == master:
					mx = float(n["x"])
					mz = float(n["z"]) + 2.0
			Net.request("gm", {"cmd": "teleport", "mapId": city, "x": mx, "z": mz})
			wait = 3500
		1:
			if not main.in_world or main.world == null or not main.world.npc_nodes.has(master):
				return
			Net.request("quest_accept", {"quest": "c3_trial", "npc": master}, func(r):
				say("prova aceita: %s" % str(r.get("ok")) + ("" if r.get("ok") else " " + str(r.get("reason")))))
			wait = 1200
		2:
			Net.request("trial_start", {"npc": master}, func(r):
				say("prova iniciada: %s" % str(r.get("ok")) + ("" if r.get("ok") else " " + str(r.get("reason")))))
			wait = 4000
		3:
			if main.map_def().get("id", "") != "arena_prova" or main.world == null or main.world.me().is_empty():
				return
			main.world.cam_dist = 16.0
			main.world.cam_pitch = 0.75
			_scene_shot("90_arena_entrada")
			wait = 2500
		4, 5, 6, 7, 8, 9, 10, 11:
			# ataca o monstro mais próximo e usa as habilidades disponíveis
			var best := ""
			var bd := 1e9
			for eid in main.world.entities.keys():
				var e: Dictionary = main.world.entities[eid]
				if e["data"]["k"] == "m":
					var d: float = e["node"].position.distance_to(main.world.my_pos())
					if d < bd:
						bd = d
						best = eid
			if best != "":
				main.world.selected = best
				if trial_step == 4 or main.world.entities[best]["data"].get("tgt", null) == null:
					Net.request("attack", {"target": best})
				var sk: Array = main.class_skills()
				var learned: Dictionary = main.ch.get("skills", {})
				var usable := []
				for sid in sk:
					if int(learned.get(sid, 0)) > 0:
						usable.append(sid)
				if not usable.is_empty():
					main.world.use_skill(usable[trial_casts % usable.size()])
					trial_casts += 1
			wait = 900
			if trial_step in [6, 8, 10]:
				get_tree().create_timer(0.25).timeout.connect(func(): _scene_shot("9%d_arena_combate" % trial_step))
		12:
			say("prova vista no cliente: %d habilidades usadas, mapa %s" % [trial_casts, main.map_def().get("id", "")])
			trial_done = true
			scene_i = SCENE_SPOTS.size()
			return
	trial_step += 1
	trial_until = Time.get_ticks_msec() + wait


# ---------------- calabouço visto no cliente (--sceneshots=pasta --dungeon=NomeDoParceiro) ----------------
# O parceiro é um cliente simulado (tools/partner.mjs) que aceita o convite e vem para a porta.
var dungeon_step := 0
var dungeon_done := false
var dungeon_until := 0
var dungeon_shots := 0

# ---------- capítulo 4 no cliente (--cap4): canalização, escolta e escolha de diálogo ----------
var cap4_step := 0
var cap4_done := false
var cap4_until := 0
var cap4_ambush := false
var cap4_ambush_shot := false

func _cap4_cart() -> Dictionary:
	for eid in main.world.entities.keys():
		var e: Dictionary = main.world.entities[eid]
		if e["data"].get("k", "") == "e":
			return e
	return {}

func _cap4_tick() -> void:
	if Time.get_ticks_msec() < cap4_until:
		return
	var wait := 1500
	match cap4_step:
		0:
			Net.request("gm", {"cmd": "xp", "level": 15}, func(r):
				if r["ok"]:
					main.set_char(r["char"]))
			var pre := ["c4_bells"]
			for qid in main.defs["quests"].keys():
				if int(main.defs["quests"][qid].get("chapter", 9)) < 4:
					pre.append(qid)
			Net.request("gm", {"cmd": "quest_done", "quests": pre})
			wait = 2500
		1:
			Net.request("gm", {"cmd": "teleport", "mapId": "galerias_eco", "x": 25.5, "z": 87.0})
			wait = 4500
		2:
			if main.map_def().get("id", "") != "galerias_eco" or main.world == null or main.world.me().is_empty():
				return
			Net.request("quest_accept", {"quest": "c4_ilda", "npc": "ilda"}, func(r):
				say("aceitou Ilda Varen: %s" % ("ok" if r["ok"] else r["reason"])))
		3:
			Net.request("gm", {"cmd": "teleport", "x": 92.0, "z": 72.5})
			main.world.cam_dist = 11.0
			main.world.cam_pitch = 0.7
		4:
			Net.request("interact", {"object": "gauge_1"}, func(r):
				if r["ok"] and r.has("channel"):
					main.hud.show_channel(str(r["channel"]["text"]), float(r["channel"]["ms"]))
				say("medidor: %s" % ("canalizando" if r["ok"] else r["reason"])))
			wait = 1800
		5:
			_scene_shot("90_canalizacao")
			wait = 3500
		6:
			Net.request("gm", {"cmd": "quest_done", "quests": ["c4_ilda"]})
			Net.request("gm", {"cmd": "teleport", "x": 25.5, "z": 87.0})
			wait = 2000
		7:
			Net.request("quest_accept", {"quest": "c4_route", "npc": "ilda"}, func(r):
				say("aceitou Rota Alternativa: %s" % ("ok" if r["ok"] else r["reason"])))
			Net.request("gm", {"cmd": "teleport", "x": 31.0, "z": 93.0})
			main.world.cam_dist = 16.0
		8:
			Net.request("interact", {"object": "ilda_cart"}, func(r):
				say("carroça: %s" % ("partiu" if r["ok"] else r["reason"])))
		9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24:
			var cart := _cap4_cart()
			if not cart.is_empty():
				var cp: Vector3 = cart["node"].position
				main.world.request_move(cp.x + 1.8, cp.z - 1.2)
			if cap4_step == 12:
				_scene_shot("91_escolta")
			if cap4_ambush and not cap4_ambush_shot:
				cap4_ambush_shot = true
				var best := ""
				var bd := 30.0
				for eid in main.world.entities.keys():
					var e: Dictionary = main.world.entities[eid]
					if e["data"].get("k", "") == "m":
						var d: float = e["node"].position.distance_to(main.world.my_pos())
						if d < bd:
							bd = d
							best = eid
				if best != "":
					main.world.selected = best
					Net.request("attack", {"target": best})
				wait = 1200
			elif cap4_ambush_shot and cap4_step < 24:
				_scene_shot("92_emboscada")
				cap4_step = 24
			wait = maxi(wait, 1500)
		25:
			Net.request("gm", {"cmd": "quest_done", "quests": ["c4_route"]})
			Net.request("gm", {"cmd": "teleport", "x": 27.5, "z": 73.0})
			wait = 2500
		26:
			Net.request("quest_accept", {"quest": "c4_reasons", "npc": "mara"}, func(r):
				say("aceitou Duas Razões: %s" % ("ok" if r["ok"] else r["reason"]))
				Net.request("gm", {"cmd": "quest_progress", "quest": "c4_reasons", "index": 0, "value": ["thermo_1", "thermo_2", "thermo_3"]}))
			wait = 1500
		27:
			Net.request("gm", {"cmd": "teleport", "x": 25.5, "z": 87.0})
			main.world.cam_dist = 10.0
			wait = 2000
		28:
			Net.request("talk", {"npc": "ilda"}, func(r):
				if r["ok"]:
					main.hud.show_npc(r)
					say("Ilda pergunta: %s" % ("sim" if r.get("choice", null) != null else "não")))
		29:
			_scene_shot("93_escolha")
			Net.request("quest_choice", {"quest": "c4_reasons", "option": "inverno", "npc": "ilda"}, func(r):
				say("escolha: %s" % (("título " + str(r.get("title", ""))) if r["ok"] else r["reason"]))
				main.hud.npc_panel.visible = false)
			wait = 2500
		30:
			main.world.cam_dist = 8.0
			wait = 2000
		31:
			_scene_shot("94_titulo")
			say("capítulo 4 visto no cliente")
			cap4_done = true
			scene_i = SCENE_SPOTS.size()
			return
	cap4_step += 1
	cap4_until = Time.get_ticks_msec() + wait

func _dungeon_tick() -> void:
	if Time.get_ticks_msec() < dungeon_until:
		return
	var wait := 1500
	match dungeon_step:
		0:
			Net.request("gm", {"cmd": "xp", "level": 20}, func(r):
				if r["ok"]:
					main.set_char(r["char"]))
			Net.request("gm", {"cmd": "quest_done", "quests": ["c5_fragment"]})
			Net.request("party_invite", {"name": main.args["dungeon"]})
			wait = 2500
		1:
			Net.request("gm", {"cmd": "teleport", "mapId": "canais_eclusa", "x": 100.0, "z": 187.0})
			wait = 4000
		2:
			if main.map_def().get("id", "") != "canais_eclusa" or main.world == null or main.world.me().is_empty():
				return
			main.world.cam_dist = 20.0
			_scene_shot("80_porta_eclusa")
			Net.request("interact", {"object": "eclusa_gate"}, func(r):
				say("porta da Eclusa: %s" % ("ok" if r["ok"] else r["reason"])))
			wait = 4000
		3:
			if main.map_def().get("id", "") != "ultima_eclusa" or main.world == null or main.world.me().is_empty():
				return
			main.world.cam_dist = 24.0
			main.world.cam_pitch = 0.85
			wait = 2000
		4:
			_scene_shot("81_camara")
			var boss := ""
			for eid in main.world.entities.keys():
				if main.world.entities[eid]["data"].get("def", "") == "lock_custodian":
					boss = eid
			if boss != "":
				main.world.selected = boss
				Net.request("attack", {"target": boss})
			wait = 3500
		5, 6, 7, 8, 9, 10:
			_scene_shot("8%d_luta" % dungeon_step)
			var sk: Array = main.class_skills()
			if not sk.is_empty() and main.world.selected != "":
				main.world.use_skill(sk[0])
			wait = 2500
		11:
			say("calabouço visto no cliente")
			dungeon_done = true
			scene_i = SCENE_SPOTS.size()
			return
	dungeon_step += 1
	dungeon_until = Time.get_ticks_msec() + wait


# ---------- pós-versão 1 no cliente (--social=NomeDoParceiro): troca, clã, duelo e refino com risco ----------
# O parceiro é um cliente simulado (server/tools/parceiro-social.mjs) que aceita tudo e oferece ouro.
var social_step := 0
var social_done := false
var social_until := 0
var social_axe := ""

func _social_partner() -> String:
	var n: String = str(main.args.get("social", "Parceira"))
	for eid in main.world.entities.keys():
		var d: Dictionary = main.world.entities[eid]["data"]
		if d.get("k", "") == "p" and str(d.get("n", "")) == n:
			return eid
	return ""

func _social_tick() -> void:
	if Time.get_ticks_msec() < social_until:
		return
	var wait := 1500
	var soc = main.hud.social
	var partner: String = str(main.args.get("social", "Parceira"))
	match social_step:
		0:
			Net.request("gm", {"cmd": "xp", "level": 10})
			Net.request("gm", {"cmd": "gold", "amount": 3000})
			Net.request("gm", {"cmd": "give", "defId": "axe_1h_t5"}, func(r):
				if r["ok"]:
					social_axe = r["instanceId"])
			Net.request("gm", {"cmd": "give", "defId": "mat_refine_sup", "qty": 12})
			Net.request("gm", {"cmd": "give", "defId": "protect_seal", "qty": 2})
			Net.request("gm", {"cmd": "teleport", "x": 22.0, "z": 50.0})
			main.world.cam_dist = 9.0
			main.world.cam_pitch = 0.62
			wait = 2500
		1:
			if _social_partner() == "":
				return
			Net.request("trade_request", {"name": partner}, func(r):
				say("pedido de troca: %s" % ("ok" if r["ok"] else r["reason"])))
		2:
			if not soc.trade_panel.visible:
				return
			Net.request("trade_offer", {"items": [social_axe], "gold": 0})
			wait = 2000
		3:
			_scene_shot("social_troca_aberta")
			Net.request("trade_lock")
			wait = 1500
		4:
			_scene_shot("social_troca_travada")
			Net.request("trade_confirm", {}, func(r):
				say("troca: %s" % ("concluída" if r.get("done", false) else str(r.get("waiting", r.get("reason", "?"))))))
			wait = 2000
		5:
			Net.request("clan_create", {"name": "Guarda do Sal", "tag": "SAL"}, func(r):
				say("clã: %s" % ("fundado" if r["ok"] else r["reason"])))
			wait = 1000
		6:
			Net.request("clan_invite", {"name": partner})
			wait = 2000
		7:
			soc.toggle_clan()
			wait = 1500
		8:
			_scene_shot("social_cla_painel")
			soc.clan_panel.visible = false
			soc.show_player_actions(partner)
			wait = 800
		9:
			_scene_shot("social_acoes_jogador")
			soc.actions_panel.visible = false
			Net.request("duel_request", {"name": partner}, func(r):
				say("duelo: %s" % ("pedido" if r["ok"] else r["reason"])))
			wait = 1400
		10:
			_scene_shot("social_duelo_contagem")
			wait = 2600
		11:
			var op := _social_partner()
			if op != "":
				main.world.selected = op
				Net.request("attack", {"target": op})
				main.hud.refresh_target()
			wait = 1800
		12:
			_scene_shot("social_duelo_luta")
			wait = 1000
		13:
			if soc.duel_state != "":
				return
			_scene_shot("social_duelo_fim")
			Net.request("gm", {"cmd": "teleport", "mapId": "pedrambar", "x": 13.0, "z": 45.5})
			wait = 4000
		14:
			if main.map_def().get("id", "") != "pedrambar":
				return
			Net.request("gm", {"cmd": "give", "defId": "axe_1h_t5"}, func(r):
				if r["ok"]:
					social_axe = r["instanceId"]
					Net.request("gm", {"cmd": "set_enh", "instance": social_axe, "enh": 3}))
			wait = 1500
		15:
			Net.request("talk", {"npc": "smith_gusmao"}, func(r):
				if r["ok"]:
					main.hud.show_npc(r))
			wait = 1500
		16:
			var iid := social_axe
			for c in main.hud.npc_box.get_children():
				if c is Button and "+3" in (c as Button).text:
					(c as Button).emit_signal("pressed")
					break
			wait = 1500
		17:
			_scene_shot("social_ferreiro_risco")
			Net.request("talk", {"npc": "armorer_amaro"}, func(r):
				if r["ok"]:
					main.hud.show_npc(r))
			wait = 1500
		18:
			_scene_shot("social_armeiro")
			# bolsa aberta com o menu do botão direito (último comerciante: dá para vender)
			main.hud.npc_panel.visible = false
			main.hud.inv_panel.visible = true
			main.hud._refresh_inventory()
			wait = 600
		19:
			get_viewport().warp_mouse(Vector2(640, 260))
			for it in main.ch.get("items", []):
				if it["loc"] == "bag" and main.defs["items"].get(it["defId"], {}).get("slot", null) != null:
					main.hud._bag_menu(it)
					break
			wait = 800
		20:
			_scene_shot("social_inventario_menu")
			say("social OK")
			social_done = true
			get_tree().quit(0)
			return
	social_step += 1
	social_until = Time.get_ticks_msec() + wait
