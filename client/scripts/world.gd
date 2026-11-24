extends Node3D
## Mundo 3D: cenário (scenery.gd), câmera elevada com zoom/rotação suaves, entidades
## interpoladas no tempo do servidor (motion.gd), previsão do próprio personagem, reações a
## golpes e cliques (andar, atacar, falar, usar objeto, portal, coletar).
## Visual: cel shading + contorno (ver art.gd e docs/07-navegacao.md).

const Art = preload("res://scripts/art.gd")
const Scenery = preload("res://scripts/scenery.gd")
const Motion = preload("res://scripts/motion.gd")
const Vfx = preload("res://scripts/vfx.gd")
const STAFF_LABEL_COLOR := Color("#8fd0ff") # nome de quem é da equipe (a mesma cor da marca no chat)
const PLAYER_LABEL_COLOR := Color("#f2ead8") # nome dos outros jogadores

var main # main.gd
var scenery: Scenery
var vfx: Vfx
var cam_pivot: Node3D
var camera: Camera3D
var cam_yaw := -0.6        # alvo da rotação (teclas Q/E e botão direito)
var cam_pitch := 0.8
var cam_dist := 18.0       # alvo do zoom
var _cam_yaw := -0.6
var _cam_pitch := 0.8
var _cam_dist := 18.0
var _cam_vel := Vector3.ZERO
var _cam_lead := Vector3.ZERO
var entities := {} # eid -> { node, label, data, w, track, yaw, speed, vel, accel, turn, knock }
var loots := {} # loot id -> { node, data }
var selected := ""
var ally_selected := ""
var select_ring: MeshInstance3D
var dest_marker: MeshInstance3D
var pending_pickup := ""
var pending_cast := {}
var pending_action := {} # { kind: npc|object|portal, id, pos, range }
var npc_nodes := {}
var object_nodes := {}
var portal_nodes := {}
var clock: Motion.Clock = Motion.Clock.new()
var pred: Motion.Predictor = Motion.Predictor.new()
var _lp_offset := Vector2.ZERO
var _lp_render := Vector2.ZERO
var _rotating := false
var _t := 0.0
var log_motion := false   # usado pelo tour de capturas para medir a fluidez
var motion_log := []
var listener: AudioListener3D
var _step_surface := "footstep_stone"
var _boss_phase := 0
var _gate_prog := {}

const ROLE_NAMES := {"quest": "missões", "master": "mestre de classe", "smith": "ferreiro", "shop": "tônicos", "storage": "depósito", "armorer": "armeiro"}
## Entidades "e" que são gente (resgatados do tutorial, só o dono os vê): o corpo de morador de cada um.
const PEOPLE := {"man": 1.3, "woman": 1.25, "boy": 1.0}
## Som: passos só de quem está a até STEP_HEAR m do jogador; chão de terra nestes mapas, pedra nos demais
## (ruas calçadas, trilhos, túneis e câmaras).
const STEP_HEAR := 16.0
const DIRT_MAPS := ["estrada_velha", "brejo_bombas"]
## Teleporte (D186): salto de posição de gente maior que isso num snapshot, sem investida, salto ou puxão de monstro
## que o explique, desfaz o corpo em brasas no lugar antigo e o forma no novo.
const JUMP_MIN := 7.0
## Em combate, andando mais devagar que isso (m/s) com o alvo a até STRAFE_NEAR m, o personagem segue virado para o
## alvo e a passada vai de lado ou de costas (D186); correndo, vira para onde corre.
const STRAFE_MAX := 2.4
const STRAFE_NEAR := 8.0
## Quanto o corpo leva para se desfazer (s); o personagem fica no lugar antigo enquanto isso.
const VANISH_SECS := 0.3
var _arrivals := {}   # eid -> instante (ms) do evento joined: a entidade nova chega com o efeito de chegada
var _me_arrived := false

func _ready() -> void:
	var map: Dictionary = main.map_def()
	var env := WorldEnvironment.new()
	env.environment = Scenery.environment(map.get("id", ""))
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun_light = sun
	sun.rotation_degrees = Vector3(-52, -40, 0)
	sun.light_color = Scenery.sun_color(map.get("id", ""))
	sun.light_energy = 1.0
	sun.shadow_enabled = bool(main.gfx.get("shadows", true)) and not bool(main.gfx.get("light_mode", false)) if main else true
	sun.shadow_blur = 1.5
	sun.directional_shadow_max_distance = 70.0
	add_child(sun)
	Art.publish_sun(sun)
	scenery = Scenery.new()
	add_child(scenery)
	scenery.build(map)
	vfx = Vfx.new()
	vfx.world = self
	add_child(vfx)
	_build_map(map)
	cam_pivot = Node3D.new()
	add_child(cam_pivot)
	camera = Camera3D.new()
	camera.fov = 45
	camera.far = 900.0
	cam_pivot.add_child(camera)
	camera.current = true
	# ouvinte dos sons 3D 4 m acima do personagem (a câmera fica alta e longe), virado para onde a câmera
	# olha: os sons do próprio personagem soam a 0 dB (unit_size 4) e os de longe caem devagar
	listener = AudioListener3D.new()
	add_child(listener)
	listener.make_current()
	_step_surface = "footstep_dirt" if main.map_id in DIRT_MAPS else "footstep_stone"
	select_ring = Art.part(self, _torus(0.9, 1.05), Art.toon(Color("#ffcf4a"), false, Color(0.8, 0.6, 0.1)), Vector3.ZERO)
	select_ring.visible = false
	dest_marker = Art.part(self, _torus(0.3, 0.42), Art.toon(Color("#9fd3d1"), false, Color(0.3, 0.6, 0.6)), Vector3.ZERO)
	dest_marker.visible = false
	var ms: Dictionary = main.ch.get("stats", {})
	pred.max_speed = float(ms.get("moveSpeed", 5.0))
	pred.accel = float(ms.get("accel", 18.0))
	pred.decel = float(ms.get("decel", 24.0))

func _exit_tree() -> void:
	Sfx.clear_listener()

func _torus(inner: float, outer: float) -> TorusMesh:
	var t := TorusMesh.new()
	t.inner_radius = inner
	t.outer_radius = outer
	return t

func _label(text: String, size := 40, color := Color.WHITE) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.font_size = size
	l.pixel_size = 0.009
	l.modulate = color
	l.outline_size = 10
	l.outline_modulate = Color("#1a1210")
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	return l

## Altura do ponto mais alto das malhas do nó, acima da base dele (transformações locais até o nó, então vale
## também antes de ele entrar na árvore).
func _node_top(root: Node3D) -> float:
	var top := 1.2
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var m := mi as MeshInstance3D
		if m.mesh == null or not m.visible:
			continue
		var xf := Transform3D.IDENTITY
		var n: Node = m
		while n != null and n != root:
			if n is Node3D:
				xf = (n as Node3D).transform * xf
			n = n.get_parent()
		var box: AABB = xf * m.get_aabb()
		top = maxf(top, box.end.y)
	return minf(top, 4.0)

func ground_y(x: float, z: float) -> float:
	return scenery.height(x, z) if scenery else 0.0

func _gpos(x: float, z: float) -> Vector3:
	return Vector3(x, ground_y(x, z), z)

func _build_map(map: Dictionary) -> void:
	for b in map.get("blocked", []):
		var sx := float(b["x1"]) - float(b["x0"])
		var sz := float(b["z1"]) - float(b["z0"])
		var cx := float(b["x0"]) + sx / 2.0
		var cz := float(b["z0"]) + sz / 2.0
		var bl := _label(b["name"], 34, Color("#e8dccb"))
		bl.position = _gpos(cx, cz) + Vector3(0, 5.2, 0)
		add_child(bl)
	var gp: Dictionary = map.get("guardPost", {})
	if not gp.is_empty():
		var gpos := _gpos(float(gp["x"]), float(gp["z"]))
		if float(gp["safeRadius"]) > 0 and float(gp["safeRadius"]) < 30:
			# só a linha do círculo da zona segura (um anel fino rente ao chão)
			var r := float(gp["safeRadius"])
			var ring := TorusMesh.new()
			ring.inner_radius = r - 0.09
			ring.outer_radius = r + 0.09
			ring.rings = 96
			ring.ring_segments = 4
			var rm := StandardMaterial3D.new()
			rm.albedo_color = Color(0.7, 0.92, 0.9, 0.45)
			rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			var rmi := Art.part(self, ring, rm, gpos + Vector3(0, 0.25, 0), Vector3(1, 0.3, 1))
			rmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var gl := _label(gp["name"], 48, Color("#ffcf7a"))
		gl.position = gpos + Vector3(0, 4.2, -3)
		add_child(gl)
	for n in map.get("npcs", []):
		var npc_col := Color("#e3a548") if n.get("role", "") == "master" else Color.from_hsv(float(hash(n["id"]) % 360) / 360.0, 0.35, 0.75)
		var npc: Node3D
		if n.get("role", "") == "master" and n.has("classId"):
			npc = Art.character(n["classId"], _kit_family(n["classId"]))
		else:
			npc = Art.character("", "", true, npc_col, hash(n["id"]))
		npc.position = _gpos(float(n["x"]), float(n["z"]))
		npc.scale = Vector3.ONE * 1.3
		# de frente para o centro do mapa (onde os jogadores costumam estar)
		var size: Array = map.get("size", [160, 100])
		var home := atan2(float(size[0]) / 2.0 - float(n["x"]), float(size[1]) / 2.0 - float(n["z"]))
		npc.rotation.y = home
		add_child(npc)
		var nl := _label("%s\n‹%s›" % [n["name"], ROLE_NAMES.get(n.get("role", ""), "")], 36, Color("#ffe39a"))
		nl.position = npc.position + Vector3(0, 2.9, 0)
		add_child(nl)
		npc_nodes[n["id"]] = {"pos": npc.position, "data": n, "node": npc, "home": home, "yaw": home, "label": nl, "color": npc_col}
	for o in map.get("objects", []):
		var op := _gpos(float(o["x"]), float(o["z"]))
		if o.get("kind", "") == "dungeon":
			# portão da Eclusa: moldura de pedra, folha de ferro e brilho âmbar entre as frestas
			var gate := Node3D.new()
			gate.position = op
			add_child(gate)
			for k in [-1.0, 1.0]:
				Art.part(gate, Art.box(Vector3(1.2, 5.0, 1.2)), Art.toon(Color("#6a625c")), Vector3(k * 2.6, 2.5, 0))
			Art.part(gate, Art.box(Vector3(6.6, 1.0, 1.4)), Art.toon(Color("#5a524c")), Vector3(0, 5.3, 0))
			Art.part(gate, Art.box(Vector3(4.0, 4.6, 0.3)), Art.toon(Color("#7a4a30")), Vector3(0, 2.3, 0))
			Art.part(gate, Art.box(Vector3(0.12, 4.6, 0.34)), Art.toon(Color("#ffb347"), false, Color(1.0, 0.55, 0.15)), Vector3(0, 2.3, 0))
			var ol2 := _label(o["name"], 36, Color("#ffcf7a"))
			ol2.position = op + Vector3(0, 6.4, 0)
			add_child(ol2)
			object_nodes[o["id"]] = {"pos": op, "data": o, "node": gate, "static": true}
			continue
		# objeto de missão com modelo próprio (art.gd quest_object: pelo kind ou pelo prefixo do id), parado no
		# chão; um losango pequeno flutua em cima para dizer que dá para usar
		var obj: Node3D = Art.quest_object(o)
		obj.position = op
		# a frente do modelo (+z) virada para a câmera inicial (cam_yaw −0,6), com um pouco de variação
		obj.rotation.y = -0.6 + float(absi(hash(o["id"])) % 61 - 30) / 100.0
		add_child(obj)
		# o losango fica um pouco acima do ponto mais alto do modelo (a válvula grande, o tubo de resposta e o
		# quadro passam dos 2 m)
		var top := _node_top(obj) + 0.45
		var gem := Art.part(self, Art.sphere(0.13, 4), Art.toon(Color("#9fd3d1"), true, Color(0.2, 0.45, 0.45)), op + Vector3(0, top, 0), Vector3(1.0, 1.6, 1.0))
		var ol := _label(o["name"], 30, Color("#bfeeee"))
		ol.position = op + Vector3(0, top + 0.5, 0)
		add_child(ol)
		object_nodes[o["id"]] = {"pos": op, "data": o, "node": obj, "static": true, "gem": gem, "gem_y": top, "label": ol}
	for pt in map.get("portals", []):
		var pp := _gpos(float(pt["x"]), float(pt["z"]))
		var ring2 := Art.cyl(float(pt["radius"]), float(pt["radius"]), 0.06, 48)
		var pm := StandardMaterial3D.new()
		pm.albedo_color = Color(1.0, 0.7, 0.3, 0.35)
		pm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		pm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		var pr := Art.part(self, ring2, pm, pp + Vector3(0, 0.07, 0))
		pr.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var dest: Dictionary = main.defs.get("maps", {}).get(pt["to"], {})
		var lvl := int(pt.get("minLevel", 1))
		var pl := _label("→ %s%s" % [dest.get("name", pt["to"]), (" (nível %d)" % lvl) if lvl > 1 else ""], 42, Color("#ffcf7a"))
		pl.position = pp + Vector3(0, 4.4, 0)
		add_child(pl)
		portal_nodes[pt["id"]] = {"pos": pp, "data": pt}
	for sp in map.get("spawns", []):
		var md: Dictionary = main.defs.get("monsters", {}).get(sp["monster"], {})
		var sl := _label("%s (nv %d)" % [md.get("name", sp["monster"]), int(md.get("level", 1))], 30, Color(1, 1, 1, 0.45))
		sl.position = _gpos(float(sp["x"]), float(sp["z"]) + float(sp["radius"]) + 1) + Vector3(0, 0.4, 0)
		add_child(sl)

func _kit_family(class_id: String) -> String:
	for id in main.defs.get("classes", {}).get(class_id, {}).get("startingKit", {}).get("equip", []):
		var d: Dictionary = main.defs["items"].get(id, {})
		if d.get("slot", "") == "weapon":
			return d.get("family", "")
	return ""

func reset_entities() -> void:
	for e in entities.values():
		e["node"].queue_free()
	entities.clear()
	for l in loots.values():
		l["node"].queue_free()
	loots.clear()
	selected = ""
	pred.active = false

# ---------------- snapshots ----------------
func _weapon_family(def_id) -> String:
	if def_id == null:
		return ""
	return main.defs["items"].get(def_id, {}).get("family", "")

func _is_me(eid: String) -> bool:
	return eid == main.ch.get("eid", "")

func apply_snapshot(snap: Dictionary) -> void:
	var now_srv := float(snap.get("now", 0))
	clock.on_snapshot(now_srv)
	var seen := {}
	for d in snap.get("ents", []):
		var eid: String = d["id"]
		var e: Dictionary = entities.get(eid, {})
		# entidade nova sem o registro inteiro (só os grupos que mudaram, sem a base no cache de main.gd): não dá para
		# montá-la, e uma entrada quebrada em entities pararia o laço do mundo a cada quadro — fica de fora (D187)
		if e.is_empty() and not d.has("k"):
			continue
		seen[eid] = true
		if not e.is_empty() and d["k"] == "p" and (e.get("w") != d.get("w") or e.get("oh") != d.get("oh")):
			# trocou de arma ou de mão secundária: refaz o modelo no mesmo lugar (caído, o novo já aparece deitado)
			var keep: Motion.Track = e["track"]
			var yaw: float = e["yaw"]
			e["node"].queue_free()
			entities.erase(eid)
			e = _spawn_entity(d)
			if not e.has("node"):
				continue
			e["track"] = keep
			e["yaw"] = yaw
			entities[eid] = e
			_down_now(e)
		var fresh := e.is_empty()
		if fresh:
			e = _spawn_entity(d)
			if not e.has("node"):
				continue   # não deu para montar o modelo: nada de entrada quebrada em entities
			entities[eid] = e
		e["data"] = d
		var pos := Vector2(float(d["x"]), float(d["z"]))
		var vel := Vector2(float(d.get("vx", 0.0)), float(d.get("vz", 0.0)))
		if d.get("_u", true):
			if not fresh:
				_check_jump(e, pos)
			(e["track"] as Motion.Track).push(now_srv, pos, vel)
		if fresh:
			_on_spawned(eid, e)
		var name: String
		if d["k"] == "p":
			name = "%s  nv %d" % [d["n"], int(d["lvl"])]
			if d.get("cl") != null and str(d.get("cl")) != "":
				name = "[%s] %s" % [str(d["cl"]), name]
			# marca da equipe (papel gm/admin), só pelo campo do servidor; nome e sigla não a imitam (D145)
			var staff: bool = d.get("staff", false) == true
			if staff:
				name = "[Equipe] %s" % name
			e["label"].modulate = STAFF_LABEL_COLOR if staff else PLAYER_LABEL_COLOR
			if d.get("ttl") != null and str(d.get("ttl")) != "":
				name = "«%s»\n%s" % [str(d["ttl"]), name]
		elif d["k"] == "e":
			name = str(d.get("n", "Carroça"))
		elif d["k"] == "a":
			name = str(d.get("n", "Aprendiz"))
		else:
			name = "%s  nv %d" % [main.defs["monsters"].get(d["def"], {}).get("name", d["def"]), int(d["lvl"])]
		var frac := clampf(float(d["hp"]) / maxf(1.0, float(d["mhp"])), 0.0, 1.0)
		if d["k"] == "e" and PEOPLE.has(str(d.get("def", ""))) and int(d["hp"]) >= int(d["mhp"]):
			e["label"].text = name   # gente com a vida cheia: só o nome (e a situação: "preso no entulho"...)
		else:
			e["label"].text = "%s\n%d / %d" % [name, int(d["hp"]), int(d["mhp"])]
		# peça parada da prova (pilar, boneco, alvo, sino): só a vida no rótulo (o nome está no quadro do alvo)
		if d["k"] == "m" and main.defs["monsters"].get(d["def"], {}).has("model") and main.defs["monsters"][d["def"]]["model"] in ["pillar", "dummy", "target", "bell"]:
			e["label"].text = "%d / %d" % [int(d["hp"]), int(d["mhp"])]
		if d["k"] == "a" and int(d.get("sh", 0)) > 0:
			e["label"].text += "  (+%d)" % int(d["sh"])
		e["label"].visible = main.settings.get("show_names", true) or eid == selected or d["k"] == "a"
		if d["k"] == "m":
			e["label"].modulate = Color("#ffcf9a").lerp(Color("#ff4a3a"), 1.0 - frac)
			_trial_piece_state(e, d)
		elif d["k"] == "a":
			e["label"].modulate = Color("#a8f0b0").lerp(Color("#ff6a4a"), 1.0 - frac)
		if _is_me(eid):
			_reconcile(pos, d)
			if d.get("tgt") != null and not d.get("dead", false):
				Sfx.combat_ping()   # com alvo: música de combate
	for eid in entities.keys():
		if not seen.has(eid):
			entities[eid]["node"].queue_free()
			entities.erase(eid)
			_arrivals.erase(eid)
			if selected == eid:
				selected = ""
	_sync_defense_npcs()
	_sync_escort_objects()
	if main.hud:
		main.hud.refresh_target()

## Enquanto um NPC está numa defesa (Joca abrindo a válvula, com vida e ondas em cima dele), a entidade da
## defesa aparece no lugar dele: o modelo parado e o nome do NPC somem até a defesa acabar. Clicar no lugar
## continua abrindo a conversa (o clique usa a posição, não o modelo).
func _sync_defense_npcs() -> void:
	var busy := {}
	for e in entities.values():
		var d: Dictionary = e["data"]
		if d.get("k", "") == "e" and d.get("npc") != null:
			busy[str(d["npc"])] = true
	for id in npc_nodes.keys():
		var nd: Dictionary = npc_nodes[id]
		var show := not busy.has(id)
		if (nd["node"] as Node3D).visible != show:
			(nd["node"] as Node3D).visible = show
			if nd.has("label"):
				(nd["label"] as Node3D).visible = show

## Carroça parada da escolta (objeto de missão): some, com o losango e o nome, enquanto a carroça da escolta
## do próprio grupo está na rota — a entidade "e" com esc = o id da escolta do objeto e o dono (own) ou o
## grupo (pty) de quem joga; o servidor a manda sempre ao grupo, também de longe — e volta quando a escolta
## acaba (chegada, abandono), pronta para recomeçar. A carroça de outro grupo não a esconde: quem não está
## naquela escolta começa a própria ali (D183). Escondida, não recebe clique.
func _sync_escort_objects() -> void:
	var busy := {}
	var my_id := int(main.ch.get("id", -1))
	var mine_e := me()
	var my_party = null if mine_e.is_empty() else mine_e["data"].get("party", null)
	for e in entities.values():
		var d: Dictionary = e["data"]
		if d.get("k", "") != "e" or d.get("esc") == null:
			continue
		var own := d.get("own") != null and int(d["own"]) == my_id
		var party := d.get("pty") != null and my_party != null and str(d["pty"]) == str(my_party)
		if own or party:
			busy[str(d["esc"])] = true
	for id in object_nodes.keys():
		var o: Dictionary = object_nodes[id]
		if str(o["data"].get("kind", "")) != "escort":
			continue
		var show := not busy.has(str(o["data"].get("escort", "")))
		if (o["node"] as Node3D).visible != show:
			for k in ["node", "gem", "label"]:
				if o.get(k) != null:
					(o[k] as Node3D).visible = show

## Confere a previsão do próprio personagem com a posição do servidor.
func _reconcile(server_pos: Vector2, d: Dictionary) -> void:
	if not pred.active:
		return
	if d.get("dead", false) or d.get("tgt") != null:
		_stop_prediction()
		return
	var err := pred.pos.distance_to(server_pos)
	if err > 6.0:
		_stop_prediction()
		return
	if err > 1.5 + pred.max_speed * 0.3:
		pred.bad_snaps += 1
		if pred.bad_snaps >= 3:
			_stop_prediction()
	else:
		pred.bad_snaps = 0

## Volta a desenhar o personagem pela interpolação, sem salto (o erro some aos poucos).
func _stop_prediction() -> void:
	if not pred.active:
		return
	pred.active = false
	var e := me()
	if e.is_empty():
		return
	var s: Array = (e["track"] as Motion.Track).sample(clock.render)
	_lp_offset = _lp_render - (s[0] as Vector2)

func _spawn_entity(d: Dictionary) -> Dictionary:
	var root: Node3D
	var person: bool = d["k"] == "e" and PEOPLE.has(str(d.get("def", "")))
	if d["k"] == "p":
		root = Art.character(d.get("cls", ""), _weapon_family(d.get("w")), false, Color("#c9b07a"), 0, _weapon_family(d.get("oh")) if d.has("oh") else "?")
		# o próprio personagem com o contorno na cor da classe (os outros seguem com o escuro)
		if _is_me(d["id"]) and Art.CLASS_OUTLINE.has(d.get("cls", "")):
			Art.tint_outline(root, Art.CLASS_OUTLINE[d["cls"]])
	elif d["k"] == "e" and str(d.get("def", "cart")) == "npc":
		# defesa: o NPC defendido (Joca na válvula), com a mesma aparência do NPC parado do mapa
		var nid := str(d.get("npc", ""))
		var col: Color = npc_nodes[nid]["color"] if npc_nodes.has(nid) else Color.from_hsv(float(hash(nid) % 360) / 360.0, 0.35, 0.75)
		root = Art.character("", "", true, col, hash(nid))
	elif person:
		# Bento, Ligia, Caio: moradores com corpo e cor fixos pelo nome (sem a situação entre parênteses)
		var base := str(d.get("n", "")).get_slice(" (", 0)
		root = Art.character("", "", true, Color.from_hsv(float(hash(base) % 360) / 360.0, 0.4, 0.78), hash(base), "?", str(d["def"]))
	elif d["k"] == "e":
		root = Art.cart()
	elif d["k"] == "a":
		# aliado da prova de classe (aprendiz, peregrino), com o corpo que os dados pedem (fem)
		root = Art.trial_ally(str(d.get("def", "apprentice")), hash(str(d.get("n", ""))), bool(d.get("fem", false)))
	else:
		var md: Dictionary = main.defs["monsters"].get(d["def"], {}).duplicate()
		md["id"] = d["def"]
		root = Art.monster(md)
	root.scale = Vector3.ONE * (1.3 if d["k"] in ["p", "a"] or str(d.get("def", "")) == "npc" else (float(PEOPLE[str(d["def"])]) if person else (1.0 if d["k"] == "e" else 1.15)))
	add_child(root)
	var label := _label("", 34, PLAYER_LABEL_COLOR if d["k"] == "p" else (Color("#ffe39a") if person else (Color("#9fe3ff") if d["k"] == "e" else (Color("#a8f0b0") if d["k"] == "a" else Color("#ffcf9a")))))
	label.position.y = 2.1 if d["k"] in ["p", "a"] else (2.5 if d["k"] == "e" else (3.6 if root.has_meta("armor") else 1.8))
	root.add_child(label)
	var x := float(d["x"])
	var z := float(d["z"])
	root.position = _gpos(x, z)
	var track := Motion.Track.new()
	track.push(clock.latest, Vector2(x, z), Vector2(float(d.get("vx", 0.0)), float(d.get("vz", 0.0))))
	var yaw := randf() * TAU
	root.rotation.y = yaw
	if _is_me(d["id"]):
		_lp_render = Vector2(x, z)
		_lp_offset = Vector2.ZERO
	return {"node": root, "label": label, "data": d, "w": d.get("w"), "oh": d.get("oh"), "track": track, "yaw": yaw, "speed": 0.0, "vel": Vector2.ZERO, "accel": 0.0, "turn": 0.0, "knock": Vector2.ZERO, "snd": _sound_profile(d)}

## Como a entidade soa: passos (arquivo, tom, volume) e voz ao apanhar/cair (tom pelo tamanho e família).
## Espíritos flutuam (sem passos); máquinas pisam pesado e rangem metal; bichos pequenos têm patas leves.
func _sound_profile(d: Dictionary) -> Dictionary:
	if d["k"] == "p" or d["k"] == "a" or str(d.get("def", "")) == "npc":
		# jogadores, aliados da prova (mais baixo) e o NPC de uma defesa (Joca na válvula) apanham com voz de gente
		return {"fam": "player", "step": _step_surface, "step_pitch": 1.0, "step_db": -4.0 if d["k"] == "a" else 0.0, "voice": 1.0}
	if d["k"] == "e" and PEOPLE.has(str(d.get("def", ""))):
		# gente escoltada: passos de gente (o menino, mais leves)
		var kid: bool = str(d["def"]) == "boy"
		return {"fam": "person", "step": _step_surface, "step_pitch": 1.25 if kid else 1.05, "step_db": -5.0 if kid else -3.0, "voice": 1.3 if kid else 1.0}
	if d["k"] != "m":
		# outras entidades do servidor (objetos que andam ou apanham): sem passos nem voz
		return {"fam": "object", "step": "", "step_pitch": 1.0, "step_db": 0.0, "voice": 1.0}
	var md: Dictionary = main.defs.get("monsters", {}).get(d.get("def", ""), {})
	var fam: String = md.get("family", "beast")
	var rank: String = md.get("rank", "normal")
	var size := 0.85 + float(md.get("level", 1)) * 0.03 + (0.55 if rank == "elite" else 0.0) + (1.2 if rank == "boss" else 0.0)
	var k := 1.0 / sqrt(size)
	match fam:
		"spirit":
			return {"fam": fam, "step": "", "step_pitch": 1.0, "step_db": 0.0, "voice": 1.45 * k}
		"machine":
			return {"fam": fam, "step": "footstep_stone", "step_pitch": 0.72 * k, "step_db": 1.0 + 3.0 * (size - 1.0), "voice": 0.75 * k}
	return {"fam": fam, "step": "footstep_dirt", "step_pitch": 1.3 * k, "step_db": -3.0, "voice": 1.15 * k}

## Passo no instante em que o pé toca o chão: a fase da passada da animação (vrm_character.gd e rig.gd
## avançam _phase pela distância percorrida) cruza um múltiplo de PI. Só para quem está perto.
func _footstep(e: Dictionary, n: Node3D, is_me: bool, ear: Vector3) -> void:
	var ph = n.get("_phase")
	if ph == null:
		return
	var k := int(floor(float(ph) / PI))
	var last := int(e.get("step_k", k))
	e["step_k"] = k
	if k == last or float(e["speed"]) < 0.5 or e["data"].get("dead", false):
		return
	var snd: Dictionary = e["snd"]
	if snd["step"] == "":
		return
	if not is_me and Vector2(n.position.x - ear.x, n.position.z - ear.z).length() > STEP_HEAR:
		return
	var run := clampf((float(e["speed"]) - 2.5) / 3.0, 0.0, 1.0)
	Sfx.play(snd["step"], n.position, float(snd["step_db"]) + (2.0 if is_me else 0.0) + 2.0 * run, float(snd["step_pitch"]))

func me() -> Dictionary:
	return entities.get(main.ch.get("eid", ""), {})

func my_pos() -> Vector3:
	var e := me()
	return e["node"].position if not e.is_empty() else Vector3.ZERO

## Última posição confirmada pelo servidor (para as checagens de alcance).
func auth_pos() -> Vector3:
	var e := me()
	if e.is_empty():
		return Vector3.ZERO
	var p: Vector2 = (e["track"] as Motion.Track).last_pos()
	return Vector3(p.x, 0.0, p.y)

## Pede para andar; com a resposta (caminho), o personagem sai andando na hora.
func request_move(x: float, z: float, cb := Callable()) -> void:
	var ms: Dictionary = main.ch.get("stats", {})
	pred.max_speed = float(ms.get("moveSpeed", pred.max_speed))
	pred.accel = float(ms.get("accel", pred.accel))
	pred.decel = float(ms.get("decel", pred.decel))
	Net.request("move", {"x": x, "z": z}, func(r):
		if r.get("ok", false) and r.has("path") and not me().is_empty() and not main.ch.get("dead", false):
			var e := me()
			var cur_vel: Vector2 = e["vel"]
			if not pred.active:
				_lp_offset = Vector2.ZERO
			pred.start(_lp_render, cur_vel, r["path"])
		if cb.is_valid():
			cb.call(r))

func _process(delta: float) -> void:
	_t += delta
	var game_dt := clock.advance(delta)
	var my_eid: String = main.ch.get("eid", "")
	var ear := my_pos()
	for eid in entities.keys():
		var e: Dictionary = entities[eid]
		var n: Node3D = e["node"]
		var track: Motion.Track = e["track"]
		var pos2: Vector2
		var vel: Vector2
		if eid == my_eid:
			var s: Array = track.sample(clock.render)
			_lp_offset *= exp(-delta / 0.11)
			if _lp_offset.length() > 4.0:
				_lp_offset = Vector2.ZERO
			pos2 = s[0]
			vel = s[1]
			if pred.active:
				pred.step(game_dt)
				pos2 = pred.pos
				vel = pred.dir * pred.speed
				if pred.path.is_empty() and pred.speed <= 0.0:
					if pred.done_at < 0.0:
						pred.done_at = Motion.now_ms()
					var sv: Vector2 = s[1]
					if (sv.length() < 0.05 and (s[0] as Vector2).distance_to(pred.pos) < 0.8) or Motion.now_ms() - pred.done_at > 900.0:
						# o servidor também chegou: volta à interpolação sem salto
						_lp_offset = pred.pos - (s[0] as Vector2)
						pred.active = false
						pos2 = s[0]
						vel = s[1]
			if not pred.active:
				pos2 += _lp_offset
			_lp_render = pos2
			if log_motion:
				motion_log.append([game_dt, pos2, s[0], 1.0, Motion.now_ms()])
		else:
			var s2: Array = track.sample(clock.render)
			pos2 = s2[0]
			vel = s2[1]
		# desfazendo em brasas (teleporte, renascer longe): fica no lugar antigo até sumir, então aparece no novo
		if e.has("pin"):
			if Time.get_ticks_msec() < int(e["pin_until"]):
				pos2 = e["pin"]
				vel = Vector2.ZERO
			else:
				_arrive(e)
				pos2 = (e["track"] as Motion.Track).last_pos()
				vel = Vector2.ZERO
				if eid == my_eid:
					_lp_offset = Vector2.ZERO
					_lp_render = pos2
		# empurrão visual dos golpes
		var knock: Vector2 = e["knock"]
		if knock.length() > 0.001:
			knock *= exp(-delta * 9.0)
			e["knock"] = knock
		n.position = _gpos(pos2.x + knock.x, pos2.y + knock.y)
		# caído: o corpo cai de lado e fica no chão (e levanta ao renascer ou ao ser levantado); o Caio derrubado pelos
		# bichos também (D186). Corpos sem esqueleto (reserva sem os modelos VRM) só deitam
		var lying: bool = e["data"].get("dead", false) or str(e["data"].get("st", "")) == "down"
		if n.has_method("set_down"):
			n.set_down(lying, bool(e["data"].get("dead", false)))
		else:
			n.rotation.x = lerpf(n.rotation.x, -1.45 if lying else 0.0, clampf(delta * 6.0, 0.0, 1.0))
		# velocidade e aceleração suavizadas (para a animação)
		var speed := vel.length()
		var prev_speed: float = e["speed"]
		e["accel"] = lerpf(float(e["accel"]), (speed - prev_speed) / maxf(delta, 1e-4), clampf(delta * 10.0, 0.0, 1.0))
		e["speed"] = speed
		e["vel"] = vel
		# direção: para onde anda; parado em combate, para o alvo
		var yaw: float = e["yaw"]
		var want := yaw
		var turn_speed := 10.0
		# salto ou investida: o servidor leva o corpo de lado ou para trás e ele não vira para onde desliza
		var locked: bool = n.has_method("face_locked") and n.face_locked()
		if locked:
			want = yaw
		elif speed > 0.35:
			want = atan2(vel.x, vel.y)
			var ct = e["data"].get("tgt", null)
			if speed < STRAFE_MAX and ct != null and entities.has(ct) and n.has_method("set_move_dir"):
				var ctp: Vector3 = entities[ct]["node"].position
				var cd := Vector2(ctp.x - n.position.x, ctp.z - n.position.z)
				if cd.length() > 0.3 and cd.length() < STRAFE_NEAR:
					want = atan2(cd.x, cd.y)
					turn_speed = 7.0
		else:
			var tgt = e["data"].get("tgt", null)
			if tgt != null and entities.has(tgt):
				var tp: Vector3 = entities[tgt]["node"].position
				if Vector2(tp.x - n.position.x, tp.z - n.position.z).length() > 0.05:
					want = atan2(tp.x - n.position.x, tp.z - n.position.z)
				turn_speed = 7.0
		# preparando um cone ou uma linha avisada (ou usando uma habilidade parado): olha para onde vai golpear
		if e.has("face_until") and not locked:
			if Time.get_ticks_msec() < int(e["face_until"]):
				want = float(e["face_yaw"])
				turn_speed = 12.0
			else:
				e.erase("face_until")
		var diff := wrapf(want - yaw, -PI, PI)
		var step := clampf(diff * clampf(delta * 12.0, 0.0, 1.0), -turn_speed * delta, turn_speed * delta)
		yaw = wrapf(yaw + step, -PI, PI)
		e["turn"] = lerpf(float(e["turn"]), step / maxf(delta, 1e-4), clampf(delta * 8.0, 0.0, 1.0))
		e["yaw"] = yaw
		n.rotation.y = yaw
		if n.has_method("set_motion"):
			n.set_motion(speed, float(e["accel"]), float(e["turn"]))
		if n.has_method("set_move_dir") and speed > 0.05:
			# para onde anda em relação a para onde olha (x: esquerda, y: frente)
			n.set_move_dir(Vector2(vel.x * cos(yaw) - vel.y * sin(yaw), vel.x * sin(yaw) + vel.y * cos(yaw)))
		if n.has_method("set_combat"):
			n.set_combat(e["data"].get("tgt", null) != null and not e["data"].get("dead", false))
		elif n.has_method("set_moving"):
			n.set_moving(speed > 0.3)
		if n.has_method("set_look_target"):
			var lt = e["data"].get("tgt", null)
			if lt != null and entities.has(lt):
				n.set_look_target(entities[lt]["node"].position + Vector3(0, 0.8, 0), 1.0)
			else:
				n.set_look_target(Vector3.ZERO, 0.0)
		_footstep(e, n, eid == my_eid, ear)
	var focus := my_pos()
	_update_npcs(delta, focus)
	_update_camera(delta, focus)
	listener.global_transform = Transform3D(Basis(Vector3.UP, _cam_yaw), focus + Vector3(0, 4.0, 0))
	Sfx.set_listener(focus)
	RenderingServer.global_shader_parameter_set("focus_pos", focus)
	scenery.follow(focus)
	if selected != "" and entities.has(selected):
		select_ring.visible = true
		select_ring.position = entities[selected]["node"].position + Vector3(0, 0.06, 0)
		select_ring.rotation.y += delta * 0.8
	else:
		select_ring.visible = false
	if dest_marker.visible:
		dest_marker.rotation.y += delta * 2.0
		if Vector2(focus.x, focus.z).distance_to(Vector2(dest_marker.position.x, dest_marker.position.z)) < 0.8:
			dest_marker.visible = false
	var ap_me := auth_pos()
	if pending_pickup != "" and loots.has(pending_pickup):
		var lp: Vector3 = loots[pending_pickup]["node"].position
		if Vector2(lp.x, lp.z).distance_to(Vector2(ap_me.x, ap_me.z)) < 4.0:
			var lid := pending_pickup
			pending_pickup = ""
			Net.request("pickup", {"loot": lid}, func(r): _on_pickup(lid, r))
	for l in loots.values():
		var gem: Node3D = l["node"].get_child(0)
		gem.rotation.y += delta * 1.5
		gem.position.y = sin(_t * 2.2 + float(hash(l["data"]["id"]) % 100)) * 0.08
	for o in object_nodes.values():
		var gem = o.get("gem", null)
		if gem != null:
			gem.position.y = (o["pos"] as Vector3).y + float(o["gem_y"]) + sin(_t * 2.2 + (o["pos"] as Vector3).x) * 0.08
			gem.rotation.y += delta * 1.2
		if o.get("static", false):
			continue
		var on: Node3D = o["node"]
		on.position.y = (o["pos"] as Vector3).y + 0.4 + sin(_t * 1.8 + (o["pos"] as Vector3).x) * 0.06
		on.rotation.y += delta * 0.4
	if not pending_action.is_empty():
		var ap: Vector3 = pending_action["pos"]
		if Vector2(ap.x, ap.z).distance_to(Vector2(ap_me.x, ap_me.z)) <= float(pending_action["range"]):
			var pa := pending_action
			pending_action = {}
			match pa["kind"]:
				"npc":
					Net.request("talk", {"npc": pa["id"]}, func(r):
						if r["ok"]:
							main.hud.show_npc(r))
				"object":
					Net.request("interact", {"object": pa["id"]}, func(r):
						if r["ok"]:
							if r.has("channel"):
								main.hud.show_channel(str(r["channel"]["text"]), float(r["channel"]["ms"]))
							elif r.has("board"):
								main.hud.show_board(r["board"])
							elif not r.has("escort"):
								main.hud.system("Feito: %s" % object_nodes.get(pa["id"], {}).get("data", {}).get("name", "")))
				"portal":
					Net.request("portal", {"portal": pa["id"]})
	if not pending_cast.is_empty() and entities.has(pending_cast.get("target", "")):
		var tpos: Vector3 = entities[pending_cast["target"]]["node"].position
		if Vector2(tpos.x, tpos.z).distance_to(Vector2(ap_me.x, ap_me.z)) <= float(pending_cast["range"]) - 0.3:
			var pc := pending_cast
			pending_cast = {}
			Net.request("cast", {"skill": pc["skill"], "target": pc["target"]})

## NPCs viram (devagar) para quem se aproxima e acompanham com o olhar.
func _update_npcs(delta: float, focus: Vector3) -> void:
	for id in npc_nodes.keys():
		var nd: Dictionary = npc_nodes[id]
		var node: Node3D = nd["node"]
		var to := focus - node.position
		var near := Vector2(to.x, to.z).length() < 7.0 and not me().is_empty()
		var want: float = atan2(to.x, to.z) if near else float(nd["home"])
		var yaw: float = nd["yaw"]
		var diff := wrapf(want - yaw, -PI, PI)
		var step := clampf(diff * clampf(delta * 3.0, 0.0, 1.0), -2.5 * delta, 2.5 * delta)
		yaw = wrapf(yaw + step, -PI, PI)
		nd["yaw"] = yaw
		node.rotation.y = yaw
		if node.has_method("set_motion"):
			node.set_motion(0.0, 0.0, step / maxf(delta, 1e-4))
		if node.has_method("set_look_target"):
			node.set_look_target(focus + Vector3(0, 1.6, 0), 1.0 if near else 0.0)

## Câmera: segue com mola criticamente amortecida, olha um pouco à frente de quem corre e
## suaviza zoom e rotação.
func _update_camera(delta: float, focus: Vector3) -> void:
	var rot_speed := 1.8 * float(main.settings.get("camera_sensitivity", 1.0))
	if main.in_world and not main.menu_open():
		if Input.is_key_pressed(KEY_Q):
			cam_yaw += delta * rot_speed
		if Input.is_key_pressed(KEY_E):
			cam_yaw -= delta * rot_speed
	var e := me()
	var lead_target := Vector3.ZERO
	if not e.is_empty():
		var v: Vector2 = e["vel"]
		lead_target = Vector3(v.x, 0, v.y) * 0.22
		lead_target = lead_target.limit_length(1.4)
	_cam_lead = _cam_lead.lerp(lead_target, clampf(delta * 2.5, 0.0, 1.0))
	var target := focus + _cam_lead
	if cam_pivot.position.distance_to(target) > 25.0:
		cam_pivot.position = target
		_cam_vel = Vector3.ZERO
	else:
		cam_pivot.position = _smooth_damp(cam_pivot.position, target, 0.16, delta)
	_cam_yaw = lerp_angle(_cam_yaw, cam_yaw, clampf(delta * 10.0, 0.0, 1.0))
	_cam_pitch = lerpf(_cam_pitch, cam_pitch, clampf(delta * 10.0, 0.0, 1.0))
	_cam_dist = lerpf(_cam_dist, cam_dist, clampf(delta * 8.0, 0.0, 1.0))
	var off := Vector3(sin(_cam_yaw) * cos(_cam_pitch), sin(_cam_pitch), cos(_cam_yaw) * cos(_cam_pitch)) * _cam_dist
	var look := cam_pivot.global_position + Vector3(0, 1.2, 0)
	var cam_pos := look + off
	# não deixa a câmera entrar no morro
	var floor_y := ground_y(cam_pos.x, cam_pos.z) + 1.5
	if cam_pos.y < floor_y:
		cam_pos.y = floor_y
	camera.global_position = cam_pos
	camera.look_at(look, Vector3.UP)

func _smooth_damp(current: Vector3, target: Vector3, smooth_time: float, delta: float) -> Vector3:
	var omega := 2.0 / smooth_time
	var x := omega * delta
	var k := 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
	var change := current - target
	var temp := (_cam_vel + change * omega) * delta
	_cam_vel = (_cam_vel - temp * omega) * k
	return target + (change + temp) * k

func _on_pickup(lid: String, r: Dictionary) -> void:
	if r["ok"]:
		if loots.has(lid):
			loots[lid]["node"].queue_free()
			loots.erase(lid)
		if r.get("discarded", false):
			# item de missão caído depois da entrega: some do chão sem ocupar a bolsa
			main.hud.system(str(r.get("message", "Você não precisa mais disto.")))
			return
		var what: String = "%d de ouro" % int(r["gold"]) if r.get("defId", null) == null else main.defs["items"][r["defId"]]["name"]
		main.hud.system("Coletado: %s" % what)
		Sfx.ui("loot_coins" if r.get("defId", null) == null else "loot_item")
	else:
		main.hud.error(r["reason"])

# ---------------- entrada ----------------
func _unhandled_input(event: InputEvent) -> void:
	if not main.in_world or main.menu_open():
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			cam_dist = clampf(cam_dist - 2.0, 8.0, 50.0)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			cam_dist = clampf(cam_dist + 2.0, 8.0, 50.0)
		elif mb.button_index == MOUSE_BUTTON_RIGHT:
			_rotating = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			_click(mb.position)
	elif event is InputEventMouseMotion and _rotating:
		var mm := event as InputEventMouseMotion
		var sens := float(main.settings.get("camera_sensitivity", 1.0))
		cam_yaw -= mm.relative.x * 0.008 * sens
		cam_pitch = clampf(cam_pitch + mm.relative.y * 0.005 * sens, 0.45, 1.35)

func ground_point(screen_pos: Vector2) -> Variant:
	var from := camera.project_ray_origin(screen_pos)
	var dir := camera.project_ray_normal(screen_pos)
	if scenery:
		return scenery.terrain.ray_hit(from, dir)
	return Plane(Vector3.UP, 0.0).intersects_ray(from, dir)

static func _flat_dist(a: Vector3, b: Vector3) -> float:
	return Vector2(a.x - b.x, a.z - b.z).length()

func _click(screen_pos: Vector2) -> void:
	var p = ground_point(screen_pos)
	if p == null:
		return
	var gp: Vector3 = p
	for lid in loots.keys():
		if _flat_dist(loots[lid]["node"].position, gp) < 1.2:
			pending_pickup = lid
			request_move(gp.x, gp.z)
			return
	# monstro sob o clique: na defesa do Joca as ondas ficam coladas no NPC escondido, e o clique num monstro
	# abria a conversa com ele em vez de atacar
	var mon_here := _monster_at(gp)
	for group in [["npc", npc_nodes, 1.5, 4.5], ["object", object_nodes, 1.2, 2.8], ["portal", portal_nodes, 3.0, 2.5]]:
		var nodes: Dictionary = group[1]
		for id in nodes.keys():
			if group[0] == "npc" and mon_here != "" and not (nodes[id]["node"] as Node3D).visible:
				continue
			if group[0] == "object" and not (nodes[id]["node"] as Node3D).visible:
				continue  # carroça parada escondida enquanto a escolta do grupo está na rota (D183)
			var pos: Vector3 = nodes[id]["pos"]
			var pick := float(group[2])
			if group[0] == "portal":
				pick = float(nodes[id]["data"]["radius"])
			if _flat_dist(pos, gp) < pick:
				pending_action = {"kind": group[0], "id": id, "pos": pos, "range": group[3]}
				pending_cast = {}
				pending_pickup = ""
				request_move(pos.x + 0.8, pos.z + 0.8)
				return
	# aliado da prova de classe (aprendiz, peregrino): vira o alvo das habilidades de aliado (cura, escudo, Juramento)
	for eid in entities.keys():
		var ae: Dictionary = entities[eid]
		if ae["data"]["k"] == "a" and not ae["data"].get("dead", false) and _flat_dist(ae["node"].position, gp) < 1.2:
			ally_selected = eid
			var fem: bool = ae["data"].get("fem", false)
			main.hud.system("%s: %s (curas e escudos vão para %s)" % ["Aliada selecionada" if fem else "Aliado selecionado", str(ae["data"].get("n", "")), "ela" if fem else "ele"])
			return
	for eid in entities.keys():
		var pe: Dictionary = entities[eid]
		if pe["data"]["k"] == "p" and eid != main.ch.get("eid", "") and _flat_dist(pe["node"].position, gp) < 1.2:
			if main.hud.social.in_duel_with(eid):
				# duelo: o oponente vira alvo de ataque
				selected = eid
				pending_cast = {}
				_stop_prediction()
				Net.request("attack", {"target": eid})
				main.hud.refresh_target()
				return
			ally_selected = eid
			main.hud.system("Aliado selecionado: %s" % pe["data"]["n"])
			main.hud.social.show_player_actions(str(pe["data"]["n"]), bool(pe["data"].get("dead", false)))
			return
	var best := mon_here
	if best != "":
		selected = best
		pending_cast = {}
		_stop_prediction()
		Net.request("attack", {"target": best})
		main.hud.refresh_target()
		return
	pending_cast = {}
	pending_pickup = ""
	pending_action = {}
	request_move(gp.x, gp.z, func(r):
		if r["ok"]:
			var dst: Dictionary = r.get("dest", {"x": gp.x, "z": gp.z})
			dest_marker.position = _gpos(float(dst["x"]), float(dst["z"])) + Vector3(0, 0.06, 0)
			dest_marker.visible = true)

## Monstro mais perto do ponto clicado (até 1,8 m), ou "".
func _monster_at(gp: Vector3) -> String:
	var best := ""
	var best_d := 1.8
	for eid in entities.keys():
		var e: Dictionary = entities[eid]
		if e["data"]["k"] != "m":
			continue
		var d: float = _flat_dist(e["node"].position, gp)
		if d < best_d:
			best_d = d
			best = eid
	return best

## Usa a habilidade da barra conforme o tipo de alvo.
func use_skill(skill_id: String) -> void:
	var s: Dictionary = main.defs["skills"].get(skill_id, {})
	if s.is_empty():
		return
	var target_type: String = s.get("target", "enemy")
	if target_type == "enemy":
		if selected == "" or not entities.has(selected):
			main.hud.error("Selecione um alvo (clique em um monstro).")
			return
		var rng = s.get("range", 2.5)
		var r := float(main.ch["stats"]["range"]) if str(rng) == "weapon" else float(rng)
		var d := _flat_dist(auth_pos(), entities[selected]["node"].position)
		_stop_prediction()
		if d > r:
			pending_cast = {"skill": skill_id, "target": selected, "range": r}
			Net.request("attack", {"target": selected})
		else:
			Net.request("cast", {"skill": skill_id, "target": selected})
	elif target_type == "ally_dead":
		if ally_selected == "" or not entities.has(ally_selected):
			main.hud.error("Selecione um aliado caído (clique nele).")
			return
		Net.request("cast", {"skill": skill_id, "ally": ally_selected})
	elif target_type == "ally":
		var target_ally: String = ally_selected if entities.has(ally_selected) else main.ch.get("eid", "")
		Net.request("cast", {"skill": skill_id, "ally": target_ally})
	elif target_type in ["cone", "line"]:
		var payload := {"skill": skill_id}
		if selected != "" and entities.has(selected):
			payload["target"] = selected
		else:
			var mp = ground_point(get_viewport().get_mouse_position())
			if mp != null:
				payload["x"] = mp.x
				payload["z"] = mp.z
		Net.request("cast", payload)
	elif target_type == "ground":
		var p = ground_point(get_viewport().get_mouse_position())
		if p == null:
			return
		Net.request("cast", {"skill": skill_id, "x": p.x, "z": p.z})
	else:
		Net.request("cast", {"skill": skill_id})

# ---------------- eventos visuais ----------------
func _float_text(at: Vector3, text: String, color: Color, size := 46) -> void:
	var l := _label(text, size, color)
	l.position = at + Vector3(randf_range(-0.4, 0.4), 2.4, 0)
	add_child(l)
	var tw := create_tween()
	tw.tween_property(l, "position:y", l.position.y + 1.6, 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(l, "modulate:a", 0.0, 0.9)
	tw.tween_callback(l.queue_free)

func on_hit(m: Dictionary) -> void:
	var dst: Dictionary = entities.get(m["dst"], {})
	if dst.is_empty():
		return
	# golpe recusado pela peça da prova (blindado, apagado, fora do posto) ou escudo que segurou tudo
	var note := str(m.get("note", "")) if m.get("note", null) != null else ""
	if note != "":
		_float_text(dst["node"].position, note, Color("#b8c8d8"), 36)
		if note == "blindado":
			Sfx.play("hit_blunt", dst["node"].position, -2.0, 1.5)
		var nsrc: Dictionary = entities.get(m.get("src", ""), {})
		if not nsrc.is_empty() and m.get("skill", null) == null and nsrc["node"].has_method("play_attack"):
			nsrc["node"].play_attack()
		return
	# golpe que o escudo segurou chega como "errou" com block: mostra o bloqueio, não um erro
	var blocked: bool = m.get("block", false)
	var text := "Bloqueio" if blocked else ("errou" if m.get("miss", false) else str(int(m["dmg"])))
	var col := Color("#ffffff")
	if blocked:
		col = Color("#9fc4ff")
	elif m["dst"] == main.ch.get("eid", ""):
		col = Color("#ff5a4f")
	elif m.get("magic", false):
		col = Color("#ff9a4a")
	if m.get("crit", false):
		text += "!"
		col = Color("#ffd84a")
	_float_text(dst["node"].position, text, col, 62 if m.get("crit", false) else 46)
	var src: Dictionary = entities.get(m.get("src", ""), {})
	var fam := ""
	if not src.is_empty() and src["data"]["k"] == "p":
		fam = _weapon_family(src["data"].get("w"))
	# ataque básico: o golpe de quem bateu (variação da arma; floreio maior no crítico) — antes do efeito, que
	# espera a corda ou o foco soltar; golpe de habilidade de jogador vem com o cast, que já move o corpo
	if not src.is_empty() and src["node"].has_method("play_attack"):
		var sk = m.get("skill", null)
		if sk == null:
			src["node"].play_attack(bool(m.get("crit", false)))
		elif sk != "dot" and src["data"].get("k", "") != "p":
			src["node"].play_attack()
	vfx.on_hit(m, fam)
	_hit_voice(m, dst)
	if not m.get("miss", false):
		if dst["node"].has_method("play_hurt"):
			dst["node"].play_hurt()
		# empurrãozinho para longe de quem bateu (mais forte no crítico); a carroça não sai do lugar
		if not src.is_empty() and dst["data"].get("k", "") != "e":
			var dv: Vector3 = dst["node"].position - src["node"].position
			var d2 := Vector2(dv.x, dv.z)
			if d2.length() > 0.01:
				dst["knock"] = (dst["knock"] as Vector2) + d2.normalized() * (0.28 if m.get("crit", false) else 0.16)

## Quem apanha reage (o golpe em si soa em vfx.gd): gemido do jogador, grunhido ou rangido do monstro.
## Golpes que envolvem o jogador local mantêm a música de combate.
func _hit_voice(m: Dictionary, dst: Dictionary) -> void:
	var my_eid: String = main.ch.get("eid", "")
	if m.get("src", "") == my_eid or m["dst"] == my_eid:
		Sfx.combat_ping()
	if m.get("miss", false) or m.get("skill", null) == "dot":
		return
	var crit: bool = m.get("crit", false)
	var at: Vector3 = dst["node"].position
	if m["dst"] == my_eid:
		Sfx.play("player_hurt", null, 2.0 if crit else 0.0)
	elif dst["data"]["k"] == "p" or dst["snd"]["fam"] == "player" or dst["snd"]["fam"] == "person":
		Sfx.play("player_hurt", at, -4.0, float(dst["snd"]["voice"]))
	elif dst["snd"]["fam"] != "object" and (crit or randf() < 0.55):
		var snd: Dictionary = dst["snd"]
		if snd["fam"] == "machine":
			Sfx.play("hit_blunt", at, -3.0, float(snd["voice"]) * 0.8)
		else:
			Sfx.play("monster_hurt", at, 0.0, float(snd["voice"]))

## Balão de fala sobre quem fala (resgatados do tutorial): some depois de alguns segundos.
func on_say(m: Dictionary) -> void:
	var e: Dictionary = entities.get(str(m.get("eid", "")), {})
	if e.is_empty():
		return
	var node: Node3D = e["node"]
	var old = e.get("bubble")
	if old != null and is_instance_valid(old):
		old.queue_free()
	var b := _label(str(m.get("text", "")), 30, Color("#fff4d6"))
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.width = 520.0
	# cresce para cima a partir de logo acima do nome (centrado, um balão de três linhas cobria o nome e a vida)
	b.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	b.position = Vector3(0, 2.95, 0)
	node.add_child(b)
	e["bubble"] = b
	var tw := b.create_tween()
	tw.tween_interval(4.5)
	tw.tween_property(b, "modulate:a", 0.0, 0.6)
	tw.tween_callback(b.queue_free)

## Efeito na posição de uma entidade visível (nível de outro jogador, queda etc.).
func sound_at(eid: String, snd: String, volume_db := 0.0) -> void:
	if entities.has(eid):
		Sfx.play(snd, entities[eid]["node"].position, volume_db)

func on_heal(m: Dictionary) -> void:
	var dst: Dictionary = entities.get(m["dst"], {})
	if dst.is_empty() or int(m["amount"]) <= 0:
		return
	_float_text(dst["node"].position, "+%d" % int(m["amount"]), Color("#6fd06a"))
	vfx.on_heal(m)

## Monstro preparando um golpe avisado (warn com src): recua e treme até o golpe sair (vfx.gd desenha a área).
## face_yaw (cone, linha): o monstro vira para onde vai golpear até o fim do aviso.
func monster_windup(eid, ms: float, face_yaw = null) -> void:
	if eid == null or not entities.has(eid):
		return
	var e: Dictionary = entities[eid]
	var n: Node3D = e["node"]
	if n.has_method("play_windup"):
		n.play_windup(ms / 1000.0)
	if face_yaw != null:
		e["face_yaw"] = float(face_yaw)
		e["face_until"] = Time.get_ticks_msec() + int(ms)

## O golpe avisado foi cancelado (warn_cancel): o monstro desiste da pose.
func monster_windup_cancel(eid) -> void:
	if eid == null or not entities.has(eid):
		return
	entities[eid].erase("face_until")
	if entities[eid]["node"].has_method("cancel_windup"):
		entities[eid]["node"].cancel_windup()

## Habilidade usada parado: o personagem vira para onde ela vai (alvo, ponto ou aliado) enquanto o movimento dura.
## Andando, segue virado para onde anda (não anda de lado nem de costas).
func face_during(eid, yaw: float, secs: float) -> void:
	if eid == null or not entities.has(eid) or secs <= 0.0:
		return
	var e: Dictionary = entities[eid]
	if float(e["speed"]) > 0.6:
		return
	e["face_yaw"] = yaw
	e["face_until"] = Time.get_ticks_msec() + int(secs * 1000.0)

## O servidor parou o meu personagem (atordoado, puxado): a previsão local não continua o caminho antigo.
func halt_prediction() -> void:
	_stop_prediction()

## A velocidade do meu personagem mudou (reforço ou efeito negativo de monstro): vale já para a previsão.
func set_move_speed(v: float) -> void:
	if v > 0.0:
		pred.max_speed = v

func on_death(eid: String) -> void:
	# antes de tudo: o espírito sai da função mais cedo (some sem afundar) e a seleção não pode ficar presa nele
	if selected == eid:
		selected = ""
	if entities.has(eid):
		var e: Dictionary = entities[eid]
		var n: Node3D = e["node"]
		entities.erase(eid)
		if n.has_method("set_motion"):
			n.set_motion(0.0, 0.0, 0.0)
		var label: Node = e["label"]
		label.visible = false
		if e["data"]["k"] == "m":
			var snd: Dictionary = e["snd"]
			Sfx.play("monster_die", n.position, 0.0, float(snd["voice"]))
			if snd["fam"] == "machine":
				Sfx.play("hit_blunt", n.position, -1.0, 0.7)
		# a queda da família do monstro (rig.gd: bicho tomba de lado, besouro vira de costas, máquina cai de cara),
		# um instante no chão e afunda — no mesmo tempo de antes, ~2,2 s (D186); o espírito encolhe e some em ~0,75 s,
		# sem afundar; peças paradas da prova tombam de lado
		var tw := create_tween()
		if n.has_method("play_death"):
			n.play_death()
			if str(n.get("family")) == "spirit":
				_sparks_at(n.position + Vector3(0, 1.0, 0))
				tw.tween_interval(float(n.death_seconds()) + 0.05)
				tw.tween_callback(n.queue_free)
				return
			if str(n.get("family")) == "machine":
				# faíscas quando bate no chão (tween preso ao mundo: numa troca de zona, nada fica pendurado)
				var at := n.position
				var tws := create_tween()
				tws.tween_interval(0.55)
				tws.tween_callback(func(): vfx._sparks(at + Vector3(0, 0.3, 0), Color(1.0, 0.75, 0.35), 18, 3.0, 0.6, 0.45))
			tw.tween_interval(float(n.death_seconds()) + 0.7)
		else:
			var side := -1.0 if randf() < 0.5 else 1.0
			tw.tween_property(n, "rotation:z", 1.5 * side, 0.4).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
			tw.tween_interval(0.9)
		tw.tween_property(n, "position:y", n.position.y - 1.4, 0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		tw.tween_callback(n.queue_free)

# ---------------- corpo: chegar, sair, teleportar, renascer, beber (D186) ----------------
## Entidade que acabou de entrar na lista: caída desde já (sem a queda), ou chegando ao mapa com o efeito de chegada
## (o meu personagem no mundo novo; outro jogador que acabou de entrar — evento joined).
func _on_spawned(eid: String, e: Dictionary) -> void:
	var n: Node3D = e["node"]
	_down_now(e)
	var arriving := false
	if _is_me(eid) and not _me_arrived:
		_me_arrived = true
		arriving = true
	elif _arrivals.has(eid):
		arriving = Time.get_ticks_msec() - int(_arrivals[eid]) < 4000
		_arrivals.erase(eid)
	if arriving:
		if n.has_method("appear"):
			n.appear(0.45)
		vfx.arrive_fx(n.position, false)

## Modelo novo de quem está caído (chegou à lista caído, ou trocou de arma ou de mão secundária no chão): já deitado,
## com a arma no chão e a cor apagada, sem tocar a queda (D187).
func _down_now(e: Dictionary) -> void:
	var n: Node3D = e["node"]
	var d: Dictionary = e["data"]
	if n.has_method("set_down") and (d.get("dead", false) or str(d.get("st", "")) == "down"):
		n.set_down(true, bool(d.get("dead", false)), true)

## Outro jogador entrou neste mapa (portal, prova, calabouço, entrada no jogo): quando aparecer, chega com o efeito.
func on_joined(m: Dictionary) -> void:
	var eid := str(m.get("eid", ""))
	if eid == "" or _is_me(eid):
		return
	if entities.has(eid):
		var n: Node3D = entities[eid]["node"]
		if n.has_method("appear"):
			n.appear(0.45)
		vfx.arrive_fx(n.position, false)
	else:
		_arrivals[eid] = Time.get_ticks_msec()

## Outro jogador saiu do mapa (portal, saída do jogo): o corpo se desfaz em brasas onde estava. O registro dele fica no
## cache dos snapshots por diferença (main.gd): o servidor o tira com "gone" no snapshot seguinte e, se o mesmo jogador
## entra de novo antes disso (outra conexão da mesma conta derruba a antiga: left e joined no mesmo tick), o servidor
## ainda o conhece e manda só os grupos que mudaram — é o registro guardado que deixa remontá-lo (D187).
func on_left(m: Dictionary) -> void:
	var eid := str(m.get("eid", ""))
	_arrivals.erase(eid)
	if not entities.has(eid) or _is_me(eid):
		return
	var e: Dictionary = entities[eid]
	entities.erase(eid)
	if selected == eid:
		selected = ""
	var n: Node3D = e["node"]
	(e["label"] as Node3D).visible = false
	vfx.vanish_fx(n.position)
	if n.has_method("vanish"):
		n.vanish(VANISH_SECS)
	var tw := create_tween()
	tw.tween_interval(VANISH_SECS + 0.05)
	tw.tween_callback(n.queue_free)

## Salto de posição no snapshot (teleporte de mestre): desfaz e forma de novo, se nada explica o salto (investida ou
## salto do próprio movimento, puxão de monstro, renascer já em curso).
func _check_jump(e: Dictionary, pos: Vector2) -> void:
	var n: Node3D = e["node"]
	if not n.has_method("vanish") or e.has("pin"):
		return
	var last: Vector2 = (e["track"] as Motion.Track).last_pos()
	if last.distance_to(pos) < JUMP_MIN:
		return
	if (n.has_method("act_locked") and n.act_locked()) or Time.get_ticks_msec() < int(e.get("pulled_until", 0)):
		return
	_teleport(e, false)

## Começa o teleporte: o corpo se desfaz em brasas onde está e fica ali até sumir; crouched: ao chegar, forma
## agachado e se levanta (renascer).
func _teleport(e: Dictionary, crouched: bool) -> void:
	var n: Node3D = e["node"]
	e["pin"] = Vector2(n.position.x, n.position.z) - (e["knock"] as Vector2)
	e["pin_until"] = Time.get_ticks_msec() + int(VANISH_SECS * 1000.0)
	e["pin_crouch"] = crouched
	vfx.vanish_fx(n.position)
	if n.has_method("vanish"):
		n.vanish(VANISH_SECS)

## Fim do desfazer: o corpo aparece no lugar novo (o que o servidor já mandou) e se forma numa coluna de luz.
func _arrive(e: Dictionary) -> void:
	var crouched: bool = e.get("pin_crouch", false)
	e.erase("pin")
	e.erase("pin_until")
	e.erase("pin_crouch")
	var track: Motion.Track = e["track"]
	track.clear_to(clock.latest, track.last_pos())
	e["knock"] = Vector2.ZERO
	var p := track.last_pos()
	var n: Node3D = e["node"]
	n.position = _gpos(p.x, p.y)
	if n.has_method("appear"):
		n.appear(0.45 if crouched else 0.35, crouched)
	vfx.arrive_fx(n.position, crouched)

## Renascer (evento respawn): longe de onde caiu (posto de guarda, entrada do calabouço depois da queda do grupo), o
## corpo se desfaz e se forma agachado numa coluna de luz e então se levanta; levantado por um aliado no mesmo
## lugar, levanta-se de onde caiu.
func on_respawn(m: Dictionary) -> void:
	var eid := str(m.get("eid", ""))
	if not entities.has(eid):
		return
	var e: Dictionary = entities[eid]
	var n: Node3D = e["node"]
	var to := Vector2(float(m.get("x", n.position.x)), float(m.get("z", n.position.z)))
	if Vector2(n.position.x, n.position.z).distance_to(to) > 3.0 and n.has_method("vanish"):
		_teleport(e, true)
		# o snapshot com o lugar novo chega logo depois; até lá, a chegada é no lugar do evento
		(e["track"] as Motion.Track).push(clock.latest + 1.0, to, Vector2.ZERO)
		return
	if n.has_method("set_down"):
		n.set_down(false)
		vfx.column(eid, Vfx.COLORS["sacred"], 0.9)

## Monstro puxou este jogador (mech pull): o salto de posição é o puxão, não um teleporte.
func mark_pulled(eid) -> void:
	if eid != null and entities.has(eid):
		entities[eid]["pulled_until"] = Time.get_ticks_msec() + 800

## Tônico (evento drink): quem bebeu leva o frasco à boca; no fim do gole, a faísca da cor sobe.
func on_drink(m: Dictionary) -> void:
	var eid := str(m.get("eid", ""))
	if not entities.has(eid):
		return
	var n: Node3D = entities[eid]["node"]
	var kind := str(m.get("kind", "hp"))
	if not _is_me(eid):
		Sfx.play("potion", n.position, -6.0)
	var wait := 0.0
	if n.has_method("play_drink"):
		n.play_drink(kind)
		wait = n.drink_spark_in()
	var tw := create_tween()
	tw.tween_interval(maxf(0.05, wait))
	tw.tween_callback(func(): vfx.drink_spark(eid, kind))

## Brilhos do espírito que se desfaz.
func _sparks_at(at: Vector3) -> void:
	vfx._sparks(at, Color(0.85, 0.75, 1.0), 22, 2.0, 1.0, 0.7)

func add_loot(l: Dictionary) -> void:
	if loots.has(l["id"]):
		return
	var color := Color("#ffd84a")
	var name := "%d de ouro" % int(l["gold"])
	if l.get("defId", null) != null:
		var d: Dictionary = main.defs["items"].get(l["defId"], {})
		color = Color(main.defs["rarities"].get(d.get("rarity", "common"), {}).get("color", "#ffffff"))
		name = d.get("name", "?")
		if int(l.get("qty", 1)) > 1:
			name += " x%d" % int(l["qty"])
	var root := Node3D.new()
	var gem := Node3D.new()
	root.add_child(gem)
	Art.part(gem, Art.sphere(0.22, 6), Art.toon(color, true, color * 0.5), Vector3(0, 0.45, 0), Vector3(1, 1.4, 1))
	var lab := _label(name, 30, color)
	lab.position.y = 1.1
	root.add_child(lab)
	root.position = _gpos(float(l["x"]), float(l["z"]))
	add_child(root)
	# o saque "salta" do chão
	gem.scale = Vector3.ONE * 0.2
	var tw := create_tween()
	tw.tween_property(gem, "scale", Vector3.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	loots[l["id"]] = {"node": root, "data": l}

## Saque que acabou de cair (mensagem "loot"): tilinta no chão onde caiu.
func on_loot_drop(l: Dictionary) -> void:
	var fresh := not loots.has(l["id"])
	add_loot(l)
	if fresh:
		Sfx.play("loot_coins" if l.get("defId", null) == null else "loot_item", _gpos(float(l["x"]), float(l["z"])), -4.0, 1.1)

func ground_effect(m: Dictionary) -> void:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.4, 0.1, 0.35)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var mi := Art.part(self, Art.cyl(float(m["radius"]), float(m["radius"]), 0.08, 32), mat, _gpos(float(m["x"]), float(m["z"])) + Vector3(0, 0.06, 0))
	get_tree().create_timer(float(m["ms"]) / 1000.0).timeout.connect(mi.queue_free)

## Estado do encontro com o chefe (comportas, válvulas, alarme).
func on_boss(m: Dictionary) -> void:
	if scenery:
		scenery.on_boss(m)
	_boss_audio(m)

## Música e avisos do Custódio. O servidor manda o estado desde que a câmara abre; a luta "começa"
## (música do chefe) quando ele perde vida ou passa da fase 1. Fase 3: comportas rangendo e apito.
func _boss_audio(m: Dictionary) -> void:
	var st: String = m.get("state", "")
	if st != "fight":
		Sfx.set_boss(false)
		if st == "victory":
			Sfx.ui("quest_done")
		elif st == "reset":
			Sfx.warn("gate")
		_boss_phase = 0
		_gate_prog.clear()
		return
	var phase := int(m.get("phase", 1))
	Sfx.set_boss(phase > 1 or float(m.get("hp", 0)) < float(m.get("mhp", 1)), phase)
	if phase == 3 and _boss_phase != 3:
		Sfx.warn("gate")
		Sfx.warn("alarm")
	_boss_phase = phase
	if phase == 3 and m.get("gates", null) != null:
		for g in m["gates"]:
			var p := float(g["progress"])
			var before := float(_gate_prog.get(g["id"], 0.0))
			# desceu mais um quarto, ou subiu de volta (trava destruída): a comporta range
			if int(p * 4.0) > int(before * 4.0) or p < before - 0.2:
				Sfx.warn("gate")
			_gate_prog[g["id"]] = p


# ---------------- prova de classe ----------------
var trial_mark_nodes := {} # id -> { node, data, ring }

## Estado das peças paradas da prova pelo snapshot: o pilar mostra a blindagem enquanto tiver 'armor' (e
## solta lascas quando a Ruptura racha); o sino só acende quando é o da vez (sem 'idle').
func _trial_piece_state(e: Dictionary, d: Dictionary) -> void:
	var n: Node3D = e["node"]
	var fx: Array = d["fx"] if d.get("fx", null) is Array else []
	if n.has_meta("armor"):
		var armored := fx.has("armor")
		var armor: Node3D = n.get_meta("armor")
		if armor.visible and not armored and e.get("armor_seen", false):
			vfx._sparks(n.position + Vector3(0, 2.2, 0), Color(1.0, 0.62, 0.22), 30, 4.5, 1.5, 0.7)
			Sfx.play("hit_blunt", n.position, 3.0, 0.55)
		armor.visible = armored
		(n.get_meta("cracks") as Node3D).visible = not armored
		e["armor_seen"] = true
	if n.has_meta("glow"):
		(n.get_meta("glow") as Node3D).visible = not fx.has("idle")

## Marcas da prova ('trial' started): filas (linha no chão), fossos (vala), posto de tiro (área), marcos da
## rota e números dos sinos (anel). 'status' marca a ativa e as concluídas (update_trial_marks).
func trial_marks(marks: Array) -> void:
	for t in trial_mark_nodes.values():
		t["node"].queue_free()
	trial_mark_nodes.clear()
	for mk in marks:
		var node := Node3D.new()
		add_child(node)
		var kind: String = str(mk.get("kind", "goal"))
		var x0 := float(mk.get("x", 0.0))
		var z0 := float(mk.get("z", 0.0))
		var x1 := float(mk.get("x2", x0))
		var z1 := float(mk.get("z2", z0))
		var center := _gpos((x0 + x1) / 2.0, (z0 + z1) / 2.0)
		var ring: MeshInstance3D = null
		var label_y := 1.6
		match kind:
			"ditch":
				# vala: fundo escuro rente ao chão, beiradas de pedra e pedras soltas no fundo. Em pedaços de 1 m que
				# seguem a altura do terreno (o chão da arena ondula alguns centímetros e cobria o fundo inteiriço)
				var sx := absf(x1 - x0)
				var sz := absf(z1 - z0)
				var dark := Art.toon(Color("#17110d"), false)
				var stone := Art.toon(Color("#6d5e4e"))
				var segs := maxi(1, int(ceil(sx)))
				var seg_w := sx / float(segs)
				for i in segs:
					var sxp := minf(x0, x1) + (i + 0.5) * seg_w
					var hy := maxf(ground_y(sxp, minf(z0, z1)), maxf(ground_y(sxp, center.z), ground_y(sxp, maxf(z0, z1))))
					var floor_mi := Art.part(node, Art.box(Vector3(seg_w + 0.02, 0.05, sz)), dark, Vector3(sxp, hy + 0.04, center.z))
					floor_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
					for edge in [minf(z0, z1), maxf(z0, z1)]:
						Art.part(node, Art.box(Vector3(seg_w + 0.02, 0.28, 0.32)), stone, Vector3(sxp, hy + 0.14, edge))
				var rng := RandomNumberGenerator.new()
				rng.seed = hash(str(mk.get("id", "")))
				for i in int(sx / 1.6):
					Art.part(node, Art.sphere(rng.randf_range(0.12, 0.26), 6), Art.toon(Color("#3a3028")), _gpos(minf(x0, x1) + 0.8 + i * 1.6, center.z + rng.randf_range(-sz * 0.3, sz * 0.3)) + Vector3(0, 0.05, 0), Vector3(1.2, 0.6, 1.0))
				label_y = 1.0
			"zone":
				# área (posto de tiro): borda clara no chão e um véu fino
				var sx2 := absf(x1 - x0)
				var sz2 := absf(z1 - z0)
				var fill := StandardMaterial3D.new()
				fill.albedo_color = Color(0.6, 0.9, 1.0, 0.1)
				fill.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				fill.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
				var fm := Art.part(node, Art.box(Vector3(sx2, 0.02, sz2)), fill, center + Vector3(0, 0.04, 0))
				fm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				var edge_mat := Art.toon(Color("#9fe3ff"), false, Color(0.3, 0.6, 0.7))
				for e2 in [[Vector3(sx2, 0.05, 0.12), Vector3(0, 0, -sz2 / 2.0)], [Vector3(sx2, 0.05, 0.12), Vector3(0, 0, sz2 / 2.0)], [Vector3(0.12, 0.05, sz2), Vector3(-sx2 / 2.0, 0, 0)], [Vector3(0.12, 0.05, sz2), Vector3(sx2 / 2.0, 0, 0)]]:
					Art.part(node, Art.box(e2[0]), edge_mat, center + e2[1] + Vector3(0, 0.05, 0))
				center = _gpos((x0 + x1) / 2.0, maxf(z0, z1) - 1.0)
				label_y = 0.8
			"line":
				# fila ou linha de contenção: faixa clara no chão de ponta a ponta, em pedaços de 1 m que seguem o
				# terreno; todos os pedaços dividem o material (update_trial_marks troca a cor de uma vez)
				var a := Vector2(x0, z0)
				var b := Vector2(x1, z1)
				var total := a.distance_to(b) + 1.0
				var dir := (b - a).normalized() if a.distance_to(b) > 0.01 else Vector2(0, 1)
				var start := a - dir * 0.5
				var n := maxi(1, int(ceil(total)))
				var mat := Art.toon(Color("#ffcf7a"), false, Color(0.5, 0.35, 0.1))
				var parts := []
				for i in n:
					var p2 := start + dir * ((i + 0.5) * total / float(n))
					var strip := Art.part(node, Art.box(Vector3(0.22, 0.04, total / float(n) + 0.02)), mat, _gpos(p2.x, p2.y) + Vector3(0, 0.04, 0))
					strip.rotation.y = atan2(dir.x, dir.y)
					strip.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
					parts.append(strip)
				ring = parts[0]
				node.set_meta("parts", parts)
				label_y = 0.9
			"path":
				# caminho do peregrino: pontos no chão a cada 1,4 m ao longo da rota
				var pts: Array = mk.get("pts", [])
				var dot := Art.toon(Color("#f2ead8"), false, Color(0.25, 0.22, 0.18))
				for i in range(1, pts.size()):
					var pa := Vector2(float(pts[i - 1][0]), float(pts[i - 1][1]))
					var pb := Vector2(float(pts[i][0]), float(pts[i][1]))
					var steps := int(pa.distance_to(pb) / 1.4)
					for k in steps:
						var q := pa.lerp(pb, (k + 0.5) / float(maxi(1, steps)))
						var d := Art.part(node, Art.cyl(0.13, 0.13, 0.03, 8), dot, _gpos(q.x, q.y) + Vector3(0, 0.05, 0))
						d.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			_:
				# marco (rota do peregrino) ou número do sino: anel no chão
				var r := float(mk.get("r", 1.2))
				var t := TorusMesh.new()
				t.inner_radius = r - 0.12
				t.outer_radius = r
				t.rings = 40
				t.ring_segments = 4
				ring = Art.part(node, t, Art.toon(Color("#f2ead8"), false, Color(0.3, 0.3, 0.3)), center + Vector3(0, 0.06, 0), Vector3(1, 0.3, 1))
				ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				label_y = 3.3 if str(mk.get("id", "")).begins_with("bell") else 1.4
		var text := str(mk.get("label", ""))
		if text != "":
			var l := _label(text, 40 if text.length() <= 2 else 34, Color("#ffe39a"))
			l.position = center + Vector3(0, label_y, 0)
			node.add_child(l)
		trial_mark_nodes[str(mk.get("id", ""))] = {"node": node, "data": mk, "ring": ring}
	update_trial_marks(marks)

## Marca a vez (ativa: âmbar) e o que já foi feito (verde apagado).
func update_trial_marks(states: Array) -> void:
	for st in states:
		var t: Dictionary = trial_mark_nodes.get(str(st.get("id", "")), {})
		# só marca com estado (vez ou feita) muda de cor; as outras ficam com a cor de quando foram criadas
		if t.is_empty() or t["ring"] == null or not (st.has("done") or st.has("active")):
			continue
		var node: Node3D = t["node"]
		if not node.has_meta("base_mat"):
			node.set_meta("base_mat", (t["ring"] as MeshInstance3D).material_override)
		var mat: Material = node.get_meta("base_mat")
		if st.get("done", false):
			mat = Art.toon(Color("#7fbf6a"), false, Color(0.1, 0.25, 0.05))
		elif st.get("active", false):
			mat = Art.toon(Color("#ffb347"), false, Color(0.9, 0.5, 0.1))
		for mi in (node.get_meta("parts") if node.has_meta("parts") else [t["ring"]]):
			(mi as MeshInstance3D).material_override = mat

# ---------------- opções gráficas ----------------
var sun_light: DirectionalLight3D

## Sombras ligadas ou não (opções; o modo leve desliga). Vale na hora.
func apply_graphics(gfx: Dictionary) -> void:
	if sun_light:
		sun_light.shadow_enabled = bool(gfx.get("shadows", true)) and not bool(gfx.get("light_mode", false))
