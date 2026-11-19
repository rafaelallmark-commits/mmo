extends RefCounted
## Armas e peças de equipamento em estilo anime: perfis 2D extrudados (lâminas, pontas,
## guardas), metais com tom de aço/ouro, empunhaduras enroladas e cristais que brilham.
## Convenção das armas: origem no punho, +Y aponta para a ponta, +Z é o lado do gume.

const TOON := preload("res://shaders/toon.gdshader")
const OUTLINE := preload("res://shaders/outline.gdshader")

const STEEL := Color("#a9b2bd")
const STEEL_DARK := Color("#6c7480")
const GOLD := Color("#d9a441")
const WOOD := Color("#6b4a2e")
const LEATHER := Color("#4a3428")
const WRAP := Color("#2e2420")

static var _cache := {}

static func mat(color: Color, outline := true, emission := Color(0, 0, 0), thickness := 0.006) -> ShaderMaterial:
	var key := "%s|%s|%s|%s" % [color.to_html(), outline, emission.to_html(), thickness]
	if _cache.has(key):
		return _cache[key]
	var m := ShaderMaterial.new()
	m.shader = TOON
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("emission", emission)
	m.set_shader_parameter("lit_level", 0.92)
	if outline:
		var o := ShaderMaterial.new()
		o.shader = OUTLINE
		o.set_shader_parameter("thickness", thickness)
		m.next_pass = o
	_cache[key] = m
	return m

static func part(parent: Node3D, mesh: Mesh, m: Material, pos: Vector3, scl := Vector3.ONE, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = m
	mi.position = pos
	mi.scale = scl
	mi.rotation_degrees = rot
	parent.add_child(mi)
	return mi

static func cyl(top: float, bottom: float, h: float, seg := 12) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = h
	c.radial_segments = seg
	c.rings = 1
	return c

static func sphere(r: float, seg := 12, rings := 6) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = seg
	s.rings = rings
	return s

static func box(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b

static func torus(inner: float, outer: float, seg := 24) -> TorusMesh:
	var t := TorusMesh.new()
	t.inner_radius = inner
	t.outer_radius = outer
	t.rings = seg
	t.ring_segments = 8
	return t

## Cristal (octaedro alongado).
static func crystal(r: float, h: float) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r
	s.height = h
	s.radial_segments = 4
	s.rings = 2
	return s

## Extruda um polígono 2D (plano XY, ordem anti-horária) com espessura depth no eixo Z.
## Faces planas, frente em +Z. (O Godot usa ordem horária como face da frente.)
static func extrude(points: PackedVector2Array, depth: float) -> ArrayMesh:
	var key := "ext|%s|%s" % [str(points), depth]
	if _cache.has(key):
		return _cache[key]
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hz := depth / 2.0
	var tris := Geometry2D.triangulate_polygon(points)
	# frente (+Z): inverte para ordem horária vista de +Z
	for i in range(0, tris.size(), 3):
		for k in [0, 2, 1]:
			var p: Vector2 = points[tris[i + k]]
			st.set_normal(Vector3(0, 0, 1))
			st.add_vertex(Vector3(p.x, p.y, hz))
	# trás (-Z)
	for i in range(0, tris.size(), 3):
		for k in [0, 1, 2]:
			var p: Vector2 = points[tris[i + k]]
			st.set_normal(Vector3(0, 0, -1))
			st.add_vertex(Vector3(p.x, p.y, -hz))
	# laterais
	var n := points.size()
	for i in n:
		var a: Vector2 = points[i]
		var b: Vector2 = points[(i + 1) % n]
		var e := b - a
		var nrm := Vector3(e.y, -e.x, 0).normalized()
		var va := Vector3(a.x, a.y, hz)
		var vb := Vector3(b.x, b.y, hz)
		var vc := Vector3(b.x, b.y, -hz)
		var vd := Vector3(a.x, a.y, -hz)
		for v in [va, vb, vc, va, vc, vd]:
			st.set_normal(nrm)
			st.add_vertex(v)
	var m := st.commit()
	_cache[key] = m
	return m

## Empunhadura enrolada (anéis escuros) ao longo de +Y.
static func grip(parent: Node3D, r: float, from_y: float, to_y: float, rings := 4) -> void:
	part(parent, cyl(r * 1.05, r * 1.05, to_y - from_y, 10), mat(LEATHER), Vector3(0, (from_y + to_y) / 2.0, 0))
	for i in rings:
		var y := lerpf(from_y, to_y, (i + 0.5) / rings)
		part(parent, cyl(r * 1.22, r * 1.22, (to_y - from_y) / rings * 0.35, 10), mat(WRAP, false), Vector3(0, y, 0))

## Lâmina extrudada no plano do gume: perfil 2D (x = para o gume, y = ao longo da arma).
static func blade(parent: Node3D, profile: PackedVector2Array, depth: float, color: Color, pos: Vector3, edge_dir := 1.0) -> MeshInstance3D:
	# o perfil é desenhado em XY; gira para que +X vire +Z (lado do gume)
	return part(parent, extrude(profile, depth), mat(color, true, Color(0, 0, 0), 0.004), pos, Vector3(1, 1, 1), Vector3(0, -90 * edge_dir, 0))

static func weapon(family: String, accent := GOLD) -> Node3D:
	var w := Node3D.new()
	match family:
		"axe_1h", "axe_2h":
			var big := 1.3 if family == "axe_2h" else 1.0
			part(w, cyl(0.02 * big, 0.024 * big, 0.78 * big, 10), mat(WOOD), Vector3(0, 0.26 * big, 0))
			grip(w, 0.022 * big, -0.1 * big, 0.12 * big)
			part(w, sphere(0.03 * big), mat(accent), Vector3(0, -0.13 * big, 0))
			var crescent := PackedVector2Array([Vector2(0.0, -0.05), Vector2(0.06, -0.09), Vector2(0.13, -0.13), Vector2(0.17, -0.06), Vector2(0.185, 0.0), Vector2(0.17, 0.06), Vector2(0.13, 0.13), Vector2(0.06, 0.09), Vector2(0.0, 0.05)])
			var scaled := PackedVector2Array()
			for p in crescent:
				scaled.append(p * big)
			blade(w, scaled, 0.018 * big, STEEL, Vector3(0, 0.58 * big, 0.015 * big))
			part(w, box(Vector3(0.05, 0.12, 0.05) * big), mat(STEEL_DARK), Vector3(0, 0.58 * big, 0))
			if family == "axe_2h":
				blade(w, scaled, 0.018 * big, STEEL, Vector3(0, 0.58 * big, -0.015 * big), -1.0)
			else:
				var spike := PackedVector2Array([Vector2(0.0, -0.025), Vector2(0.09, 0.0), Vector2(0.0, 0.025)])
				blade(w, spike, 0.014, STEEL_DARK, Vector3(0, 0.58, -0.02), -1.0)
			part(w, cyl(0.0, 0.03 * big, 0.08 * big, 6), mat(STEEL_DARK), Vector3(0, 0.69 * big, 0))
		"hammer_1h":
			part(w, cyl(0.02, 0.024, 0.66, 10), mat(WOOD), Vector3(0, 0.22, 0))
			grip(w, 0.022, -0.1, 0.12)
			part(w, sphere(0.028), mat(accent), Vector3(0, -0.13, 0))
			part(w, box(Vector3(0.11, 0.11, 0.26)), mat(STEEL_DARK), Vector3(0, 0.55, 0))
			for z in [-0.13, 0.13]:
				part(w, cyl(0.072, 0.072, 0.04, 8), mat(STEEL), Vector3(0, 0.55, z), Vector3.ONE, Vector3(90, 0, 0))
			part(w, box(Vector3(0.125, 0.03, 0.18)), mat(accent), Vector3(0, 0.55, 0))
			part(w, cyl(0.0, 0.025, 0.07, 6), mat(STEEL), Vector3(0, 0.64, 0))
		"claw":
			part(w, box(Vector3(0.1, 0.1, 0.12)), mat(STEEL_DARK), Vector3(0, 0.02, 0.02))
			part(w, box(Vector3(0.105, 0.03, 0.125)), mat(accent), Vector3(0, 0.06, 0.02))
			for i in 3:
				var hook := PackedVector2Array([Vector2(0.0, 0.0), Vector2(0.02, 0.0), Vector2(0.05, 0.12), Vector2(0.03, 0.24), Vector2(0.0, 0.26), Vector2(0.018, 0.12)])
				var b := blade(w, hook, 0.012, STEEL, Vector3(-0.035 + i * 0.035, 0.06, 0.05))
				b.rotation_degrees.x = -12.0
		"spear_2h":
			part(w, cyl(0.02, 0.022, 1.75, 10), mat(WOOD), Vector3(0, 0.45, 0))
			grip(w, 0.022, -0.05, 0.25, 5)
			grip(w, 0.022, 0.52, 0.74, 3)  # onde a mão da frente pega na guarda e a de trás ao carregar
			part(w, cyl(0.034, 0.03, 0.06, 10), mat(accent), Vector3(0, 1.34, 0))
			var leaf := PackedVector2Array([Vector2(-0.025, 0.0), Vector2(0.025, 0.0), Vector2(0.05, 0.1), Vector2(0.03, 0.22), Vector2(0.0, 0.32), Vector2(-0.03, 0.22), Vector2(-0.05, 0.1)])
			part(w, extrude(leaf, 0.014), mat(STEEL, true, Color(0, 0, 0), 0.004), Vector3(0, 1.37, 0))
			part(w, box(Vector3(0.14, 0.02, 0.02)), mat(STEEL_DARK), Vector3(0, 1.35, 0))
			part(w, cyl(0.0, 0.03, 0.12, 6), mat(Color("#c03a2a"), false), Vector3(0, 1.27, 0), Vector3.ONE, Vector3(180, 0, 0))
		"bow":
			# arco em arco de círculo com segmentos; o punho fica no meio da madeira (origem) e a
			# corda passa 11 cm atrás, do lado do arqueiro (−Z); o tiro sai para +Z
			var limbs := 9
			for i in limbs:
				var t := (float(i) / (limbs - 1)) * 2.0 - 1.0
				var y := t * 0.52
				var z := (1.0 - t * t) * 0.11 - 0.11
				var ang := atan2(-t * 0.22, 0.52)  # tangente do arco: dz/dt sobre dy/dt
				part(w, cyl(0.014, 0.018, 0.13, 8), mat(WOOD), Vector3(0, y, z), Vector3.ONE, Vector3(rad_to_deg(ang), 0, 0))
			for k in [-1.0, 1.0]:
				part(w, sphere(0.02), mat(accent), Vector3(0, k * 0.54, -0.11))
			grip(w, 0.022, -0.06, 0.06, 3)
			part(w, cyl(0.003, 0.003, 1.06, 4), mat(Color("#efe6d2"), false), Vector3(0, 0, -0.115))
		"sword_1h", "sword_2h":
			var big := 1.3 if family == "sword_2h" else 1.0
			grip(w, 0.02, -0.11 * big, 0.06, 3)
			part(w, sphere(0.03), mat(accent), Vector3(0, -0.13 * big, 0))
			var guard := PackedVector2Array([Vector2(-0.13, -0.01), Vector2(-0.1, -0.025), Vector2(0.1, -0.025), Vector2(0.13, -0.01), Vector2(0.11, 0.02), Vector2(0.03, 0.02), Vector2(0.0, 0.045), Vector2(-0.03, 0.02), Vector2(-0.11, 0.02)])
			part(w, extrude(guard, 0.04), mat(accent, true, Color(0, 0, 0), 0.004), Vector3(0, 0.08, 0), Vector3.ONE, Vector3(0, 90, 0))
			var bl := PackedVector2Array([Vector2(-0.028, 0.0), Vector2(0.028, 0.0), Vector2(0.026, 0.62 * big), Vector2(0.0, 0.72 * big), Vector2(-0.026, 0.62 * big)])
			part(w, extrude(bl, 0.012), mat(STEEL, true, Color(0, 0, 0), 0.004), Vector3(0, 0.1, 0), Vector3.ONE, Vector3(0, 90, 0))
			part(w, box(Vector3(0.013, 0.5 * big, 0.012)), mat(STEEL_DARK, false), Vector3(0, 0.1 + 0.28 * big, 0))
			part(w, crystal(0.018, 0.04), mat(Color("#5ab0ff"), false, Color(0.2, 0.45, 0.9)), Vector3(0, 0.08, 0.025), Vector3.ONE, Vector3(90, 0, 0))
		"javelin":
			part(w, cyl(0.014, 0.016, 1.15, 8), mat(WOOD), Vector3(0, 0.32, 0))
			grip(w, 0.016, 0.22, 0.42, 3)  # ponto de equilíbrio, onde a mão segura
			var head := PackedVector2Array([Vector2(-0.018, 0.0), Vector2(0.018, 0.0), Vector2(0.04, 0.05), Vector2(0.016, 0.06), Vector2(0.0, 0.2), Vector2(-0.016, 0.06), Vector2(-0.04, 0.05)])
			part(w, extrude(head, 0.01), mat(STEEL, true, Color(0, 0, 0), 0.004), Vector3(0, 0.89, 0))
			for k in [-1, 1]:
				part(w, box(Vector3(0.0, 0.07, 0.04)), mat(Color("#e8e2d6")), Vector3(0.0, -0.18, 0.0), Vector3(1, 1, 1), Vector3(0, 45 * k, 0))
		"wand":
			part(w, cyl(0.014, 0.02, 0.38, 8), mat(WOOD), Vector3(0, 0.12, 0))
			grip(w, 0.02, -0.06, 0.06, 2)
			part(w, torus(0.03, 0.04), mat(accent), Vector3(0, 0.32, 0), Vector3.ONE, Vector3(90, 0, 0))
			part(w, crystal(0.035, 0.11), mat(Color("#ffb347"), false, Color(1.0, 0.5, 0.12)), Vector3(0, 0.36, 0))
		"scepter":
			part(w, cyl(0.016, 0.02, 0.46, 8), mat(Color("#e8dcc0")), Vector3(0, 0.15, 0))
			grip(w, 0.021, -0.07, 0.06, 2)
			for k in [-1.0, 1.0]:
				var wing := PackedVector2Array([Vector2(0.0, 0.0), Vector2(0.09, 0.04), Vector2(0.12, 0.12), Vector2(0.07, 0.09), Vector2(0.02, 0.06)])
				part(w, extrude(wing, 0.01), mat(accent, true, Color(0, 0, 0), 0.004), Vector3(0, 0.36, 0), Vector3(k, 1, 1))
			part(w, torus(0.035, 0.045), mat(accent), Vector3(0, 0.42, 0))
			part(w, crystal(0.04, 0.1), mat(Color("#b6e0ff"), false, Color(0.4, 0.6, 0.95)), Vector3(0, 0.45, 0))
		"staff_2h":
			part(w, cyl(0.022, 0.028, 1.55, 8), mat(WOOD), Vector3(0, 0.38, 0))
			grip(w, 0.026, 0.42, 0.78, 4)  # altura das mãos: apoiado, em guarda e carregando
			for i in 3:
				part(w, cyl(0.03, 0.03, 0.025, 8), mat(accent), Vector3(0, 0.55 + i * 0.25, 0))
			part(w, torus(0.07, 0.085), mat(accent), Vector3(0, 1.24, 0), Vector3.ONE, Vector3(90, 0, 0))
			for k in [-1.0, 1.0]:
				var prong := PackedVector2Array([Vector2(0.0, 0.0), Vector2(0.03, 0.0), Vector2(0.09, 0.12), Vector2(0.06, 0.22), Vector2(0.04, 0.12)])
				part(w, extrude(prong, 0.015), mat(accent, true, Color(0, 0, 0), 0.004), Vector3(0, 1.12, 0), Vector3(k, 1, 1))
			part(w, crystal(0.06, 0.18), mat(Color("#ff8a3a"), false, Color(1.0, 0.45, 0.12)), Vector3(0, 1.26, 0))
	return w

# ---------------- peças de equipamento (presas aos ossos pelo personagem) ----------------
## Ombreira em camadas (eixo +Y para cima, +X para fora do ombro).
static func pauldron(color: Color, trim: Color, side: float) -> Node3D:
	var n := Node3D.new()
	var metal := STEEL.lerp(color, 0.25)
	for i in 3:
		part(n, sphere(0.085 - i * 0.012, 16, 8), mat(metal.darkened(i * 0.12)), Vector3(side * i * 0.014, 0.02 - i * 0.028, 0), Vector3(1.1, 0.42, 1.15), Vector3(0, 0, side * -(8 + i * 8)))
	part(n, torus(0.08, 0.09, 20), mat(trim), Vector3(side * 0.005, 0.0, 0), Vector3(1.15, 1, 1.2), Vector3(0, 0, side * -10))
	part(n, sphere(0.014, 8, 4), mat(trim), Vector3(side * 0.06, 0.035, 0.0))
	return n

## Bota: cano ao redor da canela (+Y para cima) e pé (+Z para a frente).
static func boot_shaft(color: Color, trim: Color, height: float) -> Node3D:
	var n := Node3D.new()
	part(n, cyl(0.058, 0.052, height, 14), mat(color), Vector3.ZERO)
	part(n, cyl(0.064, 0.064, 0.03, 14), mat(trim), Vector3(0, height / 2.0, 0))
	part(n, cyl(0.06, 0.06, 0.02, 14), mat(color.darkened(0.3)), Vector3(0, -height * 0.15, 0))
	return n

static func boot_foot(color: Color) -> Node3D:
	var n := Node3D.new()
	part(n, box(Vector3(0.085, 0.065, 0.16)), mat(color), Vector3(0, -0.035, 0.035))
	part(n, sphere(0.045, 12, 6), mat(color), Vector3(0, -0.04, 0.11), Vector3(1.0, 0.75, 1.1))
	part(n, box(Vector3(0.09, 0.02, 0.2)), mat(color.darkened(0.45)), Vector3(0, -0.07, 0.05))
	return n

## Braçadeira ao longo do eixo do antebraço (+Y).
static func bracer(color: Color, trim: Color, length: float) -> Node3D:
	var n := Node3D.new()
	part(n, cyl(0.045, 0.04, length, 12), mat(color), Vector3.ZERO)
	for y in [-length / 2.0 + 0.01, length / 2.0 - 0.01]:
		part(n, cyl(0.048, 0.048, 0.015, 12), mat(trim), Vector3(0, y, 0))
	return n

## Peitoral (frente em +Z).
static func chestplate(color: Color, trim: Color) -> Node3D:
	var n := Node3D.new()
	var metal := STEEL.lerp(color, 0.2)
	part(n, sphere(0.14, 20, 10), mat(metal), Vector3(0, 0, 0.0), Vector3(1.0, 0.92, 0.42))
	part(n, sphere(0.1, 16, 8), mat(metal.lightened(0.08)), Vector3(0, 0.02, 0.012), Vector3(1.0, 0.8, 0.42))
	part(n, box(Vector3(0.016, 0.16, 0.01)), mat(trim), Vector3(0, 0.0, 0.058))
	part(n, torus(0.128, 0.142, 28), mat(trim), Vector3(0, 0.0, 0.0), Vector3(1.0, 0.92, 0.42), Vector3(90, 0, 0))
	part(n, crystal(0.02, 0.05), mat(Color("#5ab0ff"), false, Color(0.2, 0.45, 0.9)), Vector3(0, 0.05, 0.062), Vector3.ONE, Vector3(90, 0, 0))
	return n

## Saia/tabardo em volta do quadril.
static func skirt(color: Color, trim: Color, top_r: float, bottom_r: float, length: float) -> Node3D:
	var n := Node3D.new()
	part(n, cyl(top_r, bottom_r, length, 20), mat(color), Vector3(0, -length / 2.0, 0))
	part(n, cyl(bottom_r + 0.004, bottom_r + 0.004, 0.025, 20), mat(trim), Vector3(0, -length + 0.012, 0))
	part(n, cyl(top_r + 0.01, top_r + 0.01, 0.035, 20), mat(trim.darkened(0.2)), Vector3(0, 0.0, 0))
	return n

## Cinto com fivela e bolsinha.
static func belt(color: Color, trim: Color, r: float) -> Node3D:
	var n := Node3D.new()
	part(n, cyl(r, r, 0.035, 20), mat(color), Vector3.ZERO)
	part(n, box(Vector3(0.05, 0.04, 0.015)), mat(trim), Vector3(0, 0, r))
	part(n, box(Vector3(0.07, 0.08, 0.05)), mat(color.darkened(0.2)), Vector3(r * 0.85, -0.03, r * 0.3), Vector3.ONE, Vector3(0, -30, 0))
	return n

## Chapéu de mago com aba caída e fivela.
static func wizard_hat(color: Color, trim: Color) -> Node3D:
	var n := Node3D.new()
	part(n, cyl(0.25, 0.27, 0.02, 32), mat(color), Vector3.ZERO)
	part(n, torus(0.24, 0.27, 32), mat(color.darkened(0.1)), Vector3(0, -0.01, 0), Vector3(1, 0.6, 1))
	part(n, cyl(0.118, 0.13, 0.05, 20), mat(trim), Vector3(0, 0.03, 0))
	part(n, box(Vector3(0.05, 0.04, 0.01)), mat(GOLD), Vector3(0, 0.03, 0.13))
	var tip := Node3D.new()
	tip.position = Vector3(0, 0.05, 0)
	tip.rotation_degrees = Vector3(-10, 0, 0)
	n.add_child(tip)
	part(tip, cyl(0.07, 0.118, 0.2, 20), mat(color), Vector3(0, 0.1, 0))
	var tip2 := Node3D.new()
	tip2.position = Vector3(0, 0.2, 0)
	tip2.rotation_degrees = Vector3(-28, 0, 0)
	tip.add_child(tip2)
	part(tip2, cyl(0.0, 0.07, 0.2, 16), mat(color), Vector3(0, 0.1, 0))
	part(tip2, sphere(0.02), mat(GOLD, false, Color(0.5, 0.35, 0.05)), Vector3(0, 0.2, 0))
	return n

## Capa (presa às costas, cai para baixo).
static func cape(color: Color, trim: Color) -> Node3D:
	var n := Node3D.new()
	var shape := PackedVector2Array([Vector2(-0.15, 0.0), Vector2(0.15, 0.0), Vector2(0.24, -0.72), Vector2(0.08, -0.78), Vector2(0.0, -0.74), Vector2(-0.08, -0.78), Vector2(-0.24, -0.72)])
	part(n, extrude(shape, 0.012), mat(color, true, Color(0, 0, 0), 0.004), Vector3(0, 0, 0), Vector3.ONE, Vector3(-9, 0, 0))
	part(n, cyl(0.022, 0.022, 0.32, 10), mat(trim), Vector3(0, 0.0, 0.0), Vector3.ONE, Vector3(0, 0, 90))
	for k in [-1.0, 1.0]:
		part(n, sphere(0.025), mat(GOLD), Vector3(k * 0.16, 0.0, 0.01))
	return n

## Cachecol/lenço no pescoço com ponta caindo.
static func scarf(color: Color) -> Node3D:
	var n := Node3D.new()
	part(n, torus(0.06, 0.085, 20), mat(color), Vector3.ZERO, Vector3(1.0, 1.4, 1.0))
	var tail := PackedVector2Array([Vector2(-0.03, 0.0), Vector2(0.03, 0.0), Vector2(0.04, -0.22), Vector2(0.0, -0.25), Vector2(-0.035, -0.21)])
	part(n, extrude(tail, 0.015), mat(color.darkened(0.1)), Vector3(0.05, -0.02, -0.06), Vector3.ONE, Vector3(15, 30, 10))
	return n
