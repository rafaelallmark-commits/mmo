extends RefCounted
## Relevo visual do mapa: ondulações suaves, estradas e postos achatados, leito seco e lagoas
## escavados, colinas logo além da borda e montanhas no horizonte (o mundo não "acaba no vazio").
## O servidor é 2D; aqui só decidimos a altura em que cada coisa é desenhada. Determinístico.

var map: Dictionary
var w := 160.0
var h := 100.0
var noise := FastNoiseLite.new()
var hills := FastNoiseLite.new()
var ridges := FastNoiseLite.new()
var detail := FastNoiseLite.new()
var roads := []          # [{w, pts:[Vector2]}]
var carves := []         # [{rect: Rect2, depth, kind}]
var flats := []          # [Vector2 centro, raio]
var amp := 0.5

func _init(p_map: Dictionary) -> void:
	map = p_map
	var size: Array = map.get("size", [160, 100])
	w = float(size[0])
	h = float(size[1])
	var seed := hash(map.get("id", "mapa"))
	noise.seed = seed
	noise.frequency = 0.035
	noise.fractal_octaves = 3
	hills.seed = seed + 17
	hills.frequency = 0.02
	hills.fractal_octaves = 4
	ridges.seed = seed + 23
	ridges.frequency = 0.0055
	ridges.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	ridges.fractal_octaves = 3
	detail.seed = seed + 31
	detail.frequency = 0.25
	if map.get("city", false) or map.get("id", "") == "arena_prova":
		amp = 0.12
	for r in map.get("roads", []):
		var pts := []
		for p in r["pts"]:
			pts.append(Vector2(float(p[0]), float(p[1])))
		roads.append({"w": float(r["w"]), "pts": pts})
	for b in map.get("blocked", []):
		var x0 := float(b["x0"])
		var z0 := float(b["z0"])
		var x1 := float(b["x1"])
		var z1 := float(b["z1"])
		# lados encostados na borda do mapa continuam para fora (o rio segue pelas colinas)
		if x0 <= 0.5:
			x0 = -400.0
		if z0 <= 0.5:
			z0 = -400.0
		if x1 >= w - 0.5:
			x1 = w + 400.0
		if z1 >= h - 0.5:
			z1 = h + 400.0
		var rect := Rect2(x0, z0, x1 - x0, z1 - z0)
		var nm: String = b.get("name", "")
		var small := minf(float(b["x1"]) - float(b["x0"]), float(b["z1"]) - float(b["z0"]))
		if "Leito" in nm:
			carves.append({"rect": rect, "depth": 0.9, "kind": "dry", "round": small * 0.4, "wobble": 0.5})
		elif "Lagoa" in nm or "água" in nm:
			carves.append({"rect": rect, "depth": 1.1, "kind": "water", "round": small * 0.42, "wobble": 1.6})
	var gp: Dictionary = map.get("guardPost", {})
	if not gp.is_empty():
		flats.append([Vector2(float(gp["x"]), float(gp["z"])), minf(float(gp["safeRadius"]), 16.0)])
	for pt in map.get("portals", []):
		flats.append([Vector2(float(pt["x"]), float(pt["z"])), 5.0])
	for n in map.get("npcs", []):
		flats.append([Vector2(float(n["x"]), float(n["z"])), 2.5])

static func _seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var t := clampf((p - a).dot(ab) / maxf(ab.length_squared(), 1e-6), 0.0, 1.0)
	return p.distance_to(a + ab * t)

## Distância até a borda da estrada mais próxima (negativa = em cima da estrada).
func road_dist(x: float, z: float) -> float:
	var p := Vector2(x, z)
	var best := 1e9
	for r in roads:
		var pts: Array = r["pts"]
		for i in pts.size() - 1:
			best = minf(best, _seg_dist(p, pts[i], pts[i + 1]) - float(r["w"]) * 0.5)
	return best

## 0..1: quanto o terreno é "estrada" (1 no meio, desce na borda com ruído).
func road_mask(x: float, z: float) -> float:
	var d := road_dist(x, z) + detail.get_noise_2d(x, z) * 0.5
	return 1.0 - smoothstep(-0.4, 0.9, d)

## [profundidade, tipo, margem 0..1]. A rampa fica toda DENTRO do retângulo bloqueado, então a
## beira onde se pode andar continua seca; "margem" vale 1 perto da borda (achata o barranco).
func carve_mask(x: float, z: float) -> Array:
	for c in carves:
		var r: Rect2 = c["rect"]
		# retângulo de cantos arredondados, com a margem "mordida" por ruído (só para dentro,
		# então a água nunca passa da área bloqueada no servidor)
		var half := r.size * 0.5
		var rr: float = minf(float(c["round"]), minf(half.x, half.y))
		var q := Vector2(absf(x - (r.position.x + half.x)), absf(z - (r.position.y + half.y))) - (half - Vector2(rr, rr))
		var sdf := Vector2(maxf(q.x, 0.0), maxf(q.y, 0.0)).length() + minf(maxf(q.x, q.y), 0.0) - rr
		var inside := -sdf
		if inside < -4.0:
			continue
		inside -= (detail.get_noise_2d(x * 0.6, z * 0.6) * 0.5 + 0.5) * float(c["wobble"])
		if inside <= 0.0:
			return [0.0, c["kind"], 1.0 - smoothstep(0.0, 4.0, -inside)]
		return [smoothstep(0.0, 2.6, inside) * float(c["depth"]), c["kind"], 1.0]
	return [0.0, "", 0.0]

func outside_dist(x: float, z: float) -> float:
	var dx := maxf(maxf(-x, x - w), 0.0)
	var dz := maxf(maxf(-z, z - h), 0.0)
	return sqrt(dx * dx + dz * dz)

func height(x: float, z: float) -> float:
	var y := noise.get_noise_2d(x, z) * amp
	var flat := clampf(1.0 - smoothstep(0.0, 3.0, road_dist(x, z)), 0.0, 1.0)
	for f in flats:
		flat = maxf(flat, 1.0 - smoothstep(float(f[1]) * 0.6, float(f[1]) + 2.0, Vector2(x, z).distance_to(f[0])))
	var cm: Array = carve_mask(x, z)
	flat = maxf(flat, float(cm[2]))
	y *= 1.0 - flat * 0.85
	var out := outside_dist(x, z)
	if out > 0.0:
		var hn := hills.get_noise_2d(x, z) * 0.5 + 0.5
		y += smoothstep(0.0, 30.0, out) * (3.0 + hn * 13.0) + out * 0.04
		# cordilheira ao longe (cristas)
		var rn := ridges.get_noise_2d(x, z) * 0.5 + 0.5
		y += smoothstep(45.0, 240.0, out) * (14.0 + rn * rn * 75.0)
	y -= float(cm[0])
	return y

## Linhas da grade: finas no mapa e perto dele, cada vez mais espaçadas até o horizonte.
static func _lines(lo: float, hi: float, fine: float, near: float, far: float) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	var span := hi - lo + near * 2.0
	var steps := int(ceil(span / fine))
	var st := span / steps
	var left := PackedFloat32Array()
	var d := near
	var g := st
	while d < far:
		g *= 1.14
		d += g
		left.append(lo - d)
	for i in range(left.size() - 1, -1, -1):
		out.append(left[i])
	for i in steps + 1:
		out.append(lo - near + i * st)
	d = near
	g = st
	while d < far:
		g *= 1.14
		d += g
		out.append(hi + d)
	return out

## Malha do terreno (cores por vértice: R estrada, G variação, B terra/pedra/lama).
func build_mesh(fine := 1.25, near := 18.0, far := 420.0) -> ArrayMesh:
	var xs := _lines(0.0, w, fine, near, far)
	var zs := _lines(0.0, h, fine, near, far)
	var nx := xs.size()
	var nz := zs.size()
	var verts := PackedVector3Array()
	var cols := PackedColorArray()
	var uvs := PackedVector2Array()
	verts.resize(nx * nz)
	cols.resize(nx * nz)
	uvs.resize(nx * nz)
	for j in nz:
		var z: float = zs[j]
		for i in nx:
			var x: float = xs[i]
			var k := j * nx + i
			var out := outside_dist(x, z)
			var y := height(x, z)
			verts[k] = Vector3(x, y, z)
			var road := road_mask(x, z) if out <= 2.0 else 0.0
			var cm: Array = carve_mask(x, z)
			var dirt := 0.0
			if cm[1] == "dry":
				dirt = clampf(float(cm[0]) / 0.5, 0.0, 1.0)
			elif cm[1] == "water":
				dirt = clampf(float(cm[0]) / 0.6, 0.0, 1.0) * 0.85
			var rocky := smoothstep(6.0, 26.0, out) * (0.55 + 0.45 * detail.get_noise_2d(x * 0.2, z * 0.2))
			cols[k] = Color(road, noise.get_noise_2d(x * 2.0, z * 2.0) * 0.5 + 0.5, maxf(dirt, rocky), 1.0)
			uvs[k] = Vector2(x, z)
	var idx := PackedInt32Array()
	idx.resize((nx - 1) * (nz - 1) * 6)
	var t := 0
	for j in nz - 1:
		for i in nx - 1:
			var a := j * nx + i
			var b := a + 1
			var c := a + nx
			var d := c + 1
			# ordem horária vista de cima (+Y) = face da frente no Godot
			idx[t] = a; idx[t + 1] = b; idx[t + 2] = c
			idx[t + 3] = b; idx[t + 4] = d; idx[t + 5] = c
			t += 6
	var st := SurfaceTool.new()
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_COLOR] = cols
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = idx
	var tmp := ArrayMesh.new()
	tmp.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	st.create_from(tmp, 0)
	st.generate_normals()
	return st.commit()

## Ponto do terreno sob o raio (para cliques): parte do plano y=0 e refina pela altura.
func ray_hit(from: Vector3, dir: Vector3) -> Variant:
	if absf(dir.y) < 1e-4:
		return null
	var y := 0.0
	var p := Vector3.ZERO
	for i in 6:
		var t := (y - from.y) / dir.y
		if t < 0.0:
			return null
		p = from + dir * t
		y = height(p.x, p.z)
	return Vector3(p.x, y, p.z)
