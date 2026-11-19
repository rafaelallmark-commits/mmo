extends Node3D
## Cenário do mapa: terreno com relevo, grama ao vento, árvores/pedras/arbustos (as mesmas
## peças com colisão do servidor, em data/maps.json), estruturas (ruínas, casa das bombas,
## casas, esteira), acampamento do posto, portais, água, montanhas e partículas.
## Peças repetidas usam MultiMesh (uma malha mesclada por tipo e material).

const Terrain := preload("res://scripts/terrain.gd")
const Gear := preload("res://scripts/gear.gd")
const TOON_LIT := preload("res://shaders/toon_lit.gdshader")
const OUTLINE := preload("res://shaders/outline_fade.gdshader")
const SKY := preload("res://shaders/sky.gdshader")
const FOLIAGE := preload("res://shaders/foliage.gdshader")
const GRASS := preload("res://shaders/grass.gdshader")
const TERRAIN_SH := preload("res://shaders/terrain.gdshader")
const WATER := preload("res://shaders/water.gdshader")
const FLAG := preload("res://shaders/flag.gdshader")

var map: Dictionary
var terrain: Terrain
var rng := RandomNumberGenerator.new()
var _mats := {}
var _meshes := {}
var fire_light: OmniLight3D
var _t := 0.0

const PALETTES := {
	"estrada_velha": {"grass_a": Color("#6f8a3e"), "grass_b": Color("#84983f"), "grass_dry": Color("#a8925a"), "leaves": [Color("#6f8c3a"), Color("#88a040"), Color("#c58a3c"), Color("#5e7d3e")], "blade_base": Color("#5a7634"), "blade_tip": Color("#a6b65a")},
	"brejo_bombas": {"grass_a": Color("#55703f"), "grass_b": Color("#4f6a4a"), "grass_dry": Color("#7a7a4e"), "leaves": [Color("#4f7a4a"), Color("#5f8a52"), Color("#6a7a3e")], "blade_base": Color("#46623c"), "blade_tip": Color("#86a058")},
	"oficina_soterrada": {"grass_a": Color("#625e5c"), "grass_b": Color("#57534f"), "grass_dry": Color("#6e665e"), "leaves": [Color("#5a6a5a")], "blade_base": Color("#4e4a42"), "blade_tip": Color("#7a7464")},
	"pedrambar": {"grass_a": Color("#7a8a48"), "grass_b": Color("#8a9a4e"), "grass_dry": Color("#a8925a"), "leaves": [Color("#6f8c3a"), Color("#88a040"), Color("#c58a3c")], "blade_base": Color("#627a3a"), "blade_tip": Color("#b0bc60")},
	"galerias_eco": {"grass_a": Color("#5a6470"), "grass_b": Color("#4e5864"), "grass_dry": Color("#6a6a74"), "leaves": [Color("#6a8a8a")], "blade_base": Color("#3e4a52"), "blade_tip": Color("#7a9aa0")},
	"canais_eclusa": {"grass_a": Color("#5e6e52"), "grass_b": Color("#52624a"), "grass_dry": Color("#74705a"), "leaves": [Color("#5f8a52"), Color("#6a7a3e")], "blade_base": Color("#3e5034"), "blade_tip": Color("#8aa060")},
	"ultima_eclusa": {"grass_a": Color("#5a5654"), "grass_b": Color("#524e4c"), "grass_dry": Color("#625a54"), "leaves": [Color("#5a6a5a")], "blade_base": Color("#3a3a34"), "blade_tip": Color("#6a6a5a")},
	"arena_prova": {"grass_a": Color("#c8a878"), "grass_b": Color("#bc9c6c"), "grass_dry": Color("#d0b088"), "leaves": [Color("#6f8c3a")], "blade_base": Color("#6a5a3a"), "blade_tip": Color("#a89060")},
	"vau_de_nacar": {"grass_a": Color("#6a8a58"), "grass_b": Color("#7a9a64"), "grass_dry": Color("#9aa07a"), "leaves": [Color("#7aa070"), Color("#9ab878"), Color("#d8c27a")], "blade_base": Color("#58784e"), "blade_tip": Color("#a8c88a")},
}

func build(p_map: Dictionary) -> void:
	map = p_map
	rng.seed = hash(map.get("id", "mapa"))
	terrain = Terrain.new(map)
	if DisplayServer.get_name() == "headless":
		return # sem tela (testes automáticos): só o relevo, para as alturas
	var pal: Dictionary = PALETTES.get(map.get("id", ""), PALETTES["estrada_velha"])
	_build_terrain(pal)
	_build_props(pal)
	_build_ground_cover(pal)
	_build_water()
	_build_structures()
	if map.get("id", "") == "oficina_soterrada":
		_build_rails()
	_build_camp()
	_build_portals()
	_build_motes()

func height(x: float, z: float) -> float:
	return terrain.height(x, z)

# ---------------- materiais ----------------
func lit(color: Color, outline := true, emission := Color(0, 0, 0)) -> ShaderMaterial:
	var key := "lit|%s|%s|%s" % [color.to_html(), outline, emission.to_html()]
	if _mats.has(key):
		return _mats[key]
	var m := ShaderMaterial.new()
	m.shader = TOON_LIT
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("emission", emission)
	if outline:
		var o := ShaderMaterial.new()
		o.shader = OUTLINE
		o.set_shader_parameter("thickness", 0.02)
		o.set_shader_parameter("outline_color", Color("#2a1c18"))
		m.next_pass = o
	_mats[key] = m
	return m

func leaves(color: Color, sway := 0.06) -> ShaderMaterial:
	var key := "leaf|%s|%s" % [color.to_html(), sway]
	if _mats.has(key):
		return _mats[key]
	var m := ShaderMaterial.new()
	m.shader = FOLIAGE
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("shade", Color(color.r * 0.62, color.g * 0.7, color.b * 0.85 + 0.06))
	m.set_shader_parameter("sway", sway)
	var o := ShaderMaterial.new()
	o.shader = OUTLINE
	o.set_shader_parameter("thickness", 0.03)
	o.set_shader_parameter("outline_color", Color("#26301c"))
	m.next_pass = o
	_mats[key] = m
	return m

# ---------------- malhas ----------------
## Junta peças [malha, transformação] numa única ArrayMesh.
static func merge(parts: Array) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for p in parts:
		var mesh: Mesh = p[0]
		for s in mesh.get_surface_count():
			st.append_from(mesh, s, p[1])
	return st.commit()

static func xf(pos: Vector3, rot_deg := Vector3.ZERO, scl := Vector3.ONE) -> Transform3D:
	var b := Basis.from_euler(rot_deg * (PI / 180.0)).scaled(scl)
	return Transform3D(b, pos)

## Pedra facetada: esfera de poucos polígonos com vértices deslocados por ruído.
static func rock_mesh(seed: int, squash := 0.7) -> ArrayMesh:
	var sm := SphereMesh.new()
	sm.radius = 1.0
	sm.height = 2.0
	sm.radial_segments = 8
	sm.rings = 5
	var arr: Array = sm.get_mesh_arrays()
	var verts: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
	var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
	var n := FastNoiseLite.new()
	n.seed = seed
	n.frequency = 0.9
	var moved := {}
	for i in verts.size():
		var v: Vector3 = verts[i]
		var key := Vector3i(roundi(v.x * 1000), roundi(v.y * 1000), roundi(v.z * 1000))
		if not moved.has(key):
			var k := 1.0 + n.get_noise_3dv(v * 1.7) * 0.35
			var nv := Vector3(v.x * k, v.y * k * squash, v.z * k)
			if nv.y < -0.15:
				nv.y = -0.15 + (nv.y + 0.15) * 0.3
			moved[key] = nv
		verts[i] = moved[key]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for t in range(0, idx.size(), 3):
		var a: Vector3 = verts[idx[t]]
		var b: Vector3 = verts[idx[t + 1]]
		var c: Vector3 = verts[idx[t + 2]]
		var nrm := (c - a).cross(b - a).normalized()
		for v in [a, b, c]:
			st.set_normal(nrm)
			st.add_vertex(v)
	return st.commit()

func _get_mesh(key: String, builder: Callable) -> Dictionary:
	if not _meshes.has(key):
		_meshes[key] = builder.call()
	return _meshes[key]

## Retorna {material_key: [ArrayMesh, Material]} para o tipo de peça.
func _type_meshes(t: String, pal: Dictionary, variant: int) -> Dictionary:
	var leafs: Array = pal["leaves"]
	var leaf: Color = leafs[variant % leafs.size()]
	match t:
		"tree_round":
			return _get_mesh("%s|%d" % [t, variant % leafs.size()], func():
				var trunk := merge([[Gear.cyl(0.14, 0.24, 2.3, 9), xf(Vector3(0, 1.15, 0))], [Gear.cyl(0.05, 0.1, 1.1, 6), xf(Vector3(0.32, 1.9, 0), Vector3(0, 0, -40))], [Gear.cyl(0.04, 0.09, 0.9, 6), xf(Vector3(-0.28, 2.05, 0.1), Vector3(10, 0, 38))], [Gear.cyl(0.24, 0.34, 0.25, 9), xf(Vector3(0, 0.1, 0))]])
				var crown := []
				for blob in [[Vector3(0, 3.0, 0), 1.15], [Vector3(0.75, 2.65, 0.2), 0.8], [Vector3(-0.7, 2.7, -0.2), 0.85], [Vector3(0.15, 2.6, 0.75), 0.75], [Vector3(-0.1, 2.75, -0.75), 0.75], [Vector3(0.3, 3.55, -0.1), 0.7]]:
					crown.append([Gear.sphere(blob[1], 10, 6), xf(blob[0])])
				return {"trunk": [trunk, lit(Color("#6a4a32"))], "leaves": [merge(crown), leaves(leaf, 0.05)]})
		"tree_pine":
			return _get_mesh(t, func():
				var trunk := merge([[Gear.cyl(0.1, 0.2, 1.6, 8), xf(Vector3(0, 0.8, 0))]])
				var cones := []
				for i in 4:
					cones.append([Gear.cyl(0.0, 1.35 - i * 0.28, 1.3, 10), xf(Vector3(0, 1.5 + i * 0.75, 0))])
				return {"trunk": [trunk, lit(Color("#5a3e2a"))], "leaves": [merge(cones), leaves(Color("#3f6a44"), 0.03)]})
		"tree_birch":
			return _get_mesh("%s|%d" % [t, variant % 2], func():
				var trunk := merge([[Gear.cyl(0.07, 0.12, 3.4, 8), xf(Vector3(0, 1.7, 0))], [Gear.cyl(0.03, 0.05, 0.9, 5), xf(Vector3(0.22, 2.6, 0), Vector3(0, 0, -35))]])
				var marks := []
				for i in 6:
					marks.append([Gear.box(Vector3(0.1, 0.035, 0.1)), xf(Vector3(0, 0.5 + i * 0.45, 0), Vector3(0, i * 47, 0), Vector3(1.1, 1, 1.1))])
				var crown := []
				for blob in [[Vector3(0, 3.6, 0), 0.8], [Vector3(0.5, 3.2, 0.1), 0.6], [Vector3(-0.45, 3.3, -0.1), 0.6], [Vector3(0.1, 4.1, 0.2), 0.5]]:
					crown.append([Gear.sphere(blob[1], 9, 5), xf(blob[0], Vector3.ZERO, Vector3(1.0, 1.25, 1.0))])
				var c: Color = Color("#c8c45a") if variant % 2 == 0 else Color("#e0b85a")
				return {"trunk": [trunk, lit(Color("#ece6dc"))], "marks": [merge(marks), lit(Color("#2e2a28"), false)], "leaves": [merge(crown), leaves(c, 0.07)]})
		"tree_willow":
			return _get_mesh(t, func():
				var trunk := merge([[Gear.cyl(0.18, 0.3, 2.4, 9), xf(Vector3(0, 1.2, 0), Vector3(0, 0, 4))]])
				var drape := [[Gear.sphere(1.5, 12, 6), xf(Vector3(0, 3.0, 0), Vector3.ZERO, Vector3(1.0, 0.65, 1.0))]]
				for i in 9:
					var a := i * TAU / 9.0
					drape.append([Gear.sphere(0.4, 8, 5), xf(Vector3(cos(a) * 1.3, 2.1, sin(a) * 1.3), Vector3.ZERO, Vector3(0.6, 2.4, 0.6))])
				return {"trunk": [trunk, lit(Color("#5e4632"))], "leaves": [merge(drape), leaves(Color("#5e8a56"), 0.1)]})
		"tree_dead":
			return _get_mesh(t, func():
				var parts := [[Gear.cyl(0.1, 0.22, 2.6, 7), xf(Vector3(0, 1.3, 0), Vector3(0, 0, 5))]]
				for b in [[Vector3(0.3, 2.1, 0), Vector3(0, 0, -50), 1.2], [Vector3(-0.3, 1.8, 0.1), Vector3(10, 0, 45), 1.0], [Vector3(0.05, 2.5, -0.25), Vector3(-40, 0, 5), 0.9], [Vector3(0.1, 2.9, 0.1), Vector3(20, 0, -20), 0.7]]:
					parts.append([Gear.cyl(0.02, 0.07, b[2], 5), xf(b[0], b[1])])
				return {"trunk": [merge(parts), lit(Color("#6e6258"))]})
		"bush":
			return _get_mesh("%s|%d" % [t, variant % leafs.size()], func():
				var blobs := []
				for blob in [[Vector3(0, 0.4, 0), 0.55], [Vector3(0.45, 0.32, 0.1), 0.42], [Vector3(-0.4, 0.33, -0.1), 0.45], [Vector3(0.05, 0.3, 0.42), 0.38]]:
					blobs.append([Gear.sphere(blob[1], 8, 5), xf(blob[0])])
				var berries := []
				for i in 5:
					berries.append([Gear.sphere(0.05, 6, 3), xf(Vector3(cos(i * 1.3) * 0.5, 0.5 + 0.12 * sin(i * 2.0), sin(i * 1.3) * 0.5))])
				return {"leaves": [merge(blobs), leaves(leaf.darkened(0.08), 0.04)], "berries": [merge(berries), lit(Color("#c8403a"), false)]})
		"rock_l", "rock_m", "rock_s":
			var rv := variant % 3
			return _get_mesh("rock|%d" % rv, func():
				var col: Color = [Color("#8e867c"), Color("#7e7a76"), Color("#9a8e80")][rv]
				var moss := Gear.sphere(1.0, 8, 4)
				return {"rock": [rock_mesh(1000 + rv * 77, 0.62 + rv * 0.08), lit(col)], "moss": [merge([[moss, xf(Vector3(0.1, 0.42, 0.05), Vector3.ZERO, Vector3(0.75, 0.22, 0.7))]]), lit(Color("#6f8a44"), false)]})
		"stump":
			return _get_mesh(t, func():
				var parts := [[Gear.cyl(0.3, 0.36, 0.45, 10), xf(Vector3(0, 0.22, 0))]]
				for i in 5:
					var a := i * TAU / 5.0 + 0.4
					parts.append([Gear.cyl(0.04, 0.11, 0.55, 5), xf(Vector3(cos(a) * 0.3, 0.07, sin(a) * 0.3), Vector3(0, 180.0 - rad_to_deg(a), 72))])
				return {"wood": [merge(parts), lit(Color("#6a4a32"))], "rings": [merge([[Gear.cyl(0.27, 0.27, 0.02, 10), xf(Vector3(0, 0.455, 0))]]), lit(Color("#c8a070"), false)]})
		"log":
			return _get_mesh(t, func():
				return {"wood": [merge([[Gear.cyl(0.22, 0.24, 2.2, 9), xf(Vector3(0, 0.2, 0), Vector3(0, 0, 90))], [Gear.cyl(0.05, 0.08, 0.5, 5), xf(Vector3(0.4, 0.4, 0.1), Vector3(30, 0, 0))]]), lit(Color("#6e5038"))],
					"cut": [merge([[Gear.cyl(0.2, 0.2, 0.02, 9), xf(Vector3(1.11, 0.2, 0), Vector3(0, 0, 90))], [Gear.cyl(0.2, 0.2, 0.02, 9), xf(Vector3(-1.11, 0.2, 0), Vector3(0, 0, 90))]]), lit(Color("#c8a070"), false)]})
		"reeds":
			return _get_mesh(t, func():
				var blades := []
				var tops := []
				for i in 9:
					var a := i * 2.4
					var r := 0.12 + (i % 3) * 0.08
					var hgt := 1.0 + (i % 4) * 0.22
					blades.append([Gear.cyl(0.0, 0.025, hgt, 4), xf(Vector3(cos(a) * r, hgt * 0.5, sin(a) * r), Vector3(sin(a) * 8.0, 0, cos(a) * 8.0))])
					if i % 3 == 0:
						tops.append([Gear.cyl(0.035, 0.035, 0.22, 6), xf(Vector3(cos(a) * r, hgt * 0.88, sin(a) * r))])
				return {"leaves": [merge(blades), leaves(Color("#7a9a52"), 0.12)], "tops": [merge(tops), lit(Color("#6a4630"), false)]})
		"crystal":
			return _get_mesh("%s|%d" % [t, variant % 2], func():
				var parts := []
				for c in [[Vector3(0, 0.5, 0), 0.22, 1.2, Vector3.ZERO], [Vector3(0.25, 0.32, 0.05), 0.15, 0.75, Vector3(0, 0, -25)], [Vector3(-0.2, 0.3, 0.1), 0.14, 0.7, Vector3(15, 0, 25)], [Vector3(0.05, 0.25, -0.22), 0.12, 0.55, Vector3(-25, 0, 0)]]:
					parts.append([Gear.crystal(c[1], c[2]), xf(c[0], c[3])])
				var col: Color = Color("#7ad8ff") if variant % 2 == 0 else Color("#c79aff")
				return {"crystal": [merge(parts), lit(col, true, col * 0.55)]})
		"pillar":
			return _get_mesh(t, func():
				return {"stone": [merge([[Gear.cyl(0.42, 0.42, 2.2, 10), xf(Vector3(0, 1.1, 0))], [Gear.box(Vector3(1.1, 0.3, 1.1)), xf(Vector3(0, 0.15, 0))], [Gear.cyl(0.42, 0.3, 0.5, 10), xf(Vector3(0.08, 2.4, 0), Vector3(0, 0, 18))]]), lit(Color("#8a8278"))]})
		"gear":
			return _get_mesh(t, func():
				var parts := [[Gear.torus(0.35, 0.55, 18), xf(Vector3(0, 0.12, 0))]]
				for i in 10:
					var a := i * TAU / 10.0
					parts.append([Gear.box(Vector3(0.16, 0.14, 0.18)), xf(Vector3(cos(a) * 0.62, 0.12, sin(a) * 0.62), Vector3(0, -rad_to_deg(a), 0))])
				return {"metal": [merge(parts), lit(Color("#8a5a3a"))]})
		"rubble":
			return _get_mesh(t, func():
				var parts := []
				for i in 6:
					parts.append([Gear.box(Vector3(0.35, 0.22, 0.28)), xf(Vector3(cos(i * 2.1) * 0.5, 0.1 + (i % 2) * 0.12, sin(i * 2.1) * 0.5), Vector3(i * 17, i * 41, i * 9))])
				return {"stone": [merge(parts), lit(Color("#7a726a"))]})
		"crate":
			return _get_mesh(t, func():
				var planks := [[Gear.box(Vector3(0.82, 0.82, 0.82)), xf(Vector3(0, 0.41, 0))]]
				var frame := []
				for y in [0.06, 0.76]:
					for side in [[Vector3(0, y, 0.42), Vector3(0.86, 0.1, 0.03)], [Vector3(0, y, -0.42), Vector3(0.86, 0.1, 0.03)], [Vector3(0.42, y, 0), Vector3(0.03, 0.1, 0.86)], [Vector3(-0.42, y, 0), Vector3(0.03, 0.1, 0.86)]]:
						frame.append([Gear.box(side[1]), xf(side[0])])
				return {"wood": [merge(planks), lit(Color("#b08050"))], "frame": [merge(frame), lit(Color("#6e4a30"), false)]})
		"barrel":
			return _get_mesh(t, func():
				var hoops := []
				for y in [0.15, 0.5, 0.85]:
					hoops.append([Gear.cyl(0.37, 0.37, 0.05, 12), xf(Vector3(0, y, 0))])
				return {"wood": [merge([[Gear.cyl(0.33, 0.33, 1.0, 12), xf(Vector3(0, 0.5, 0))], [Gear.cyl(0.36, 0.36, 0.5, 12), xf(Vector3(0, 0.5, 0))]]), lit(Color("#9a6a40"))], "hoops": [merge(hoops), lit(Color("#4a4440"), false)]})
		"mushroom":
			return _get_mesh(t, func():
				var stems := []
				var caps := []
				for m in [[Vector3(0, 0, 0), 1.0], [Vector3(0.18, 0, 0.1), 0.7], [Vector3(-0.12, 0, 0.15), 0.55]]:
					var s: float = m[1]
					stems.append([Gear.cyl(0.035 * s, 0.05 * s, 0.22 * s, 6), xf(m[0] + Vector3(0, 0.11 * s, 0))])
					caps.append([Gear.sphere(0.12 * s, 8, 4), xf(m[0] + Vector3(0, 0.22 * s, 0), Vector3.ZERO, Vector3(1.0, 0.55, 1.0))])
				return {"stem": [merge(stems), lit(Color("#ece0c8"), false)], "cap": [merge(caps), lit(Color("#d0503a"), true, Color("#d0503a") * 0.08)]})
	return {}

# ---------------- montagem ----------------
func _multimesh(mesh: Mesh, mat: Material, xforms: Array, shadows := true, vis_end := 0.0) -> void:
	if xforms.is_empty():
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = xforms.size()
	for i in xforms.size():
		mm.set_instance_transform(i, xforms[i])
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	if vis_end > 0.0:
		mmi.visibility_range_end = vis_end
		mmi.visibility_range_end_margin = 6.0
	add_child(mmi)

func _build_terrain(pal: Dictionary) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = terrain.build_mesh()
	var m := ShaderMaterial.new()
	m.shader = TERRAIN_SH
	m.set_shader_parameter("grass_a", pal["grass_a"])
	m.set_shader_parameter("grass_b", pal["grass_b"])
	m.set_shader_parameter("grass_dry", pal["grass_dry"])
	if map.get("id", "") == "oficina_soterrada":
		m.set_shader_parameter("road", Color("#8a7660"))
		m.set_shader_parameter("road_edge", Color("#6e5e4c"))
		m.set_shader_parameter("dirt", Color("#5a4e46"))
		m.set_shader_parameter("rock", Color("#5e5a62"))
	elif map.get("id", "") == "brejo_bombas":
		m.set_shader_parameter("road", Color("#8e7a58"))
		m.set_shader_parameter("road_edge", Color("#6e6046"))
		m.set_shader_parameter("dirt", Color("#4e4a36"))
	else:
		m.set_shader_parameter("road", Color("#a8916a"))
		m.set_shader_parameter("road_edge", Color("#8a7454"))
	if map.get("city", false):
		m.set_shader_parameter("road", Color("#aaa294"))
		m.set_shader_parameter("road_edge", Color("#8a8476"))
		m.set_shader_parameter("paving", 1.0)
	mi.material_override = m
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)

func _build_props(pal: Dictionary) -> void:
	var groups := {} # chave da malha|material -> [malha, material, [transforms], sombra]
	var i := 0
	for p in map.get("props", []):
		i += 1
		var t: String = p["t"]
		var variant := i
		if t == "monument":
			continue
		var meshes := _type_meshes(t, pal, variant)
		var s := float(p["s"])
		if t == "rock_m":
			s *= 0.55
		elif t == "rock_s":
			s *= 0.22
		elif t == "rock_l":
			s *= 1.0
		var x := float(p["x"])
		var z := float(p["z"])
		var y := terrain.height(x, z)
		var basis := Basis(Vector3.UP, deg_to_rad(float(p["rot"]))).scaled(Vector3.ONE * s)
		if t.begins_with("tree"):
			basis = basis.scaled(Vector3.ONE * 1.25)
		elif t.begins_with("rock"):
			y -= 0.12 * s
		var tr := Transform3D(basis, Vector3(x, y, z))
		for k in meshes.keys():
			var entry: Array = meshes[k]
			var gk := "%s|%s|%d" % [t, k, entry[0].get_instance_id()]
			if not groups.has(gk):
				groups[gk] = [entry[0], entry[1], [], not t in ["rock_s", "mushroom", "reeds"]]
			groups[gk][2].append(tr)
	for g in groups.values():
		_multimesh(g[0], g[1], g[2], g[3])

## Grama (em blocos com alcance de visão), flores com cor por instância e pedrinhas.
func _build_ground_cover(pal: Dictionary) -> void:
	var id: String = map.get("id", "")
	var w: float = terrain.w
	var h: float = terrain.h
	var density := 0.95
	if id == "oficina_soterrada":
		density = 0.08
	elif id in ["arena_prova", "ultima_eclusa"]:
		density = 0.0
	elif id == "galerias_eco":
		density = 0.25
	elif id == "canais_eclusa":
		density = 0.6
	elif map.get("city", false):
		density = 0.4
	elif id == "brejo_bombas":
		density = 1.1
	# grade espacial das peças com colisão (evita testar todas para cada tufo)
	var cell := 4.0
	var buckets := {}
	for p in map.get("props", []):
		if float(p["r"]) <= 0.0:
			continue
		var key := Vector2i(int(floor(float(p["x"]) / cell)), int(floor(float(p["z"]) / cell)))
		if not buckets.has(key):
			buckets[key] = []
		buckets[key].append([Vector2(float(p["x"]), float(p["z"])), float(p["r"]) + 0.15])
	var rects := []
	for b in map.get("blocked", []):
		rects.append(Rect2(float(b["x0"]), float(b["z0"]), float(b["x1"]) - float(b["x0"]), float(b["z1"]) - float(b["z0"])))
	for st in map.get("structures", []):
		var side: bool = int(st["rot"]) == 90 or int(st["rot"]) == 270
		var hw: float = (float(st["d"]) if side else float(st["w"])) / 2.0 + 0.4
		var hd: float = (float(st["w"]) if side else float(st["d"])) / 2.0 + 0.4
		rects.append(Rect2(float(st["x"]) - hw, float(st["z"]) - hd, hw * 2.0, hd * 2.0))
	var tuft := _grass_tuft()
	var gmat := ShaderMaterial.new()
	gmat.shader = GRASS
	gmat.set_shader_parameter("base_color", pal["blade_base"])
	gmat.set_shader_parameter("tip_color", pal["blade_tip"])
	var flowers := []
	var flower_cols := []
	var pebbles := []
	var fc: Array = [Color("#f4ecd0"), Color("#f2c84a"), Color("#e88aa8"), Color("#a8b8f0"), Color("#f0a05a")]
	var chunk := 24.0
	var cx := -8.0
	while cx < w + 8.0:
		var cz := -8.0
		while cz < h + 8.0:
			var blades := []
			var count := int(chunk * chunk * density * 0.75)
			for k in count:
				var x := cx + rng.randf() * chunk
				var z := cz + rng.randf() * chunk
				if terrain.outside_dist(x, z) > 9.0:
					continue
				var carve: Array = terrain.carve_mask(x, z)
				if float(carve[0]) > 0.12:
					if carve[1] == "dry" and rng.randf() < 0.1:
						pebbles.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * rng.randf_range(0.08, 0.2)), Vector3(x, terrain.height(x, z), z)))
					continue
				var road: float = terrain.road_mask(x, z)
				if road > 0.35:
					if road > 0.6 and rng.randf() < 0.03:
						pebbles.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * rng.randf_range(0.05, 0.12)), Vector3(x, terrain.height(x, z), z)))
					continue
				var pt := Vector2(x, z)
				var skip := false
				for r in rects:
					if (r as Rect2).has_point(pt):
						skip = true
						break
				if skip:
					continue
				var key := Vector2i(int(floor(x / cell)), int(floor(z / cell)))
				for di in [-1, 0, 1]:
					for dj in [-1, 0, 1]:
						for bp in buckets.get(key + Vector2i(di, dj), []):
							if pt.distance_squared_to(bp[0]) < bp[1] * bp[1]:
								skip = true
				if skip:
					continue
				var y: float = terrain.height(x, z)
				var s := rng.randf_range(0.7, 1.35) * (1.0 - road)
				if id == "brejo_bombas":
					s *= 1.35
				var b := Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(s, s * rng.randf_range(0.8, 1.3), s))
				blades.append(Transform3D(b, Vector3(x, y - 0.02, z)))
				if rng.randf() < (0.06 if map.get("city", false) else 0.035) and id != "oficina_soterrada":
					flowers.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3.ONE * rng.randf_range(0.8, 1.25)), Vector3(x + 0.12, y, z + 0.1)))
					flower_cols.append(fc[rng.randi() % (fc.size() if id != "brejo_bombas" else 2)])
			_multimesh(tuft, gmat, blades, false, 60.0)
			cz += chunk
		cx += chunk
	if not flowers.is_empty():
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = _flower_mesh()
		mm.instance_count = flowers.size()
		for i in flowers.size():
			mm.set_instance_transform(i, flowers[i])
			mm.set_instance_color(i, flower_cols[i])
		var mmi := MultiMeshInstance3D.new()
		mmi.multimesh = mm
		var fm := ShaderMaterial.new()
		fm.shader = TOON_LIT
		fm.set_shader_parameter("albedo", Color.WHITE)
		fm.set_shader_parameter("use_instance_color", true)
		fm.set_shader_parameter("fade_enabled", false)
		mmi.material_override = fm
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mmi)
	_multimesh(rock_mesh(4242, 0.55), lit(Color("#8e867c"), false), pebbles, false)

## Tufo de 3 lâminas (UV.y = 0 na raiz, 1 na ponta), feito à mão.
func _grass_tuft() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for b in 3:
		var a := b * TAU / 3.0 + 0.3
		var dir := Vector3(cos(a), 0, sin(a))
		var side := Vector3(-dir.z, 0, dir.x) * 0.045
		var lean := dir * 0.12
		var base := dir * 0.05
		var hgt := 0.38 + b * 0.07
		var p0 := base - side
		var p1 := base + side
		var p2 := base + lean * 0.5 + Vector3(0, hgt * 0.55, 0) - side * 0.6
		var p3 := base + lean * 0.5 + Vector3(0, hgt * 0.55, 0) + side * 0.6
		var p4 := base + lean + Vector3(0, hgt, 0)
		var tris := [[p0, p1, p2, 0.0, 0.0, 0.55], [p1, p3, p2, 0.0, 0.55, 0.55], [p2, p3, p4, 0.55, 0.55, 1.0]]
		for q in tris:
			for vi in 3:
				st.set_normal(Vector3.UP)
				st.set_uv(Vector2(0.0, q[3 + vi]))
				st.add_vertex(q[vi])
	return st.commit()

func _flower_mesh() -> ArrayMesh:
	var parts := [[Gear.cyl(0.006, 0.008, 0.28, 4), xf(Vector3(0, 0.14, 0))]]
	for i in 5:
		var a := i * TAU / 5.0
		parts.append([Gear.sphere(0.035, 6, 3), xf(Vector3(cos(a) * 0.04, 0.29, sin(a) * 0.04), Vector3.ZERO, Vector3(1.0, 0.45, 1.0))])
	parts.append([Gear.sphere(0.025, 6, 3), xf(Vector3(0, 0.3, 0))])
	return merge(parts)

func _build_water() -> void:
	for b in map.get("blocked", []):
		var nm: String = b.get("name", "")
		if not ("Lagoa" in nm or "água" in nm):
			continue
		var x0 := float(b["x0"])
		var z0 := float(b["z0"])
		var sx := float(b["x1"]) - x0
		var sz := float(b["z1"]) - z0
		var pm := PlaneMesh.new()
		pm.size = Vector2(sx, sz)
		pm.subdivide_width = int(sx / 2.0)
		pm.subdivide_depth = int(sz / 2.0)
		var m := ShaderMaterial.new()
		m.shader = WATER
		m.set_shader_parameter("size", Vector2(sx, sz))
		var mi := MeshInstance3D.new()
		mi.mesh = pm
		mi.material_override = m
		mi.position = Vector3(x0 + sx / 2.0, -0.38, z0 + sz / 2.0)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(mi)
		# vitórias-régias e um tronco caído
		var pads := []
		for k in int(sx * sz / 18.0):
			var px := x0 + 1.8 + rng.randf() * (sx - 3.6)
			var pz := z0 + 1.8 + rng.randf() * (sz - 3.6)
			if terrain.height(px, pz) > -0.75:
				continue
			pads.append(Transform3D(Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(1, 0.08, 1) * rng.randf_range(0.25, 0.5)), Vector3(px, -0.35, pz)))
		var pad := merge([[Gear.cyl(1.0, 1.0, 0.2, 10), Transform3D()]])
		_multimesh(pad, lit(Color("#5a8a4a"), false), pads, false)
		var lily := []
		for k in range(0, pads.size(), 4):
			var tr: Transform3D = pads[k]
			lily.append(Transform3D(Basis(), tr.origin + Vector3(0.1, 0.05, 0.05)))
		_multimesh(merge([[Gear.sphere(0.09, 6, 3), xf(Vector3.ZERO, Vector3.ZERO, Vector3(1, 0.6, 1))]]), lit(Color("#f2c0d8"), false, Color(0.15, 0.08, 0.1)), lily, false)

# ---------------- estruturas ----------------
func _part(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, rot := Vector3.ZERO, scl := Vector3.ONE) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation_degrees = rot
	mi.scale = scl
	parent.add_child(mi)
	return mi

func _build_structures() -> void:
	for b in map.get("blocked", []):
		var nm: String = b.get("name", "")
		var x0 := float(b["x0"])
		var z0 := float(b["z0"])
		var x1 := float(b["x1"])
		var z1 := float(b["z1"])
		if "Ruínas" in nm:
			_ruins(x0, z0, x1, z1)
		elif "Casa das Bombas" in nm:
			_pump_house(x0, z0, x1, z1)
		elif "Esteira" in nm:
			_conveyor(x0, z0, x1, z1)
	for s in map.get("structures", []):
		if s["type"] == "house":
			_house(s)
	for p in map.get("props", []):
		if p["t"] == "monument":
			_monument(p)
	if map.get("city", false):
		_city_walls()
	if map.get("id", "") == "arena_prova":
		_arena()
	if map.get("id", "") == "ultima_eclusa":
		_eclusa_chamber()

func _ruins(x0: float, z0: float, x1: float, z1: float) -> void:
	var root := Node3D.new()
	add_child(root)
	var stone := lit(Color("#9a9086"))
	var dark := lit(Color("#7a7068"))
	var moss := lit(Color("#6f8a44"), false)
	var y := terrain.height((x0 + x1) / 2.0, (z0 + z1) / 2.0)
	var walls := [[Vector2(x0, z0), Vector2(x1, z0)], [Vector2(x1, z0), Vector2(x1, z1)], [Vector2(x1, z1), Vector2(x0, z1)], [Vector2(x0, z1), Vector2(x0, z0)]]
	var blocks := {"stone": [], "dark": [], "moss": []}
	for wl in walls:
		var a: Vector2 = wl[0]
		var bb: Vector2 = wl[1]
		var n := int(a.distance_to(bb) / 1.2)
		for k in n:
			if rng.randf() < 0.16:
				continue
			var p := a.lerp(bb, (k + 0.5) / n)
			var hgt := rng.randf_range(0.6, 3.4) if rng.randf() > 0.25 else rng.randf_range(0.3, 0.8)
			var horizontal := absf(bb.y - a.y) < 0.1
			var size := Vector3(1.15, hgt, 0.7) if horizontal else Vector3(0.7, hgt, 1.15)
			blocks["stone" if rng.randf() < 0.7 else "dark"].append([Gear.box(size), xf(Vector3(p.x, y + hgt / 2.0, p.y), Vector3(0, rng.randf_range(-4, 4), 0))])
			if hgt > 1.5 and rng.randf() < 0.45:
				blocks["moss"].append([Gear.box(Vector3(size.x * 1.02, 0.12, size.z * 1.02)), xf(Vector3(p.x, y + hgt + 0.03, p.y))])
	var cx := (x0 + x1) / 2.0
	var cz := (z0 + z1) / 2.0
	# arco da antiga estação, pilares tombados e o sino rachado (o mistério dos sinos)
	for k in [-1.0, 1.0]:
		blocks["stone"].append([Gear.cyl(0.45, 0.5, 4.2, 10), xf(Vector3(cx + k * 1.6, y + 2.1, cz))])
	blocks["dark"].append([Gear.box(Vector3(4.4, 0.6, 1.1)), xf(Vector3(cx, y + 4.4, cz), Vector3(0, 0, 3))])
	blocks["stone"].append([Gear.cyl(0.4, 0.4, 3.2, 10), xf(Vector3(cx + 1.0, y + 0.4, cz - 4.5), Vector3(0, 30, 88))])
	blocks["stone"].append([Gear.box(Vector3(1.4, 0.5, 1.2)), xf(Vector3(cx + 2.2, y + 0.25, cz + 2.0), Vector3(15, 30, 8))])
	for k in blocks.keys():
		if blocks[k].is_empty():
			continue
		var mi := MeshInstance3D.new()
		mi.mesh = merge(blocks[k])
		mi.material_override = {"stone": stone, "dark": dark, "moss": moss}[k]
		root.add_child(mi)
	_part(root, Gear.cyl(0.25, 0.6, 0.9, 14), lit(Color("#9a7a3a")), Vector3(cx - 1.0, y + 0.45, cz + 3.0), Vector3(0, 0, 70))
	_part(root, Gear.torus(0.5, 0.62, 16), lit(Color("#7a5a2a")), Vector3(cx - 1.42, y + 0.6, cz + 3.0), Vector3(0, 0, 70))
	for k in 10:
		var px := rng.randf_range(x0 + 0.5, x1 - 0.5)
		var pz := rng.randf_range(z0 + 0.5, z1 - 0.5)
		_part(root, rock_mesh(k * 13, 0.6), stone, Vector3(px, y + 0.1, pz), Vector3(0, rng.randf() * 360, 0), Vector3.ONE * rng.randf_range(0.2, 0.5))

func _pump_house(x0: float, z0: float, x1: float, z1: float) -> void:
	var root := Node3D.new()
	add_child(root)
	var cx := (x0 + x1) / 2.0
	var cz := (z0 + z1) / 2.0
	var sx := x1 - x0
	var sz := z1 - z0
	var y := terrain.height(cx, cz)
	_part(root, Gear.box(Vector3(sx + 0.4, 0.5, sz + 0.4)), lit(Color("#7a7068")), Vector3(cx, y + 0.25, cz))
	_part(root, Gear.box(Vector3(sx, 3.2, sz)), lit(Color("#8a7a6a")), Vector3(cx, y + 1.9, cz))
	var roof := Gear.extrude(PackedVector2Array([Vector2(-sx / 2.0 - 0.5, 0), Vector2(sx / 2.0 + 0.5, 0), Vector2(0, 2.0)]), sz + 0.8)
	_part(root, roof, lit(Color("#6a3a2e")), Vector3(cx, y + 3.5, cz))
	_part(root, Gear.box(Vector3(1.4, 2.2, 0.12)), lit(Color("#4a3428")), Vector3(cx, y + 1.6, z0 - 0.04))
	for k in [-1.0, 1.0]:
		_part(root, Gear.box(Vector3(1.0, 0.9, 0.1)), lit(Color("#ffcf7a"), false, Color(0.45, 0.32, 0.12)), Vector3(cx + k * 2.8, y + 2.3, z0 - 0.04))
		_part(root, Gear.box(Vector3(1.15, 0.12, 0.18)), lit(Color("#4a3428")), Vector3(cx + k * 2.8, y + 1.8, z0 - 0.06))
	# chaminé, roda d'água e canos que descem para a lagoa
	_part(root, Gear.cyl(0.35, 0.42, 3.4, 10), lit(Color("#6c7480")), Vector3(x1 - 1.2, y + 5.0, cz + 1.5))
	_part(root, Gear.cyl(0.42, 0.42, 0.2, 10), lit(Color("#4a5058")), Vector3(x1 - 1.2, y + 6.7, cz + 1.5))
	_part(root, Gear.torus(1.0, 1.3, 20), lit(Color("#7a5a3a")), Vector3(x1 + 0.35, y + 1.5, cz), Vector3(0, 0, 90))
	for k in 6:
		_part(root, Gear.box(Vector3(0.12, 0.5, 0.2)), lit(Color("#6a4a2e")), Vector3(x1 + 0.35, y + 1.5 + cos(k * TAU / 6.0) * 1.15, cz + sin(k * TAU / 6.0) * 1.15), Vector3(rad_to_deg(k * TAU / 6.0), 0, 0))
	for k in 3:
		_part(root, Gear.cyl(0.18, 0.18, 5.0, 8), lit(Color("#6c7480")), Vector3(x0 - 2.5, y + 0.35, cz - 1.5 + k * 1.5), Vector3(0, 0, 90))
	var smoke := CPUParticles3D.new()
	smoke.amount = 16
	smoke.lifetime = 4.0
	smoke.preprocess = 4.0
	smoke.direction = Vector3(0.3, 1, 0.1)
	smoke.spread = 12.0
	smoke.gravity = Vector3(0.25, 0.35, 0)
	smoke.initial_velocity_min = 0.4
	smoke.initial_velocity_max = 0.8
	smoke.scale_amount_min = 0.35
	smoke.scale_amount_max = 0.7
	var curve := Curve.new()
	curve.add_point(Vector2(0, 0.4))
	curve.add_point(Vector2(1, 1.6))
	smoke.scale_amount_curve = curve
	smoke.mesh = Gear.sphere(0.5, 6, 4)
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.albedo_color = Color(0.85, 0.85, 0.85, 0.35)
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	smoke.material_override = sm
	smoke.position = Vector3(x1 - 1.2, y + 6.9, cz + 1.5)
	root.add_child(smoke)

func _conveyor(x0: float, z0: float, x1: float, z1: float) -> void:
	var root := Node3D.new()
	add_child(root)
	var cx := (x0 + x1) / 2.0
	var sz := z1 - z0
	var y := terrain.height(cx, (z0 + z1) / 2.0)
	var dark := []
	var metal := []
	var frame := []
	dark.append([Gear.box(Vector3(x1 - x0 - 1.0, 0.18, sz)), xf(Vector3(cx, y + 1.05, (z0 + z1) / 2.0))])
	var z := z0 + 1.0
	while z < z1:
		metal.append([Gear.cyl(0.14, 0.14, x1 - x0 - 0.6, 8), xf(Vector3(cx, y + 0.9, z), Vector3(0, 0, 90))])
		frame.append([Gear.box(Vector3(0.25, 1.0, 0.25)), xf(Vector3(x0 + 0.3, y + 0.5, z))])
		frame.append([Gear.box(Vector3(0.25, 1.0, 0.25)), xf(Vector3(x1 - 0.3, y + 0.5, z))])
		z += 3.0
	for side in [x0 + 0.3, x1 - 0.3]:
		frame.append([Gear.box(Vector3(0.2, 0.35, sz)), xf(Vector3(side, y + 1.15, (z0 + z1) / 2.0))])
	# minério e engrenagens paradas sobre a esteira
	var ore := []
	for k in int(sz / 2.5):
		ore.append([rock_mesh(k + 300, 0.6), xf(Vector3(cx + rng.randf_range(-2.0, 2.0), y + 1.3, z0 + 1.0 + k * 2.5), Vector3(0, rng.randf() * 360.0, 0), Vector3.ONE * rng.randf_range(0.25, 0.45))])
	for g in [[dark, Color("#3a3634")], [metal, Color("#6c7480")], [frame, Color("#5a5450")], [ore, Color("#7a6a8a")]]:
		var mi := MeshInstance3D.new()
		mi.mesh = merge(g[0])
		mi.material_override = lit(g[1])
		root.add_child(mi)

func _house(s: Dictionary) -> void:
	var root := Node3D.new()
	root.position = Vector3(float(s["x"]), terrain.height(float(s["x"]), float(s["z"])), float(s["z"]))
	root.rotation_degrees.y = float(s["rot"])
	add_child(root)
	var w := float(s["w"])
	var d := float(s["d"])
	var style := int(s.get("style", 0))
	var wall_c: Color = [Color("#e8dcc4"), Color("#d8c8b0"), Color("#c8b8a0")][style % 3]
	var roof_c: Color = [Color("#a04a34"), Color("#5a6a8a"), Color("#7a5a3a")][style % 3]
	var timber := lit(Color("#5a3e2a"))
	_part(root, Gear.box(Vector3(w, 0.4, d)), lit(Color("#8a8278")), Vector3(0, 0.2, 0))
	_part(root, Gear.box(Vector3(w - 0.2, 2.8, d - 0.2)), lit(wall_c), Vector3(0, 1.8, 0))
	for k in [-1.0, 1.0]:
		_part(root, Gear.box(Vector3(0.18, 2.8, 0.18)), timber, Vector3(k * (w / 2.0 - 0.1), 1.8, d / 2.0 - 0.1))
		_part(root, Gear.box(Vector3(0.18, 2.8, 0.18)), timber, Vector3(k * (w / 2.0 - 0.1), 1.8, -d / 2.0 + 0.1))
	_part(root, Gear.box(Vector3(w, 0.18, 0.2)), timber, Vector3(0, 3.1, d / 2.0 - 0.1))
	_part(root, Gear.box(Vector3(w, 0.18, 0.2)), timber, Vector3(0, 1.3, d / 2.0 - 0.1))
	var roof := Gear.extrude(PackedVector2Array([Vector2(-w / 2.0 - 0.5, 0), Vector2(w / 2.0 + 0.5, 0), Vector2(0, 1.9)]), d + 0.7)
	_part(root, roof, lit(roof_c), Vector3(0, 3.2, 0))
	_part(root, Gear.box(Vector3(1.0, 1.9, 0.1)), lit(Color("#5a3e2a")), Vector3(0, 1.35, d / 2.0 - 0.04))
	_part(root, Gear.sphere(0.05, 6, 3), lit(Color("#d9a441"), false), Vector3(0.35, 1.3, d / 2.0 + 0.02))
	_part(root, Gear.box(Vector3(1.4, 0.1, 0.7)), timber, Vector3(0, 2.45, d / 2.0 + 0.3), Vector3(-15, 0, 0))
	for k in [-1.0, 1.0]:
		_part(root, Gear.box(Vector3(0.9, 0.8, 0.08)), lit(Color("#ffd58a"), false, Color(0.6, 0.45, 0.2)), Vector3(k * (w / 4.0 + 0.3), 2.0, d / 2.0 - 0.05))
		_part(root, Gear.box(Vector3(1.05, 0.1, 0.14)), timber, Vector3(k * (w / 4.0 + 0.3), 1.55, d / 2.0 - 0.02))
		# floreira sob a janela
		_part(root, Gear.box(Vector3(0.95, 0.22, 0.25)), lit(Color("#7a5a3a")), Vector3(k * (w / 4.0 + 0.3), 1.42, d / 2.0 + 0.1))
		for f in 3:
			_part(root, Gear.sphere(0.09, 6, 3), lit([Color("#e88aa8"), Color("#f2c84a"), Color("#f4ecd0")][(f + style) % 3], false), Vector3(k * (w / 4.0 + 0.3) - 0.3 + f * 0.3, 1.6, d / 2.0 + 0.12))
	_part(root, Gear.box(Vector3(0.6, 1.6, 0.6)), lit(Color("#8a8278")), Vector3(w / 4.0, 4.3, -d / 4.0))
	# barril e caixa encostados
	_part(root, Gear.cyl(0.3, 0.3, 0.85, 10), lit(Color("#9a6a40")), Vector3(w / 2.0 + 0.45, 0.43, d / 2.0 - 0.6))
	_part(root, Gear.box(Vector3(0.6, 0.6, 0.6)), lit(Color("#b08050")), Vector3(-w / 2.0 - 0.4, 0.3, d / 2.0 - 0.5), Vector3(0, 15, 0))

## Monumento da praça: a balança de bronze (Pedrâmbar) ou a torre do relógio (Vau de Nácar).
func _monument(p: Dictionary) -> void:
	var root := Node3D.new()
	var x := float(p["x"])
	var z := float(p["z"])
	root.position = Vector3(x, terrain.height(x, z), z)
	root.rotation_degrees.y = float(p.get("rot", 0))
	add_child(root)
	var style: String = p.get("style", "balance")
	if style == "clock":
		var stone := lit(Color("#d8dcdc"))
		_part(root, Gear.box(Vector3(3.4, 0.5, 3.4)), lit(Color("#a8acb0")), Vector3(0, 0.25, 0))
		_part(root, Gear.box(Vector3(2.4, 6.4, 2.4)), stone, Vector3(0, 3.6, 0))
		_part(root, Gear.box(Vector3(2.7, 0.3, 2.7)), lit(Color("#a8acb0")), Vector3(0, 6.9, 0))
		for k in 4:
			var a := k * PI / 2.0
			var n := Vector3(sin(a), 0, cos(a))
			var face := _part(root, Gear.cyl(0.85, 0.85, 0.08, 24), lit(Color("#f4f0e4"), true), n * 1.22 + Vector3(0, 5.6, 0))
			face.rotation = Vector3(PI / 2.0, a, 0)
			var hand := _part(root, Gear.box(Vector3(0.08, 0.6, 0.04)), lit(Color("#2a2a30"), false), n * 1.28 + Vector3(0, 5.75, 0))
			hand.rotation = Vector3(0, a, 0.35)
			var hand2 := _part(root, Gear.box(Vector3(0.07, 0.42, 0.04)), lit(Color("#2a2a30"), false), n * 1.29 + Vector3(0, 5.6, 0))
			hand2.rotation = Vector3(0, a, -1.6)
		var cap := _part(root, Gear.cyl(0.0, 2.1, 2.2, 4), lit(Color("#4a5a8a")), Vector3(0, 8.15, 0))
		cap.rotation.y = PI / 4.0
		_part(root, Gear.sphere(0.18, 8, 4), lit(Color("#e8c060"), false, Color(0.4, 0.3, 0.1)), Vector3(0, 9.35, 0))
	else:
		var bronze := lit(Color("#b8863a"))
		_part(root, Gear.box(Vector3(2.6, 0.9, 2.6)), lit(Color("#a8987a")), Vector3(0, 0.45, 0))
		_part(root, Gear.box(Vector3(2.0, 0.4, 2.0)), lit(Color("#bcaa88")), Vector3(0, 1.1, 0))
		_part(root, Gear.cyl(0.16, 0.24, 3.4, 10), bronze, Vector3(0, 2.95, 0))
		var beam := Node3D.new()
		beam.position = Vector3(0, 4.6, 0)
		beam.rotation.z = 0.12
		root.add_child(beam)
		_part(beam, Gear.box(Vector3(3.6, 0.16, 0.16)), bronze, Vector3.ZERO)
		for k in [-1.0, 1.0]:
			for c in 3:
				var a := c * TAU / 3.0
				var ch := _part(beam, Gear.cyl(0.012, 0.012, 1.25, 4), lit(Color("#6a5a3a"), false), Vector3(k * 1.7 + cos(a) * 0.22, -0.62, sin(a) * 0.22))
				ch.rotation = Vector3(sin(a) * 0.18, 0, -cos(a) * 0.18)
			var pan := _part(beam, Gear.cyl(0.42, 0.3, 0.12, 14), bronze, Vector3(k * 1.7, -1.25, 0))
			pan.rotation.z = -beam.rotation.z
		_part(root, Gear.sphere(0.2, 10, 6), lit(Color("#e8c060"), false, Color(0.45, 0.32, 0.1)), Vector3(0, 4.85, 0))

## Muralha baixa da cidade, com torres nos cantos e passagens nas pontas das ruas.
func _city_walls() -> void:
	var w: float = terrain.w
	var h: float = terrain.h
	var stone_c := Color("#c8b08a") if map.get("id", "") == "pedrambar" else Color("#c8ccd0")
	var gaps := []
	for r in terrain.roads:
		for q in [r["pts"][0], r["pts"][r["pts"].size() - 1]]:
			gaps.append(q)
	for pt in map.get("portals", []):
		gaps.append(Vector2(float(pt["x"]), float(pt["z"])))
	var blocks := []
	var tops := []
	var inset := 0.5
	var sides := [[Vector2(inset, inset), Vector2(w - inset, inset)], [Vector2(w - inset, inset), Vector2(w - inset, h - inset)], [Vector2(w - inset, h - inset), Vector2(inset, h - inset)], [Vector2(inset, h - inset), Vector2(inset, inset)]]
	for sd in sides:
		var a: Vector2 = sd[0]
		var b: Vector2 = sd[1]
		var len := a.distance_to(b)
		var dir := (b - a) / len
		var horizontal := absf(dir.y) < 0.5
		var seg := 2.0
		var n := int(len / seg)
		for k in n:
			var c := a + dir * (k + 0.5) * (len / n)
			var near_gap := false
			for g in gaps:
				if c.distance_to(g) < 5.0:
					near_gap = true
					break
			if near_gap:
				continue
			var y := terrain.height(c.x, c.y)
			var size := Vector3(len / n + 0.02, 2.4, 0.8) if horizontal else Vector3(0.8, 2.4, len / n + 0.02)
			blocks.append([Gear.box(size), xf(Vector3(c.x, y + 1.0, c.y))])
			var tsz := Vector3(0.7, 0.45, 0.9) if horizontal else Vector3(0.9, 0.45, 0.7)
			tops.append([Gear.box(tsz), xf(Vector3(c.x, y + 2.4, c.y))])
	for corner in [Vector2(inset, inset), Vector2(w - inset, inset), Vector2(inset, h - inset), Vector2(w - inset, h - inset)]:
		var y := terrain.height(corner.x, corner.y)
		blocks.append([Gear.cyl(1.5, 1.7, 4.4, 12), xf(Vector3(corner.x, y + 2.0, corner.y))])
		tops.append([Gear.cyl(0.0, 1.9, 2.0, 12), xf(Vector3(corner.x, y + 5.2, corner.y))])
	# torres das passagens
	for g in gaps:
		var gp: Vector2 = g
		if gp.x > 1.5 and gp.x < w - 1.5 and gp.y > 1.5 and gp.y < h - 1.5:
			continue
		var along := Vector2(0, 1) if (gp.x <= 1.5 or gp.x >= w - 1.5) else Vector2(1, 0)
		for k in [-1.0, 1.0]:
			var tp: Vector2 = Vector2(clampf(gp.x, inset, w - inset), clampf(gp.y, inset, h - inset)) + along * float(k) * 5.2
			var y := terrain.height(tp.x, tp.y)
			blocks.append([Gear.box(Vector3(1.8, 4.0, 1.8)), xf(Vector3(tp.x, y + 1.8, tp.y))])
			tops.append([Gear.cyl(0.0, 1.5, 1.6, 4), xf(Vector3(tp.x, y + 4.6, tp.y), Vector3(0, 45, 0))])
	if not blocks.is_empty():
		var mi := MeshInstance3D.new()
		mi.mesh = merge(blocks)
		mi.material_override = lit(stone_c)
		add_child(mi)
	if not tops.is_empty():
		var mt := MeshInstance3D.new()
		mt.mesh = merge(tops)
		mt.material_override = lit(stone_c.darkened(0.25) if map.get("id", "") == "pedrambar" else Color("#5a6a8a"))
		add_child(mt)

## Arena da Prova: muros altos, areia, bandeiras e braseiros nos cantos.
func _arena() -> void:
	var w: float = terrain.w
	var h: float = terrain.h
	var blocks := []
	for sd in [[Vector2(0.4, 0.4), Vector2(w - 0.4, 0.4)], [Vector2(w - 0.4, 0.4), Vector2(w - 0.4, h - 0.4)], [Vector2(w - 0.4, h - 0.4), Vector2(0.4, h - 0.4)], [Vector2(0.4, h - 0.4), Vector2(0.4, 0.4)]]:
		var a: Vector2 = sd[0]
		var b: Vector2 = sd[1]
		var len := a.distance_to(b)
		var dir := (b - a) / len
		var horizontal := absf(dir.y) < 0.5
		var n := int(len / 3.0)
		for k in n:
			var c := a + dir * (k + 0.5) * (len / n)
			if absf(c.x - w / 2.0) < 3.0 and c.y < 1.0:
				continue # entrada
			var size := Vector3(len / n + 0.02, 3.6, 1.0) if horizontal else Vector3(1.0, 3.6, len / n + 0.02)
			blocks.append([Gear.box(size), xf(Vector3(c.x, 1.6, c.y))])
	var mi := MeshInstance3D.new()
	mi.mesh = merge(blocks)
	mi.material_override = lit(Color("#a08a70"))
	add_child(mi)
	for corner in [Vector2(2.5, 2.5), Vector2(w - 2.5, 2.5), Vector2(2.5, h - 2.5), Vector2(w - 2.5, h - 2.5)]:
		_part(self, Gear.cyl(0.35, 0.5, 1.4, 8), lit(Color("#4a4440")), Vector3(corner.x, 0.7, corner.y))
		_part(self, Gear.cyl(0.6, 0.4, 0.3, 10), lit(Color("#3a3430")), Vector3(corner.x, 1.5, corner.y))
		_part(self, Gear.cyl(0.0, 0.4, 0.8, 8), lit(Color("#ffb347"), false, Color(1.0, 0.55, 0.12)), Vector3(corner.x, 1.95, corner.y))
	var l := OmniLight3D.new()
	l.light_color = Color("#ffa04a")
	l.light_energy = 1.2
	l.omni_range = 26.0
	l.position = Vector3(w / 2.0, 6.0, h / 2.0)
	add_child(l)

## Trilhos de vagonete enferrujados ao longo das estradas da oficina.
func _build_rails() -> void:
	var sleepers := []
	var rails := []
	for r in terrain.roads:
		var pts: Array = r["pts"]
		for i in pts.size() - 1:
			var a: Vector2 = pts[i]
			var b: Vector2 = pts[i + 1]
			var len := a.distance_to(b)
			var dir := (b - a) / len
			var side := Vector2(-dir.y, dir.x)
			var yaw := atan2(dir.x, dir.y)
			var d := 0.4
			while d < len:
				var c := a + dir * d
				if terrain.outside_dist(c.x, c.y) <= 0.0:
					var y := terrain.height(c.x, c.y)
					sleepers.append(Transform3D(Basis(Vector3.UP, yaw), Vector3(c.x, y + 0.03, c.y)))
					for k in [-0.55, 0.55]:
						var rp: Vector2 = c + side * float(k)
						rails.append(Transform3D(Basis(Vector3.UP, yaw), Vector3(rp.x, terrain.height(rp.x, rp.y) + 0.1, rp.y)))
				d += 0.9
	_multimesh(merge([[Gear.box(Vector3(1.6, 0.08, 0.26)), Transform3D()]]), lit(Color("#5a4636")), sleepers, false)
	_multimesh(merge([[Gear.box(Vector3(0.07, 0.08, 0.92)), Transform3D()]]), lit(Color("#7a5a48")), rails, false)

## Verifica se um ponto do acampamento está livre de NPCs, objetos, portais e peças.
func _free_spot(p: Vector2, r: float) -> bool:
	for n in map.get("npcs", []):
		if p.distance_to(Vector2(float(n["x"]), float(n["z"]))) < r + 1.2:
			return false
	for o in map.get("objects", []):
		if p.distance_to(Vector2(float(o["x"]), float(o["z"]))) < r + 1.2:
			return false
	for pt in map.get("portals", []):
		if p.distance_to(Vector2(float(pt["x"]), float(pt["z"]))) < r + float(pt["radius"]) + 1.0:
			return false
	for pr in map.get("props", []):
		if float(pr["r"]) > 0.0 and p.distance_to(Vector2(float(pr["x"]), float(pr["z"]))) < r + float(pr["r"]):
			return false
	return terrain.road_dist(p.x, p.y) > r * 0.5

func _build_camp() -> void:
	var gp: Dictionary = map.get("guardPost", {})
	if gp.is_empty() or float(gp["safeRadius"]) <= 0.0 or float(gp["safeRadius"]) > 30.0:
		return
	var cx := float(gp["x"])
	var cz := float(gp["z"])
	var center := Vector2(cx, cz)
	# fogueira: primeiro lugar livre (fora da estrada) numa espiral em volta do posto
	var fire := center
	for k in 40:
		var a := k * 2.4
		var cand := center + Vector2(cos(a), sin(a)) * (4.0 + k * 0.25)
		if _free_spot(cand, 1.6):
			fire = cand
			break
	var y := terrain.height(fire.x, fire.y)
	var froot := Node3D.new()
	froot.position = Vector3(fire.x, y, fire.y)
	add_child(froot)
	for k in 7:
		var a := k * TAU / 7.0
		_part(froot, rock_mesh(k + 90, 0.6), lit(Color("#7a726a")), Vector3(cos(a) * 0.55, 0.05, sin(a) * 0.55), Vector3.ZERO, Vector3.ONE * 0.18)
	for k in 3:
		_part(froot, Gear.cyl(0.06, 0.07, 0.9, 6), lit(Color("#5a3e2a")), Vector3(0, 0.12, 0), Vector3(0, k * 60, 75))
	var flame_mat := lit(Color("#ffb347"), false, Color(1.0, 0.55, 0.12))
	flame_mat.set_shader_parameter("fade_enabled", false)
	var f1 := _part(froot, Gear.cyl(0.0, 0.25, 0.7, 8), flame_mat, Vector3(0, 0.45, 0))
	f1.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var f2 := _part(froot, Gear.cyl(0.0, 0.15, 0.5, 8), lit(Color("#ffe08a"), false, Color(1.0, 0.85, 0.4)), Vector3(0.05, 0.4, 0.03))
	f2.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	flames.append(f1)
	flames.append(f2)
	# troncos para sentar
	for k in 2:
		var a := 0.6 + k * 2.4
		_part(froot, Gear.cyl(0.18, 0.2, 1.4, 8), lit(Color("#6e5038")), Vector3(cos(a) * 1.6, 0.18, sin(a) * 1.6), Vector3(0, -rad_to_deg(a), 90))
	fire_light = OmniLight3D.new()
	fire_light.light_color = Color("#ffa04a")
	fire_light.light_energy = 1.6
	fire_light.omni_range = 8.0
	fire_light.position = Vector3(0, 1.0, 0)
	froot.add_child(fire_light)
	var embers := CPUParticles3D.new()
	embers.amount = 24
	embers.lifetime = 1.6
	embers.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	embers.emission_sphere_radius = 0.25
	embers.direction = Vector3(0, 1, 0)
	embers.spread = 20.0
	embers.gravity = Vector3(0, 0.6, 0)
	embers.initial_velocity_min = 0.6
	embers.initial_velocity_max = 1.4
	embers.scale_amount_min = 0.04
	embers.scale_amount_max = 0.08
	embers.mesh = Gear.sphere(1.0, 4, 2)
	var emat := StandardMaterial3D.new()
	emat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	emat.albedo_color = Color("#ffb347")
	embers.material_override = emat
	embers.position = Vector3(0, 0.5, 0)
	froot.add_child(embers)
	# barraca, caixas, barril, bandeira e placa em lugares livres em volta
	var spots := []
	for k in 60:
		var a := k * 2.39996 + 1.0
		var cand := center + Vector2(cos(a), sin(a)) * (5.0 + k * 0.18)
		if cand.distance_to(fire) > 3.0 and _free_spot(cand, 1.8):
			var ok := true
			for s in spots:
				if (s as Vector2).distance_to(cand) < 3.2:
					ok = false
					break
			if ok:
				spots.append(cand)
		if spots.size() >= 4:
			break
	for i in spots.size():
		var sp: Vector2 = spots[i]
		var root := Node3D.new()
		root.position = Vector3(sp.x, terrain.height(sp.x, sp.y), sp.y)
		root.rotation.y = atan2(fire.x - sp.x, fire.y - sp.y)
		add_child(root)
		match i:
			0:
				var canvas := Color("#7e8a6a")
				var slope := Vector2(1.45, 1.9).length()
				var ang := rad_to_deg(atan2(1.45, 1.9))
				_part(root, Gear.box(Vector3(0.06, slope, 2.8)), lit(canvas), Vector3(-0.72, 0.95, 0), Vector3(0, 0, -ang))
				_part(root, Gear.box(Vector3(0.06, slope, 2.8)), lit(canvas.darkened(0.12)), Vector3(0.72, 0.95, 0), Vector3(0, 0, ang))
				var back := Gear.extrude(PackedVector2Array([Vector2(-1.4, 0), Vector2(1.4, 0), Vector2(0, 1.85)]), 0.04)
				_part(root, back, lit(canvas.darkened(0.25)), Vector3(0, 0, -1.36))
				var door := Gear.extrude(PackedVector2Array([Vector2(-0.55, 0), Vector2(0.55, 0), Vector2(0, 1.2)]), 0.04)
				_part(root, door, lit(Color("#2e2620"), false), Vector3(0, 0, 1.36))
				_part(root, Gear.cyl(0.035, 0.035, 3.0, 5), lit(Color("#5a3e2a")), Vector3(0, 1.92, 0), Vector3(90, 0, 0))
				for k in [-1.0, 1.0]:
					_part(root, Gear.cyl(0.035, 0.035, 2.0, 5), lit(Color("#5a3e2a")), Vector3(0, 0.98, k * 1.42))
			1:
				_part(root, Gear.box(Vector3(0.8, 0.8, 0.8)), lit(Color("#b08050")), Vector3(0, 0.4, 0), Vector3(0, 20, 0))
				_part(root, Gear.box(Vector3(0.6, 0.6, 0.6)), lit(Color("#9a7048")), Vector3(0.1, 1.1, 0.05), Vector3(0, 40, 0))
				_part(root, Gear.cyl(0.33, 0.33, 1.0, 12), lit(Color("#9a6a40")), Vector3(1.0, 0.5, -0.2))
			2:
				_part(root, Gear.cyl(0.06, 0.08, 5.0, 6), lit(Color("#5a3e2a")), Vector3(0, 2.5, 0))
				var flag := QuadMesh.new()
				flag.size = Vector2(1.6, 1.0)
				flag.subdivide_width = 8
				flag.subdivide_depth = 2
				var fm := ShaderMaterial.new()
				fm.shader = FLAG
				fm.set_shader_parameter("albedo", Color("#b5562c"))
				_part(root, flag, fm, Vector3(0.85, 4.4, 0))
			3:
				_part(root, Gear.cyl(0.05, 0.05, 1.6, 5), lit(Color("#5a3e2a")), Vector3(0, 0.8, 0))
				_part(root, Gear.box(Vector3(1.2, 0.45, 0.06)), lit(Color("#b08050")), Vector3(0, 1.45, 0))
	# lanternas nos dois lados do posto
	for k in [-1.0, 1.0]:
		var lp := center + Vector2(k * 3.5, -3.0)
		if not _free_spot(lp, 0.8):
			lp = center + Vector2(k * 3.5, 3.0)
		var ly := terrain.height(lp.x, lp.y)
		_part(self, Gear.cyl(0.06, 0.08, 2.2, 6), lit(Color("#3a2a22")), Vector3(lp.x, ly + 1.1, lp.y))
		_part(self, Gear.box(Vector3(0.5, 0.06, 0.06)), lit(Color("#3a2a22")), Vector3(lp.x + 0.2, ly + 2.15, lp.y))
		var lan_mat := lit(Color("#ffcf7a"), true, Color(1.0, 0.7, 0.3))
		_part(self, Gear.box(Vector3(0.26, 0.32, 0.26)), lan_mat, Vector3(lp.x + 0.4, ly + 1.92, lp.y))

func _build_portals() -> void:
	for pt in map.get("portals", []):
		var x := float(pt["x"])
		var z := float(pt["z"])
		var root := Node3D.new()
		root.position = Vector3(x, terrain.height(x, z), z)
		# o arco fica de frente para o centro do mapa
		var to_center := Vector2(terrain.w / 2.0 - x, terrain.h / 2.0 - z)
		root.rotation.y = atan2(to_center.x, to_center.y)
		add_child(root)
		var stone := lit(Color("#8a8278"))
		for k in [-1.0, 1.0]:
			_part(root, Gear.box(Vector3(0.7, 3.4, 0.7)), stone, Vector3(k * 1.8, 1.7, 0))
			_part(root, Gear.box(Vector3(0.9, 0.3, 0.9)), stone, Vector3(k * 1.8, 0.15, 0))
		_part(root, Gear.box(Vector3(4.6, 0.55, 0.85)), lit(Color("#7a7068")), Vector3(0, 3.6, 0))
		var glow := lit(Color("#ffb347"), false, Color(1.0, 0.6, 0.2))
		_part(root, Gear.box(Vector3(3.0, 0.12, 0.88)), glow, Vector3(0, 3.6, 0))
		# véu de luz dentro do arco
		var veil := QuadMesh.new()
		veil.size = Vector2(2.9, 3.2)
		var vm := StandardMaterial3D.new()
		vm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		vm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		vm.cull_mode = BaseMaterial3D.CULL_DISABLED
		vm.albedo_color = Color(1.0, 0.78, 0.45, 0.22)
		var vmi := _part(root, veil, vm, Vector3(0, 1.65, 0))
		vmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var motes := CPUParticles3D.new()
		motes.amount = 30
		motes.lifetime = 2.5
		motes.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
		motes.emission_box_extents = Vector3(1.4, 0.1, 0.4)
		motes.direction = Vector3(0, 1, 0)
		motes.gravity = Vector3(0, 0.4, 0)
		motes.initial_velocity_min = 0.2
		motes.initial_velocity_max = 0.6
		motes.scale_amount_min = 0.03
		motes.scale_amount_max = 0.07
		motes.mesh = Gear.sphere(1.0, 4, 2)
		var mm := StandardMaterial3D.new()
		mm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mm.albedo_color = Color("#ffd27a")
		motes.material_override = mm
		motes.position = Vector3(0, 0.2, 0)
		root.add_child(motes)

## Poeira/pólen flutuando perto da câmera (dá profundidade e vida).
var motes_node: CPUParticles3D
var flames := []

func _build_motes() -> void:
	motes_node = CPUParticles3D.new()
	motes_node.amount = 70
	motes_node.lifetime = 6.0
	motes_node.preprocess = 6.0
	motes_node.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	motes_node.emission_box_extents = Vector3(18, 4, 18)
	motes_node.direction = Vector3(1, 0.2, 0.3)
	motes_node.spread = 60.0
	motes_node.gravity = Vector3(0.05, 0.02, 0)
	motes_node.initial_velocity_min = 0.1
	motes_node.initial_velocity_max = 0.35
	motes_node.scale_amount_min = 0.025
	motes_node.scale_amount_max = 0.05
	motes_node.mesh = Gear.sphere(1.0, 4, 2)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	var id: String = map.get("id", "")
	m.albedo_color = Color(1.0, 0.95, 0.8, 0.8)
	if id == "oficina_soterrada":
		m.albedo_color = Color(0.6, 0.85, 1.0, 0.8)
	elif id == "brejo_bombas":
		m.albedo_color = Color(0.85, 1.0, 0.6, 0.85)
		motes_node.amount = 50
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	motes_node.material_override = m
	motes_node.local_coords = false
	add_child(motes_node)

func follow(focus: Vector3) -> void:
	if motes_node:
		motes_node.global_position = focus + Vector3(0, 2.5, 0)

func _process(delta: float) -> void:
	_t += delta
	if _valve_spin >= 0 and _valve_spin < valve_wheels.size():
		(valve_wheels[_valve_spin] as Node3D).rotate_object_local(Vector3.FORWARD, delta * 6.0)
	if alarm_light:
		alarm_light.light_energy = (0.6 + 0.9 * absf(sin(_t * 4.0))) if _alarm else 0.5
	if fire_light:
		fire_light.light_energy = 1.4 + sin(_t * 13.0) * 0.15 + sin(_t * 7.3) * 0.2 + randf() * 0.1
	for i in flames.size():
		var f: Node3D = flames[i]
		f.scale = Vector3(1.0 + sin(_t * 17.0 + i) * 0.08, 1.0 + sin(_t * 11.0 + i * 2.0) * 0.18, 1.0 + cos(_t * 15.0 + i) * 0.08)

# ---------------- céu e ambiente ----------------
const SKIES := {
	"estrada_velha": {"sun": Color("#fff0dc"), "top": Color("#5a63a8"), "horizon": Color("#f2b48a"), "ground": Color("#5a4a52"), "fog": Color("#d8b8a8"), "fog_density": 0.0035, "ambient": Color("#9a8fb0"), "cloud_lit": Color("#fff0dc"), "cloud_shade": Color("#b49ec4"), "cover": 0.48},
	"brejo_bombas": {"sun": Color("#eef0e4"), "top": Color("#6a7a88"), "horizon": Color("#c8c8a8"), "ground": Color("#4a5048"), "fog": Color("#9aa894"), "fog_density": 0.0065, "ambient": Color("#8a9a98"), "cloud_lit": Color("#e8e8d8"), "cloud_shade": Color("#8a9298"), "cover": 0.62},
	"oficina_soterrada": {"sun": Color("#ffd8b4"), "top": Color("#2a2438"), "horizon": Color("#a8603a"), "ground": Color("#3a2e2a"), "fog": Color("#6a5450"), "fog_density": 0.006, "ambient": Color("#8a7090"), "cloud_lit": Color("#e0a078"), "cloud_shade": Color("#5a4050"), "cover": 0.55},
	"pedrambar": {"sun": Color("#fff6e8"), "top": Color("#4a78c0"), "horizon": Color("#f8d8a8"), "ground": Color("#6a5a48"), "fog": Color("#c8b8a0"), "fog_density": 0.0022, "ambient": Color("#a898a8"), "cloud_lit": Color("#ffffff"), "cloud_shade": Color("#c0b0c8"), "cover": 0.4},
	"vau_de_nacar": {"sun": Color("#fff8f0"), "top": Color("#5a8ac8"), "horizon": Color("#e0e8f0"), "ground": Color("#5a6068"), "fog": Color("#b0b8c4"), "fog_density": 0.0022, "ambient": Color("#a0a8b8"), "cloud_lit": Color("#ffffff"), "cloud_shade": Color("#b8c0d8"), "cover": 0.42},
	"galerias_eco": {"sun": Color("#d8e4ff"), "top": Color("#1e2438"), "horizon": Color("#5a6a9a"), "ground": Color("#2a2e3a"), "fog": Color("#4a5478"), "fog_density": 0.007, "ambient": Color("#8a90b8"), "cloud_lit": Color("#8a9ac8"), "cloud_shade": Color("#3a4060"), "cover": 0.6},
	"canais_eclusa": {"sun": Color("#fff0d8"), "top": Color("#4a5a70"), "horizon": Color("#c8b89a"), "ground": Color("#3a4038"), "fog": Color("#a8a894"), "fog_density": 0.006, "ambient": Color("#9a9aa0"), "cloud_lit": Color("#f0e8dc"), "cloud_shade": Color("#8a8a98"), "cover": 0.65},
	"ultima_eclusa": {"sun": Color("#ffc8a0"), "top": Color("#1a1418"), "horizon": Color("#6a3020"), "ground": Color("#2a1e1a"), "fog": Color("#4a2a24"), "fog_density": 0.01, "ambient": Color("#9a7a80"), "cloud_lit": Color("#c06040"), "cloud_shade": Color("#3a1a18"), "cover": 0.7},
	"arena_prova": {"sun": Color("#ffd0a0"), "top": Color("#3a2a48"), "horizon": Color("#e87a4a"), "ground": Color("#4a3a38"), "fog": Color("#a87a64"), "fog_density": 0.003, "ambient": Color("#9a8090"), "cloud_lit": Color("#ffc890"), "cloud_shade": Color("#7a5068"), "cover": 0.5},
}

static func sun_color(map_id: String) -> Color:
	return SKIES.get(map_id, SKIES["estrada_velha"])["sun"]

static func environment(map_id: String) -> Environment:
	var cfg: Dictionary = SKIES.get(map_id, SKIES["estrada_velha"])
	var e := Environment.new()
	var sky := Sky.new()
	var sm := ShaderMaterial.new()
	sm.shader = SKY
	sm.set_shader_parameter("top_color", cfg["top"])
	sm.set_shader_parameter("horizon_color", cfg["horizon"])
	sm.set_shader_parameter("ground_color", cfg["ground"])
	sm.set_shader_parameter("cloud_lit", cfg["cloud_lit"])
	sm.set_shader_parameter("cloud_shade", cfg["cloud_shade"])
	sm.set_shader_parameter("cloud_cover", cfg["cover"])
	sky.sky_material = sm
	sky.radiance_size = Sky.RADIANCE_SIZE_32
	e.background_mode = Environment.BG_SKY
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = cfg["ambient"]
	e.ambient_light_energy = 0.32
	e.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	e.fog_enabled = true
	e.fog_light_color = cfg["fog"]
	e.fog_density = cfg["fog_density"]
	e.fog_sky_affect = 0.0
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_white = 1.3
	return e


# ---------------- A Última Eclusa ----------------
var gate_doors := {}    # id -> Node3D da folha da comporta (sobe/desce com o progresso)
var valve_wheels := []  # rodas das válvulas (giram no aviso)
var valve_rings := []

## Câmara do Custódio: paredes de metal, trilhas de descarga no piso (as linhas da fase 2),
## quatro válvulas e três comportas de saída com contador.
func _eclusa_chamber() -> void:
	var w: float = terrain.w
	var h: float = terrain.h
	var metal := lit(Color("#6a625c"))
	var dark := lit(Color("#3e3834"))
	var rust := lit(Color("#8a5a3a"))
	var walls := []
	for sd in [[Vector2(0.4, 0.4), Vector2(w - 0.4, 0.4)], [Vector2(w - 0.4, 0.4), Vector2(w - 0.4, h - 0.4)], [Vector2(w - 0.4, h - 0.4), Vector2(0.4, h - 0.4)], [Vector2(0.4, h - 0.4), Vector2(0.4, 0.4)]]:
		var a: Vector2 = sd[0]
		var b: Vector2 = sd[1]
		var len := a.distance_to(b)
		var dir := (b - a) / len
		var horizontal := absf(dir.y) < 0.5
		var n := int(len / 4.0)
		for k in n:
			var c := a + dir * (k + 0.5) * (len / n)
			var skip := false
			for g in map.get("gates", []):
				if c.distance_to(Vector2(float(g["x"]), float(g["z"]))) < 3.0:
					skip = true
			if c.y < 1.5 and absf(c.x - w / 2.0) < 3.0:
				skip = true # entrada
			if skip:
				continue
			var size := Vector3(len / n + 0.02, 6.0, 1.2) if horizontal else Vector3(1.2, 6.0, len / n + 0.02)
			walls.append([Gear.box(size), xf(Vector3(c.x, 3.0, c.y))])
			if k % 2 == 0:
				walls.append([Gear.cyl(0.35, 0.35, 6.4, 10), xf(Vector3(c.x, 3.2, c.y))])
	var wm := MeshInstance3D.new()
	wm.mesh = merge(walls)
	wm.material_override = metal
	add_child(wm)
	# trilhas metálicas do piso (onde as descargas passam)
	var strips := []
	for v in [8.0, 16.0, 24.0, 32.0, 40.0]:
		strips.append([Gear.box(Vector3(w - 2.0, 0.05, 0.35)), xf(Vector3(w / 2.0, 0.03, v))])
		strips.append([Gear.box(Vector3(0.35, 0.05, h - 2.0)), xf(Vector3(v, 0.03, h / 2.0))])
	var sm := MeshInstance3D.new()
	sm.mesh = merge(strips)
	sm.material_override = lit(Color("#b0a090"), false, Color(0.08, 0.06, 0.04))
	sm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(sm)
	# válvulas: cano, roda e anel âmbar no chão
	for v in map.get("valves", []):
		var p := Vector3(float(v["x"]), 0, float(v["z"]))
		var to_c := Vector2(w / 2.0 - p.x, h / 2.0 - p.z).normalized()
		_part(self, Gear.cyl(0.5, 0.5, 4.0, 12), dark, p + Vector3(-to_c.x, 2.0, -to_c.y) * Vector3(1.2, 1, 1.2))
		var wheel := Node3D.new()
		wheel.position = p + Vector3(0, 1.6, 0)
		wheel.rotation.y = atan2(to_c.x, to_c.y)
		add_child(wheel)
		_part(wheel, Gear.torus(0.55, 0.7, 18), rust, Vector3.ZERO, Vector3(90, 0, 0))
		for k in 3:
			_part(wheel, Gear.box(Vector3(1.2, 0.08, 0.08)), rust, Vector3.ZERO, Vector3(0, 0, k * 60))
		valve_wheels.append(wheel)
		var ring := TorusMesh.new()
		ring.inner_radius = 2.2
		ring.outer_radius = 2.5
		ring.rings = 40
		var rm := StandardMaterial3D.new()
		rm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		rm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		rm.albedo_color = Color(1.0, 0.7, 0.2, 0.0)
		var rmi := _part(self, ring, rm, p + Vector3(0, 0.08, 0), Vector3.ZERO, Vector3(1, 0.1, 1))
		valve_rings.append(rmi)
	# comportas de saída
	for g in map.get("gates", []):
		var gp := Vector3(float(g["x"]), 0, float(g["z"]))
		var root := Node3D.new()
		root.position = gp
		var along_x: bool = absf(gp.z - h) < 2.0 or gp.z < 2.0
		root.rotation.y = 0.0 if along_x else PI / 2.0
		add_child(root)
		for k in [-1.0, 1.0]:
			_part(root, Gear.box(Vector3(0.8, 6.5, 1.4)), dark, Vector3(k * 2.6, 3.25, 0))
		_part(root, Gear.box(Vector3(6.0, 0.8, 1.4)), dark, Vector3(0, 6.5, 0))
		var door := Node3D.new()
		door.position.y = 10.0
		root.add_child(door)
		_part(door, Gear.box(Vector3(4.4, 4.8, 0.4)), rust, Vector3(0, -2.4, 0))
		for k in 4:
			_part(door, Gear.box(Vector3(4.5, 0.15, 0.5)), dark, Vector3(0, -0.5 - k * 1.2, 0))
		gate_doors[g["id"]] = door
	# luz vermelha de alarme
	var l := OmniLight3D.new()
	l.light_color = Color("#ff6a3a")
	l.light_energy = 1.0
	l.omni_range = 34.0
	l.position = Vector3(w / 2.0, 9.0, h / 2.0)
	add_child(l)
	alarm_light = l

var alarm_light: OmniLight3D
var _valve_spin := -1
var _alarm := false

## Estado do chefe vindo do servidor (evento boss).
func on_boss(m: Dictionary) -> void:
	if m.get("gates", null) != null:
		for g in m["gates"]:
			var door: Node3D = gate_doors.get(g["id"], null)
			if door:
				var tw := create_tween()
				# aberta: folha recolhida no alto (y 10); fechada: encosta no chão (y 4,8)
				tw.tween_property(door, "position:y", lerpf(10.0, 4.8, float(g["progress"])), 0.45)
				door.set_meta("progress", float(g["progress"]))
	_alarm = m.get("phase", 1) == 3
	var v = m.get("valve", null)
	_valve_spin = -1
	for i in valve_rings.size():
		var mat: StandardMaterial3D = valve_rings[i].material_override
		var on: bool = v != null and int(v.get("i", -1)) == i and v.get("state", "") in ["warning", "venting"]
		mat.albedo_color.a = 0.0 if not on else (0.85 if v["state"] == "venting" else 0.45)
		if on:
			_valve_spin = i
	if m.get("state", "") in ["reset", "victory"]:
		_alarm = false
		for door in gate_doors.values():
			(door as Node3D).position.y = 10.0
