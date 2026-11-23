extends Node
## Teste automático do cliente (roda headless): conecta, cria conta/personagem se preciso,
## entra no mundo pela mesma rotina da interface, anda, ataca um monstro, coleta o saque
## e sai com código 0 em caso de sucesso. Uso:
##   godot --headless --path client -- --autotest --server=ws://127.0.0.1:7777 --account=bot --password=bot123 --class=breaker --name=Robo
## Servidor do teste público (--auth token): entra pelo serviço de contas (https://DOMINIO/contas, ou --accounts).
## Com --emails=pasta (onde chegam os e-mails: modo "arquivo" do serviço de contas ou um SMTP de teste) e uma conta
## que ainda não existe, cria a conta pelo serviço (e-mail conta@exemplo.com), confirma com o código lido do
## e-mail e entra, como um jogador novo; sem --emails, a conta já precisa existir e estar confirmada.
## Com --transfer (servidor em várias zonas, --dev): em vez de lutar, atravessa o portal para um mapa de
## outra zona e confere que o cliente reconectou no endereço novo e está no mapa novo.
## Com --board (servidor --dev): depois do fluxo normal, vai a Pedrâmbar e abre o quadro de missões da praça
## pelo mesmo clique da interface, conferindo que ele lista missões; depois recebe um item de missão e confere
## que o menu da bolsa não oferece venda nem descarte e que a dica o marca. Com --defense (servidor --dev): aceita
## "O Teste de Pressão" com Joca e abre a válvula, conferindo que o Joca da defesa (com vida e cronômetro)
## toma o lugar do NPC parado e que a ficha mostra o seletor de título; quando a onda chega, clica entre um monstro
## e o NPC escondido e confere que o clique ataca o monstro; depois sai do Brejo e confere que o cronômetro da
## válvula não fica preso na tela.
## Com --m2: depois da coleta, faz o tutorial «Três do Outro Lado» pela interface (dica na tela de cada passo,
## teclas 1 e 7, bichos de Caio, faixa do segundo toque, chegada dos três ao posto), entrega a Mara, abre o
## mapa (tecla M) na Estrada e na cidade, forma grupo (--invite) e fala com o mestre da classe.
## Em servidor --dev (comandos de mestre), também luta de verdade contra uma mecânica de monstro: perto dos
## Javalis de Cinza, recebe a investida avisada pelo servidor, confere o aviso desenhado, sai de lado e
## confere que o javali passou direto sem acertá-lo.

const ItemText = preload("res://scripts/item_text.gd")

var main
var step := "connect"
var t0 := 0
var deadline_ms := 150000
var target := ""
var killed := false
var settle_until := 0
var fight_started := 0
var zone_changed := ""
var wait_until := 0
# --m2: tutorial «Três do Outro Lado» guiado pelo diário (os sete passos e a chegada ao posto)
var tut_until := 0
var tut_said := {}
var tut_warn := {}       # último segundo toque (faixa a deixar)
var tut_dodged := 0
var log_lines := []
var desc_checked := false
var mech_until := 0
var speed_before := 0.0
# luta de verdade contra a investida do Javali de Cinza (servidor --dev)
var real_warn := {}
var real_boar := ""
var real_hit := false
var real_dash := false
var real_until := 0
var real_shot_at := 0
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
	if main.args.has("m2"):
		deadline_ms = maxi(deadline_ms, 330000)  # o tutorial inteiro em tempo real (uns 2 minutos)
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
			_token_login(true)
			return
		Net.request("register", {"account": main.account, "password": main.password}, func(_r):
			Net.request("login", {"account": main.account, "password": main.password, "delta": true}, _logged)))

## Sessão no serviço de contas e "login_token" na zona. Conta que não existe (recusa sem "codigo") com --emails:
## cadastro, código lido do e-mail, confirmação e sessão de novo (signup = pode tentar o cadastro uma vez).
func _token_login(signup: bool) -> void:
	main._accounts_post("/sessoes", {"conta": main.account, "senha": main.password}, func(ok: bool, b: Dictionary):
		if ok:
			Net.request("login_token", {"token": b["token"], "delta": true}, _logged)
			return
		if signup and main.args.has("emails") and not b.has("codigo"):
			_signup()
			return
		fail(str(b.get("erro", "serviço de contas recusou"))))

func _signup() -> void:
	var email := "%s@exemplo.com" % main.account
	var since := Time.get_unix_time_from_system()
	say("conta %s não existe; criando pelo serviço de contas (e-mail %s)" % [main.account, email])
	main._accounts_post("/contas", {"conta": main.account, "email": email, "senha": main.password, "aceite": true}, func(ok: bool, b: Dictionary):
		if not ok:
			fail("cadastro recusado: %s" % str(b.get("erro", "?")))
			return
		step = "signup_code"
		signup_since = since
		signup_until = Time.get_ticks_msec() + 60000)

var signup_since := 0.0
var signup_until := 0

## Espera o e-mail do cadastro chegar na pasta de --emails e confirma a conta com o código.
func _signup_tick() -> void:
	var code := _mail_code(str(main.args["emails"]), "%s@exemplo.com" % main.account, signup_since)
	if code == "":
		if Time.get_ticks_msec() > signup_until:
			fail("o e-mail com o código não chegou em %s em 60 s" % main.args["emails"])
		return
	step = "signup_wait"
	say("código %s lido do e-mail; confirmando a conta" % code)
	main._accounts_post("/contas/verificar", {"conta": main.account, "codigo": code}, func(ok: bool, b: Dictionary):
		if not ok:
			fail("confirmação recusada: %s" % str(b.get("erro", "?")))
			return
		say("conta confirmada pelo código do e-mail")
		step = "connect"
		_token_login(false))

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
	if m.get("t", "") == "warn" and m.get("kind", "") == "bell2":
		tut_warn = m
	if m.get("t", "") == "say":
		say("%s diz: \"%s\"" % [m.get("name", "?"), m.get("text", "")])
	if m.get("t", "") == "party_invite":
		say("convite de grupo recebido de %s; aceitando" % m["from"])
		Net.request("party_accept", {"from": int(m["fromId"])})
	if m.get("t", "") == "zone":
		zone_changed = m["mapId"]
	if step.begins_with("real_"):
		_real_msg(m)

func _process(_d: float) -> void:
	if Time.get_ticks_msec() - t0 > deadline_ms:
		fail("tempo esgotado no passo " + step)
		return
	if step == "nav":
		_nav_tick()
		return
	if step == "contas":
		_accounts_tick()
		return
	if step == "signup_code":
		_signup_tick()
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
			# Atolado: o evento "speed" muda a velocidade na ficha e na previsão na hora. Conferido já: a ficha de
			# verdade do servidor (sem o efeito, que aqui é de mentira) pode chegar logo depois e substituir a da tela.
			if absf(main.world.pred.max_speed - speed_before * 0.6) > 0.01 or absf(float(main.ch["stats"]["moveSpeed"]) - speed_before * 0.6) > 0.01:
				fail("a velocidade do Atolado não chegou à previsão (%.2f)" % main.world.pred.max_speed)
				return
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
			main._on_message({"t": "cleanse", "eid": main.ch["eid"], "id": "disoriented"})
			main._on_message({"t": "speed", "moveSpeed": speed_before})
			if main.hud._debuffs.has("disoriented"):
				fail("a Alvorada não tirou o efeito negativo da interface")
				return
			if absf(main.world.pred.max_speed - speed_before) > 0.01:
				fail("a velocidade não voltou ao normal na previsão")
				return
			say("mecânicas dos monstros: avisos em círculo, cone e linha (e um cancelado), explosão, puxão, drenagem de mana, eco, investida, reforços e pressão desenhados; Desorientado na interface e tirado pela Alvorada; a velocidade do Atolado chegou à previsão do movimento e voltou")
			step = "mech_real"
		"mech_real":
			# luta de verdade (servidor --dev): a uns 25 m dos Javalis de Cinza, bem fora do raio em que eles
			# percebem alguém (8 m), para o aviso não chegar antes de o cliente desenhar o personagem no lugar
			# novo; sem comandos de mestre (servidor de produção), fica de fora
			step = "real_wait"
			Net.request("gm", {"cmd": "teleport", "x": 111.0, "z": 50.0}, func(r):
				if not r.get("ok", false):
					say("sem comandos de mestre neste servidor: a luta de verdade contra uma mecânica ficou de fora (%s)" % r.get("reason", ""))
					step = "done"
					return
				real_until = Time.get_ticks_msec() + 20000
				wait_until = Time.get_ticks_msec() + 600
				step = "real_approach")
		"real_approach":
			if not real_warn.is_empty():
				if not main.world.vfx._warns.has(str(real_warn.get("id", ""))):
					var me: Vector3 = main.world.my_pos()
					fail("a investida chegou do servidor, mas o aviso não foi desenhado (aviso %s em (%.1f, %.1f); personagem desenhado em (%.1f, %.1f); avisos desenhados: %s)" % [str(real_warn.get("id", "")), float(real_warn["x"]), float(real_warn["z"]), me.x, me.z, str(main.world.vfx._warns.keys())])
					return
				real_shot_at = Time.get_ticks_msec() + 350  # com --shots: a marcação já desenhada no meio do aviso
				wait_until = Time.get_ticks_msec() + int(float(real_warn.get("ms", 1500))) + 700
				step = "real_check"
				return
			if Time.get_ticks_msec() > real_until:
				fail("nenhum Javali de Cinza avisou a investida em 20 s")
				return
			if Time.get_ticks_msec() < wait_until or Vector2(main.world.my_pos().x - 111.0, main.world.my_pos().z - 50.0).length() > 12.0:
				return
			# anda até 6 m do javali mais perto: a 8 m ele percebe e avisa a investida (4 a 12 m)
			var mp: Vector3 = main.world.auth_pos()
			var boar := ""
			var bd := 1e9
			for eid in main.world.entities.keys():
				var e: Dictionary = main.world.entities[eid]
				if e["data"]["k"] == "m" and e["data"]["def"] == "ash_boar":
					var d: float = Vector2(e["node"].position.x - mp.x, e["node"].position.z - mp.z).length()
					if d < bd:
						bd = d
						boar = eid
			if boar == "":
				fail("nenhum Javali de Cinza visível perto de (111, 50)")
				return
			var bp: Vector3 = main.world.entities[boar]["node"].position
			var dir := Vector2(bp.x - mp.x, bp.z - mp.z)
			var go := Vector2(mp.x, mp.z) + dir.normalized() * maxf(0.0, dir.length() - 6.0)
			Net.request("move", {"x": go.x, "z": go.y})
			wait_until = Time.get_ticks_msec() + 700
		"real_check":
			# o golpe sai no relógio do servidor (tempo real); a marcação segue o relógio do cliente, que anda
			# mais devagar quando os quadros demoram (renderização por software): espera ela sumir, com folga
			if real_shot_at > 0 and Time.get_ticks_msec() >= real_shot_at:
				real_shot_at = 0
				_shot("investida")
			if Time.get_ticks_msec() < wait_until:
				return
			if not real_dash:
				fail("o Javali avisou a investida, mas não correu")
				return
			if real_hit:
				fail("a investida acertou o personagem mesmo depois do passo de lado")
				return
			if main.world.vfx._warns.has(str(real_warn.get("id", ""))):
				if Time.get_ticks_msec() > wait_until + 8000:
					fail("a marcação da investida não sumiu depois do golpe")
				return
			say("luta de verdade: um Javali de Cinza avisou a investida (linha de %d m, %s s), o aviso foi desenhado, o personagem saiu de lado e o javali passou direto sem acertá-lo" % [int(float(real_warn.get("length", 0.0))), ("%.1f" % (float(real_warn.get("ms", 0.0)) / 1000.0)).replace(".", ",")])
			step = "real_back"
			Net.request("gm", {"cmd": "teleport", "x": 20.0, "z": 50.0}, func(_r):
				wait_until = Time.get_ticks_msec() + 600
				step = "real_done")
		"real_done":
			if Time.get_ticks_msec() >= wait_until:
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
			# sem o Mapa da Estrada Velha (recompensa do tutorial), a tecla M só avisa
			main.hud.toggle_map()
			if main.hud.map_panel.visible:
				fail("o mapa abriu sem o item de mapa")
				return
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
				elif main.args.has("board"):
					step = "board_go"
				elif main.args.has("defense"):
					step = "def_prep"
				else:
					say("OK")
					get_tree().quit(0))
			step = "quitting"
		# ---------------- quadro de missões (--board, servidor --dev) ----------------
		"board_go":
			zone_changed = ""
			step = "board_wait_zone"
			Net.request("gm", {"cmd": "teleport", "mapId": "pedrambar", "x": 37.0, "z": 26.0}, func(r):
				if not r["ok"]:
					fail("teleporte para Pedrâmbar recusado: %s" % r.get("reason", "")))
		"board_wait_zone":
			if zone_changed == "pedrambar" and main.world and main.world.object_nodes.has("board_ambar") and not main.world.me().is_empty():
				say("em Pedrâmbar; indo ao quadro de missões da praça")
				_act("object", "board_ambar")
				step = "board_wait_panel"
		"board_wait_panel":
			if main.hud.npc_panel.visible and str(main.hud.npc_open.get("role", "")) == "board":
				var rows := 0
				for ch in main.hud.npc_box.get_children():
					if ch is Label and str(ch.text).contains("— nível"):
						rows += 1
				if rows == 0:
					fail("o quadro de missões abriu sem nenhuma missão")
					return
				say("quadro de missões aberto pela interface: %d missões disponíveis" % rows)
				_shot("quadro")
				main.hud.npc_panel.visible = false
				# item de missão na bolsa: o menu do botão direito não oferece venda nem descarte
				step = "board_qitem_wait"
				Net.request("gm", {"cmd": "give", "defId": "qi_warm_shell"}, func(r):
					if not r["ok"]:
						fail("não deu para criar o item de missão: %s" % r.get("reason", ""))
						return
					if r.has("char"):
						main.set_char(r["char"])
					step = "board_qitem")
		"board_qitem":
			var inst := {}
			for it in main.ch.get("items", []):
				if it["defId"] == "qi_warm_shell" and it["loc"] == "bag":
					inst = it
			if inst.is_empty():
				fail("o item de missão não apareceu na bolsa")
				return
			main.hud._bag_menu(inst)
			var texts := []
			var marked := false
			for b in main.hud._bag_menu_node.find_children("*", "Button", true, false):
				texts.append(str(b.text))
				if str(b.text).begins_with("Item de missão") and b.disabled:
					marked = true
			main.hud._close_bag_menu()
			for t in texts:
				if str(t).begins_with("Vender") or str(t).begins_with("Descartar"):
					fail("o menu do item de missão oferece \"%s\" (o servidor recusa)" % t)
					return
			if not marked or not ItemText.describe(main.defs, inst, main.ch).contains("Item de missão"):
				fail("o item de missão não aparece como tal no menu e na dica: %s" % ", ".join(texts))
				return
			say("item de missão na bolsa: menu sem venda nem descarte (%s)" % ", ".join(texts))
			say("OK")
			get_tree().quit(0)
			step = "quitting"
		# ---------------- defesa do Joca (--defense, servidor --dev) ----------------
		"def_prep":
			step = "def_wait"
			var pre := ["tutorial", "c1_count", "c1_rats", "c1_master", "c1_route", "c1_foreman", "c2_water", "c3_trial"]
			Net.request("gm", {"cmd": "xp", "level": 7}, func(_r):
				Net.request("gm", {"cmd": "quest_done", "quests": pre}, func(_r2):
					zone_changed = ""
					Net.request("gm", {"cmd": "teleport", "mapId": "brejo_bombas", "x": 111.0, "z": 56.5}, func(r3):
						if not r3["ok"]:
							fail("teleporte para o Brejo recusado: %s" % r3.get("reason", ""))
							return
						step = "def_wait_zone")))
		"def_wait_zone":
			if zone_changed == "brejo_bombas" and main.world and main.world.npc_nodes.has("joca") and not main.world.me().is_empty():
				step = "def_wait"
				Net.request("quest_accept", {"quest": "c2_pressure", "npc": "joca"}, func(r):
					if not r["ok"]:
						fail("Joca recusou O Teste de Pressão: %s" % r.get("reason", ""))
						return
					say("O Teste de Pressão aceito; abrindo a válvula principal")
					# a ficha mostra o seletor de título (o da prova de classe já conta)
					main.hud.sheet_panel.visible = true
					main.hud.refresh_char()
					_act("object", "main_valve")
					wait_until = Time.get_ticks_msec() + 15000
					step = "def_wait_entity")
		"def_wait_entity":
			var joca_e := ""
			for eid in main.world.entities.keys():
				var d: Dictionary = main.world.entities[eid]["data"]
				if d.get("k", "") == "e" and str(d.get("npc", "")) == "joca":
					joca_e = eid
			if joca_e != "" and not (main.world.npc_nodes["joca"]["node"] as Node3D).visible and main.hud.defense_label.visible:
				var d2: Dictionary = main.world.entities[joca_e]["data"]
				say("defesa em andamento: %s com %d/%d de vida no lugar do NPC; %s" % [str(d2.get("n", "")), int(d2.get("hp", 0)), int(d2.get("mhp", 0)), main.hud.defense_label.text])
				var titles: Array = main.ch.get("titles", [])
				if titles.is_empty():
					fail("a ficha não recebeu os títulos ganhos")
					return
				say("títulos na ficha: %s" % ", ".join(titles))
				_shot("defesa")
				main.hud.sheet_panel.visible = false
				wait_until = Time.get_ticks_msec() + 20000
				step = "def_click"
			elif Time.get_ticks_msec() > wait_until:
				fail("a defesa não apareceu (entidade %s, NPC visível %s)" % [joca_e, str((main.world.npc_nodes["joca"]["node"] as Node3D).visible)])
		"def_click":
			# a onda chega no Joca: o clique entre um monstro e o NPC escondido ataca o monstro (antes abria a
			# conversa com o NPC, que fica a menos de 1,5 m do clique)
			var jpos: Vector3 = main.world.npc_nodes["joca"]["pos"]
			var mon := ""
			var mon_d := 2.6
			for eid in main.world.entities.keys():
				var e: Dictionary = main.world.entities[eid]
				var md: float = Vector2(e["node"].position.x - jpos.x, e["node"].position.z - jpos.z).length()
				if e["data"]["k"] == "m" and md < mon_d:
					mon = eid
					mon_d = md
			if mon == "":
				if Time.get_ticks_msec() > wait_until:
					fail("nenhum monstro da onda chegou perto do Joca da defesa")
				return
			var mp: Vector3 = main.world.entities[mon]["node"].position
			var dir := Vector3(mp.x - jpos.x, 0.0, mp.z - jpos.z).normalized()
			var gp := Vector3(jpos.x + dir.x * 1.0, mp.y, jpos.z + dir.z * 1.0)
			main.world.pending_action = {}
			main.world.selected = ""
			main.world._click(main.world.camera.unproject_position(gp))
			if not main.world.pending_action.is_empty():
				fail("o clique no monstro colado no Joca virou %s com %s" % [str(main.world.pending_action.get("kind", "")), str(main.world.pending_action.get("id", ""))])
				return
			if main.world.selected == "" or str(main.world.entities.get(main.world.selected, {}).get("data", {}).get("k", "")) != "m":
				fail("o clique no monstro colado no Joca não selecionou o monstro (alvo: %s)" % main.world.selected)
				return
			say("clique no monstro a %.1f m do Joca da defesa: atacando %s" % [mon_d, main.world.selected])
			# sai do Brejo no meio da defesa: o cronômetro da válvula não pode ficar preso na tela
			zone_changed = ""
			step = "def_wait_leave"
			Net.request("gm", {"cmd": "teleport", "mapId": "pedrambar", "x": 37.0, "z": 26.0}, func(r):
				if not r["ok"]:
					fail("teleporte para Pedrâmbar recusado: %s" % r.get("reason", "")))
		"def_wait_leave":
			if zone_changed == "pedrambar" and main.world and not main.world.me().is_empty():
				if main.hud.defense_label.visible:
					fail("o cronômetro da defesa ficou preso na tela depois de sair do Brejo (%s)" % main.hud.defense_label.text)
					return
				say("fora do Brejo: o cronômetro da válvula saiu da tela")
				say("OK")
				get_tree().quit(0)
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
					step = "m2_tut")
				step = "m2_wait"
		"m2_tut":
			_tut_tick()
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
					main.set_char(r["char"])
					# recompensa: o Mapa da Estrada Velha abre o mapa pela tecla M
					main.hud.toggle_map()
					if not main.hud.map_panel.visible:
						fail("o mapa não abriu com o Mapa da Estrada Velha na bolsa")
						return
					say("Mapa da Estrada Velha recebido: a tecla M abre o mapa de %s" % main.map_def().get("name", "?"))
					wait_until = Time.get_ticks_msec() + 600
					step = "m2_map_shot")
				step = "m2_wait"
		"m2_map_shot":
			if Time.get_ticks_msec() > wait_until:
				_shot("mapa")
				main.hud.toggle_map()
				step = "m2_party"
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
				main.hud.journal_panel.visible = false
				# o mesmo Mapa da Estrada Velha vale na cidade
				main.hud.toggle_map()
				if not main.hud.map_panel.visible:
					fail("o mapa não abriu na cidade")
					return
				say("mapa aberto em %s" % main.map_def().get("name", "?"))
				wait_until = Time.get_ticks_msec() + 500
				step = "m2_city_map"
		"m2_city_map":
			if Time.get_ticks_msec() > wait_until:
				_shot("mapa_cidade")
				main.hud.toggle_map()
				say("OK")
				get_tree().quit(0)
				step = "quitting"

## Eventos da luta de verdade contra o Javali: o primeiro aviso de investida faz o personagem sair de lado
## na hora (3,5 m para o lado em que já está; se o servidor recusar, para o outro); golpes e a corrida dele
## ficam anotados para a conferência.
func _real_msg(m: Dictionary) -> void:
	var t: String = m.get("t", "")
	if t == "warn" and real_warn.is_empty() and str(m.get("kind", "")) == "charge":
		real_warn = m
		real_boar = str(m.get("src", ""))
		var yaw := float(m.get("yaw", 0.0))
		var side := Vector2(cos(yaw), -sin(yaw))
		var p: Vector3 = main.world.auth_pos()
		var sgn := 1.0 if Vector2(p.x - float(m["x"]), p.z - float(m["z"])).dot(side) >= 0.0 else -1.0
		var a := Vector2(p.x, p.z) + side * sgn * 3.5
		var b := Vector2(p.x, p.z) - side * sgn * 3.5
		Net.request("move", {"x": a.x, "z": a.y}, func(r):
			if not r.get("ok", false):
				Net.request("move", {"x": b.x, "z": b.y}))
	elif t == "hit" and m.get("skill", "") == "charge" and m.get("src", "") == real_boar and m.get("dst", "") == main.ch.get("eid", ""):
		real_hit = true
	elif t == "mech" and m.get("kind", "") == "dash" and m.get("eid", "") == real_boar:
		real_dash = true

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

## Tutorial «Três do Outro Lado» pela interface: a cada 0,4 s olha o primeiro passo ainda aberto no diário
## e age como um jogador (anda, clica no rato, aperta 1 e 7, coleta, luta pelos bichos de Caio, sai da faixa
## do segundo toque, entra no círculo do posto). Confere que a dica na tela acompanha o passo.
func _tut_quest() -> Dictionary:
	for q in main.journal.get("active", []):
		if q["id"] == "tutorial":
			return q
	return {}

func _tut_person(name: String) -> Dictionary:
	for eid in main.world.entities.keys():
		var e: Dictionary = main.world.entities[eid]
		if e["data"].get("k", "") == "e" and str(e["data"].get("n", "")).begins_with(name):
			return e
	return {}

func _tut_nearest(pred: Callable, from: Vector3, max_d := 1e9) -> String:
	var best := ""
	var bd := max_d
	for eid in main.world.entities.keys():
		var e: Dictionary = main.world.entities[eid]
		if e["data"].get("k", "") != "m" or not pred.call(eid, e):
			continue
		var d: float = Vector2(e["node"].position.x - from.x, e["node"].position.z - from.z).length()
		if d < bd:
			bd = d
			best = eid
	return best

func _tut_fight(eid: String, use_skill: bool) -> void:
	if eid == "":
		return
	if main.world.selected != eid or main.world.entities[eid]["data"].get("tgt", null) == null:
		main.world.selected = eid
		Net.request("attack", {"target": eid})
	var skills: Array = main.class_skills()
	if use_skill and not skills.is_empty() and main.hud._cd_left(str(skills[0])) <= 0.05:
		main.hud._hotkey(0)   # tecla 1 (só com a recarga pronta, como um jogador)
	var c: Dictionary = main.ch
	if float(c.get("hp", 1)) < float(c.get("stats", {}).get("maxHp", 1)) * 0.5:
		main.hud._hotkey(6)   # tecla 7: tônico de vida

func _tut_tick() -> void:
	if Time.get_ticks_msec() < tut_until:
		return
	tut_until = Time.get_ticks_msec() + 400
	var q := _tut_quest()
	if q.is_empty():
		return
	if q.get("ready", false):
		say("tutorial pronto: Bento, Ligia e Caio no círculo do Posto da Ponte")
		_shot("tutorial_chegada")
		wait_until = Time.get_ticks_msec() + 300
		step = "m2_turnin"
		return
	var objs: Array = q["objectives"]
	var i := 0
	while i < objs.size() and objs[i]["done"]:
		i += 1
	if i >= objs.size():
		return
	if not tut_said.has(i):
		tut_said[i] = true
		# a dica na tela é a do passo atual
		if not main.hud.tut_panel.visible or main.hud.tut_hint.text != str(objs[i].get("hint", "")):
			fail("a dica na tela não acompanha o passo %d (%s)" % [i + 1, objs[i]["text"]])
			return
		say("passo %d: %s — dica: %s" % [i + 1, objs[i]["text"], main.hud.tut_hint.text])
		if i == 1:
			_shot("tutorial_dica")
	var me: Vector3 = main.world.my_pos()
	match i:
		0:  # andar até Bento
			var b := _tut_person("Bento")
			if not b.is_empty():
				var bp: Vector3 = b["node"].position
				main.world.request_move(bp.x - 2.0, bp.z + 1.0)
		1, 2:  # atacar um Rato de Sulco; usar a habilidade da tecla 1
			_tut_fight(_tut_nearest(func(_eid, e): return e["data"]["def"] == "furrow_rat", me), i == 2)
		3:  # Ligia ferida: tônico (tecla 7) perto dela
			var l := _tut_person("Ligia")
			if l.is_empty():
				return
			var lp: Vector3 = l["node"].position
			if Vector2(lp.x - me.x, lp.z - me.z).length() > 3.5:
				main.world.request_move(lp.x + 1.5, lp.z - 1.0)
			else:
				main.hud._hotkey(6)
		4:  # coletar o saque
			if main.world.loots.is_empty():
				_tut_fight(_tut_nearest(func(_eid, e): return e["data"]["def"] == "furrow_rat", me), false)
			elif main.world.pending_pickup == "":
				var lid: String = main.world.loots.keys()[0]
				var lpos: Vector3 = main.world.loots[lid]["node"].position
				main.world.pending_pickup = lid
				main.world.request_move(lpos.x, lpos.z)
		5:  # Caio cercado: os dois bichos que aparecem perto dele (em perseguição, batendo no menino ou em você)
			var c := _tut_person("Caio")
			if c.is_empty():
				return
			var cp: Vector3 = c["node"].position
			var g := _tut_nearest(func(_eid, e): return str(e["data"].get("st", "")) == "chase", cp, 7.0)
			if g != "":
				_tut_fight(g, true)
			elif Vector2(cp.x - me.x, cp.z - me.z).length() > 5.5:
				main.world.request_move(cp.x - 4.0, cp.z + 2.0)
		6:  # segundo toque: volta ao posto e sai da faixa quando ela acender
			if not tut_warn.is_empty() and int(tut_warn.get("_seen", 0)) == 0:
				tut_warn["_seen"] = 1
				var yaw := float(tut_warn["yaw"])
				var side := Vector2(cos(yaw), -sin(yaw)) * 4.0
				tut_dodged += 1
				say("segundo toque! faixa vermelha embaixo do personagem; saindo para o lado")
				_shot("tutorial_faixa")
				main.world.request_move(me.x + side.x, me.z + side.y, func(r):
					if not r.get("ok", false):
						main.world.request_move(me.x - side.x, me.z - side.y))
			elif tut_warn.is_empty() and Vector2(me.x - 30.0, me.z - 50.0).length() > 1.5:
				main.world.request_move(30.0, 50.0)
		7:  # os três dentro do círculo do posto
			if Vector2(me.x - 22.0, me.z - 50.0).length() > 1.0:
				main.world.request_move(22.0, 50.0)

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
var nav_frames_at := 0  # quadros desenhados exigidos antes do próximo passo (renderizador lento, sem placa)
var nav_delete_shown := false

func start_nav(m) -> void:
	main = m
	t0 = Time.get_ticks_msec()
	# renderizador por software (máquina sem placa de vídeo, como a macOS do CI): poucos quadros por segundo
	deadline_ms = 300000
	step = "nav"
	nav_until = Time.get_ticks_msec() + 1500
	say("capturas de navegação em %s" % main.args["navshots"])

func _nav_shot(name: String) -> void:
	var path := "%s/%s.png" % [main.args["navshots"], name]
	get_viewport().get_texture().get_image().save_png(path)
	say("captura: " + path)
	say("quadros: %.1f por segundo, %d desenhados" % [Engine.get_frames_per_second(), Engine.get_frames_drawn()])

func _nav_tick() -> void:
	if Time.get_ticks_msec() < nav_until or Engine.get_frames_drawn() < nav_frames_at:
		return
	var next_wait := 1200
	var next_frames := 2  # a captura é do último quadro desenhado: espera a tela nova aparecer num quadro
	match nav_step:
		0:
			_nav_shot("01_titulo")
			main.show_options()
		1:
			_nav_shot("02_opcoes")
			main.options_panel.queue_free()
			main.options_panel = null
			main.show_credits()
		2:
			_nav_shot("10_creditos")
			main.show_login()
		3:
			_nav_shot("03_entrar")
			main.account = main.args.get("account", "vitrine")
			main.password = main.args.get("password", "vitrine123")
			main.connect_and_login(true)
			next_wait = 2000
		4:
			if main.state != "chars":
				return
			main.show_create()
			main._create_class = main.args.get("class", "emberweaver")
			main._build_create(main.args.get("name", "Vitrine"))
		5:
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
		6:
			if not nav_delete_shown:
				# tela de excluir personagem: só a captura (nada é enviado ao servidor)
				_nav_shot("05_personagens")
				main.show_delete_char(main._selected_char)
				nav_delete_shown = true
				nav_until = Time.get_ticks_msec() + 800
				if DisplayServer.get_name() != "headless":
					nav_frames_at = Engine.get_frames_drawn() + 2
				return
			_nav_shot("05b_excluir_personagem")
			main.show_chars(main._selected_char)
			main.enter_world(main._selected_char)
			next_wait = 250
		7:
			_nav_shot("06_carregando")
			next_wait = 2500
		8:
			if not main.in_world:
				return
			Net.request("move", {"x": 30.0, "z": 50.0})
			next_wait = 3500
			next_frames = 8  # a tela Carregando some em 0,8 s de jogo (com quadros lentos, só depois de vários)
		9:
			_nav_shot("07_mundo")
			main.world.cam_dist = 11.0
			next_wait = 1200
		10:
			_nav_shot("08_mundo_perto")
			main.toggle_pause_menu()
			next_wait = 600
		11:
			_nav_shot("09_menu_pausa")
			say("OK")
			get_tree().quit(0)
			return
	nav_step += 1
	nav_until = Time.get_ticks_msec() + next_wait
	if DisplayServer.get_name() != "headless":
		nav_frames_at = Engine.get_frames_drawn() + next_frames


# ---------------- telas de conta (--contastest=pasta_dos_emails) ----------------
# Servidor com --auth token e serviço de contas com --email arquivo --email-dir pasta_dos_emails. Percorre as
# telas como o jogador (campos e botões de verdade): cria a conta, "fecha o jogo" sem confirmar, tenta entrar
# (a recusa abre a tela do código com a conta preenchida; recusada também ao reconectar, como de dentro do mundo,
# a tela volta sem "Sem conexão" e com a conexão aberta), pede outro código (barrado: um e-mail por minuto),
# confirma com o código lido do e-mail, entra pela mesma conexão, baixa os dados (arquivo em user://dados), salva
# uma cópia pelo diálogo de arquivo (na pasta dos e-mails) e, com --termos=conta:senha (conta que aceitou uma
# versão anterior dos termos), aceita os termos novos e entra.
var ac_step := 0
var ac_until := 0
var ac_data_path := ""
var ac_screen = null  # tela do código antes da reconexão (sai quando a recusa abre a tela de novo)

func start_accounts(m) -> void:
	main = m
	t0 = Time.get_ticks_msec()
	deadline_ms = 90000
	step = "contas"
	ac_until = Time.get_ticks_msec() + 800
	say("telas de conta; e-mails em %s" % main.args["contastest"])

func _ui_nodes(cls: String) -> Array:
	return main.screen.find_children("*", cls, true, false) if main.screen else []

## Botão (ou caixa de seleção) da tela pelo texto; prefix = começa com o texto.
func _ui_button(text: String, prefix := false) -> Button:
	for b in _ui_nodes("Button"):
		var t: String = (b as Button).text
		if t == text or (prefix and t.begins_with(text)):
			return b
	return null

func _ui_press(text: String) -> bool:
	var b := _ui_button(text)
	if b == null:
		fail("botão «%s» não está na tela «%s»" % [text, _ui_title()])
		return false
	b.pressed.emit()
	return true

## Subtítulo do painel (o segundo rótulo: o primeiro é o nome do jogo).
func _ui_title() -> String:
	var labels := _ui_nodes("Label")
	return (labels[1] as Label).text if labels.size() > 1 else ""

## Preenche os campos de texto da tela, na ordem (null = deixa como está).
func _ui_fill(values: Array) -> void:
	var edits := _ui_nodes("LineEdit")
	for i in range(mini(values.size(), edits.size())):
		if values[i] != null:
			(edits[i] as LineEdit).text = values[i]

func _ui_status() -> String:
	return main.status_label.text if main.status_label else ""

## Código de 6 dígitos do e-mail mais recente da pasta (--email arquivo, e um SMTP de teste, gravam .eml com o
## corpo em base64 e o nome começando pela hora em ms). Com `to`, só e-mails para esse endereço; com `since`
## (segundos Unix), só os gravados depois disso.
func _mail_code(dir: String, to := "", since := 0.0) -> String:
	var files := Array(DirAccess.get_files_at(dir)).filter(func(f): return str(f).ends_with(".eml"))
	files.sort()
	files.reverse()
	var re := RegEx.new()
	re.compile("\\b(\\d{6})\\b")
	for f in files:
		var stamp := str(f).get_slice("-", 0)
		if since > 0.0 and stamp.is_valid_int() and stamp.length() == 13 and int(stamp) / 1000.0 < since - 2.0:
			break  # os nomes começam com a hora: daqui para trás é mais velho que o pedido
		var parts := FileAccess.get_file_as_string(dir.path_join(f)).split("\r\n\r\n", true, 1)
		if parts.size() < 2:
			continue
		if to != "":
			var mine := false
			for line in parts[0].split("\r\n"):
				var l := str(line).to_lower()
				if l.begins_with("to:") and (l.substr(3).strip_edges() == to.to_lower() or l.contains("<%s>" % to.to_lower())):
					mine = true
			if not mine:
				continue
		var found := re.search(Marshalls.base64_to_utf8(parts[1].replace("\r\n", "").strip_edges()))
		if found:
			return found.get_string(1)
	return ""

func _accounts_tick() -> void:
	if Time.get_ticks_msec() < ac_until:
		return
	var acc: String = main.args.get("account", "testador")
	var pw: String = main.args.get("password", "senha-forte-1")
	match ac_step:
		0:
			main.show_login()
			_ui_fill([null, acc, pw])
			if not _ui_press("Criar conta"):
				return
		1:
			if _ui_title() != "Criar conta":
				return
			_ui_fill([acc, "%s@exemplo.com" % acc, pw])
			(_ui_button("Tenho 13 anos", true) as CheckBox).button_pressed = true
			if not _ui_press("Criar e receber o código"):
				return
		2:
			if _ui_title() != "Confirmar e-mail":
				if _ui_title() == "Criar conta" and _ui_status() != "":  # a tela de cadastro só escreve recusas
					fail("cadastro recusado: " + _ui_status())
				return
			say("cadastro ok, tela do código aberta; fechando o jogo sem confirmar")
			Net.close()
			main.show_title()
		3:
			main.show_login()
			_ui_fill([null, acc, pw])
			if not _ui_press("Entrar"):
				return
		4:
			if _ui_title() != "Confirmar e-mail":
				return
			var edits := _ui_nodes("LineEdit")
			if (edits[0] as LineEdit).text != acc:
				fail("a conta não veio preenchida na tela do código")
				return
			say("login recusado abriu a tela do código com a conta preenchida")
			# a mesma recusa ao reconectar de dentro do mundo (conexão caiu, "Reconectar"): sai do mundo e abre a
			# tela do código, mantendo a conexão nova aberta (sem "Sem conexão" na linha de status)
			ac_screen = main.screen
			main.reconnect()
		5:
			if is_instance_valid(ac_screen) or _ui_title() != "Confirmar e-mail":
				return
			ac_until = Time.get_ticks_msec() + 1500  # tempo de sobra para um fechamento de conexão chegar
			ac_step += 1
			return
		6:
			if _ui_status().contains("Sem conexão") or not Net.is_open():
				fail("a recusa ao reconectar deixou a tela do código sem conexão: «%s»" % _ui_status())
				return
			say("recusa ao reconectar: tela do código de novo, com a conexão aberta")
			if not _ui_press("Reenviar código"):
				return
		7:
			if not _ui_status().contains("Espere"):
				return
			say("reenviar logo depois do cadastro: " + _ui_status())
			var code := _mail_code(str(main.args["contastest"]), "%s@exemplo.com" % acc)
			if code == "":
				fail("código não encontrado nos e-mails")
				return
			_ui_fill([null, code])
			if not _ui_press("Confirmar"):
				return
		8:
			if _ui_title() != "Entrar" or not _ui_status().contains("confirmada"):
				return
			say("conta confirmada; entrando pela mesma conexão")
			if not _ui_press("Entrar"):
				return
		9:
			if main.state != "chars":
				return
			say("lista de personagens de %s" % main.account)
			if not _ui_press("Baixar meus dados"):
				return
		10:
			if _ui_title() != "Baixar meus dados":
				return
			_ui_fill([pw])
			if not _ui_press("Baixar"):
				return
		11:
			if not _ui_status().begins_with("Pronto"):
				return
			var edits := _ui_nodes("LineEdit")
			var path: String = (edits[-1] as LineEdit).text
			var data = JSON.parse_string(FileAccess.get_file_as_string(path))
			if not (data is Dictionary) or not (data.get("conta") is Dictionary) or str(data["conta"].get("name", "")) != acc or data["conta"].get("terms_at") == null:
				fail("arquivo de dados inválido em " + path)
				return
			say("dados baixados em %s (termos aceitos: versão %d)" % [path, int(data["conta"]["terms_version"])])
			ac_data_path = path
			if not _ui_press("Salvar uma cópia em outro lugar..."):
				return
		12:
			# o diálogo de arquivo (nativo, quando o sistema tem) não dá para clicar sem tela: escolhe o caminho
			# pelo sinal, como o diálogo faria, e confere a cópia
			var dlgs: Array = main.ui.find_children("*", "FileDialog", true, false)
			if dlgs.is_empty():
				return
			var copy: String = str(main.args["contastest"]).path_join("copia-dos-dados.json")
			(dlgs[0] as FileDialog).file_selected.emit(copy)
			if not _ui_status().begins_with("Cópia salva") or FileAccess.get_file_as_string(copy) != FileAccess.get_file_as_string(ac_data_path):
				fail("a cópia escolhida no diálogo não confere: %s (%s)" % [copy, _ui_status()])
				return
			say("cópia salva pelo diálogo em " + copy)
			if not main.args.has("termos"):
				say("OK")
				get_tree().quit(0)
				return
			if not _ui_press("Voltar"):
				return
		13:
			if main.state != "chars":
				return
			if not _ui_press("Voltar"):
				return
		14:
			if _ui_title() != "Entrar":
				return
			var t: PackedStringArray = str(main.args["termos"]).split(":", true, 1)
			_ui_fill([null, t[0], t[1] if t.size() > 1 else ""])
			if not _ui_press("Entrar"):
				return
		15:
			if _ui_title() != "Termos atualizados":
				return
			say("tela de termos novos: " + str(main.screen.find_children("*", "Label", true, false)[2].text))
			if not _ui_press("Aceitar e entrar"):  # sem marcar a caixa: recusa
				return
		16:
			if not _ui_status().contains("marque"):
				return
			(_ui_button("Li e aceito", true) as CheckBox).button_pressed = true
			if not _ui_press("Aceitar e entrar"):
				return
		17:
			if main.state != "chars":
				return
			say("termos aceitos; lista de personagens de %s" % main.account)
			say("OK")
			get_tree().quit(0)
			return
	ac_step += 1
	ac_until = Time.get_ticks_msec() + 300


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
	say("quadros: %.1f por segundo, %d desenhados" % [Engine.get_frames_per_second(), Engine.get_frames_drawn()])

func _scene_tick() -> void:
	if Time.get_ticks_msec() < scene_until:
		return
	var wait := 1500
	if main.args.has("trial") and scene_i == 0 and not trial_done:
		_trial_tick()
		return
	if main.args.has("objetos") and scene_i == 0 and not obj_done:
		_obj_tick()
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


# ---------------- objetos de missão vistos no cliente (--sceneshots=pasta --objetos) ----------------
# Um objeto de cada modelo (art.gd quest_object: o kind ou o prefixo do id), em cada mapa aberto: teleporta para
# perto dele e salva a visão de jogo (câmera inicial, a 12 m).
var obj_list := []
var obj_i := 0
var obj_step := 0
var obj_until := 0
var obj_done := false

func _obj_tick() -> void:
	if Time.get_ticks_msec() < obj_until:
		return
	if obj_list.is_empty():
		var seen := {}
		for mid in main.defs["maps"].keys():
			var md: Dictionary = main.defs["maps"][mid]
			if md.get("instanced", false):
				continue
			for o in md.get("objects", []):
				# o modelo sai do kind ou do id sem o número do fim (marker_1, marker_2... são o mesmo)
				var key := "%s|%s" % [str(o.get("kind", "")), str(o["id"]).rstrip("0123456789")]
				if o.get("kind", "") == "dungeon" or seen.has(key):
					continue
				seen[key] = true
				obj_list.append([mid, o])
		say("objetos de missão: %d modelos para conferir" % obj_list.size())
		# nível do teto, para os monstros dos mapas altos não derrubarem o personagem no meio das capturas
		Net.request("gm", {"cmd": "xp", "level": 25})
	if obj_i >= obj_list.size():
		obj_done = true
		scene_i = SCENE_SPOTS.size()
		return
	var mid: String = obj_list[obj_i][0]
	var o: Dictionary = obj_list[obj_i][1]
	var wait := 1500
	match obj_step:
		0:
			# o personagem fica 3 m ao lado (+x): com a câmera inicial (de +z e −x), o objeto aparece à esquerda dele
			var x := float(o["x"]) + 3.0
			var z := float(o["z"]) + 0.5
			if main.map_def().get("id", "") != mid:
				Net.request("gm", {"cmd": "teleport", "mapId": mid, "x": x, "z": z})
				wait = 3500
			else:
				Net.request("gm", {"cmd": "teleport", "x": x, "z": z})
				wait = 1500
		1:
			if not main.in_world or main.world == null or main.map_def().get("id", "") != mid or main.world.me().is_empty():
				return
			main.world.cam_yaw = -0.6
			main.world.cam_dist = 12.0
			main.world.cam_pitch = 0.7
			wait = 2200
		2:
			_scene_shot("80_objeto_%s_%s" % [mid, str(o["id"])])
			obj_i += 1
			obj_step = 0
			obj_until = Time.get_ticks_msec() + 200
			return
	obj_step += 1
	obj_until = Time.get_ticks_msec() + wait

# ---------------- prova de classe vista no cliente (--sceneshots=pasta --trial) ----------------
var trial_step := 0
var trial_done := false
var trial_until := 0
var trial_casts := 0
var trial_esc := false

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
			# a conversa com o mestre mostra a prova antes do botão (título, tempo, objetivo e a habilidade emprestada)
			Net.request("talk", {"npc": master}, func(r):
				if r.get("ok", false):
					main.hud.show_npc(r))
			wait = 1500
		3:
			_scene_shot("89_%s_mestre" % str(main.ch["classId"]))
			if main.hud.npc_panel:
				main.hud.npc_panel.visible = false
			Net.request("trial_start", {"npc": master}, func(r):
				say("prova iniciada: %s" % str(r.get("ok")) + ("" if r.get("ok") else " " + str(r.get("reason")))))
			wait = 4000
		4:
			if main.map_def().get("id", "") != "arena_prova" or main.world == null or main.world.me().is_empty():
				return
			# visão ampla da arena (de frente para o fundo) com as peças e as marcas da prova desta classe; o
			# Lanceiro fica antes do primeiro fosso. O painel da prova sai da frente só nesta captura.
			var zz := 12.5 if str(main.ch["classId"]) == "pikeman" else 16.0
			Net.request("gm", {"cmd": "teleport", "x": 18.0, "z": zz})
			main.world.cam_yaw = PI
			main.world.cam_dist = 26.0
			main.world.cam_pitch = 0.9
			if main.hud.trial_panel:
				main.hud.trial_panel.visible = false
			wait = 2500
		5:
			_scene_shot("90_%s_arena" % str(main.ch["classId"]))
			if main.hud.trial_panel:
				main.hud.trial_panel.visible = true
			main.world.cam_dist = 16.0
			main.world.cam_pitch = 0.75
			wait = 1800
		6, 7, 8, 9, 10, 11, 12:
			# ataca o monstro (ou peça) mais próximo; sem monstro, escolhe um aliado da prova (aprendiz,
			# peregrino) para as curas e escudos; usa as habilidades disponíveis, a emprestada inclusive
			var best := ""
			var bd := 1e9
			var ally := ""
			for eid in main.world.entities.keys():
				var e: Dictionary = main.world.entities[eid]
				var d: float = e["node"].position.distance_to(main.world.my_pos())
				if e["data"]["k"] == "m" and d < bd:
					bd = d
					best = eid
				elif e["data"]["k"] == "a" and ally == "":
					ally = eid
			if ally != "":
				main.world.ally_selected = ally
			if best != "":
				main.world.selected = best
				if trial_step == 6 or main.world.entities[best]["data"].get("tgt", null) == null:
					Net.request("attack", {"target": best})
			var sk: Array = main.class_skills()
			var learned: Dictionary = main.ch.get("skills", {})
			var usable := []
			for sid in sk:
				var tgt_kind: String = str(main.defs["skills"].get(sid, {}).get("target", "enemy"))
				# sem monstro por perto, só as de aliado e as de área em volta (curas, escudos, reforços)
				if int(learned.get(sid, 0)) > 0 and (best != "" or tgt_kind in ["ally", "self", "party_area"]):
					usable.append(sid)
			if not usable.is_empty() and (best != "" or ally != ""):
				main.world.use_skill(usable[trial_casts % usable.size()])
				trial_casts += 1
			wait = 900
			if trial_step in [8, 10, 12]:
				var tag := "91_%s_luta_%d" % [str(main.ch["classId"]), (trial_step - 6) / 2]
				get_tree().create_timer(0.25).timeout.connect(func(): _scene_shot(tag))
		13:
			# Esc com um alvo selecionado e o personagem batendo nele: tira a seleção e para o ataque automático
			# (main.gd _unhandled_input manda "stop"). Na Vigília da Cantora não há monstro: pula
			var alvo := ""
			for eid in main.world.entities.keys():
				var e: Dictionary = main.world.entities[eid]
				if e["data"]["k"] == "m" and not e["data"].get("dead", false):
					alvo = eid
					break
			if alvo == "" or main.map_def().get("id", "") != "arena_prova":
				trial_step = 15
				return
			main.world.selected = alvo
			Net.request("attack", {"target": alvo})
			wait = 1200
		14:
			if main.world.selected != "" and str(main.world.me().get("data", {}).get("tgt", "")) == main.world.selected:
				var esc := InputEventKey.new()
				esc.keycode = KEY_ESCAPE
				esc.pressed = true
				Input.parse_input_event(esc)
				trial_esc = true
			wait = 1200
		15:
			if trial_esc:
				var tgt = main.world.me().get("data", {}).get("tgt", null)
				if main.world.selected != "" or tgt != null:
					fail("Esc não tirou a seleção ou não parou o ataque (seleção %s, alvo no servidor %s)" % [main.world.selected, str(tgt)])
					return
				say("Esc tirou a seleção e parou o ataque automático")
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
