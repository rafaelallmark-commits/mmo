extends Node3D
## Mundo 3D: chão do mapa, câmera elevada (zoom e rotação), entidades interpoladas a partir
## dos snapshots do servidor, clique no chão para mover e clique em monstro para atacar.

var main # main.gd
var cam_pivot: Node3D
var camera: Camera3D
var cam_yaw := -0.6
var cam_pitch := 0.95
var cam_dist := 26.0
var entities := {} # eid -> { node, label, target_pos, data }
var loots := {} # loot id -> { node, data }
var selected := ""
var select_ring: MeshInstance3D
var dest_marker: MeshInstance3D
var pending_pickup := ""
var pending_cast := {}
var _rotating := false

const CLASS_COLORS := {"breaker": Color("#c8772f"), "emberweaver": Color("#e0482c"), "bastion": Color("#a07a3a"), "pikeman": Color("#8f6d3a"), "warden": Color("#6d8a3a"), "dawnshield": Color("#e8d27a"), "windwalker": Color("#7ac3c9"), "veilsinger": Color("#c9b8e8")}
const FAMILY_COLORS := {"beast": Color("#7b5a44"), "machine": Color("#6f7a80"), "spirit": Color("#8fb7c9")}

func _ready() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color("#2a2420")
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color("#8a7c6a")
	e.ambient_light_energy = 0.7
	e.fog_enabled = true
	e.fog_light_color = Color("#3a302a")
	e.fog_density = 0.006
	env.environment = e
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -35, 0)
	sun.light_color = Color("#ffd9a8")
	sun.light_energy = 1.1
	sun.shadow_enabled = true
	add_child(sun)
	_build_map()
	cam_pivot = Node3D.new()
	add_child(cam_pivot)
	camera = Camera3D.new()
	camera.fov = 50
	cam_pivot.add_child(camera)
	camera.current = true
	select_ring = _mesh(_torus(0.9, 1.1), Color("#ffcf4a"), true)
	select_ring.visible = false
	add_child(select_ring)
	dest_marker = _mesh(_torus(0.3, 0.45), Color("#9fd3d1"), true)
	dest_marker.visible = false
	add_child(dest_marker)

func _torus(inner: float, outer: float) -> TorusMesh:
	var t := TorusMesh.new()
	t.inner_radius = inner
	t.outer_radius = outer
	return t

func _mesh(m: Mesh, c: Color, unshaded := false) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = m
	var mat := StandardMaterial3D.new()
	mat.albedo_color = c
	if unshaded:
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if c.a < 1.0:
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mi.material_override = mat
	return mi

func _label(text: String, size := 48, color := Color.WHITE) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.font_size = size
	l.pixel_size = 0.01
	l.modulate = color
	l.outline_size = 8
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.no_depth_test = true
	return l

func _build_map() -> void:
	var map: Dictionary = main.defs.get("map", {})
	var size: Array = map.get("size", [160, 100])
	var w := float(size[0])
	var h := float(size[1])
	var ground := PlaneMesh.new()
	ground.size = Vector2(w, h)
	var g := _mesh(ground, Color("#4a4636"))
	g.position = Vector3(w / 2.0, 0, h / 2.0)
	add_child(g)
	# estrada velha: faixa clara de leste a oeste
	var road := PlaneMesh.new()
	road.size = Vector2(w, 6)
	var r := _mesh(road, Color("#6b5f4a"))
	r.position = Vector3(w / 2.0, 0.01, h / 2.0)
	add_child(r)
	for b in map.get("blocked", []):
		var bx := BoxMesh.new()
		var sx := float(b["x1"]) - float(b["x0"])
		var sz := float(b["z1"]) - float(b["z0"])
		bx.size = Vector3(sx, 3.0, sz)
		var bm := _mesh(bx, Color("#3a3530"))
		bm.position = Vector3(float(b["x0"]) + sx / 2.0, 1.5, float(b["z0"]) + sz / 2.0)
		add_child(bm)
		var bl := _label(b["name"], 40, Color("#9a927f"))
		bl.position = bm.position + Vector3(0, 2.5, 0)
		add_child(bl)
	var gp: Dictionary = map.get("guardPost", {})
	if not gp.is_empty():
		var ring := CylinderMesh.new()
		ring.top_radius = float(gp["safeRadius"])
		ring.bottom_radius = float(gp["safeRadius"])
		ring.height = 0.05
		var rm := _mesh(ring, Color(0.62, 0.83, 0.82, 0.18), true)
		rm.position = Vector3(float(gp["x"]), 0.03, float(gp["z"]))
		add_child(rm)
		var tower := CylinderMesh.new()
		tower.top_radius = 0.6
		tower.bottom_radius = 0.9
		tower.height = 4.0
		var tm := _mesh(tower, Color("#8a7a5a"))
		tm.position = Vector3(float(gp["x"]) - 3, 2, float(gp["z"]) - 3)
		add_child(tm)
		var gl := _label(gp["name"], 56, Color("#e3a548"))
		gl.position = tm.position + Vector3(0, 3, 0)
		add_child(gl)
	for sp in map.get("spawns", []):
		var md: Dictionary = main.defs.get("monsters", {}).get(sp["monster"], {})
		var sl := _label("%s (nv %d)" % [md.get("name", sp["monster"]), int(md.get("level", 1))], 36, Color(1, 1, 1, 0.35))
		sl.position = Vector3(float(sp["x"]), 0.3, float(sp["z"]) + float(sp["radius"]) + 1)
		add_child(sl)

func reset_entities() -> void:
	for e in entities.values():
		e["node"].queue_free()
	entities.clear()
	for l in loots.values():
		l["node"].queue_free()
	loots.clear()
	selected = ""

# ---------------- snapshots ----------------
func apply_snapshot(snap: Dictionary) -> void:
	var seen := {}
	for d in snap.get("ents", []):
		var eid: String = d["id"]
		seen[eid] = true
		var e: Dictionary = entities.get(eid, {})
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
		e["label"].modulate = Color("#e8e1d3") if d["k"] == "p" else Color("#ffb08a").lerp(Color("#ff4a3a"), 1.0 - frac)
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
	var root := Node3D.new()
	add_child(root)
	var body: MeshInstance3D
	if d["k"] == "p":
		var cap := CapsuleMesh.new()
		cap.radius = 0.45
		cap.height = 1.8
		body = _mesh(cap, CLASS_COLORS.get(d.get("cls", ""), Color.WHITE))
		body.position.y = 0.9
	else:
		var md: Dictionary = main.defs["monsters"].get(d["def"], {})
		var scale := 1.0 + (0.8 if md.get("rank", "") == "elite" else 0.0) + float(md.get("level", 1)) * 0.04
		var m: Mesh
		if md.get("family", "") == "machine":
			var bx := BoxMesh.new()
			bx.size = Vector3(1.0, 1.0, 1.0) * scale
			m = bx
		else:
			var sp := SphereMesh.new()
			sp.radius = 0.5 * scale
			sp.height = 1.0 * scale
			m = sp
		body = _mesh(m, FAMILY_COLORS.get(md.get("family", ""), Color.GRAY))
		body.position.y = 0.5 * scale
	root.add_child(body)
	var label := _label("", 40, Color("#e8e1d3") if d["k"] == "p" else Color("#ffb08a"))
	label.position.y = 2.6
	root.add_child(label)
	root.position = Vector3(float(d["x"]), 0, float(d["z"]))
	return {"node": root, "label": label, "target_pos": root.position, "data": d}

func me() -> Dictionary:
	return entities.get(main.ch.get("eid", ""), {})

func my_pos() -> Vector3:
	var e := me()
	return e["node"].position if not e.is_empty() else Vector3.ZERO

func _process(delta: float) -> void:
	for e in entities.values():
		var n: Node3D = e["node"]
		var tp: Vector3 = e["target_pos"]
		if n.position.distance_to(tp) > 8.0:
			n.position = tp
		else:
			n.position = n.position.lerp(tp, clampf(delta * 12.0, 0.0, 1.0))
	# câmera segue o personagem
	var focus := my_pos()
	cam_pivot.position = cam_pivot.position.lerp(focus, clampf(delta * 8.0, 0.0, 1.0))
	if Input.is_key_pressed(KEY_Q):
		cam_yaw += delta * 1.8
	if Input.is_key_pressed(KEY_E):
		cam_yaw -= delta * 1.8
	var off := Vector3(sin(cam_yaw) * cos(cam_pitch), sin(cam_pitch), cos(cam_yaw) * cos(cam_pitch)) * cam_dist
	camera.position = off
	camera.look_at(cam_pivot.global_position + Vector3(0, 1, 0), Vector3.UP)
	# anel de seleção
	if selected != "" and entities.has(selected):
		select_ring.visible = true
		select_ring.position = entities[selected]["node"].position + Vector3(0, 0.05, 0)
	else:
		select_ring.visible = false
	if dest_marker.visible and focus.distance_to(dest_marker.position) < 0.8:
		dest_marker.visible = false
	# coleta pendente: anda até o saque e pede ao servidor
	if pending_pickup != "" and loots.has(pending_pickup):
		var lp: Vector3 = loots[pending_pickup]["node"].position
		if Vector2(lp.x, lp.z).distance_to(Vector2(focus.x, focus.z)) < 4.0:
			var lid := pending_pickup
			pending_pickup = ""
			Net.request("pickup", {"loot": lid}, func(r): _on_pickup(lid, r))
	# habilidade pendente: aproxima e conjura quando estiver no alcance
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
	if not main.in_world:
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
		cam_yaw -= mm.relative.x * 0.008
		cam_pitch = clampf(cam_pitch + mm.relative.y * 0.005, 0.45, 1.35)

func ground_point(screen_pos: Vector2) -> Variant:
	var from := camera.project_ray_origin(screen_pos)
	var dir := camera.project_ray_normal(screen_pos)
	return Plane(Vector3.UP, 0.0).intersects_ray(from, dir)

func _click(screen_pos: Vector2) -> void:
	var p = ground_point(screen_pos)
	if p == null:
		return
	var gp: Vector3 = p
	# saque perto do clique?
	for lid in loots.keys():
		if loots[lid]["node"].position.distance_to(gp) < 1.2:
			pending_pickup = lid
			Net.request("move", {"x": gp.x, "z": gp.z})
			return
	# monstro perto do clique?
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
	Net.request("move", {"x": gp.x, "z": gp.z}, func(r):
		if r["ok"]:
			dest_marker.position = gp + Vector3(0, 0.05, 0)
			dest_marker.visible = true)

## Usa a habilidade da barra. Alvo inimigo: aproxima antes. Chão: usa o ponto do mouse.
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
	elif target_type == "ground":
		var p = ground_point(get_viewport().get_mouse_position())
		if p == null:
			return
		Net.request("cast", {"skill": skill_id, "x": p.x, "z": p.z})
	else:
		Net.request("cast", {"skill": skill_id})

# ---------------- eventos visuais ----------------
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
	var l := _label(text, 64 if m.get("crit", false) else 48, col)
	l.position = dst["node"].position + Vector3(randf_range(-0.4, 0.4), 2.2, 0)
	add_child(l)
	var tw := create_tween()
	tw.tween_property(l, "position:y", l.position.y + 1.6, 0.9)
	tw.parallel().tween_property(l, "modulate:a", 0.0, 0.9)
	tw.tween_callback(l.queue_free)

func on_death(eid: String) -> void:
	if entities.has(eid):
		entities[eid]["node"].queue_free()
		entities.erase(eid)
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
	var bx := BoxMesh.new()
	bx.size = Vector3(0.4, 0.4, 0.4)
	var m := _mesh(bx, color, true)
	m.position.y = 0.3
	root.add_child(m)
	var lab := _label(name, 32, color)
	lab.position.y = 0.9
	root.add_child(lab)
	root.position = Vector3(float(l["x"]), 0, float(l["z"]))
	add_child(root)
	loots[l["id"]] = {"node": root, "data": l}

func ground_effect(m: Dictionary) -> void:
	var c := CylinderMesh.new()
	c.top_radius = float(m["radius"])
	c.bottom_radius = float(m["radius"])
	c.height = 0.08
	var mi := _mesh(c, Color(1.0, 0.35, 0.1, 0.35), true)
	mi.position = Vector3(float(m["x"]), 0.06, float(m["z"]))
	add_child(mi)
	get_tree().create_timer(float(m["ms"]) / 1000.0).timeout.connect(mi.queue_free)
