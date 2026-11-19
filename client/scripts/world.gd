extends Node3D
## Mundo 3D: mapa, câmera elevada (zoom e rotação), entidades interpoladas a partir dos
## snapshots do servidor e cliques (andar, atacar, falar, usar objeto, portal, coletar).
## Visual: cel shading + contorno (ver art.gd e docs/07-navegacao.md).

const Art = preload("res://scripts/art.gd")

var main # main.gd
var cam_pivot: Node3D
var camera: Camera3D
var cam_yaw := -0.6
var cam_pitch := 0.8
var cam_dist := 18.0
var entities := {} # eid -> { node, label, target_pos, data, w }
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
var _rotating := false
var _t := 0.0

const ROLE_NAMES := {"quest": "missões", "master": "mestre de classe", "smith": "ferreiro", "shop": "tônicos", "storage": "depósito"}
const GROUND_COLORS := {
	"estrada_velha": [Color("#857549"), Color("#677a44")],
	"brejo_bombas": [Color("#536b45"), Color("#425e50")],
	"oficina_soterrada": [Color("#6a5f58"), Color("#5a5048")],
	"arena_prova": [Color("#8a7a68"), Color("#7a6a5a")],
	"pedrambar": [Color("#a89878"), Color("#968668")],
	"vau_de_nacar": [Color("#9aa8a0"), Color("#88968e")],
}
const LEAF_COLORS := [Color("#6f8c3a"), Color("#8a9a3e"), Color("#a8743a"), Color("#5a7a4a")]

func _ready() -> void:
	var map: Dictionary = main.map_def()
	var env := WorldEnvironment.new()
	env.environment = Art.environment(map.get("id", ""))
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52, -40, 0)
	sun.light_color = Color("#ffe2c0")
	sun.light_energy = 1.0
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 80.0
	add_child(sun)
	Art.publish_sun(sun)
	_build_map(map)
	cam_pivot = Node3D.new()
	add_child(cam_pivot)
	camera = Camera3D.new()
	camera.fov = 45
	cam_pivot.add_child(camera)
	camera.current = true
	select_ring = Art.part(self, _torus(0.9, 1.05), Art.toon(Color("#ffcf4a"), false, Color(0.8, 0.6, 0.1)), Vector3.ZERO)
	select_ring.visible = false
	dest_marker = Art.part(self, _torus(0.3, 0.42), Art.toon(Color("#9fd3d1"), false, Color(0.3, 0.6, 0.6)), Vector3.ZERO)
	dest_marker.visible = false

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

func _build_map(map: Dictionary) -> void:
	var size: Array = map.get("size", [160, 100])
	var w := float(size[0])
	var h := float(size[1])
	var id: String = map.get("id", "")
	var gc: Array = GROUND_COLORS.get(id, [Color("#8a7a5a"), Color("#7a8a4e")])
	var ground := PlaneMesh.new()
	ground.size = Vector2(w, h)
	ground.subdivide_width = 8
	ground.subdivide_depth = 8
	Art.part(self, ground, Art.ground(gc[0], gc[1]), Vector3(w / 2.0, 0, h / 2.0))
	# borda do mapa (penhasco baixo) para não parecer que o mundo acaba no vazio
	for side in [[Vector3(w / 2.0, -1.5, -1.5), Vector3(w + 6, 3, 3)], [Vector3(w / 2.0, -1.5, h + 1.5), Vector3(w + 6, 3, 3)], [Vector3(-1.5, -1.5, h / 2.0), Vector3(3, 3, h)], [Vector3(w + 1.5, -1.5, h / 2.0), Vector3(3, 3, h)]]:
		Art.part(self, Art.box(side[1]), Art.toon(Color("#5a4a3e"), false), side[0])
	var road_tint := Color("#a08c64") if not map.get("city", false) else Color("#a89e8a")
	if id == "estrada_velha" or map.get("city", false):
		var road := PlaneMesh.new()
		road.size = Vector2(w, 6 if not map.get("city", false) else 10)
		Art.part(self, road, Art.toon(road_tint, false), Vector3(w / 2.0, 0.02, h / 2.0 if not map.get("city", false) else 30.0))
	for b in map.get("blocked", []):
		var sx := float(b["x1"]) - float(b["x0"])
		var sz := float(b["z1"]) - float(b["z0"])
		var center := Vector3(float(b["x0"]) + sx / 2.0, 0, float(b["z0"]) + sz / 2.0)
		var bname: String = b["name"]
		if "Lagoa" in bname or "rio" in bname:
			var wp := PlaneMesh.new()
			wp.size = Vector2(sx, sz)
			Art.part(self, wp, Art.water(), center + Vector3(0, 0.04, 0))
		else:
			Art.part(self, Art.box(Vector3(sx, 2.6, sz)), Art.toon(Color("#7a6e64")), center + Vector3(0, 1.3, 0))
			Art.part(self, Art.box(Vector3(sx * 0.6, 1.2, sz * 0.4)), Art.toon(Color("#8a7e72")), center + Vector3(sx * 0.1, 3.2, 0))
		var bl := _label(bname, 34, Color("#e8dccb"))
		bl.position = center + Vector3(0, 4.5, 0)
		add_child(bl)
	var gp: Dictionary = map.get("guardPost", {})
	if not gp.is_empty():
		var gpos := Vector3(float(gp["x"]), 0, float(gp["z"]))
		if float(gp["safeRadius"]) > 0 and float(gp["safeRadius"]) < 30:
			var ring := Art.cyl(float(gp["safeRadius"]), float(gp["safeRadius"]), 0.04, 48)
			var rm := StandardMaterial3D.new()
			rm.albedo_color = Color(0.62, 0.83, 0.82, 0.16)
			rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			Art.part(self, ring, rm, gpos + Vector3(0, 0.03, 0))
		for off in [Vector3(-3, 0, -3), Vector3(3, 0, -3)]:
			var lan := Art.lantern()
			lan.position = gpos + off
			add_child(lan)
		var gl := _label(gp["name"], 48, Color("#ffcf7a"))
		gl.position = gpos + Vector3(0, 3.6, -3)
		add_child(gl)
	for n in map.get("npcs", []):
		var npc_col := Color("#e3a548") if n.get("role", "") == "master" else Color.from_hsv(float(hash(n["id"]) % 360) / 360.0, 0.35, 0.75)
		var npc: Node3D
		if n.get("role", "") == "master" and n.has("classId"):
			npc = Art.character(n["classId"], _kit_family(n["classId"]))
		else:
			npc = Art.character("", "", true, npc_col, hash(n["id"]))
		npc.position = Vector3(float(n["x"]), 0, float(n["z"]))
		npc.scale = Vector3.ONE * 1.3
		npc.rotation.y = -0.6
		add_child(npc)
		var nl := _label("%s\n‹%s›" % [n["name"], ROLE_NAMES.get(n.get("role", ""), "")], 36, Color("#ffe39a"))
		nl.position = npc.position + Vector3(0, 2.9, 0)
		add_child(nl)
		npc_nodes[n["id"]] = {"pos": npc.position, "data": n, "node": npc}
	for o in map.get("objects", []):
		var op := Vector3(float(o["x"]), 0, float(o["z"]))
		Art.part(self, Art.box(Vector3(0.7, 0.7, 0.7)), Art.toon(Color("#9fd3d1"), true, Color(0.15, 0.35, 0.35)), op + Vector3(0, 0.35, 0), Vector3.ONE, Vector3(0, 30, 0))
		var ol := _label(o["name"], 30, Color("#bfeeee"))
		ol.position = op + Vector3(0, 1.3, 0)
		add_child(ol)
		object_nodes[o["id"]] = {"pos": op, "data": o}
	for pt in map.get("portals", []):
		var pp := Vector3(float(pt["x"]), 0, float(pt["z"]))
		var ring2 := Art.cyl(float(pt["radius"]), float(pt["radius"]), 0.06, 32)
		var pm := StandardMaterial3D.new()
		pm.albedo_color = Color(1.0, 0.7, 0.3, 0.45)
		pm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		pm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		Art.part(self, ring2, pm, pp + Vector3(0, 0.05, 0))
		for k in 2:
			var post := Art.part(self, Art.cyl(0.15, 0.2, 3.0, 8), Art.toon(Color("#6b4a2e")), pp + Vector3(-1.6 + k * 3.2, 1.5, 0))
			post.rotation_degrees.y = 0
		Art.part(self, Art.box(Vector3(3.8, 0.3, 0.3)), Art.toon(Color("#b5562c")), pp + Vector3(0, 3.0, 0))
		var dest: Dictionary = main.defs.get("maps", {}).get(pt["to"], {})
		var lvl := int(pt.get("minLevel", 1))
		var pl := _label("→ %s%s" % [dest.get("name", pt["to"]), (" (nível %d)" % lvl) if lvl > 1 else ""], 42, Color("#ffcf7a"))
		pl.position = pp + Vector3(0, 3.8, 0)
		add_child(pl)
		portal_nodes[pt["id"]] = {"pos": pp, "data": pt}
	for sp in map.get("spawns", []):
		var md: Dictionary = main.defs.get("monsters", {}).get(sp["monster"], {})
		var sl := _label("%s (nv %d)" % [md.get("name", sp["monster"]), int(md.get("level", 1))], 30, Color(1, 1, 1, 0.45))
		sl.position = Vector3(float(sp["x"]), 0.4, float(sp["z"]) + float(sp["radius"]) + 1)
		add_child(sl)
	_scatter_props(map, w, h)

## Árvores, pedras e grama com semente fixa por mapa, fora da estrada, portais e áreas de monstros.
func _scatter_props(map: Dictionary, w: float, h: float) -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(map.get("id", "mapa"))
	var avoid := []
	for sp in map.get("spawns", []):
		avoid.append([Vector2(float(sp["x"]), float(sp["z"])), float(sp["radius"]) + 3.0])
	for pt in map.get("portals", []):
		avoid.append([Vector2(float(pt["x"]), float(pt["z"])), 6.0])
	for n in map.get("npcs", []):
		avoid.append([Vector2(float(n["x"]), float(n["z"])), 3.0])
	for o in map.get("objects", []):
		avoid.append([Vector2(float(o["x"]), float(o["z"])), 3.0])
	var gp: Dictionary = map.get("guardPost", {})
	if not gp.is_empty():
		avoid.append([Vector2(float(gp["x"]), float(gp["z"])), minf(float(gp["safeRadius"]), 14.0) + 2.0])
	var count := int(w * h / 90.0)
	if map.get("city", false):
		count = 26
	var placed := 0
	var tries := 0
	while placed < count and tries < count * 6:
		tries += 1
		var p := Vector2(rng.randf_range(2, w - 2), rng.randf_range(2, h - 2))
		var ok := true
		for a in avoid:
			if p.distance_to(a[0]) < a[1]:
				ok = false
				break
		if ok and (map.get("id", "") == "estrada_velha" and absf(p.y - h / 2.0) < 5.0):
			ok = false
		if ok and map.get("city", false) and absf(p.y - 30.0) < 7.0:
			ok = false
		for b in map.get("blocked", []):
			if p.x > float(b["x0"]) - 2 and p.x < float(b["x1"]) + 2 and p.y > float(b["z0"]) - 2 and p.y < float(b["z1"]) + 2:
				ok = false
		if not ok:
			continue
		var roll := rng.randf()
		var prop: Node3D
		if map.get("id", "") in ["oficina_soterrada", "arena_prova"]:
			prop = Art.rock(rng) if roll < 0.7 else Art.lantern()
		elif roll < 0.4:
			prop = Art.tree(rng, LEAF_COLORS)
		elif roll < 0.62:
			prop = Art.rock(rng)
		else:
			prop = Art.grass(rng, Color("#9aa84e") if map.get("id", "") != "brejo_bombas" else Color("#6a8a5a"))
		prop.position = Vector3(p.x, 0, p.y)
		prop.rotation.y = rng.randf_range(0, TAU)
		add_child(prop)
		placed += 1

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

# ---------------- snapshots ----------------
func _weapon_family(def_id) -> String:
	if def_id == null:
		return ""
	return main.defs["items"].get(def_id, {}).get("family", "")

func apply_snapshot(snap: Dictionary) -> void:
	var seen := {}
	for d in snap.get("ents", []):
		var eid: String = d["id"]
		seen[eid] = true
		var e: Dictionary = entities.get(eid, {})
		if not e.is_empty() and d["k"] == "p" and e.get("w") != d.get("w"):
			e["node"].queue_free()
			entities.erase(eid)
			e = {}
		if e.is_empty():
			e = _spawn_entity(d)
			entities[eid] = e
		e["data"] = d
		e["target_pos"] = Vector3(float(d["x"]), 0, float(d["z"]))
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
		e["node"].visible = not d.get("dead", false)
	for eid in entities.keys():
		if not seen.has(eid):
			entities[eid]["node"].queue_free()
			entities.erase(eid)
			if selected == eid:
				selected = ""
	if main.hud:
		main.hud.refresh_target()

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
	root.position = Vector3(float(d["x"]), 0, float(d["z"]))
	return {"node": root, "label": label, "target_pos": root.position, "data": d, "w": d.get("w"), "phase": randf() * TAU}

func me() -> Dictionary:
	return entities.get(main.ch.get("eid", ""), {})

func my_pos() -> Vector3:
	var e := me()
	return e["node"].position if not e.is_empty() else Vector3.ZERO

func _process(delta: float) -> void:
	_t += delta
	for e in entities.values():
		var n: Node3D = e["node"]
		var tp: Vector3 = e["target_pos"]
		var before := n.position
		if n.position.distance_to(tp) > 8.0:
			n.position = tp
		else:
			n.position = n.position.lerp(tp, clampf(delta * 12.0, 0.0, 1.0))
		# vira para onde anda; parado em combate, vira para o alvo
		var mv := n.position - before
		var face_dir := Vector3.ZERO
		if mv.length() > 0.004:
			face_dir = mv
		else:
			var tgt = e["data"].get("tgt", null)
			if tgt != null and entities.has(tgt):
				face_dir = entities[tgt]["node"].position - n.position
		if face_dir.length() > 0.001:
			var want := atan2(face_dir.x, face_dir.z)
			n.rotation.y = lerp_angle(n.rotation.y, want, clampf(delta * 10.0, 0.0, 1.0))
		var moving := mv.length() > 0.004
		if n.has_method("set_moving"):
			n.set_moving(moving)
	var focus := my_pos()
	cam_pivot.position = cam_pivot.position.lerp(focus, clampf(delta * 8.0, 0.0, 1.0))
	var rot_speed := 1.8 * float(main.settings.get("camera_sensitivity", 1.0))
	if Input.is_key_pressed(KEY_Q):
		cam_yaw += delta * rot_speed
	if Input.is_key_pressed(KEY_E):
		cam_yaw -= delta * rot_speed
	var off := Vector3(sin(cam_yaw) * cos(cam_pitch), sin(cam_pitch), cos(cam_yaw) * cos(cam_pitch)) * cam_dist
	camera.position = off
	camera.look_at(cam_pivot.global_position + Vector3(0, 1, 0), Vector3.UP)
	if selected != "" and entities.has(selected):
		select_ring.visible = true
		select_ring.position = entities[selected]["node"].position + Vector3(0, 0.05, 0)
	else:
		select_ring.visible = false
	if dest_marker.visible and focus.distance_to(dest_marker.position) < 0.8:
		dest_marker.visible = false
	if pending_pickup != "" and loots.has(pending_pickup):
		var lp: Vector3 = loots[pending_pickup]["node"].position
		if Vector2(lp.x, lp.z).distance_to(Vector2(focus.x, focus.z)) < 4.0:
			var lid := pending_pickup
			pending_pickup = ""
			Net.request("pickup", {"loot": lid}, func(r): _on_pickup(lid, r))
	for l in loots.values():
		l["node"].get_child(0).rotation.y += delta * 1.5
	if not pending_action.is_empty():
		var ap: Vector3 = pending_action["pos"]
		if Vector2(ap.x, ap.z).distance_to(Vector2(focus.x, focus.z)) <= float(pending_action["range"]):
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
		if tpos.distance_to(focus) <= float(pending_cast["range"]) - 0.3:
			var pc := pending_cast
			pending_cast = {}
			Net.request("cast", {"skill": pc["skill"], "target": pc["target"]})

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
	return Plane(Vector3.UP, 0.0).intersects_ray(from, dir)

func _click(screen_pos: Vector2) -> void:
	var p = ground_point(screen_pos)
	if p == null:
		return
	var gp: Vector3 = p
	for lid in loots.keys():
		if loots[lid]["node"].position.distance_to(gp) < 1.2:
			pending_pickup = lid
			Net.request("move", {"x": gp.x, "z": gp.z})
			return
	for group in [["npc", npc_nodes, 1.5, 4.5], ["object", object_nodes, 1.2, 2.8], ["portal", portal_nodes, 3.0, 2.5]]:
		var nodes: Dictionary = group[1]
		for id in nodes.keys():
			var pos: Vector3 = nodes[id]["pos"]
			var pick := float(group[2])
			if group[0] == "portal":
				pick = float(nodes[id]["data"]["radius"])
			if pos.distance_to(gp) < pick:
				pending_action = {"kind": group[0], "id": id, "pos": pos, "range": group[3]}
				pending_cast = {}
				pending_pickup = ""
				Net.request("move", {"x": pos.x + 0.8, "z": pos.z + 0.8})
				return
	for eid in entities.keys():
		var pe: Dictionary = entities[eid]
		if pe["data"]["k"] == "p" and eid != main.ch.get("eid", "") and pe["node"].position.distance_to(gp) < 1.2:
			ally_selected = eid
			main.hud.system("Aliado selecionado: %s" % pe["data"]["n"])
			return
	var best := ""
	var best_d := 1.8
	for eid in entities.keys():
		var e: Dictionary = entities[eid]
		if e["data"]["k"] != "m":
			continue
		var d: float = e["node"].position.distance_to(gp)
		if d < best_d:
			best_d = d
			best = eid
	if best != "":
		selected = best
		pending_cast = {}
		Net.request("attack", {"target": best})
		main.hud.refresh_target()
		return
	pending_cast = {}
	pending_pickup = ""
	pending_action = {}
	Net.request("move", {"x": gp.x, "z": gp.z}, func(r):
		if r["ok"]:
			dest_marker.position = gp + Vector3(0, 0.05, 0)
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
		var d := my_pos().distance_to(entities[selected]["node"].position)
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
	if not src.is_empty() and m.get("skill", null) != "dot" and src["node"].has_method("play_attack"):
		src["node"].play_attack()
	if not m.get("miss", false) and dst["node"].has_method("play_hurt"):
		dst["node"].play_hurt()
	# pequeno "tranco" no atingido
	if not m.get("miss", false):
		var body = dst["node"].get_node_or_null("Body")
		if body:
			var tw := create_tween()
			tw.tween_property(body, "scale", Vector3(1.12, 0.9, 1.12), 0.06)
			tw.tween_property(body, "scale", Vector3.ONE, 0.12)

func on_heal(m: Dictionary) -> void:
	var dst: Dictionary = entities.get(m["dst"], {})
	if dst.is_empty() or int(m["amount"]) <= 0:
		return
	_float_text(dst["node"].position, "+%d" % int(m["amount"]), Color("#6fd06a"))

func on_death(eid: String) -> void:
	if entities.has(eid):
		var n: Node3D = entities[eid]["node"]
		entities.erase(eid)
		var tw := create_tween()
		tw.tween_property(n, "scale", Vector3(1.2, 0.05, 1.2), 0.25)
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
	root.position = Vector3(float(l["x"]), 0, float(l["z"]))
	add_child(root)
	loots[l["id"]] = {"node": root, "data": l}

func ground_effect(m: Dictionary) -> void:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.4, 0.1, 0.35)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var mi := Art.part(self, Art.cyl(float(m["radius"]), float(m["radius"]), 0.08, 32), mat, Vector3(float(m["x"]), 0.06, float(m["z"])))
	get_tree().create_timer(float(m["ms"]) / 1000.0).timeout.connect(mi.queue_free)
