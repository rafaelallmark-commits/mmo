extends Node
## Teste automático do cliente (roda headless): conecta, cria conta/personagem se preciso,
## entra no mundo pela mesma rotina da interface, anda, ataca um monstro, coleta o saque
## e sai com código 0 em caso de sucesso. Uso:
##   godot --headless --path client -- --autotest --server=ws://127.0.0.1:7777 --account=bot --password=bot123 --class=breaker --name=Robo

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

func _connected() -> void:
	Net.request("register", {"account": main.account, "password": main.password}, func(_r):
		Net.request("login", {"account": main.account, "password": main.password}, _logged))

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
				Net.request("move", {"x": 30.0, "z": 50.0})
				step = "moving"
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
				step = "done"
			elif main.world.pending_pickup == "":
				var lid: String = main.world.loots.keys()[0]
				var lp: Vector3 = main.world.loots[lid]["node"].position
				main.world.pending_pickup = lid
				Net.request("move", {"x": lp.x, "z": lp.z})
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
			main.world.cam_dist = 13.0
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
