extends RefCounted
## Arte procedural no estilo "3D com traço de anime": cel shading, contorno e formas
## estilizadas. Os modelos são montados com primitivas; a arte definitiva pode trocar
## as malhas mantendo estes materiais.

const TOON := preload("res://shaders/toon.gdshader")
const OUTLINE := preload("res://shaders/outline.gdshader")
const GROUND := preload("res://shaders/ground.gdshader")
const WATER := preload("res://shaders/water.gdshader")

const SKIN := Color("#f2c9a6")
const EYE := Color("#2a1d24")

## Cores por classe: roupa, cabelo, detalhe.
const CLASS_LOOK := {
	"breaker": [Color("#b5562c"), Color("#3b2a22"), Color("#d9a441")],
	"bastion": [Color("#8a6a3a"), Color("#c9b07a"), Color("#c98a3a")],
	"pikeman": [Color("#6e5a3e"), Color("#22252e"), Color("#a8b0b8")],
	"warden": [Color("#4f6b35"), Color("#7a4a2a"), Color("#c9d6a0")],
	"dawnshield": [Color("#e6d7a8"), Color("#f2d06b"), Color("#ffffff")],
	"windwalker": [Color("#4f9ea3"), Color("#e8e2d6"), Color("#9fd3d1")],
	"veilsinger": [Color("#c7b6e6"), Color("#5a3d78"), Color("#ffffff")],
	"emberweaver": [Color("#a8322a"), Color("#f2a33a"), Color("#ffd27a")],
}

static var _cache := {}

static func toon(color: Color, outline := true, emission := Color(0, 0, 0)) -> ShaderMaterial:
	var key := "%s|%s|%s" % [color.to_html(), outline, emission.to_html()]
	if _cache.has(key):
		return _cache[key]
	var m := ShaderMaterial.new()
	m.shader = TOON
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("emission", emission)
	if outline:
		var o := ShaderMaterial.new()
		o.shader = OUTLINE
		m.next_pass = o
	_cache[key] = m
	return m

static func ground(a: Color, b: Color) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = GROUND
	m.set_shader_parameter("color_a", a)
	m.set_shader_parameter("color_b", b)
	return m

static func water() -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = WATER
	return m

static func part(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, scale := Vector3.ONE, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.scale = scale
	mi.rotation_degrees = rot
	parent.add_child(mi)
	return mi

static func sphere(r: float, segments := 16) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = segments
	s.rings = maxi(4, segments / 2)
	return s

static func capsule(r: float, h: float) -> CapsuleMesh:
	var c := CapsuleMesh.new()
	c.radius = r
	c.height = h
	return c

static func cyl(top: float, bottom: float, h: float, seg := 12) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = h
	c.radial_segments = seg
	return c

static func box(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b

## Personagem estilizado (cabeça grande, olhos marcados, cabelo por classe) com a arma.
## Retorna o nó raiz; o filho "Body" é animado (balanço) pelo mundo.
static func character(class_id: String, weapon_family := "", is_npc := false, npc_color := Color("#d8c48a")) -> Node3D:
	var look: Array = CLASS_LOOK.get(class_id, [npc_color, Color("#4a3a30"), Color("#e3a548")])
	var outfit: Color = look[0]
	var hair: Color = look[1]
	var trim: Color = look[2]
	if is_npc:
		outfit = npc_color
	var root := Node3D.new()
	var body := Node3D.new()
	body.name = "Body"
	root.add_child(body)
	# pernas e botas
	for sx in [-0.13, 0.13]:
		part(body, capsule(0.09, 0.55), toon(outfit.darkened(0.45)), Vector3(sx, 0.3, 0))
		part(body, sphere(0.1, 10), toon(Color("#3a2a22")), Vector3(sx, 0.06, 0.03), Vector3(1, 0.7, 1.4))
	# tronco, cinto e ombros
	part(body, capsule(0.22, 0.62), toon(outfit), Vector3(0, 0.82, 0))
	part(body, cyl(0.225, 0.225, 0.07), toon(trim, false), Vector3(0, 0.66, 0))
	for sx in [-0.27, 0.27]:
		part(body, sphere(0.1, 10), toon(trim), Vector3(sx, 1.02, 0))
		part(body, capsule(0.07, 0.48), toon(outfit.darkened(0.15)), Vector3(sx * 1.05, 0.8, 0), Vector3.ONE, Vector3(0, 0, -8.0 if sx < 0 else 8.0))
		part(body, sphere(0.07, 8), toon(SKIN), Vector3(sx * 1.12, 0.56, 0))
	# cabeça grande (proporção estilizada)
	var head := Node3D.new()
	head.name = "Head"
	head.position = Vector3(0, 1.42, 0)
	body.add_child(head)
	part(head, sphere(0.3, 18), toon(SKIN), Vector3.ZERO)
	# cabelo: volume atrás/em cima + franja
	part(head, sphere(0.33, 16), toon(hair), Vector3(0, 0.07, -0.05), Vector3(1.0, 0.9, 1.0))
	part(head, sphere(0.2, 12), toon(hair), Vector3(0, 0.16, 0.17), Vector3(1.4, 0.55, 0.6))
	if class_id in ["veilsinger", "windwalker", "dawnshield"]:
		part(head, capsule(0.09, 0.5), toon(hair), Vector3(0, -0.22, -0.24), Vector3.ONE, Vector3(15, 0, 0))
	# olhos grandes com brilho
	for sx in [-0.1, 0.1]:
		part(head, sphere(0.065, 10), toon(EYE, false), Vector3(sx, -0.02, 0.27), Vector3(0.8, 1.25, 0.35))
		part(head, sphere(0.02, 6), toon(Color.WHITE, false, Color(0.6, 0.6, 0.6)), Vector3(sx + 0.02, 0.03, 0.29))
	part(head, sphere(0.025, 6), toon(Color("#c97a6a"), false), Vector3(0, -0.15, 0.27), Vector3(1.6, 0.6, 0.5))
	if weapon_family != "":
		var w := weapon(weapon_family)
		w.position = Vector3(0.32, 0.6, 0.12)
		body.add_child(w)
	if class_id in ["bastion", "dawnshield"] and weapon_family in ["hammer_1h", "claw", "sword_1h"]:
		var sh := Node3D.new()
		part(sh, cyl(0.24, 0.24, 0.06, 16), toon(trim.darkened(0.2)), Vector3.ZERO, Vector3.ONE, Vector3(90, 0, 0))
		part(sh, sphere(0.06, 8), toon(trim), Vector3(0, 0, 0.04))
		sh.position = Vector3(-0.36, 0.8, 0.12)
		body.add_child(sh)
	return root

## Arma por família (segurada na mão direita).
static func weapon(family: String) -> Node3D:
	var w := Node3D.new()
	var wood := toon(Color("#6b4a2e"))
	var metal := toon(Color("#c4c8cc"))
	var glow := toon(Color("#ffb347"), false, Color(1.0, 0.55, 0.15))
	match family:
		"axe_1h", "axe_2h":
			var big := 1.35 if family == "axe_2h" else 1.0
			part(w, cyl(0.03, 0.03, 0.8 * big), wood, Vector3(0, 0.25 * big, 0))
			part(w, box(Vector3(0.05, 0.22, 0.26) * big), metal, Vector3(0, 0.58 * big, 0.1))
		"hammer_1h":
			part(w, cyl(0.03, 0.03, 0.7), wood, Vector3(0, 0.2, 0))
			part(w, box(Vector3(0.16, 0.16, 0.3)), metal, Vector3(0, 0.55, 0))
		"claw":
			for i in 3:
				part(w, box(Vector3(0.03, 0.3, 0.05)), metal, Vector3(-0.05 + i * 0.05, 0.1, 0.1), Vector3.ONE, Vector3(25, 0, 0))
		"spear_2h":
			part(w, cyl(0.025, 0.025, 1.9), wood, Vector3(0, 0.5, 0))
			part(w, cyl(0.0, 0.06, 0.28, 6), metal, Vector3(0, 1.58, 0))
		"bow":
			var t := TorusMesh.new()
			t.inner_radius = 0.42
			t.outer_radius = 0.46
			part(w, t, wood, Vector3(0, 0.4, 0.05), Vector3(1, 1, 0.3), Vector3(0, 90, 90))
		"sword_1h", "sword_2h":
			var big := 1.35 if family == "sword_2h" else 1.0
			part(w, cyl(0.025, 0.025, 0.2), wood, Vector3(0, 0.05, 0))
			part(w, box(Vector3(0.22, 0.04, 0.05)), metal, Vector3(0, 0.16, 0))
			part(w, box(Vector3(0.06, 0.75 * big, 0.02)), metal, Vector3(0, 0.16 + 0.38 * big, 0))
		"javelin":
			part(w, cyl(0.02, 0.02, 1.2), wood, Vector3(0, 0.35, 0))
			part(w, cyl(0.0, 0.045, 0.2, 6), metal, Vector3(0, 1.05, 0))
		"wand", "scepter":
			part(w, cyl(0.02, 0.025, 0.5), wood, Vector3(0, 0.15, 0))
			part(w, sphere(0.06, 10), glow, Vector3(0, 0.44, 0))
		"staff_2h":
			part(w, cyl(0.03, 0.035, 1.7), wood, Vector3(0, 0.45, 0))
			part(w, sphere(0.1, 10), glow, Vector3(0, 1.35, 0))
	return w

const FAMILY_COLORS := {"beast": Color("#8a6248"), "machine": Color("#7a8790"), "spirit": Color("#9fd3e8")}

## Monstro estilizado por família, com olhos expressivos; elite fica maior e com espinhos.
static func monster(def: Dictionary) -> Node3D:
	var root := Node3D.new()
	var body := Node3D.new()
	body.name = "Body"
	root.add_child(body)
	var fam: String = def.get("family", "beast")
	var rank: String = def.get("rank", "normal")
	var s := 0.75 + float(def.get("level", 1)) * 0.035 + (0.6 if rank == "elite" else 0.0) + (1.2 if rank == "boss" else 0.0)
	var col: Color = FAMILY_COLORS.get(fam, Color.GRAY)
	var eye_glow := Color(0, 0, 0)
	match fam:
		"machine":
			col = Color("#7a8790")
			part(body, box(Vector3(0.9, 0.7, 0.9) * s), toon(col), Vector3(0, 0.55 * s, 0))
			part(body, box(Vector3(0.6, 0.12, 0.6) * s), toon(Color("#b5562c")), Vector3(0, 0.95 * s, 0))
			for sx in [-0.3, 0.3]:
				for sz in [-0.3, 0.3]:
					part(body, cyl(0.07 * s, 0.07 * s, 0.4 * s, 8), toon(col.darkened(0.4)), Vector3(sx * s, 0.18 * s, sz * s))
			part(body, sphere(0.13 * s, 10), toon(Color("#ffcf4a"), false, Color(1.0, 0.6, 0.1)), Vector3(0, 0.6 * s, 0.46 * s))
		"spirit":
			var m := toon(col, true, Color(0.2, 0.35, 0.45))
			part(body, sphere(0.45 * s, 16), m, Vector3(0, 0.9 * s, 0))
			part(body, cyl(0.0, 0.3 * s, 0.6 * s, 10), m, Vector3(0, 0.35 * s, 0), Vector3.ONE, Vector3(180, 0, 0))
			eye_glow = Color(0.9, 0.95, 1.0)
		_:
			part(body, sphere(0.45 * s, 14), toon(col), Vector3(0, 0.45 * s, 0), Vector3(1.0, 0.85, 1.25))
			part(body, sphere(0.28 * s, 12), toon(col.lightened(0.08)), Vector3(0, 0.62 * s, 0.45 * s))
			for sx in [-0.14, 0.14]:
				part(body, cyl(0.0, 0.08 * s, 0.2 * s, 6), toon(col.darkened(0.25)), Vector3(sx * s, 0.88 * s, 0.4 * s))
				part(body, capsule(0.06 * s, 0.25 * s), toon(col.darkened(0.3)), Vector3(sx * 1.8 * s, 0.12 * s, 0.2 * s))
				part(body, capsule(0.06 * s, 0.25 * s), toon(col.darkened(0.3)), Vector3(sx * 1.8 * s, 0.12 * s, -0.25 * s))
	if fam != "machine":
		for sx in [-0.1, 0.1]:
			var ez := 0.68 * s if fam != "spirit" else 0.4 * s
			var ey := 0.66 * s if fam != "spirit" else 0.95 * s
			part(body, sphere(0.06 * s, 8), toon(EYE if eye_glow == Color(0, 0, 0) else Color.WHITE, false, eye_glow), Vector3(sx * s, ey, ez), Vector3(1, 1.3, 0.5))
	if rank == "elite" or rank == "boss":
		for i in 5:
			var a := float(i) / 5.0 * TAU
			part(body, cyl(0.0, 0.08 * s, 0.3 * s, 6), toon(Color("#e3a548")), Vector3(cos(a) * 0.3 * s, 1.15 * s, sin(a) * 0.3 * s))
	return root

## Cenário: árvores, pedras e tufos de grama.
static func tree(rng: RandomNumberGenerator, palette: Array) -> Node3D:
	var t := Node3D.new()
	var h := rng.randf_range(2.2, 3.6)
	part(t, cyl(0.12, 0.2, h, 8), toon(Color("#5a3e2a")), Vector3(0, h / 2.0, 0))
	var leaf: Color = palette[rng.randi() % palette.size()]
	for i in 3:
		var r := rng.randf_range(0.7, 1.1) * (1.0 - i * 0.18)
		part(t, sphere(r, 10), toon(leaf.lightened(i * 0.06)), Vector3(rng.randf_range(-0.2, 0.2), h + i * 0.55 - 0.1, rng.randf_range(-0.2, 0.2)))
	return t

static func rock(rng: RandomNumberGenerator) -> Node3D:
	var r := Node3D.new()
	var s := rng.randf_range(0.4, 1.1)
	part(r, sphere(s, 6), toon(Color("#8a8278")), Vector3(0, s * 0.4, 0), Vector3(1.2, 0.7, 1.0), Vector3(0, rng.randf_range(0, 180), 0))
	return r

static func grass(rng: RandomNumberGenerator, color: Color) -> Node3D:
	var g := Node3D.new()
	for i in 3:
		part(g, cyl(0.0, 0.06, rng.randf_range(0.3, 0.5), 4), toon(color, false), Vector3(rng.randf_range(-0.15, 0.15), 0.2, rng.randf_range(-0.15, 0.15)), Vector3.ONE, Vector3(rng.randf_range(-15, 15), 0, rng.randf_range(-15, 15)))
	return g

static func lantern() -> Node3D:
	var l := Node3D.new()
	part(l, cyl(0.06, 0.08, 2.2, 6), toon(Color("#3a2a22")), Vector3(0, 1.1, 0))
	part(l, box(Vector3(0.3, 0.35, 0.3)), toon(Color("#ffcf7a"), true, Color(1.0, 0.7, 0.3)), Vector3(0, 2.3, 0))
	return l

## Céu do amanhecer (violeta → pêssego) e névoa leve.
static func environment(map_id: String) -> Environment:
	var e := Environment.new()
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color("#5a63a8")
	sm.sky_horizon_color = Color("#f2b48a")
	sm.ground_horizon_color = Color("#c99a7a")
	sm.ground_bottom_color = Color("#3a2e3a")
	sm.sun_angle_max = 20.0
	if map_id in ["oficina_soterrada", "arena_prova"]:
		sm.sky_top_color = Color("#2a2438")
		sm.sky_horizon_color = Color("#8a5a4a")
	sky.sky_material = sm
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color("#9a8fb0")
	e.ambient_light_energy = 0.4
	e.fog_enabled = true
	e.fog_light_color = Color("#d8b0a0")
	e.fog_density = 0.004
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_white = 1.3
	return e
