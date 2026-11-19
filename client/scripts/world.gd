extends Node3D
## Mundo 3D: cenário (scenery.gd), câmera elevada com zoom/rotação suaves, entidades
## interpoladas no tempo do servidor (motion.gd), previsão do próprio personagem, reações a
## golpes e cliques (andar, atacar, falar, usar objeto, portal, coletar).
## Visual: cel shading + contorno (ver art.gd e docs/07-navegacao.md).

const Art = preload("res://scripts/art.gd")
const Scenery = preload("res://scripts/scenery.gd")
const Motion = preload("res://scripts/motion.gd")
const Vfx = preload("res://scripts/vfx.gd")

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

const ROLE_NAMES := {"quest": "missões", "master": "mestre de classe", "smith": "ferreiro", "shop": "tônicos", "storage": "depósito"}

func _ready() -> void:
	var map: Dictionary = main.map_def()
	var env := WorldEnvironment.new()
	env.environment = Scenery.environment(map.get("id", ""))
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -40, 0)
	sun.light_color = Scenery.sun_color(map.get("id", ""))
	sun.light_energy = 1.0
	sun.shadow_enabled = true
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
	select_ring = Art.part(self, _torus(0.9, 1.05), Art.toon(Color("#ffcf4a"), false, Color(0.8, 0.6, 0.1)), Vector3.ZERO)
	select_ring.visible = false
	dest_marker = Art.part(self, _torus(0.3, 0.42), Art.toon(Color("#9fd3d1"), false, Color(0.3, 0.6, 0.6)), Vector3.ZERO)
	dest_marker.visible = false
	var ms: Dictionary = main.ch.get("stats", {})
	pred.max_speed = float(ms.get("moveSpeed", 5.0))
	pred.accel = float(ms.get("accel", 18.0))
	pred.decel = float(ms.get("decel", 24.0))

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
		npc_nodes[n["id"]] = {"pos": npc.position, "data": n, "node": npc, "home": home, "yaw": home}
	for o in map.get("objects", []):
		var op := _gpos(float(o["x"]), float(o["z"]))
		var crate := Art.part(self, Art.box(Vector3(0.7, 0.7, 0.7)), Art.toon(Color("#9fd3d1"), true, Color(0.15, 0.35, 0.35)), op + Vector3(0, 0.35, 0), Vector3.ONE, Vector3(0, 30, 0))
		crate.set_meta("bob", true)
		var ol := _label(o["name"], 30, Color("#bfeeee"))
		ol.position = op + Vector3(0, 1.3, 0)
		add_child(ol)
		object_nodes[o["id"]] = {"pos": op, "data": o, "node": crate}
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
		seen[eid] = true
		var e: Dictionary = entities.get(eid, {})
		if not e.is_empty() and d["k"] == "p" and e.get("w") != d.get("w"):
			# trocou de arma: refaz o modelo no mesmo lugar
			var keep: Motion.Track = e["track"]
			var yaw: float = e["yaw"]
			e["node"].queue_free()
			entities.erase(eid)
			e = _spawn_entity(d)
			e["track"] = keep
			e["yaw"] = yaw
			entities[eid] = e
		if e.is_empty():
			e = _spawn_entity(d)
			entities[eid] = e
		e["data"] = d
		var pos := Vector2(float(d["x"]), float(d["z"]))
		var vel := Vector2(float(d.get("vx", 0.0)), float(d.get("vz", 0.0)))
		(e["track"] as Motion.Track).push(now_srv, pos, vel)
		var name: String
		if d["k"] == "p":
			name = "%s  nv %d" % [d["n"], int(d["lvl"])]
		else:
			name = "%s  nv %d" % [main.defs["monsters"].get(d["def"], {}).get("name", d["def"]), int(d["lvl"])]
		var frac := clampf(float(d["hp"]) / maxf(1.0, float(d["mhp"])), 0.0, 1.0)
		e["label"].text = "%s\n%d / %d" % [name, int(d["hp"]), int(d["mhp"])]
		e["label"].visible = main.settings.get("show_names", true) or eid == selected
		if d["k"] == "m":
			e["label"].modulate = Color("#ffcf9a").lerp(Color("#ff4a3a"), 1.0 - frac)
		if _is_me(eid):
			_reconcile(pos, d)
	for eid in entities.keys():
		if not seen.has(eid):
			entities[eid]["node"].queue_free()
			entities.erase(eid)
			if selected == eid:
				selected = ""
	if main.hud:
		main.hud.refresh_target()

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
	if d["k"] == "p":
		root = Art.character(d.get("cls", ""), _weapon_family(d.get("w")))
	else:
		var md: Dictionary = main.defs["monsters"].get(d["def"], {}).duplicate()
		md["id"] = d["def"]
		root = Art.monster(md)
	root.scale = Vector3.ONE * (1.3 if d["k"] == "p" else 1.15)
	add_child(root)
	var label := _label("", 34, Color("#f2ead8") if d["k"] == "p" else Color("#ffcf9a"))
	label.position.y = 2.1 if d["k"] == "p" else 1.8
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
	return {"node": root, "label": label, "data": d, "w": d.get("w"), "track": track, "yaw": yaw, "speed": 0.0, "vel": Vector2.ZERO, "accel": 0.0, "turn": 0.0, "knock": Vector2.ZERO}

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
		# empurrão visual dos golpes
		var knock: Vector2 = e["knock"]
		if knock.length() > 0.001:
			knock *= exp(-delta * 9.0)
			e["knock"] = knock
		n.position = _gpos(pos2.x + knock.x, pos2.y + knock.y)
		# caído: deita no chão (e levanta ao renascer)
		var lying: bool = e["data"].get("dead", false)
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
		if speed > 0.35:
			want = atan2(vel.x, vel.y)
		else:
			var tgt = e["data"].get("tgt", null)
			if tgt != null and entities.has(tgt):
				var tp: Vector3 = entities[tgt]["node"].position
				if Vector2(tp.x - n.position.x, tp.z - n.position.z).length() > 0.05:
					want = atan2(tp.x - n.position.x, tp.z - n.position.z)
				turn_speed = 7.0
		var diff := wrapf(want - yaw, -PI, PI)
		var step := clampf(diff * clampf(delta * 12.0, 0.0, 1.0), -turn_speed * delta, turn_speed * delta)
		yaw = wrapf(yaw + step, -PI, PI)
		e["turn"] = lerpf(float(e["turn"]), step / maxf(delta, 1e-4), clampf(delta * 8.0, 0.0, 1.0))
		e["yaw"] = yaw
		n.rotation.y = yaw
		if n.has_method("set_motion"):
			n.set_motion(speed, float(e["accel"]), float(e["turn"]))
		elif n.has_method("set_moving"):
			n.set_moving(speed > 0.3)
		if n.has_method("set_look_target"):
			var lt = e["data"].get("tgt", null)
			if lt != null and entities.has(lt):
				n.set_look_target(entities[lt]["node"].position + Vector3(0, 0.8, 0), 1.0)
			else:
				n.set_look_target(Vector3.ZERO, 0.0)
	var focus := my_pos()
	_update_npcs(delta, focus)
	_update_camera(delta, focus)
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
		var what: String = "%d de ouro" % int(r["gold"]) if r.get("defId", null) == null else main.defs["items"][r["defId"]]["name"]
		main.hud.system("Coletado: %s" % what)
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
	for group in [["npc", npc_nodes, 1.5, 4.5], ["object", object_nodes, 1.2, 2.8], ["portal", portal_nodes, 3.0, 2.5]]:
		var nodes: Dictionary = group[1]
		for id in nodes.keys():
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
	for eid in entities.keys():
		var pe: Dictionary = entities[eid]
		if pe["data"]["k"] == "p" and eid != main.ch.get("eid", "") and _flat_dist(pe["node"].position, gp) < 1.2:
			ally_selected = eid
			main.hud.system("Aliado selecionado: %s" % pe["data"]["n"])
			return
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
	var text := "errou" if m.get("miss", false) else str(int(m["dmg"]))
	var col := Color("#ffffff")
	if m["dst"] == main.ch.get("eid", ""):
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
	vfx.on_hit(m, fam)
	if not src.is_empty() and m.get("skill", null) != "dot" and src["node"].has_method("play_attack"):
		src["node"].play_attack()
	if not m.get("miss", false):
		if dst["node"].has_method("play_hurt"):
			dst["node"].play_hurt()
		# empurrãozinho para longe de quem bateu (mais forte no crítico)
		if not src.is_empty():
			var dv: Vector3 = dst["node"].position - src["node"].position
			var d2 := Vector2(dv.x, dv.z)
			if d2.length() > 0.01:
				dst["knock"] = (dst["knock"] as Vector2) + d2.normalized() * (0.28 if m.get("crit", false) else 0.16)

func on_heal(m: Dictionary) -> void:
	var dst: Dictionary = entities.get(m["dst"], {})
	if dst.is_empty() or int(m["amount"]) <= 0:
		return
	_float_text(dst["node"].position, "+%d" % int(m["amount"]), Color("#6fd06a"))
	vfx.on_heal(m)

func on_death(eid: String) -> void:
	if entities.has(eid):
		var e: Dictionary = entities[eid]
		var n: Node3D = e["node"]
		entities.erase(eid)
		if n.has_method("set_motion"):
			n.set_motion(0.0, 0.0, 0.0)
		var label: Node = e["label"]
		label.visible = false
		# cai de lado, fica um instante no chão e afunda
		var side := -1.0 if randf() < 0.5 else 1.0
		var tw := create_tween()
		if e["data"]["k"] == "p":
			tw.tween_property(n, "rotation:x", -1.45, 0.5).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		else:
			tw.tween_property(n, "rotation:z", 1.5 * side, 0.4).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		tw.tween_interval(0.9)
		tw.tween_property(n, "position:y", n.position.y - 1.4, 0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		tw.tween_callback(n.queue_free)
	if selected == eid:
		selected = ""

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

func ground_effect(m: Dictionary) -> void:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.4, 0.1, 0.35)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var mi := Art.part(self, Art.cyl(float(m["radius"]), float(m["radius"]), 0.08, 32), mat, _gpos(float(m["x"]), float(m["z"])) + Vector3(0, 0.06, 0))
	get_tree().create_timer(float(m["ms"]) / 1000.0).timeout.connect(mi.queue_free)
