extends RefCounted
## Arte procedural no estilo "3D com traço de anime": cel shading, contorno, rosto pintado
## (olhos grandes com brilho), cabelo e roupa por classe, corpo articulado animado (rig.gd).
## A arte definitiva pode trocar estas malhas mantendo materiais e articulações.

const TOON := preload("res://shaders/toon.gdshader")
const OUTLINE := preload("res://shaders/outline.gdshader")
const GROUND := preload("res://shaders/ground.gdshader")
const WATER := preload("res://shaders/water.gdshader")
const Rig := preload("res://scripts/rig.gd")
const VrmChar := preload("res://scripts/vrm_character.gd")
const Gear := preload("res://scripts/gear.gd")

## Modelo, acessórios e cores extras por classe (personagens VRM).
const CLASS_VRM := {
	"breaker": ["boy", ["band", "pauldrons", "bracers", "boots", "belt"]],
	"bastion": ["boy", ["pauldrons", "chestplate", "bracers", "boots", "belt", "shield"]],
	"pikeman": ["boy", ["pauldrons", "scarf", "bracers", "boots", "belt"]],
	"warden": ["boy", ["quiver", "cape", "bracers", "boots", "belt", "scarf"]],
	"dawnshield": ["girl", ["circlet", "pauldrons", "cape", "skirt", "boots", "shield"]],
	"windwalker": ["girl", ["skirt", "bracers", "boots", "scarf", "small_shield"]],
	"veilsinger": ["girl", ["cape", "long_skirt", "boots", "circlet"]],
	"emberweaver": ["boy", ["hat", "bracers", "boots", "belt"]],
}

const SKIN := Color("#efc09c")
const DARK := Color("#2a1d24")

## Visual por classe: roupa, detalhe, cabelo, olhos, penteado, traje, acessório de cabeça, feminino.
const CLASS_LOOK := {
	"breaker":     {"outfit": Color("#b5562c"), "trim": Color("#d9a441"), "hair": Color("#4a2e22"), "eyes": Color("#c0702a"), "hairstyle": "spiky",    "garb": "coat",  "headgear": "band",   "fem": false},
	"bastion":     {"outfit": Color("#8a6a3a"), "trim": Color("#c98a3a"), "hair": Color("#d8c07a"), "eyes": Color("#5a7a3a"), "hairstyle": "short",    "garb": "armor", "headgear": "",       "fem": false},
	"pikeman":     {"outfit": Color("#5e5a52"), "trim": Color("#a8b0b8"), "hair": Color("#22252e"), "eyes": Color("#4a6aa8"), "hairstyle": "swept",    "garb": "coat",  "headgear": "scarf",  "fem": false},
	"warden":      {"outfit": Color("#4f6b35"), "trim": Color("#c9d6a0"), "hair": Color("#8a4a2a"), "eyes": Color("#3a8a5a"), "hairstyle": "short",    "garb": "tunic", "headgear": "hood",   "fem": false},
	"dawnshield":  {"outfit": Color("#e6dcc0"), "trim": Color("#e3b23c"), "hair": Color("#f2d06b"), "eyes": Color("#3a7ad0"), "hairstyle": "ponytail", "garb": "armor", "headgear": "circlet", "fem": true},
	"windwalker":  {"outfit": Color("#4f9ea3"), "trim": Color("#e8e2d6"), "hair": Color("#ecebf2"), "eyes": Color("#3ab0b0"), "hairstyle": "long",     "garb": "skirt", "headgear": "",       "fem": true},
	"veilsinger":  {"outfit": Color("#cdbde9"), "trim": Color("#ffffff"), "hair": Color("#5a3d78"), "eyes": Color("#9a5ad0"), "hairstyle": "long",     "garb": "robe",  "headgear": "veil",   "fem": true},
	"emberweaver": {"outfit": Color("#a8322a"), "trim": Color("#ffd27a"), "hair": Color("#f2a33a"), "eyes": Color("#e0482c"), "hairstyle": "spiky",    "garb": "robe",  "headgear": "hat",    "fem": false},
}
## Contorno do próprio personagem na cor da classe (docs/06: legibilidade com muitos monstros). Os outros
## jogadores, NPCs e monstros seguem com o contorno escuro.
const CLASS_OUTLINE := {
	"breaker": Color("#ff7b3a"), "bastion": Color("#e8b34e"), "pikeman": Color("#7fb2ff"), "warden": Color("#8fd65a"),
	"dawnshield": Color("#ffe27a"), "windwalker": Color("#5fe0d0"), "veilsinger": Color("#c9a2ff"), "emberweaver": Color("#ff4d5a"),
}
const NPC_HAIR := [Color("#3a2a22"), Color("#7a4a2a"), Color("#c9a060"), Color("#6a6a70"), Color("#2a2a3a")]
const NPC_STYLES := ["short", "swept", "long", "ponytail", "bald"]

static var _cache := {}

# ---------------- materiais ----------------
static func toon(color: Color, outline := true, emission := Color(0, 0, 0)) -> ShaderMaterial:
	var key = "%s|%s|%s" % [color.to_html(), outline, emission.to_html()]
	if _cache.has(key):
		return _cache[key]
	var m = ShaderMaterial.new()
	m.shader = TOON
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("emission", emission)
	if outline:
		var o = ShaderMaterial.new()
		o.shader = OUTLINE
		o.set_shader_parameter("thickness", 0.018)
		m.next_pass = o
	_cache[key] = m
	return m

static func ground(a: Color, b: Color) -> ShaderMaterial:
	var m = ShaderMaterial.new()
	m.shader = GROUND
	m.set_shader_parameter("color_a", a)
	m.set_shader_parameter("color_b", b)
	return m

static func water() -> ShaderMaterial:
	var m = ShaderMaterial.new()
	m.shader = WATER
	return m

# ---------------- primitivas ----------------
static func part(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, scale := Vector3.ONE, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi = MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.scale = scale
	mi.rotation_degrees = rot
	parent.add_child(mi)
	return mi

static func pivot(parent: Node3D, pos: Vector3, name := "") -> Node3D:
	var p = Node3D.new()
	if name != "":
		p.name = name
	p.position = pos
	parent.add_child(p)
	return p

static func sphere(r: float, segments := 16) -> SphereMesh:
	var s = SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	s.radial_segments = segments
	s.rings = maxi(4, segments / 2)
	return s

static func capsule(r: float, h: float) -> CapsuleMesh:
	var c = CapsuleMesh.new()
	c.radius = r
	c.height = maxf(h, r * 2.0)
	c.radial_segments = 12
	return c

static func cyl(top: float, bottom: float, h: float, seg := 12) -> CylinderMesh:
	var c = CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = h
	c.radial_segments = seg
	return c

static func box(size: Vector3) -> BoxMesh:
	var b = BoxMesh.new()
	b.size = size
	return b

## Segmento de membro: cilindro que vai do pivô para baixo (comprimento len).
static func limb(parent: Node3D, r_top: float, r_bot: float, length: float, mat: Material) -> void:
	part(parent, cyl(r_top, r_bot, length, 10), mat, Vector3(0, -length / 2.0, 0))
	part(parent, sphere(r_top, 10), mat, Vector3.ZERO)

# ---------------- rosto pintado ----------------
## Textura do rosto: olhos de anime (íris em degradê, pupila, dois brilhos, cílio superior),
## sobrancelhas, boca e bochechas. Uma por cor de olho e estilo.
static func face_texture(iris: Color, fem: bool, fierce := false) -> ImageTexture:
	var key = "face|%s|%s|%s" % [iris.to_html(), fem, fierce]
	if _cache.has(key):
		return _cache[key]
	var w = 256
	var h = 192
	var img = Image.create(w, h, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for side in [-1, 1]:
		var cx = 128 + side * 50
		var cy = 92
		var rx = 24.0
		var ry = 32.0 if fem else 28.0
		for y in range(cy - 46, cy + 40):
			for x in range(cx - 34, cx + 34):
				var dx = (x - cx) / rx
				var dy = (y - cy) / ry
				var d = dx * dx + dy * dy
				var c = Color(0, 0, 0, 0)
				if d <= 1.0:
					c = Color("#fbf8f4")
					var ix = (x - cx) / (rx * 0.82)
					var iy = (y - cy - 2) / (ry * 0.88)
					if ix * ix + iy * iy <= 1.0:
						var g = clampf((y - (cy - ry)) / (ry * 2.0), 0.0, 1.0)
						c = iris.darkened(0.55).lerp(iris.lightened(0.15), g)
						var px = (x - cx) / (rx * 0.36)
						var py = (y - cy) / (ry * 0.5)
						if px * px + py * py <= 1.0:
							c = DARK
				# cílio superior grosso (com "asa" no canto externo)
				var lash_y = cy - ry * sqrt(maxf(0.0, 1.0 - pow((x - cx) / (rx * 1.08), 2.0)))
				if absf(x - cx) <= rx * 1.08 and y >= lash_y - (6 if fem else 4) and y <= lash_y + 1:
					c = DARK
				if fem and (x - cx) * side > rx * 0.7 and (x - cx) * side < rx * 1.35 and y > lash_y - 9 and y < lash_y - 1 and (x - cx) * side > (cy - y) * 0.6:
					c = DARK
				if c.a > 0.0:
					img.set_pixel(x, y, c)
		# brilhos
		for hl in [[cx - 9, cy - 12, 8.0], [cx + 8, cy + 10, 4.0]]:
			for y in range(int(hl[1] - hl[2]), int(hl[1] + hl[2]) + 1):
				for x in range(int(hl[0] - hl[2]), int(hl[0] + hl[2]) + 1):
					if Vector2(x - hl[0], y - hl[1]).length() <= hl[2]:
						img.set_pixel(x, y, Color.WHITE)
		# sobrancelha
		for x in range(cx - 22, cx + 22):
			var t = float(x - cx) / 22.0 * side
			var by = cy - ry - 16 + (int(t * 6.0) if fierce else int(-t * t * 4.0))
			for k in 4:
				img.set_pixel(x, by + k, Color("#3a2620"))
		# bochechas
		for y in range(cy + 34, cy + 46):
			for x in range(cx - 18, cx + 18):
				if pow((x - cx) / 18.0, 2.0) + pow((y - cy - 40) / 6.0, 2.0) <= 1.0:
					img.set_pixel(x, y, Color(1.0, 0.55, 0.55, 0.45))
	# boca
	for x in range(118, 139):
		var my = 168 + int(pow((x - 128) / 10.0, 2.0) * -2.0)
		img.set_pixel(x, my, Color("#8a3a3a"))
		img.set_pixel(x, my + 1, Color("#8a3a3a"))
	var tex = ImageTexture.create_from_image(img)
	_cache[key] = tex
	return tex

static func face_material(iris: Color, fem: bool, fierce := false) -> StandardMaterial3D:
	var key = "facemat|%s|%s|%s" % [iris.to_html(), fem, fierce]
	if _cache.has(key):
		return _cache[key]
	var m = StandardMaterial3D.new()
	m.albedo_texture = face_texture(iris, fem, fierce)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
	m.alpha_scissor_threshold = 0.4
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
	_cache[key] = m
	return m

static func face_decal(head: Node3D, r: float, iris: Color, fem: bool, fierce := false, width := 1.62) -> void:
	var q = QuadMesh.new()
	q.size = Vector2(r * width, r * width * 0.75)
	part(head, q, face_material(iris, fem, fierce), Vector3(0, -r * 0.1, r * 0.9))

# ---------------- personagens ----------------
## Personagem articulado e animado. Retorna o nó raiz (com rig.gd); "Body" é o quadril.
## offhand: família do item da mão secundária ("shield", "light_shield", "quiver", "focus", "" = nada) ou
## "?" para usar o visual padrão da classe (vitrine, sonda, telas de personagem).
const TWO_HANDED := ["axe_2h", "spear_2h", "staff_2h", "sword_2h"]
const OFFHAND_ACC := {"shield": "shield", "light_shield": "small_shield", "quiver": "quiver"}

static func character(class_id: String, weapon_family := "", is_npc := false, npc_color := Color("#c9b07a"), seed := 0, offhand := "?") -> Node3D:
	if VrmChar.available():
		return vrm_character(class_id, weapon_family, is_npc, npc_color, seed, offhand)
	return proc_character(class_id, weapon_family, is_npc, npc_color, seed)

## Personagem de anime (modelo VRM) com cores e acessórios da classe.
static func vrm_character(class_id: String, weapon_family := "", is_npc := false, npc_color := Color("#c9b07a"), seed := 0, offhand := "?") -> Node3D:
	var look: Dictionary
	var model_id := "girl"
	var acc: Array = []
	if is_npc or not CLASS_LOOK.has(class_id):
		var rng := RandomNumberGenerator.new()
		rng.seed = seed
		model_id = "girl" if rng.randf() < 0.5 else "boy"
		var hair: Color = NPC_HAIR[rng.randi() % NPC_HAIR.size()]
		look = {"outfit": npc_color, "pants": npc_color.darkened(0.55), "boots": Color("#4a3428"), "hair": hair,
			"eyes": Color.from_hsv(rng.randf(), 0.5, 0.55), "trim": npc_color.darkened(0.3), "cape": npc_color.darkened(0.2), "scarf": npc_color.lightened(0.2)}
		# moradores de Várdia: botas, cinto e, às vezes, saia longa, cachecol ou capa
		acc = ["boots", "belt"]
		if model_id == "girl":
			acc.append("long_skirt" if rng.randf() < 0.6 else "skirt")
		if rng.randf() < 0.4:
			acc.append("scarf")
		if rng.randf() < 0.3:
			acc.append("cape")
	else:
		var l: Dictionary = CLASS_LOOK[class_id]
		model_id = CLASS_VRM[class_id][0]
		acc = (CLASS_VRM[class_id][1] as Array).duplicate()
		# escudo e aljava seguem o que está equipado (arma de duas mãos não deixa escudo)
		if offhand != "?":
			for a in ["shield", "small_shield", "quiver"]:
				acc.erase(a)
			if OFFHAND_ACC.has(offhand):
				acc.append(OFFHAND_ACC[offhand])
		if weapon_family in TWO_HANDED:
			acc.erase("shield")
			acc.erase("small_shield")
		var outfit: Color = l["outfit"]
		look = {"outfit": outfit, "pants": outfit.darkened(0.55), "boots": Color("#4a3428"), "hair": l["hair"], "eyes": l["eyes"],
			"trim": l["trim"], "cape": l["trim"] if class_id == "dawnshield" else outfit.darkened(0.25)}
		if class_id == "veilsinger":
			look["cape"] = Color("#f4f0ff")
	if class_id == "windwalker":
		look["scarf"] = Color("#e8e2d6")
	elif class_id == "warden":
		look["scarf"] = Color("#7a5a3a")
	elif class_id == "pikeman":
		look["scarf"] = Color("#8a2a2a")
	var c = VrmChar.new()
	c.setup(model_id, look, weapon_family, acc, Gear.weapon(weapon_family, look.get("trim", Gear.GOLD)) if weapon_family != "" else null)
	if is_npc:
		# moradores variam a pose parada: braços soltos, mãos juntas à frente ou para trás
		c.npc_variant = int(abs(seed)) % 3
	return c

## Personagem procedural (reserva, se os modelos VRM não estiverem disponíveis).
static func proc_character(class_id: String, weapon_family := "", is_npc := false, npc_color := Color("#c9b07a"), seed := 0) -> Node3D:
	var look: Dictionary = CLASS_LOOK.get(class_id, {})
	if look.is_empty() or is_npc:
		var rng = RandomNumberGenerator.new()
		rng.seed = seed
		look = {"outfit": npc_color, "trim": npc_color.darkened(0.35), "hair": NPC_HAIR[rng.randi() % NPC_HAIR.size()],
			"eyes": Color.from_hsv(rng.randf(), 0.5, 0.6), "hairstyle": NPC_STYLES[rng.randi() % NPC_STYLES.size()],
			"garb": ["coat", "tunic", "skirt"][rng.randi() % 3], "headgear": "", "fem": rng.randf() < 0.5}
	var outfit: Color = look["outfit"]
	var trim: Color = look["trim"]
	var hair: Color = look["hair"]
	var fem: bool = look["fem"]
	var root: Node3D = Rig.new()
	var hips = pivot(root, Vector3(0, 0.9, 0), "Body")
	root.body = hips
	var skin = toon(SKIN)
	var cloth = toon(outfit)
	var cloth_dark = toon(outfit.darkened(0.35))
	var pants = toon(outfit.darkened(0.55) if look["garb"] != "armor" else Color("#5a4a3e"))
	var boots = toon(Color("#4a3428"))
	# pernas articuladas
	for side in [-1, 1]:
		var hip = pivot(hips, Vector3(0.085 * side, -0.02, 0))
		limb(hip, 0.075, 0.062, 0.42, pants)
		var knee = pivot(hip, Vector3(0, -0.42, 0))
		limb(knee, 0.062, 0.05, 0.4, pants)
		part(knee, cyl(0.07, 0.065, 0.16, 10), boots, Vector3(0, -0.32, 0))
		part(knee, box(Vector3(0.1, 0.07, 0.2)), boots, Vector3(0, -0.43, 0.04))
		root.legs.append([hip, 0.0 if side < 0 else PI])
		root.knees.append([knee, 0.0 if side < 0 else PI])
	# tronco (cintura → peito) e pescoço
	var torso = pivot(hips, Vector3(0, 0.02, 0))
	part(torso, cyl(0.15, 0.13, 0.16, 14), cloth, Vector3(0, 0.08, 0))
	part(torso, cyl(0.16 if not fem else 0.14, 0.15, 0.24, 14), cloth, Vector3(0, 0.27, 0), Vector3(1.0, 1.0, 0.8))
	part(torso, cyl(0.155, 0.155, 0.05, 14), toon(trim, false), Vector3(0, 0.03, 0))
	part(torso, cyl(0.045, 0.05, 0.1, 8), skin, Vector3(0, 0.44, 0))
	match look["garb"]:
		"coat":
			for sx in [-0.07, 0.07]:
				part(torso, box(Vector3(0.12, 0.38, 0.03)), cloth_dark, Vector3(sx, -0.12, -0.11), Vector3.ONE, Vector3(-8, 0, 0))
			part(torso, box(Vector3(0.04, 0.24, 0.02)), toon(trim, false), Vector3(0, 0.27, 0.125))
		"armor":
			part(torso, sphere(0.17, 14), toon(trim.darkened(0.1)), Vector3(0, 0.3, 0.02), Vector3(1.0, 0.8, 0.75))
			part(torso, cyl(0.17, 0.2, 0.14, 14), toon(trim.darkened(0.25)), Vector3(0, -0.04, 0))
		"skirt":
			part(torso, cyl(0.15, 0.27, 0.32, 16), cloth_dark, Vector3(0, -0.12, 0))
		"robe":
			part(torso, cyl(0.15, 0.3, 0.78, 16), cloth, Vector3(0, -0.36, 0))
			part(torso, cyl(0.301, 0.301, 0.05, 16), toon(trim, false), Vector3(0, -0.73, 0))
		"tunic":
			part(torso, cyl(0.15, 0.2, 0.24, 14), cloth, Vector3(0, -0.08, 0))
	if class_id == "dawnshield" or class_id == "veilsinger":
		part(torso, box(Vector3(0.34, 0.7, 0.02)), toon(trim if class_id == "dawnshield" else Color("#e8e0f8")), Vector3(0, 0.02, -0.14), Vector3.ONE, Vector3(-10, 0, 0))
	# braços articulados
	for side in [-1, 1]:
		var shoulder = pivot(torso, Vector3(0.2 * side, 0.36, 0))
		part(shoulder, sphere(0.07, 10), cloth, Vector3.ZERO)
		if look["garb"] == "armor" or class_id in ["breaker", "pikeman"]:
			part(shoulder, sphere(0.09, 10), toon(trim), Vector3(0.02 * side, 0.03, 0), Vector3(1.1, 0.7, 1.1))
		limb(shoulder, 0.055, 0.048, 0.26, cloth)
		shoulder.rotation.z = 0.12 * side
		var elbow = pivot(shoulder, Vector3(0, -0.26, 0))
		limb(elbow, 0.046, 0.04, 0.24, skin if look["garb"] in ["tunic", "skirt"] else cloth_dark)
		var hand = pivot(elbow, Vector3(0, -0.26, 0))
		part(hand, sphere(0.05, 10), skin, Vector3.ZERO, Vector3(1.0, 1.15, 1.0))
		root.arms.append([shoulder, PI if side < 0 else 0.0])
		if side > 0:
			root.weapon_arm = shoulder
			root.weapon_elbow = elbow
			shoulder.rotation.x = -0.15
			shoulder.rotation.z = 0.32
			elbow.rotation.x = -0.7
			if weapon_family != "":
				var w = weapon(weapon_family)
				w.rotation.x = 1.35
				w.rotation.z = -0.25
				hand.add_child(w)
		elif class_id in ["bastion", "dawnshield", "windwalker"] and weapon_family in ["hammer_1h", "claw", "sword_1h", "javelin"]:
			var sh = Node3D.new()
			var sr = 0.2 if class_id != "windwalker" else 0.15
			part(sh, cyl(sr, sr, 0.05, 18), toon(trim.darkened(0.35)), Vector3.ZERO, Vector3.ONE, Vector3(90, 0, 0))
			part(sh, cyl(sr * 0.75, sr * 0.75, 0.055, 18), toon(outfit), Vector3(0, 0, 0.004), Vector3.ONE, Vector3(90, 0, 0))
			part(sh, sphere(0.05, 8), toon(trim), Vector3(0, 0, 0.04))
			sh.position = Vector3(0, -0.02, 0.06)
			hand.add_child(sh)
			elbow.rotation.x = -0.6
	# cabeça
	var head = pivot(torso, Vector3(0, 0.66, 0), "Head")
	root.head = head
	var r = 0.19
	part(head, sphere(r, 20), skin, Vector3.ZERO, Vector3(1.0, 1.04, 0.98))
	part(head, sphere(r * 0.62, 12), skin, Vector3(0, -r * 0.42, r * 0.28), Vector3(1.0, 0.8, 1.0)) # queixo fino
	face_decal(head, r, look["eyes"], fem)
	for sx in [-1, 1]:
		part(head, sphere(0.04, 8), skin, Vector3(r * 0.98 * sx, -0.01, 0), Vector3(0.5, 1.0, 0.8))
	_hair(head, r, hair, look["hairstyle"], fem)
	_headgear(head, r, look["headgear"], trim, outfit)
	return root

static func _hair(head: Node3D, r: float, color: Color, style: String, fem: bool) -> void:
	if style == "bald":
		return
	var m = toon(color)
	# calota: cobre topo e nuca
	part(head, sphere(r * 1.08, 18), m, Vector3(0, r * 0.12, -r * 0.1), Vector3(1.0, 0.95, 1.0))
	# franja em mechas pontudas sobre a testa
	var n = 5
	for i in n:
		var t = (float(i) / (n - 1)) * 2.0 - 1.0
		part(head, cyl(0.0, r * 0.26, r * 0.75, 6), m, Vector3(t * r * 0.62, r * 0.42, r * 0.78), Vector3(1.0, 1.0, 0.55), Vector3(180 - 25, 0, t * 25))
	# mechas laterais
	for sx in [-1, 1]:
		part(head, cyl(0.0, r * 0.22, r * (1.3 if fem else 0.8), 6), m, Vector3(sx * r * 0.88, -r * 0.1, r * 0.25), Vector3(0.7, 1.0, 0.6), Vector3(180, 0, -sx * 6))
	match style:
		"spiky":
			for i in 7:
				var a = -1.2 + i * 0.4
				part(head, cyl(0.0, r * 0.3, r * 0.95, 6), m, Vector3(sin(a) * r * 0.75, r * 0.85, -cos(a) * r * 0.35 - r * 0.15), Vector3.ONE, Vector3(-35 - absf(a) * 10, 0, -a * 40))
		"short":
			for i in 4:
				var a = -0.9 + i * 0.6
				part(head, cyl(0.0, r * 0.25, r * 0.6, 6), m, Vector3(sin(a) * r * 0.6, r * 0.85, -r * 0.2), Vector3.ONE, Vector3(-25, 0, -a * 30))
		"swept":
			for i in 5:
				var a = -1.0 + i * 0.5
				part(head, cyl(0.0, r * 0.28, r * 1.0, 6), m, Vector3(sin(a) * r * 0.55, r * 0.6, -r * 0.65), Vector3(1.0, 1.0, 0.7), Vector3(-110, 0, -a * 20))
		"ponytail":
			part(head, sphere(r * 0.22, 8), toon(Color("#e3b23c")), Vector3(0, r * 0.55, -r * 0.95))
			var tail = pivot(head, Vector3(0, r * 0.5, -r * 1.05))
			part(tail, cyl(r * 0.3, 0.0, r * 3.2, 8), m, Vector3(0, -r * 1.5, -r * 0.35), Vector3(1.0, 1.0, 0.8), Vector3(15, 0, 0))
		"long":
			part(head, cyl(r * 0.95, r * 0.55, r * 3.0, 12), m, Vector3(0, -r * 1.25, -r * 0.35), Vector3(1.0, 1.0, 0.55), Vector3(8, 0, 0))
			for sx in [-1, 1]:
				part(head, cyl(r * 0.22, 0.0, r * 2.4, 6), m, Vector3(sx * r * 0.8, -r * 1.1, r * 0.2), Vector3(0.8, 1.0, 0.6))

static func _headgear(head: Node3D, r: float, kind: String, trim: Color, outfit: Color) -> void:
	match kind:
		"band":
			part(head, cyl(r * 1.1, r * 1.12, r * 0.22, 18), toon(Color("#c03a2a")), Vector3(0, r * 0.38, -r * 0.05), Vector3(1.0, 1.0, 1.0), Vector3(-8, 0, 0))
		"circlet":
			part(head, cyl(r * 1.1, r * 1.11, r * 0.08, 18), toon(trim, true, trim * 0.3), Vector3(0, r * 0.45, 0), Vector3.ONE, Vector3(-12, 0, 0))
			part(head, sphere(r * 0.12, 8), toon(Color("#5ab0ff"), false, Color(0.2, 0.5, 0.9)), Vector3(0, r * 0.47, r * 1.06))
		"hood":
			part(head, sphere(r * 1.25, 16), toon(outfit.darkened(0.15)), Vector3(0, r * 0.22, -r * 0.42), Vector3(1.05, 1.0, 1.0))
			part(head, cyl(0.0, r * 0.45, r * 1.0, 8), toon(outfit.darkened(0.15)), Vector3(0, r * 0.3, -r * 1.55), Vector3.ONE, Vector3(-70, 0, 0))
		"hat":
			part(head, cyl(r * 1.9, r * 1.9, r * 0.12, 20), toon(outfit.darkened(0.3)), Vector3(0, r * 0.7, 0))
			part(head, cyl(0.0, r * 1.05, r * 3.0, 14), toon(outfit.darkened(0.3)), Vector3(0, r * 2.15, -r * 0.35), Vector3.ONE, Vector3(-14, 0, 0))
			part(head, cyl(r * 1.07, r * 1.07, r * 0.25, 14), toon(trim), Vector3(0, r * 0.85, 0))
		"veil":
			part(head, cyl(r * 1.0, r * 1.5, r * 2.6, 16), toon(Color("#f4f0ff")), Vector3(0, -r * 0.4, -r * 0.45), Vector3(1.0, 1.0, 0.7), Vector3(6, 0, 0))
			part(head, cyl(r * 1.1, r * 1.1, r * 0.1, 16), toon(trim), Vector3(0, r * 0.62, -r * 0.05))
		"scarf":
			pass

## Arma por família (versão detalhada em gear.gd). Origem no punho; +Y aponta para a ponta.
static func weapon(family: String) -> Node3D:
	return Gear.weapon(family)

static func weapon_simple(family: String) -> Node3D:
	var w = Node3D.new()
	var wood = toon(Color("#6b4a2e"))
	var metal = toon(Color("#c9ced4"))
	var glow = toon(Color("#ffb347"), false, Color(1.0, 0.55, 0.15))
	match family:
		"axe_1h", "axe_2h":
			var big = 1.35 if family == "axe_2h" else 1.0
			part(w, cyl(0.025, 0.03, 0.75 * big), wood, Vector3(0, 0.22 * big, 0))
			part(w, box(Vector3(0.04, 0.2, 0.2) * big), metal, Vector3(0, 0.52 * big, 0.11 * big))
			part(w, cyl(0.0, 0.11 * big, 0.04 * big, 3), metal, Vector3(0, 0.52 * big, 0.21 * big), Vector3(1.0, 1.0, 1.6), Vector3(90, 0, 0))
		"hammer_1h":
			part(w, cyl(0.025, 0.03, 0.62), wood, Vector3(0, 0.18, 0))
			part(w, box(Vector3(0.14, 0.14, 0.28)), metal, Vector3(0, 0.5, 0))
		"claw":
			part(w, box(Vector3(0.12, 0.1, 0.12)), metal, Vector3(0, 0.02, 0))
			for i in 3:
				part(w, cyl(0.0, 0.02, 0.28, 4), metal, Vector3(-0.04 + i * 0.04, 0.18, 0.05), Vector3.ONE, Vector3(18, 0, 0))
		"spear_2h":
			part(w, cyl(0.022, 0.022, 1.9), wood, Vector3(0, 0.45, 0))
			part(w, cyl(0.0, 0.055, 0.3, 4), metal, Vector3(0, 1.55, 0))
		"bow":
			for k in [-1, 1]:
				part(w, cyl(0.012, 0.02, 0.5, 6), wood, Vector3(0, k * 0.24, 0.08), Vector3.ONE, Vector3(k * 20, 0, 0))
			part(w, cyl(0.003, 0.003, 0.9, 4), toon(Color("#e8e0d0"), false), Vector3(0, 0, -0.02))
		"sword_1h", "sword_2h":
			var big = 1.3 if family == "sword_2h" else 1.0
			part(w, cyl(0.02, 0.022, 0.18), wood, Vector3(0, 0.0, 0))
			part(w, box(Vector3(0.2, 0.035, 0.05)), toon(Color("#e3b23c")), Vector3(0, 0.1, 0))
			part(w, box(Vector3(0.055, 0.72 * big, 0.015)), metal, Vector3(0, 0.1 + 0.36 * big, 0))
		"javelin":
			part(w, cyl(0.016, 0.016, 1.15), wood, Vector3(0, 0.3, 0))
			part(w, cyl(0.0, 0.04, 0.2, 4), metal, Vector3(0, 0.98, 0))
		"wand", "scepter":
			part(w, cyl(0.016, 0.022, 0.42), wood, Vector3(0, 0.12, 0))
			part(w, sphere(0.05, 10), glow, Vector3(0, 0.36, 0))
			if family == "scepter":
				part(w, cyl(0.07, 0.07, 0.02, 12), toon(Color("#e3b23c")), Vector3(0, 0.33, 0))
		"staff_2h":
			part(w, cyl(0.025, 0.03, 1.6), wood, Vector3(0, 0.4, 0))
			var ring = TorusMesh.new()
			ring.inner_radius = 0.07
			ring.outer_radius = 0.1
			part(w, ring, toon(Color("#e3b23c")), Vector3(0, 1.25, 0), Vector3.ONE, Vector3(90, 0, 0))
			part(w, sphere(0.08, 10), glow, Vector3(0, 1.25, 0))
	return w

# ---------------- monstros ----------------
const FAMILY_COLORS := {"beast": Color("#8a6248"), "machine": Color("#7a8790"), "spirit": Color("#9fd3e8")}
const MONSTER_COLORS := {
	"furrow_rat": Color("#9a8a80"), "ember_beetle": Color("#c8522a"), "rust_hound": Color("#a8622e"),
	"ballast_lizard": Color("#6a7a4a"), "ash_boar": Color("#5a4a44"), "pump_toad": Color("#6a8a4a"),
	"silt_eel": Color("#4a5a50"), "rust_heron": Color("#8a7a6a"), "boiling_leech": Color("#8a3a4a"),
	"gear_rat": Color("#8a9098"), "echo_bat": Color("#5a4a6a"), "thermal_larva": Color("#e8b06a"),
	"conduit_spider": Color("#3a3a4a"),
	# A Cava Primeira (pós-v1): famílias existentes, só cores novas
	"cistern_salamander": Color("#c8623a"), "bronze_bellringer": Color("#b0823a"), "buried_voice": Color("#c8a8e8"),
	"basalt_mole": Color("#45403f"), "deep_sealer": Color("#5f8a84"),
	# prova de classe
	"trial_sentinel": Color("#6a6f80"), "trial_archer": Color("#8a7a5a"), "trial_runner": Color("#5a7a8a"), "trial_spark": Color("#ff8a3a"),
}

## Monstro por espécie (rato, besouro, cão, lagarto, javali) ou por família, com olhos
## pintados e patas animadas.
## Carroça de abastecimento da escolta (capítulo 4): caixa de madeira sobre quatro rodas, um tanque de
## cobre com chaminé e lanternas âmbar. +Z = frente.
static func cart() -> Node3D:
	var root := Node3D.new()
	var wood := toon(Color("#7a5232"))
	var dark := toon(Color("#4a3020"))
	var copper := toon(Color("#b8743a"))
	part(root, box(Vector3(1.4, 0.5, 2.4)), wood, Vector3(0, 0.75, 0))
	part(root, box(Vector3(1.5, 0.12, 2.5)), dark, Vector3(0, 0.5, 0))
	for sx in [-1.0, 1.0]:
		for sz in [-0.85, 0.85]:
			part(root, cyl(0.38, 0.38, 0.12, 14), dark, Vector3(sx * 0.78, 0.38, sz), Vector3.ONE, Vector3(0, 0, 90))
			part(root, cyl(0.1, 0.1, 0.16, 8), copper, Vector3(sx * 0.8, 0.38, sz), Vector3.ONE, Vector3(0, 0, 90))
	part(root, cyl(0.42, 0.42, 1.3, 14), copper, Vector3(0, 1.32, -0.2), Vector3.ONE, Vector3(90, 0, 0))
	part(root, cyl(0.1, 0.12, 0.7, 8), dark, Vector3(0, 1.9, -0.6))
	part(root, box(Vector3(0.1, 0.08, 1.4)), dark, Vector3(0.35, 0.9, 1.75))
	part(root, box(Vector3(0.1, 0.08, 1.4)), dark, Vector3(-0.35, 0.9, 1.75))
	for sx in [-0.7, 0.7]:
		part(root, sphere(0.09), toon(Color("#ffb347"), false, Color(1.0, 0.55, 0.15)), Vector3(sx, 1.15, 1.2))
	return root

static func monster(def: Dictionary) -> Node3D:
	# peças paradas da prova de classe (pilar, boneco, alvo, sino) têm modelo próprio, sem esqueleto
	var model: String = def.get("model", "")
	var piece := trial_piece(model)
	if piece != null:
		return piece
	var root: Node3D = Rig.new()
	root.step_speed = 12.0
	root.stride = 0.55
	var body = pivot(root, Vector3.ZERO, "Body")
	root.body = body
	var id: String = def.get("id", "")
	var fam: String = def.get("family", "beast")
	var rank: String = def.get("rank", "normal")
	var s = 0.85 + float(def.get("level", 1)) * 0.03 + (0.55 if rank == "elite" else 0.0) + (1.2 if rank == "boss" else 0.0)
	var col: Color = MONSTER_COLORS.get(id, FAMILY_COLORS.get(fam, Color.GRAY))
	var fierce: bool = def.get("aggro", "passive") == "aggressive"
	root.cycle_len = (1.6 if fam == "machine" else 1.15) * s
	if fam == "machine":
		_robot(root, body, s, col, rank)
		if model == "archer" and root.weapon_arm != null:
			# atirador: besta de ferro presa ao braço
			var metal = toon(Color("#3a3f46"))
			part(root.weapon_arm, cyl(0.05 * s, 0.06 * s, 0.75 * s, 8), metal, Vector3(0, -0.5 * s, 0.22 * s), Vector3.ONE, Vector3(80, 0, 0))
			part(root.weapon_arm, box(Vector3(0.7, 0.04, 0.06) * s), metal, Vector3(0, -0.46 * s, 0.34 * s))
		elif model == "runner":
			# perseguidor: barbatanas de vento nas costas
			for sx in [-1, 1]:
				part(body, box(Vector3(0.04, 0.32, 0.55) * s), toon(col.darkened(0.3)), Vector3(sx * 0.3 * s, 1.15 * s, -0.25 * s), Vector3.ONE, Vector3(25, sx * 12, 0))
	elif fam == "spirit":
		_spirit(root, body, s, col)
	elif id == "ember_beetle":
		_beetle(root, body, s, col)
	else:
		_quadruped(root, body, s, col, id, fierce)
	if rank == "elite" or rank == "boss":
		var crown = pivot(body, Vector3(0, 1.25 * s, 0))
		for i in 5:
			var a = float(i) / 5.0 * TAU
			part(crown, cyl(0.0, 0.07 * s, 0.28 * s, 5), toon(Color("#e3a548"), true, Color(0.4, 0.25, 0.05)), Vector3(cos(a) * 0.22 * s, 0, sin(a) * 0.22 * s))
	return root

static func _quadruped(root: Node3D, body: Node3D, s: float, col: Color, id: String, fierce: bool) -> void:
	var m = toon(col)
	var belly = toon(col.lightened(0.25))
	var long = id in ["ballast_lizard", "silt_eel"]
	var big = id in ["ash_boar"]
	var leg_h = 0.28 * s if not long else 0.14 * s
	var bl = (0.55 if not long else 0.8) * s
	var bh = leg_h + 0.22 * s
	part(body, sphere(0.3 * s, 16), m, Vector3(0, bh, 0), Vector3(1.0 if not big else 1.25, 0.85 if not long else 0.6, bl / (0.3 * s) * 0.5))
	part(body, sphere(0.22 * s, 12), belly, Vector3(0, bh - 0.08 * s, 0.05 * s), Vector3(1.0, 0.6, 1.3))
	# cabeça
	var head = pivot(body, Vector3(0, bh + 0.12 * s, bl * 0.55), "Head")
	root.head = head
	var hr = 0.2 * s
	part(head, sphere(hr, 14), m, Vector3.ZERO, Vector3(1.0, 0.9, 1.0))
	part(head, cyl(hr * 0.35, hr * 0.7, hr * 0.9, 10), m, Vector3(0, -hr * 0.15, hr * 0.85), Vector3.ONE, Vector3(90, 0, 0))
	part(head, sphere(hr * 0.2, 8), toon(Color("#3a2a2a")), Vector3(0, -hr * 0.1, hr * 1.32))
	face_decal(head, hr, Color("#e8c040") if fierce else Color("#4a3a30"), false, fierce, 1.6)
	match id:
		"furrow_rat", "gear_rat":
			for sx in [-1, 1]:
				part(head, sphere(hr * 0.5, 10), m, Vector3(sx * hr * 0.75, hr * 0.85, -hr * 0.1), Vector3(1.0, 1.0, 0.35))
				part(head, sphere(hr * 0.33, 10), toon(Color("#e8a0a0"), false), Vector3(sx * hr * 0.75, hr * 0.85, -hr * 0.02), Vector3(1.0, 1.0, 0.3))
		"rust_hound":
			for sx in [-1, 1]:
				part(head, cyl(0.0, hr * 0.35, hr * 0.8, 4), m, Vector3(sx * hr * 0.55, hr * 0.85, -hr * 0.1), Vector3.ONE, Vector3(-10, 0, -sx * 15))
			for i in 3:
				part(body, box(Vector3(0.08, 0.1, 0.12) * s), toon(Color("#c8783a")), Vector3(0, bh + 0.24 * s, -0.1 * s + i * 0.12 * s))
		"ash_boar":
			for sx in [-1, 1]:
				part(head, cyl(0.0, hr * 0.12, hr * 0.7, 6), toon(Color("#f0e8d8")), Vector3(sx * hr * 0.35, -hr * 0.35, hr * 1.1), Vector3.ONE, Vector3(-60, 0, sx * 20))
			for i in 5:
				part(body, cyl(0.0, 0.05 * s, 0.22 * s, 4), toon(Color("#2a2420")), Vector3(0, bh + 0.27 * s, -0.25 * s + i * 0.12 * s), Vector3.ONE, Vector3(-20, 0, 0))
		"ballast_lizard":
			for i in 4:
				part(body, cyl(0.0, 0.05 * s, 0.12 * s, 4), toon(col.darkened(0.3)), Vector3(0, bh + 0.17 * s, -0.3 * s + i * 0.18 * s))
	# rabo
	var tail = pivot(body, Vector3(0, bh, -bl * 0.5))
	root.tail = tail
	var tl = (0.45 if id in ["furrow_rat", "gear_rat"] else 0.3) * s
	if long:
		tl = 0.7 * s
	part(tail, cyl(0.0, 0.06 * s if not long else 0.12 * s, tl, 6), toon(col.darkened(0.15) if id != "furrow_rat" else Color("#e8a0a0")), Vector3(0, -0.02 * s, -tl / 2.0), Vector3.ONE, Vector3(-80, 0, 0))
	# patas
	var k = 0
	for z in [0.3, -0.3]:
		for sx in [-1, 1]:
			var leg = pivot(body, Vector3(sx * 0.17 * s * (1.4 if long else 1.0), leg_h, z * bl))
			limb(leg, 0.06 * s, 0.045 * s, leg_h, toon(col.darkened(0.25)))
			part(leg, sphere(0.055 * s, 8), toon(col.darkened(0.4)), Vector3(0, -leg_h, 0.03 * s), Vector3(1.0, 0.6, 1.3))
			root.legs.append([leg, 0.0 if (k == 0 or k == 3) else PI])
			k += 1

static func _beetle(root: Node3D, body: Node3D, s: float, col: Color) -> void:
	var shell = toon(col, true, col * 0.15)
	part(body, sphere(0.35 * s, 16), shell, Vector3(0, 0.32 * s, 0), Vector3(1.0, 0.7, 1.25))
	part(body, box(Vector3(0.015, 0.2, 0.8) * s), toon(Color("#3a1a10"), false), Vector3(0, 0.56 * s, 0))
	for sx in [-1, 1]:
		part(body, sphere(0.06 * s, 8), toon(Color("#ffd06a"), false, Color(0.9, 0.6, 0.1)), Vector3(sx * 0.18 * s, 0.45 * s, -0.1 * s))
	var head = pivot(body, Vector3(0, 0.28 * s, 0.42 * s), "Head")
	root.head = head
	part(head, sphere(0.15 * s, 12), toon(Color("#3a2420")), Vector3.ZERO)
	face_decal(head, 0.15 * s, Color("#ffcf4a"), false, false, 1.5)
	for sx in [-1, 1]:
		part(head, cyl(0.005, 0.01, 0.3 * s, 4), toon(Color("#2a1a14"), false), Vector3(sx * 0.07 * s, 0.17 * s, 0.1 * s), Vector3.ONE, Vector3(40, 0, -sx * 25))
	var k = 0
	for z in [0.22, 0.0, -0.22]:
		for sx in [-1, 1]:
			var leg = pivot(body, Vector3(sx * 0.3 * s, 0.22 * s, z * s))
			leg.rotation.z = sx * 0.8
			limb(leg, 0.025 * s, 0.015 * s, 0.26 * s, toon(Color("#2a1a14")))
			root.legs.append([leg, 0.0 if k % 2 == 0 else PI])
			k += 1

static func _robot(root: Node3D, body: Node3D, s: float, col: Color, rank: String) -> void:
	var plate = toon(col)
	var dark = toon(col.darkened(0.45))
	var rust = toon(Color("#b5562c"))
	var hip_h = 0.5 * s
	for sx in [-1, 1]:
		var leg = pivot(body, Vector3(sx * 0.18 * s, hip_h, 0))
		limb(leg, 0.07 * s, 0.06 * s, hip_h * 0.95, dark)
		part(leg, box(Vector3(0.16, 0.08, 0.24) * s), plate, Vector3(0, -hip_h, 0.04 * s))
		root.legs.append([leg, 0.0 if sx < 0 else PI])
	var torso = pivot(body, Vector3(0, hip_h, 0))
	part(torso, box(Vector3(0.62, 0.55, 0.42) * s), plate, Vector3(0, 0.32 * s, 0))
	part(torso, box(Vector3(0.5, 0.12, 0.44) * s), rust, Vector3(0, 0.46 * s, 0))
	part(torso, cyl(0.1 * s, 0.1 * s, 0.08 * s, 10), toon(Color("#ffcf4a"), false, Color(1.0, 0.55, 0.1)), Vector3(0, 0.25 * s, 0.22 * s), Vector3.ONE, Vector3(90, 0, 0))
	var head = pivot(torso, Vector3(0, 0.7 * s, 0.02 * s), "Head")
	root.head = head
	part(head, box(Vector3(0.36, 0.26, 0.32) * s), plate, Vector3.ZERO)
	part(head, box(Vector3(0.3, 0.07, 0.02) * s), toon(Color("#ff5a2a"), false, Color(1.0, 0.3, 0.1)), Vector3(0, 0.02 * s, 0.17 * s))
	part(head, cyl(0.008 * s, 0.008 * s, 0.25 * s, 4), dark, Vector3(0.12 * s, 0.25 * s, 0))
	part(head, sphere(0.03 * s, 6), toon(Color("#ff5a2a"), false, Color(1.0, 0.3, 0.1)), Vector3(0.12 * s, 0.38 * s, 0))
	for sx in [-1, 1]:
		var sh = pivot(torso, Vector3(sx * 0.38 * s, 0.5 * s, 0))
		part(sh, sphere(0.1 * s, 10), rust, Vector3.ZERO)
		limb(sh, 0.06 * s, 0.055 * s, 0.38 * s, dark)
		for f in [-1, 1]:
			part(sh, box(Vector3(0.04, 0.16, 0.06) * s), plate, Vector3(f * 0.04 * s, -0.45 * s, 0.03 * s), Vector3.ONE, Vector3(0, 0, f * 15))
		root.arms.append([sh, PI if sx < 0 else 0.0])
		if sx > 0:
			root.weapon_arm = sh

static func _spirit(root: Node3D, body: Node3D, s: float, col: Color) -> void:
	var m = toon(col, true, col * 0.35)
	part(body, sphere(0.42 * s, 18), m, Vector3(0, 1.0 * s, 0))
	part(body, cyl(0.38 * s, 0.05 * s, 0.7 * s, 14), m, Vector3(0, 0.45 * s, 0))
	for i in 4:
		var a = float(i) / 4.0 * TAU
		part(body, cyl(0.0, 0.08 * s, 0.4 * s, 6), m, Vector3(cos(a) * 0.3 * s, 0.4 * s, sin(a) * 0.3 * s), Vector3.ONE, Vector3(180, 0, 0))
	var head = pivot(body, Vector3(0, 1.0 * s, 0), "Head")
	root.head = head
	face_decal(head, 0.42 * s, Color("#ffffff"), false, true, 1.1)

# ---------------- contorno na cor da classe ----------------
static var _tinted := {}

## Troca o contorno escuro (casca invertida, OUTLINE) de todas as malhas do nó por um na cor dada e um pouco
## mais grosso. Os materiais são compartilhados entre personagens: cada material ganha uma cópia própria,
## guardada por cor, então só este nó (o personagem do jogador) muda.
static func tint_outline(root: Node, color: Color, thickness_mult := 1.7) -> void:
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var m := mi as MeshInstance3D
		if m.material_override != null:
			m.material_override = _tinted_mat(m.material_override, color, thickness_mult)
		if m.mesh == null:
			continue
		for i in m.mesh.get_surface_count():
			var src: Material = m.get_surface_override_material(i)
			if src != null:
				m.set_surface_override_material(i, _tinted_mat(src, color, thickness_mult))

static func _tinted_mat(src: Material, color: Color, mult: float) -> Material:
	if not (src is ShaderMaterial):
		return src
	var o = (src as ShaderMaterial).next_pass
	if not (o is ShaderMaterial) or (o as ShaderMaterial).shader == null or not String((o as ShaderMaterial).shader.resource_path).ends_with("outline.gdshader"):
		return src
	var key := "%d|%s" % [src.get_instance_id(), color.to_html()]
	if _tinted.has(key):
		return _tinted[key]
	var m2 := (src as ShaderMaterial).duplicate() as ShaderMaterial
	var o2 := (o as ShaderMaterial).duplicate() as ShaderMaterial
	o2.set_shader_parameter("outline_color", color)
	var t = o2.get_shader_parameter("thickness")
	o2.set_shader_parameter("thickness", (float(t) if t != null else 0.025) * mult)
	m2.next_pass = o2
	_tinted[key] = m2
	return m2

# ---------------- prova de classe: peças e aliados ----------------
## Peça parada da prova (data/monsters.json "model"): pilar blindado, boneco de treino, alvo móvel, sino.
## Partes que mudam com o estado ficam em metadados: "armor"/"cracks" (pilar) e "glow" (sino aceso).
static func trial_piece(model: String) -> Node3D:
	match model:
		"pillar":
			return _trial_pillar()
		"dummy":
			return _trial_dummy()
		"target":
			return _trial_target()
		"bell":
			return _trial_bell()
	return null

static func _trial_pillar() -> Node3D:
	var root := Node3D.new()
	var stone := toon(Color("#8d8378"))
	var dark := toon(Color("#5e564e"))
	part(root, box(Vector3(1.7, 0.3, 1.7)), dark, Vector3(0, 0.15, 0))
	part(root, cyl(0.52, 0.58, 3.4, 12), stone, Vector3(0, 2.0, 0))
	part(root, box(Vector3(1.5, 0.4, 1.5)), dark, Vector3(0, 3.85, 0))
	# blindagem: placas de ferro rebitadas e duas cintas (somem quando a Ruptura racha)
	var armor := Node3D.new()
	armor.name = "Armor"
	root.add_child(armor)
	var iron := toon(Color("#5d636c"))
	var rivet := toon(Color("#a9b0b8"))
	for i in 4:
		var a := i * PI / 2.0 + PI / 4.0
		var pl := part(armor, box(Vector3(0.42, 2.5, 0.12)), iron, Vector3(sin(a) * 0.58, 1.95, cos(a) * 0.58), Vector3.ONE, Vector3(0, rad_to_deg(a), 0))
		for k in 2:
			part(pl, sphere(0.05, 6), rivet, Vector3(-0.12 + k * 0.24, 0.95, 0.07))
			part(pl, sphere(0.05, 6), rivet, Vector3(-0.12 + k * 0.24, -0.95, 0.07))
	for y in [1.05, 2.85]:
		part(armor, cyl(0.66, 0.66, 0.16, 16), iron, Vector3(0, y, 0))
	# rachaduras incandescentes (aparecem com a blindagem rachada)
	var cracks := Node3D.new()
	cracks.name = "Cracks"
	cracks.visible = false
	root.add_child(cracks)
	var hot := toon(Color("#ffb04a"), false, Color(1.0, 0.45, 0.1))
	for i in 5:
		var a := i * TAU / 5.0 + 0.3
		var y := 1.0 + float(i % 3) * 0.8
		part(cracks, box(Vector3(0.06, 0.9, 0.04)), hot, Vector3(sin(a) * 0.56, y, cos(a) * 0.56), Vector3.ONE, Vector3(0, rad_to_deg(a), 18 if i % 2 == 0 else -22))
	root.set_meta("armor", armor)
	root.set_meta("cracks", cracks)
	return root

static func _trial_dummy() -> Node3D:
	var root := Node3D.new()
	var wood := toon(Color("#7a5232"))
	var straw := toon(Color("#d8b45a"))
	var burlap := toon(Color("#c9a66b"))
	var strap := toon(Color("#5a3a26"))
	for k in [0.0, 90.0]:
		part(root, box(Vector3(1.0, 0.12, 0.16)), wood, Vector3(0, 0.06, 0), Vector3.ONE, Vector3(0, k, 0))
	part(root, cyl(0.07, 0.08, 1.9, 8), wood, Vector3(0, 0.95, 0))
	part(root, capsule(0.3, 1.0), straw, Vector3(0, 1.25, 0), Vector3(1.0, 1.0, 0.8))
	part(root, cyl(0.06, 0.06, 1.2, 8), wood, Vector3(0, 1.5, 0), Vector3.ONE, Vector3(0, 0, 90))
	for sx in [-0.62, 0.62]:
		part(root, sphere(0.1, 8), straw, Vector3(sx, 1.5, 0))
	for y in [1.0, 1.4]:
		part(root, cyl(0.31, 0.31, 0.06, 12), strap, Vector3(0, y, 0), Vector3(1.0, 1.0, 0.8))
	part(root, sphere(0.22, 10), burlap, Vector3(0, 1.92, 0))
	# olhos de pano costurados em X
	for sx in [-0.08, 0.08]:
		for r in [45.0, -45.0]:
			part(root, box(Vector3(0.09, 0.02, 0.02)), strap, Vector3(sx, 1.96, 0.21), Vector3.ONE, Vector3(0, 0, r))
	return root

static func _trial_target() -> Node3D:
	var root := Node3D.new()
	var wood := toon(Color("#6e4a2c"))
	part(root, box(Vector3(1.1, 0.22, 0.7)), wood, Vector3(0, 0.25, 0))
	for sx in [-0.42, 0.42]:
		for sz in [-0.3, 0.3]:
			part(root, cyl(0.14, 0.14, 0.08, 10), toon(Color("#3a2a20")), Vector3(sx, 0.14, sz), Vector3.ONE, Vector3(90, 0, 0))
	part(root, cyl(0.05, 0.05, 1.0, 6), wood, Vector3(0, 0.85, 0))
	# disco pintado (anéis concêntricos dos dois lados), de lado para o trilho: encara quem atira
	var disc := pivot(root, Vector3(0, 1.45, 0))
	disc.rotation_degrees = Vector3(0, 0, 90)
	var rings := [[0.6, Color("#f2ead8")], [0.46, Color("#c0392b")], [0.32, Color("#f2ead8")], [0.17, Color("#c0392b")]]
	for i in rings.size():
		part(disc, cyl(rings[i][0], rings[i][0], 0.06 + i * 0.012, 20), toon(rings[i][1], i == 0), Vector3.ZERO)
	return root

static func _trial_bell() -> Node3D:
	var root := Node3D.new()
	var wood := toon(Color("#6b4a2e"))
	var bronze := toon(Color("#b8803a"))
	part(root, box(Vector3(0.9, 0.12, 0.9)), toon(Color("#4a3a2c")), Vector3(0, 0.06, 0))
	part(root, cyl(0.08, 0.1, 2.5, 8), wood, Vector3(0, 1.25, 0))
	part(root, box(Vector3(1.2, 0.12, 0.14)), wood, Vector3(0.35, 2.45, 0))
	part(root, cyl(0.16, 0.42, 0.6, 14), bronze, Vector3(0.75, 1.98, 0))
	part(root, cyl(0.43, 0.43, 0.05, 14), toon(Color("#8a5a28")), Vector3(0.75, 1.68, 0))
	part(root, sphere(0.08, 8), toon(Color("#3a2a20")), Vector3(0.75, 1.62, 0))
	# sino aceso (o da vez): chama âmbar no alto do poste e um halo
	var glow := Node3D.new()
	glow.name = "Glow"
	root.add_child(glow)
	part(glow, sphere(0.16, 10), toon(Color("#ffcf6a"), false, Color(1.0, 0.65, 0.2)), Vector3(0, 2.75, 0))
	var halo := TorusMesh.new()
	halo.inner_radius = 0.5
	halo.outer_radius = 0.58
	part(glow, halo, toon(Color("#ffcf6a"), false, Color(1.0, 0.7, 0.25)), Vector3(0.75, 1.98, 0), Vector3(1, 0.4, 1))
	root.set_meta("glow", glow)
	return root

## Aliado da prova (aprendiz, peregrina): morador com roupa e acessório próprios — o aprendiz com uma
## varinha de estudo, a peregrina de capa parda com o cajado de caminhada.
static func trial_ally(model: String, seed: int) -> Node3D:
	if model == "pilgrim":
		return character("", "staff_2h", true, Color("#a8865a"), seed)
	return character("", "wand", true, Color("#4f8f86"), seed)

# ---------------- objetos de missão ----------------
## Modelo de um objeto de missão (data/maps.json "objects"): pelo kind (quadro, carroça, defesa) ou pelo
## prefixo do id (marcos, páginas, fusíveis, medidores, válvulas, selos, tubos de voz, a máquina do posto,
## pessoas a resgatar). A base fica no chão (y = 0); o losango que indica "dá para usar" é do world.gd.
static func quest_object(o: Dictionary) -> Node3D:
	var id: String = o.get("id", "")
	match o.get("kind", ""):
		"board":
			return _obj_board()
		"escort":
			return cart()
		"defense":
			return _obj_valve(true)
	if id.begins_with("rescue_"):
		return _obj_person(id)
	if id.begins_with("marker_"):
		return _obj_marker()
	if id.begins_with("page_"):
		return _obj_pages()
	if id.begins_with("fuse_box"):
		return _obj_fuse_box()
	if id == "order_vault" or id.ends_with("_vault"):
		return _obj_vault()
	if id.begins_with("gauge_"):
		return _obj_gauge()
	if id.begins_with("thermo_"):
		return _obj_thermo()
	if id.begins_with("valve_"):
		return _obj_valve(false)
	if id.begins_with("voice_tube") or id.ends_with("_tube"):
		return _obj_tube(id == "reply_tube")
	if id == "old_post":
		return _obj_machine()
	if id.begins_with("deep_seal") or id.begins_with("seal_"):
		return _obj_seal()
	return _obj_crate()

static func _obj_crate() -> Node3D:
	var root := Node3D.new()
	part(root, box(Vector3(0.7, 0.7, 0.7)), toon(Color("#9fd3d1"), true, Color(0.15, 0.35, 0.35)), Vector3(0, 0.35, 0), Vector3.ONE, Vector3(0, 30, 0))
	return root

static func _obj_marker() -> Node3D:
	# marco de rota: pedra talhada com faixa pintada e uma bandeirola
	var root := Node3D.new()
	var stone := toon(Color("#a39a8c"))
	part(root, box(Vector3(0.7, 0.18, 0.7)), toon(Color("#7d7468")), Vector3(0, 0.09, 0))
	part(root, cyl(0.2, 0.26, 1.1, 6), stone, Vector3(0, 0.7, 0))
	part(root, cyl(0.0, 0.21, 0.22, 6), stone, Vector3(0, 1.36, 0))
	part(root, cyl(0.265, 0.265, 0.14, 6), toon(Color("#c0392b")), Vector3(0, 0.95, 0))
	part(root, cyl(0.02, 0.02, 0.9, 5), toon(Color("#5a3e2a")), Vector3(0.22, 1.5, 0))
	part(root, box(Vector3(0.02, 0.22, 0.34)), toon(Color("#e3b23c")), Vector3(0.23, 1.82, 0.17))
	return root

static func _obj_pages() -> Node3D:
	# páginas do registro: maço de folhas amarradas sobre um toco, uma folha solta presa por uma pedra
	var root := Node3D.new()
	part(root, cyl(0.32, 0.36, 0.5, 10), toon(Color("#6b4a2e")), Vector3(0, 0.25, 0))
	for i in 4:
		part(root, box(Vector3(0.42, 0.025, 0.3)), toon(Color("#efe4c8").darkened(i * 0.04), false), Vector3(0.0, 0.52 + i * 0.026, 0.0), Vector3.ONE, Vector3(0, i * 9 - 12, 0))
	part(root, box(Vector3(0.05, 0.14, 0.32)), toon(Color("#8a2a2a")), Vector3(0, 0.58, 0))
	part(root, box(Vector3(0.36, 0.02, 0.26)), toon(Color("#efe4c8"), false), Vector3(0.45, 0.02, 0.18), Vector3.ONE, Vector3(0, 25, 0))
	part(root, sphere(0.08, 6), toon(Color("#8a8278")), Vector3(0.45, 0.07, 0.18))
	return root

static func _obj_fuse_box() -> Node3D:
	# caixa de fusíveis num poste: porta de metal, três fusíveis de vidro e uma lâmpada
	var root := Node3D.new()
	var metal := toon(Color("#6f7a80"))
	part(root, cyl(0.06, 0.07, 1.6, 6), toon(Color("#4a3a2c")), Vector3(0, 0.8, 0))
	part(root, box(Vector3(0.6, 0.7, 0.28)), metal, Vector3(0, 1.3, 0.1))
	part(root, box(Vector3(0.5, 0.6, 0.03)), toon(Color("#56606a")), Vector3(0, 1.3, 0.25))
	for i in 3:
		part(root, cyl(0.04, 0.04, 0.22, 6), toon(Color("#9fd3e8"), false, Color(0.15, 0.3, 0.4)), Vector3(-0.15 + i * 0.15, 1.32, 0.28))
	part(root, box(Vector3(0.06, 0.18, 0.06)), toon(Color("#c0392b")), Vector3(0.33, 1.18, 0.18))
	part(root, sphere(0.06, 8), toon(Color("#ffcf4a"), false, Color(1.0, 0.7, 0.2)), Vector3(0, 1.72, 0.12))
	return root

static func _obj_vault() -> Node3D:
	# cofre de ordens: caixa de ferro com roda de segredo e dobradiças
	var root := Node3D.new()
	var iron := toon(Color("#4f565e"))
	part(root, box(Vector3(1.0, 1.1, 0.8)), iron, Vector3(0, 0.55, 0))
	part(root, box(Vector3(0.84, 0.94, 0.04)), toon(Color("#5c646d")), Vector3(0, 0.56, 0.41))
	part(root, cyl(0.16, 0.16, 0.06, 14), toon(Color("#b8a46a")), Vector3(0.1, 0.62, 0.45), Vector3.ONE, Vector3(90, 0, 0))
	part(root, box(Vector3(0.04, 0.2, 0.04)), toon(Color("#b8a46a")), Vector3(-0.22, 0.45, 0.44))
	for y in [0.25, 0.85]:
		part(root, box(Vector3(0.06, 0.12, 0.08)), toon(Color("#2f343a")), Vector3(-0.44, y, 0.42))
	return root

static func _obj_gauge() -> Node3D:
	# medidor de pressão: cano saindo do chão com o mostrador redondo e o ponteiro
	var root := Node3D.new()
	var pipe := toon(Color("#8a6a4a"))
	part(root, cyl(0.1, 0.1, 1.2, 8), pipe, Vector3(0, 0.6, 0))
	part(root, cyl(0.1, 0.1, 0.8, 8), pipe, Vector3(0.35, 0.15, 0), Vector3.ONE, Vector3(0, 0, 90))
	part(root, cyl(0.3, 0.3, 0.1, 18), toon(Color("#b8803a")), Vector3(0, 1.35, 0.06), Vector3.ONE, Vector3(90, 0, 0))
	part(root, cyl(0.25, 0.25, 0.02, 18), toon(Color("#f2ead8"), false), Vector3(0, 1.35, 0.12), Vector3.ONE, Vector3(90, 0, 0))
	part(root, box(Vector3(0.03, 0.2, 0.02)), toon(Color("#c0392b"), false), Vector3(0.05, 1.4, 0.14), Vector3.ONE, Vector3(0, 0, -35))
	return root

static func _obj_thermo() -> Node3D:
	# ponto de medição térmica: estaca com tubo de vidro e bulbo vermelho
	var root := Node3D.new()
	part(root, cyl(0.05, 0.08, 1.3, 6), toon(Color("#5a4a3a")), Vector3(0, 0.65, 0))
	part(root, cyl(0.05, 0.05, 0.7, 8), toon(Color("#dff2f4"), false), Vector3(0.1, 1.1, 0.05))
	part(root, cyl(0.025, 0.025, 0.45, 6), toon(Color("#e04a3a"), false, Color(0.6, 0.1, 0.05)), Vector3(0.1, 1.0, 0.05))
	part(root, sphere(0.08, 8), toon(Color("#e04a3a"), false, Color(0.6, 0.1, 0.05)), Vector3(0.1, 0.75, 0.05))
	part(root, box(Vector3(0.18, 0.05, 0.18)), toon(Color("#8a8278")), Vector3(0, 0.03, 0))
	return root

static func _obj_valve(big: bool) -> Node3D:
	# válvula: cano em cotovelo com o volante de manobra (a válvula principal da defesa é maior)
	var root := Node3D.new()
	var k := 1.5 if big else 1.0
	var pipe := toon(Color("#7a6a5a"))
	part(root, cyl(0.16 * k, 0.16 * k, 1.0 * k, 10), pipe, Vector3(0, 0.5 * k, 0))
	part(root, cyl(0.16 * k, 0.16 * k, 1.2 * k, 10), pipe, Vector3(0.5 * k, 0.2 * k, 0), Vector3.ONE, Vector3(0, 0, 90))
	part(root, cyl(0.22 * k, 0.22 * k, 0.12 * k, 10), toon(Color("#5a4a3a")), Vector3(0, 1.0 * k, 0))
	part(root, cyl(0.04 * k, 0.04 * k, 0.35 * k, 6), toon(Color("#4a3a2c")), Vector3(0, 1.2 * k, 0))
	var wheel := TorusMesh.new()
	wheel.inner_radius = 0.26 * k
	wheel.outer_radius = 0.32 * k
	part(root, wheel, toon(Color("#c0392b")), Vector3(0, 1.38 * k, 0))
	for i in 3:
		part(root, box(Vector3(0.58 * k, 0.04 * k, 0.04 * k)), toon(Color("#c0392b")), Vector3(0, 1.38 * k, 0), Vector3.ONE, Vector3(0, i * 60, 0))
	return root

static func _obj_tube(big: bool) -> Node3D:
	# tubo de voz: cano de latão saindo do chão, curvado, com a boca em corneta
	var root := Node3D.new()
	var k := 1.35 if big else 1.0
	var brass := toon(Color("#c39a4a"))
	part(root, cyl(0.12 * k, 0.14 * k, 1.3 * k, 10), brass, Vector3(0, 0.65 * k, 0))
	part(root, cyl(0.12 * k, 0.12 * k, 0.4 * k, 10), brass, Vector3(0, 1.42 * k, 0.12 * k), Vector3.ONE, Vector3(50, 0, 0))
	part(root, cyl(0.38 * k, 0.12 * k, 0.45 * k, 14), brass, Vector3(0, 1.62 * k, 0.4 * k), Vector3.ONE, Vector3(80, 0, 0))
	part(root, cyl(0.3 * k, 0.3 * k, 0.03 * k, 14), toon(Color("#2a2018"), false), Vector3(0, 1.66 * k, 0.6 * k), Vector3.ONE, Vector3(80, 0, 0))
	part(root, cyl(0.2 * k, 0.24 * k, 0.12 * k, 10), toon(Color("#8a6a3a")), Vector3(0, 0.06, 0))
	return root

static func _obj_machine() -> Node3D:
	# máquina do posto antigo: armário de metal com mostradores, alavanca e um rolo de fita perfurada
	var root := Node3D.new()
	var body := toon(Color("#6a6f5a"))
	part(root, box(Vector3(1.3, 1.5, 0.8)), body, Vector3(0, 0.75, 0))
	part(root, box(Vector3(1.4, 0.12, 0.9)), toon(Color("#4a4e40")), Vector3(0, 1.56, 0))
	for i in 3:
		part(root, cyl(0.13, 0.13, 0.05, 14), toon(Color("#efe4c8"), false), Vector3(-0.4 + i * 0.4, 1.15, 0.42), Vector3.ONE, Vector3(90, 0, 0))
		part(root, box(Vector3(0.02, 0.1, 0.02)), toon(Color("#2a2018"), false), Vector3(-0.4 + i * 0.4, 1.17, 0.45), Vector3.ONE, Vector3(0, 0, 20 - i * 30))
	part(root, cyl(0.03, 0.03, 0.5, 6), toon(Color("#3a3a3a")), Vector3(0.72, 1.0, 0.1), Vector3.ONE, Vector3(0, 0, -20))
	part(root, sphere(0.07, 8), toon(Color("#c0392b")), Vector3(0.8, 1.24, 0.1))
	part(root, cyl(0.12, 0.12, 0.6, 10), toon(Color("#d8c89a")), Vector3(0, 0.6, 0.42), Vector3.ONE, Vector3(0, 0, 90))
	part(root, sphere(0.06, 8), toon(Color("#ffcf4a"), false, Color(1.0, 0.65, 0.2)), Vector3(0.5, 1.4, 0.42))
	return root

static func _obj_seal() -> Node3D:
	# selo da Porta Funda: disco de bronze num pedestal de pedra, com marcas que brilham verde-água
	var root := Node3D.new()
	part(root, box(Vector3(0.9, 0.6, 0.5)), toon(Color("#6d665e")), Vector3(0, 0.3, 0))
	part(root, cyl(0.55, 0.55, 0.14, 20), toon(Color("#9a7a3a")), Vector3(0, 1.15, 0), Vector3.ONE, Vector3(90, 0, 0))
	part(root, cyl(0.42, 0.42, 0.16, 20), toon(Color("#7a5e2a")), Vector3(0, 1.15, 0.01), Vector3.ONE, Vector3(90, 0, 0))
	var glyph := toon(Color("#7fe3d0"), false, Color(0.2, 0.6, 0.55))
	for i in 6:
		var a := i * TAU / 6.0
		part(root, box(Vector3(0.05, 0.16, 0.02)), glyph, Vector3(cos(a) * 0.32, 1.15 + sin(a) * 0.32, 0.1), Vector3.ONE, Vector3(0, 0, rad_to_deg(a)))
	part(root, sphere(0.08, 8), glyph, Vector3(0, 1.15, 0.1))
	return root

static func _obj_board() -> Node3D:
	# quadro de missões: dois postes, telhadinho, tábua com folhas presas por pregos
	var root := Node3D.new()
	var wood := toon(Color("#7a5232"))
	for sx in [-0.85, 0.85]:
		part(root, cyl(0.07, 0.08, 2.3, 6), wood, Vector3(sx, 1.15, 0))
	part(root, box(Vector3(1.8, 1.1, 0.08)), toon(Color("#8e6440")), Vector3(0, 1.45, 0))
	part(root, box(Vector3(2.1, 0.08, 0.5)), toon(Color("#5a3a26")), Vector3(0, 2.3, 0.02), Vector3.ONE, Vector3(-14, 0, 0))
	var papers := [[-0.55, 1.65, 4.0], [-0.1, 1.55, -6.0], [0.4, 1.7, 3.0], [-0.35, 1.2, -3.0], [0.25, 1.22, 7.0], [0.62, 1.35, -5.0]]
	for p in papers:
		part(root, box(Vector3(0.36, 0.42, 0.01)), toon(Color("#efe4c8"), false), Vector3(p[0], p[1], 0.05), Vector3.ONE, Vector3(0, 0, p[2]))
		part(root, sphere(0.025, 5), toon(Color("#c0392b"), false), Vector3(p[0], p[1] + 0.17, 0.065))
	return root

static func _obj_person(id: String) -> Node3D:
	# pessoa a resgatar (tutorial): morador comum; Bento preso no entulho, Caio é criança
	var root := Node3D.new()
	var p := character("", "", true, Color("#8a9a6a") if id.ends_with("caio") else Color("#a87a5a"), hash(id))
	root.add_child(p)
	if id.ends_with("caio"):
		p.scale = Vector3.ONE * 0.95
	else:
		p.scale = Vector3.ONE * 1.25
	if id.ends_with("bento"):
		var rubble := toon(Color("#8a8278"))
		for i in 6:
			var a := i * TAU / 6.0
			part(root, sphere(0.25 + (i % 3) * 0.06, 6), rubble, Vector3(cos(a) * 0.55, 0.15, sin(a) * 0.55), Vector3(1.2, 0.7, 1.0), Vector3(0, i * 40, 0))
		part(root, box(Vector3(1.4, 0.12, 0.2)), toon(Color("#5a3e2a")), Vector3(0.1, 0.4, 0.35), Vector3.ONE, Vector3(0, 20, 12))
	return root

# ---------------- cenário ----------------
static func tree(rng: RandomNumberGenerator, palette: Array) -> Node3D:
	var t = Node3D.new()
	var h = rng.randf_range(2.2, 3.6)
	part(t, cyl(0.12, 0.2, h, 8), toon(Color("#5a3e2a")), Vector3(0, h / 2.0, 0))
	var leaf: Color = palette[rng.randi() % palette.size()]
	for i in 3:
		var r = rng.randf_range(0.7, 1.1) * (1.0 - i * 0.18)
		part(t, sphere(r, 10), toon(leaf.lightened(i * 0.06)), Vector3(rng.randf_range(-0.2, 0.2), h + i * 0.55 - 0.1, rng.randf_range(-0.2, 0.2)))
	return t

static func rock(rng: RandomNumberGenerator) -> Node3D:
	var r = Node3D.new()
	var s = rng.randf_range(0.4, 1.1)
	part(r, sphere(s, 6), toon(Color("#8a8278")), Vector3(0, s * 0.4, 0), Vector3(1.2, 0.7, 1.0), Vector3(0, rng.randf_range(0, 180), 0))
	return r

static func grass(rng: RandomNumberGenerator, color: Color) -> Node3D:
	var g = Node3D.new()
	for i in 3:
		part(g, cyl(0.0, 0.06, rng.randf_range(0.3, 0.5), 4), toon(color, false), Vector3(rng.randf_range(-0.15, 0.15), 0.2, rng.randf_range(-0.15, 0.15)), Vector3.ONE, Vector3(rng.randf_range(-15, 15), 0, rng.randf_range(-15, 15)))
	return g

static func lantern() -> Node3D:
	var l = Node3D.new()
	part(l, cyl(0.06, 0.08, 2.2, 6), toon(Color("#3a2a22")), Vector3(0, 1.1, 0))
	part(l, box(Vector3(0.3, 0.35, 0.3)), toon(Color("#ffcf7a"), true, Color(1.0, 0.7, 0.3)), Vector3(0, 2.3, 0))
	return l

## Publica direção e cor do sol para os shaders com iluminação própria (personagens VRM).
## Chamar depois que a luz estiver na árvore de cena.
static func publish_sun(sun: DirectionalLight3D, ambient := Color(0.18, 0.17, 0.2)) -> void:
	RenderingServer.global_shader_parameter_set("sun_direction", sun.global_transform.basis.z.normalized())
	RenderingServer.global_shader_parameter_set("sun_color", sun.light_color * minf(sun.light_energy, 1.2))
	RenderingServer.global_shader_parameter_set("ambient_tint", ambient)

## Céu e névoa do mapa (ver scenery.gd).
static func environment(map_id: String) -> Environment:
	return preload("res://scripts/scenery.gd").environment(map_id)
