extends Node3D
## Personagem de anime a partir de um modelo VRM (glTF binário): materiais com cel shading
## sobre a textura original, recolor por classe (cabelo, olhos, roupa), partes escondidas,
## animação procedural no esqueleto (pose relaxada, andar, respirar, piscar, golpes e
## habilidades) e arma/acessórios presos aos ossos.
##
## As rotações são definidas nos eixos do personagem (frente +Z, esquerda +X) num "espaço
## normalizado": para cada osso, pose_local = Rg_pai⁻¹ · D · Rg_osso, onde Rg são as rotações
## globais de repouso. Assim a mesma animação serve para modelos com eixos de ossos diferentes.
##
## Golpes e habilidades são movimentos de moves.gd (linhas do tempo de chaves) tocados por cima da
## postura: as duas mãos por IK, o tronco por giro e inclinação, e as pernas por IK com os pés
## plantados (agachar, avançar o peso, passo, pulo, giro do corpo inteiro).

const TOON_TEX := preload("res://shaders/toon_tex.gdshader")
const TOON_TEX_2S := preload("res://shaders/toon_tex_2s.gdshader")
const HIDDEN := preload("res://shaders/hidden.gdshader")
const OUTLINE := preload("res://shaders/outline.gdshader")
const Gear := preload("res://scripts/gear.gd")
const Moves := preload("res://scripts/moves.gd")

## Modelos VRM disponíveis (créditos em docs/CREDITOS.md).
const MODELS := {
	"girl": {
		"path": "res://assets/characters/pixiv_sample.glb",
		"bones": {
			"hips": "J_Bip_C_Hips", "spine": "J_Bip_C_Spine", "chest": "J_Bip_C_Chest", "neck": "J_Bip_C_Neck", "head": "J_Bip_C_Head",
			"l_upper_arm": "J_Bip_L_UpperArm", "l_lower_arm": "J_Bip_L_LowerArm", "l_hand": "J_Bip_L_Hand",
			"r_upper_arm": "J_Bip_R_UpperArm", "r_lower_arm": "J_Bip_R_LowerArm", "r_hand": "J_Bip_R_Hand",
			"l_upper_leg": "J_Bip_L_UpperLeg", "l_lower_leg": "J_Bip_L_LowerLeg", "l_foot": "J_Bip_L_Foot",
			"r_upper_leg": "J_Bip_R_UpperLeg", "r_lower_leg": "J_Bip_R_LowerLeg", "r_foot": "J_Bip_R_Foot",
		},
		"blink": ["Face_Blendshape.Fcl_EYE_Close"],
		"hide_meshes": [],
		"hide_surfaces": [],
		"recolor": {
			"Tops_01_CLOTH": ["outfit", 0.92], "Bottoms_01_CLOTH": ["pants", 0.12], "Shoes_01_CLOTH": ["boots", 0.22],
			"Hair_00_HAIR": ["hair", 0.40], "HairBack_00_HAIR": ["hair", 0.40], "EyeIris_00_EYE": ["eyes", 0.38],
		},
		"face": ["FaceMouth_00_FACE", "EyeIris_00_EYE", "Face_00_SKIN", "EyeWhite_00_EYE", "FaceEyeline_00_FACE", "FaceBrow_00_FACE", "EyeHighlight_00_EYE"],
		"no_outline_meshes": ["Face"],
		"cutout": {},
		# restrições de mira do VRM (VRMC_node_constraint): o Godot não as executa, então
		# apontamos estes ossos auxiliares para o alvo a cada quadro (pele do braço, manga, coxa)
		"aims": [
			["J_Aim_L_UpperLeg", "J_Bip_L_LowerLeg", Vector3(0, -1, 0)], ["J_Aim_R_UpperLeg", "J_Bip_R_LowerLeg", Vector3(0, -1, 0)],
			["J_Aim_L_Shoulder", "J_Bip_L_LowerArm", Vector3(1, 0, 0)], ["J_Aim_L_TopsUpperArm", "J_Bip_L_LowerArm", Vector3(1, 0, 0)],
			["J_Aim_R_Shoulder", "J_Bip_R_LowerArm", Vector3(-1, 0, 0)], ["J_Aim_R_TopsUpperArm", "J_Bip_R_LowerArm", Vector3(-1, 0, 0)],
		],
		"arm_down": 1.18,
		"head_top": 0.235,
		"waist_r": 0.118,
		"expr": {"happy": ["Face_Blendshape.Fcl_ALL_Joy"], "angry": ["Face_Blendshape.Fcl_ALL_Angry"], "hurt": ["Face_Blendshape.Fcl_ALL_Sorrow"]},
		# dedos: formato do nome (dedo, segmento 1..3, lado L/R)
		"finger_fmt": "J_Bip_{s}_{f}{n}",
		"finger_names": {"thumb": "Thumb", "index": "Index", "middle": "Middle", "ring": "Ring", "little": "Little"},
	},
	"boy": {
		"path": "res://assets/characters/seed_san.glb",
		"bones": {
			"hips": "hips", "spine": "spine", "chest": "chest", "neck": "neck", "head": "head 1",
			"l_upper_arm": "upper_arm.L", "l_lower_arm": "forearm.L", "l_hand": "hand.L",
			"r_upper_arm": "upper_arm.R", "r_lower_arm": "forearm.R", "r_hand": "hand.R",
			"l_upper_leg": "thigh.L", "l_lower_leg": "shin.L", "l_foot": "foot.L",
			"r_upper_leg": "thigh.R", "r_lower_leg": "shin.R", "r_foot": "foot.R",
		},
		"blink": ["blink_L", "blink_R"],
		"hide_meshes": ["robo_arm"],
		"hide_surfaces": ["backpack_metal", "backpack_nm", "backpack_plastic", "anim_logo", "robo_face", "glass"],
		"recolor": {
			"hair": ["hair", 0.12], "huku_bake": ["outfit", 0.78], "armgear_plastic": ["pants", 0.15],
			"green_emit": ["trim", 0.6], "eye": ["eyes", 0.3],
		},
		"face": ["eye", "eye_trans", "body_bake@head"],
		"no_outline_meshes": ["head"],
		"cutout": {"eye": 0.5},
		"aims": [],
		"arm_down": 1.2,
		"head_top": 0.24,
		"waist_r": 0.13,
		"expr": {"happy": ["face_happy"], "angry": ["face_angry"], "hurt": ["face_sad", "eye_close"]},
		"finger_fmt": "{f}.0{n}.{s}",
		"finger_names": {"thumb": "thumb", "index": "f_index", "middle": "f_middle", "ring": "f_ring", "little": "f_pinky"},
	},
}

var model_id := "girl"
var look := {}
var weapon_family := ""
var accessories := []
var cfg := {}
var model: Node3D
var body: Node3D
var skel: Skeleton3D
var s_rot := Quaternion.IDENTITY
var bones := {}
var blink_meshes := []
var moving := false
var weapon_holder: Node3D
var _amp := 0.0
var _t := 0.0
var _phase := 0.0
var _blink_in := 2.0
var _blink_t := -1.0
var _mat_cache := {}
var aims := []
var expr_targets := {}   # nome -> [[malha, índice]]
var expr_weight := {}    # nome -> peso atual
var expr_until := {}     # nome -> tempo de término
var _smile_in := 8.0

static var _shared_mats := {}

static func available() -> bool:
	return ResourceLoader.exists(MODELS["girl"]["path"]) and ResourceLoader.exists(MODELS["boy"]["path"])

## look: { outfit, pants, boots, hair, eyes, trim } (Color). accessories: lista de nomes.
func setup(p_model: String, p_look: Dictionary, p_weapon: String, p_accessories: Array, weapon_node: Node3D) -> void:
	model_id = p_model
	look = p_look
	weapon_family = p_weapon
	accessories = p_accessories
	cfg = MODELS[model_id]
	var scn: PackedScene = load(cfg["path"])
	model = scn.instantiate()
	model.name = "Body"
	add_child(model)
	body = model
	var found := model.find_children("*", "Skeleton3D", true, false)
	if found.is_empty():
		push_warning("VRM sem esqueleto: %s" % cfg["path"])
		return
	skel = found[0]
	# rotação do esqueleto em relação à raiz do modelo
	var t := skel.transform
	var n := skel.get_parent()
	while n != null and n != model:
		if n is Node3D:
			t = (n as Node3D).transform * t
		n = n.get_parent()
	s_rot = t.basis.get_rotation_quaternion()
	for key in cfg["bones"].keys():
		var idx := _find_bone(cfg["bones"][key])
		if idx < 0:
			push_warning("osso %s (%s) não encontrado em %s" % [key, cfg["bones"][key], model_id])
			continue
		var parent := skel.get_bone_parent(idx)
		var pg := Quaternion.IDENTITY
		if parent >= 0:
			pg = skel.get_bone_global_rest(parent).basis.get_rotation_quaternion()
		bones[key] = {"idx": idx, "pg": pg, "bg": skel.get_bone_global_rest(idx).basis.get_rotation_quaternion(), "rest": skel.get_bone_rest(idx)}
	# altura padronizada: cabeça a 1,38 m
	if bones.has("head"):
		var head_y: float = (t * skel.get_bone_global_rest(bones["head"]["idx"])).origin.y
		if head_y > 0.1:
			model.scale = Vector3.ONE * (1.38 / head_y)
	_base_basis = model.transform.basis
	_apply_materials()
	for a in cfg.get("aims", []):
		var ai := _find_bone(a[0])
		var si := _find_bone(a[1])
		if ai >= 0 and si >= 0:
			aims.append({"idx": ai, "parent": skel.get_bone_parent(ai), "src": si, "axis": a[2], "rest": skel.get_bone_rest(ai)})
	for mi in model.find_children("*", "MeshInstance3D", true, false):
		for bs in cfg["blink"]:
			var bi: int = (mi as MeshInstance3D).find_blend_shape_by_name(bs)
			if bi >= 0:
				blink_meshes.append([mi, bi])
	for ename in cfg.get("expr", {}).keys():
		var lst := []
		for mi in model.find_children("*", "MeshInstance3D", true, false):
			for bs in cfg["expr"][ename]:
				var bi: int = (mi as MeshInstance3D).find_blend_shape_by_name(bs)
				if bi >= 0:
					lst.append([mi, bi])
		if not lst.is_empty():
			expr_targets[ename] = lst
			expr_weight[ename] = 0.0
			expr_until[ename] = -1.0
	_setup_fingers()
	_measure_limbs()
	if weapon_family != "" and weapon_node != null:
		_attach_weapon(weapon_node)
	_build_accessories()
	_pose(0.0)
	_t = randf() * 10.0

func _find_bone(name: String) -> int:
	for variant in [name, name.replace(".", "_"), name.replace(" ", "_"), name.replace(" ", "")]:
		var i := skel.find_bone(variant)
		if i >= 0:
			return i
	return -1

# ---------------- materiais ----------------
func _apply_materials() -> void:
	var hidden := ShaderMaterial.new()
	hidden.shader = HIDDEN
	for node in model.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		if mi.name in cfg["hide_meshes"]:
			mi.visible = false
			continue
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		for i in mi.mesh.get_surface_count():
			var src := mi.mesh.surface_get_material(i)
			var mname: String = src.resource_name if src else ""
			if mname in cfg["hide_surfaces"]:
				mi.set_surface_override_material(i, hidden)
				continue
			if src is StandardMaterial3D:
				mi.set_surface_override_material(i, _toon_from(src as StandardMaterial3D, mname, String(mi.name)))

func _toon_from(src: StandardMaterial3D, mname: String, mesh_name: String) -> Material:
	var rc: Array = cfg["recolor"].get(mname, [])
	var key := "%s|%s|%s|%s" % [model_id, mesh_name, mname, (look.get(rc[0], Color.WHITE) as Color).to_html() if rc.size() > 0 else "-"]
	if _shared_mats.has(key):
		return _shared_mats[key]
	var is_face: bool = mname in cfg["face"] or ("%s@%s" % [mname, mesh_name]) in cfg["face"]
	var outline_ok: bool = not (mesh_name in cfg["no_outline_meshes"])
	var blend := src.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA or src.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA_DEPTH_PRE_PASS
	if blend:
		# realces dos olhos e afins: mantém o material original, sem sombra
		var m2 := src.duplicate() as StandardMaterial3D
		m2.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_shared_mats[key] = m2
		return m2
	var m := ShaderMaterial.new()
	var two_sided := src.cull_mode == BaseMaterial3D.CULL_DISABLED
	m.shader = TOON_TEX_2S if two_sided else TOON_TEX
	m.set_shader_parameter("albedo_tex", src.albedo_texture)
	m.set_shader_parameter("albedo", src.albedo_color)
	var cutout := src.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR or src.transparency == BaseMaterial3D.TRANSPARENCY_ALPHA_HASH
	var cut: float = maxf(0.05, src.alpha_scissor_threshold) if cutout else 0.0
	if cfg["cutout"].has(mname):
		cut = float(cfg["cutout"][mname])
		cutout = true
	m.set_shader_parameter("alpha_cut", cut)
	if rc.size() > 0 and look.has(rc[0]):
		m.set_shader_parameter("recolor_on", true)
		m.set_shader_parameter("recolor", look[rc[0]])
		m.set_shader_parameter("ref_lum", float(rc[1]))
	var is_cloth: bool = "CLOTH" in mname or mname in ["huku_bake", "armgear_plastic", "hair", "Hair_00_HAIR", "HairBack_00_HAIR"]
	if is_cloth:
		# tecido e cabelo: sombra mais clara e transição suave (as dobras do modelo criariam manchas)
		m.set_shader_parameter("shade_tint", Color(0.84, 0.8, 0.9))
		m.set_shader_parameter("softness", 0.14)
		m.set_shader_parameter("threshold", 0.36)
	if is_face:
		# rosto quase sem sombra (como no anime); só um leve degradê
		m.set_shader_parameter("shade_tint", Color(0.95, 0.9, 0.92))
		m.set_shader_parameter("lit_level", 0.74)
		m.set_shader_parameter("rim_strength", 0.0)
		m.set_shader_parameter("threshold", 0.25)
	if src.emission_enabled:
		var em: Color = src.emission * src.emission_energy_multiplier
		if rc.size() > 0 and look.has(rc[0]):
			em = (look[rc[0]] as Color) * 0.45
		m.set_shader_parameter("emission_color", em)
	if outline_ok and not is_face and not cutout:
		var o := ShaderMaterial.new()
		o.shader = OUTLINE
		o.set_shader_parameter("thickness", 0.0035)
		o.set_shader_parameter("outline_color", Color("#2a1a18"))
		m.next_pass = o
	_shared_mats[key] = m
	return m

# ---------------- ossos ----------------
static func _rx(a: float) -> Quaternion:
	return Quaternion(Vector3.RIGHT, a)

static func _ry(a: float) -> Quaternion:
	return Quaternion(Vector3.UP, a)

static func _rz(a: float) -> Quaternion:
	return Quaternion(Vector3.BACK, a)

func _bone(key: String, d_model: Quaternion) -> void:
	if not bones.has(key):
		return
	var b: Dictionary = bones[key]
	var d: Quaternion = s_rot.inverse() * d_model * s_rot
	skel.set_bone_pose_rotation(b["idx"], ((b["pg"] as Quaternion).inverse() * d * (b["bg"] as Quaternion)).normalized())

func _set_offset(key: String, off_model: Vector3) -> void:
	if not bones.has(key):
		return
	var b: Dictionary = bones[key]
	var off: Vector3 = (b["pg"] as Quaternion).inverse() * (s_rot.inverse() * off_model)
	skel.set_bone_pose_position(b["idx"], (b["rest"] as Transform3D).origin + off)

## Rotações de repouso da pose relaxada (para orientar objetos presos à mão).
func _idle_d(key: String) -> Quaternion:
	var down: float = cfg["arm_down"]
	match key:
		"l_upper_arm":
			return _rx(-0.1) * _rz(-down)
		"r_upper_arm":
			return _rx(-0.22) * _rz(down)
		"l_lower_arm":
			return _ry(-0.35)
		"r_lower_arm":
			return _ry(0.75 if weapon_family != "" else 0.35)
	return Quaternion.IDENTITY

func _idle_chain(keys: Array) -> Quaternion:
	var q := Quaternion.IDENTITY
	for k in keys:
		q = q * _idle_d(k)
	return q

## Prende um nó a um osso. offset e orientação são dados nos eixos do personagem, na pose relaxada.
func _attach(key: String, offset_norm: Vector3, chain_idle: Quaternion, orient: Quaternion, offset_in_idle := false) -> Node3D:
	if not bones.has(key):
		return null
	var b: Dictionary = bones[key]
	var ba := BoneAttachment3D.new()
	ba.bone_name = skel.get_bone_name(b["idx"])
	skel.add_child(ba)
	var holder := Node3D.new()
	ba.add_child(holder)
	var bg: Quaternion = b["bg"]
	var chain_s: Quaternion = s_rot.inverse() * chain_idle * s_rot
	var orient_s: Quaternion = s_rot.inverse() * orient
	holder.quaternion = (bg.inverse() * chain_s.inverse() * orient_s).normalized()
	var off := chain_idle.inverse() * offset_norm if offset_in_idle else offset_norm
	holder.position = bg.inverse() * (s_rot.inverse() * off)
	# compensa a escala do modelo para que armas e acessórios tenham tamanho em metros do mundo
	holder.scale = Vector3.ONE / maxf(0.01, model.scale.x)
	return holder

func _bone_len(a: String, b: String) -> float:
	if not bones.has(a) or not bones.has(b):
		return 0.35
	return skel.get_bone_global_rest(bones[a]["idx"]).origin.distance_to(skel.get_bone_global_rest(bones[b]["idx"]).origin)

func _build_accessories() -> void:
	var trim: Color = look.get("trim", Color("#e3b23c"))
	var outfit: Color = look.get("outfit", Color.WHITE)
	var leather: Color = look.get("boots", Color("#4a3428"))
	var top: float = cfg["head_top"]
	var waist: float = cfg["waist_r"]
	var shin := _bone_len("l_lower_leg", "l_foot")
	var forearm := _bone_len("l_lower_arm", "l_hand")
	for acc in accessories:
		match acc:
			"hat":
				var h := _attach("head", Vector3(0, top * 0.8, -0.012), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if h:
					h.add_child(Gear.wizard_hat(outfit.darkened(0.35), trim))
			"band":
				var b2 := _attach("head", Vector3(0, top * 0.55, -0.005), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if b2:
					Gear.part(b2, Gear.torus(0.098, 0.112, 28), Gear.mat(Color("#c03a2a")), Vector3.ZERO, Vector3(1.0, 1.0, 1.1), Vector3(-10, 0, 0))
					Gear.part(b2, Gear.box(Vector3(0.03, 0.1, 0.01)), Gear.mat(Color("#c03a2a")), Vector3(0.025, -0.05, -0.12), Vector3.ONE, Vector3(15, 0, 22))
					Gear.part(b2, Gear.box(Vector3(0.03, 0.08, 0.01)), Gear.mat(Color("#a8302a")), Vector3(-0.01, -0.045, -0.122), Vector3.ONE, Vector3(10, 0, -12))
			"circlet":
				var c := _attach("head", Vector3(0, top * 0.6, 0.0), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if c:
					Gear.part(c, Gear.torus(0.1, 0.108, 28), Gear.mat(trim, true, trim * 0.25), Vector3.ZERO, Vector3(1.0, 1.0, 1.08), Vector3(-14, 0, 0))
					Gear.part(c, Gear.crystal(0.016, 0.04), Gear.mat(Color("#5ab0ff"), false, Color(0.2, 0.5, 0.95)), Vector3(0, 0.03, 0.115), Vector3.ONE, Vector3(90, 0, 0))
			"cape":
				var cp := _attach("chest", Vector3(0, 0.13, -0.1), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if cp:
					cp.add_child(Gear.cape(look.get("cape", trim), trim))
			"shield", "small_shield":
				# preso ao antebraço esquerdo pelas correias (acompanha a pronação/supinação da mão):
				# o eixo do disco é o dorso do antebraço (+Y na pose T); de lado com o braço caído e de
				# frente para o oponente na guarda
				var r: float = 0.21 if acc == "shield" else 0.15
				var sh := _attach("l_hand", Vector3(-forearm * 0.4, 0.06, 0.0), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if sh:
					Gear.part(sh, Gear.cyl(r, r, 0.035, 26), Gear.mat(trim.darkened(0.35)), Vector3.ZERO)
					Gear.part(sh, Gear.cyl(r * 0.8, r * 0.8, 0.04, 26), Gear.mat(outfit), Vector3(0, 0.004, 0))
					Gear.part(sh, Gear.torus(r * 0.36, r * 0.44, 20), Gear.mat(trim), Vector3(0, 0.024, 0))
					Gear.part(sh, Gear.sphere(0.035), Gear.mat(trim), Vector3(0, 0.03, 0))
					has_shield = true
			"quiver":
				var q := _attach("chest", Vector3(0.08, 0.05, -0.13), Quaternion.IDENTITY, Quaternion(Vector3.BACK, deg_to_rad(-25)))
				if q:
					Gear.part(q, Gear.cyl(0.05, 0.045, 0.42, 12), Gear.mat(Color("#6b4a2e")), Vector3.ZERO)
					Gear.part(q, Gear.cyl(0.053, 0.053, 0.03, 12), Gear.mat(trim), Vector3(0, 0.2, 0))
					for i in 4:
						Gear.part(q, Gear.cyl(0.004, 0.004, 0.22, 4), Gear.mat(Color("#e8e0d0"), false), Vector3(-0.024 + i * 0.016, 0.3, 0))
						Gear.part(q, Gear.box(Vector3(0.0, 0.05, 0.025)), Gear.mat(Color("#c03a2a"), false), Vector3(-0.024 + i * 0.016, 0.39, 0))
			"pauldrons":
				for side in [["l_upper_arm", 1.0], ["r_upper_arm", -1.0]]:
					var pd := _attach(side[0], Vector3(0.035 * side[1], 0.045, 0.0), _idle_d(side[0]), Quaternion.IDENTITY, true)
					if pd:
						pd.add_child(Gear.pauldron(trim.darkened(0.15), trim, side[1]))
			"boots":
				for side in ["l", "r"]:
					var bs := _attach(side + "_lower_leg", Vector3(0, -shin * 0.7, 0.0), Quaternion.IDENTITY, Quaternion.IDENTITY)
					if bs:
						bs.add_child(Gear.boot_shaft(leather, trim, shin * 0.55))
					var bf := _attach(side + "_foot", Vector3(0, -0.005, 0.0), Quaternion.IDENTITY, Quaternion.IDENTITY)
					if bf:
						bf.add_child(Gear.boot_foot(leather))
			"bracers":
				for side in [["l_lower_arm", 1.0], ["r_lower_arm", -1.0]]:
					var br := _attach(side[0], Vector3(forearm * 0.62 * side[1], 0, 0), Quaternion.IDENTITY, Quaternion(Vector3.BACK, deg_to_rad(-90)))
					if br:
						br.add_child(Gear.bracer(leather.lightened(0.1), trim, forearm * 0.5))
			"chestplate":
				var ch := _attach("chest", Vector3(0, 0.07, 0.06), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if ch:
					ch.add_child(Gear.chestplate(trim.darkened(0.2), trim))
			"belt":
				var bt := _attach("hips", Vector3(0, 0.035, 0.0), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if bt:
					bt.add_child(Gear.belt(leather, trim, waist + 0.012))
			"skirt":
				var sk := _attach("hips", Vector3(0, 0.045, 0.0), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if sk:
					sk.add_child(Gear.skirt(outfit.darkened(0.15), trim, waist + 0.01, 0.235, 0.24))
			"long_skirt":
				var lk := _attach("hips", Vector3(0, 0.045, 0.0), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if lk:
					_long_skirt = Gear.skirt(look.get("cape", outfit), trim, waist + 0.01, SKIRT_R, SKIRT_LEN)
					lk.add_child(_long_skirt)
			"scarf":
				var sc := _attach("neck", Vector3(0, 0.02, 0.0), Quaternion.IDENTITY, Quaternion.IDENTITY)
				if sc:
					sc.add_child(Gear.scarf(look.get("scarf", trim)))

# pequenos construtores (iguais aos de art.gd, para não depender do script estático)
func _toon(color: Color, outline := true, emission := Color(0, 0, 0)) -> Material:
	var key := "acc|%s|%s|%s" % [color.to_html(), outline, emission.to_html()]
	if _shared_mats.has(key):
		return _shared_mats[key]
	var m := ShaderMaterial.new()
	m.shader = preload("res://shaders/toon.gdshader")
	m.set_shader_parameter("albedo", color)
	m.set_shader_parameter("emission", emission)
	m.set_shader_parameter("lit_level", 0.92)
	if outline:
		var o := ShaderMaterial.new()
		o.shader = OUTLINE
		o.set_shader_parameter("thickness", 0.006)
		m.next_pass = o
	_shared_mats[key] = m
	return m

func _part(parent: Node3D, mesh: Mesh, mat: Material, pos: Vector3, scl := Vector3.ONE, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.scale = scl
	mi.rotation_degrees = rot
	parent.add_child(mi)
	return mi

func _cyl(top: float, bottom: float, h: float, seg := 12) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = top
	c.bottom_radius = bottom
	c.height = h
	c.radial_segments = seg
	return c

func _box(size: Vector3) -> BoxMesh:
	var b := BoxMesh.new()
	b.size = size
	return b

func _sphere(r: float) -> SphereMesh:
	var s := SphereMesh.new()
	s.radius = r
	s.height = r * 2.0
	return s

# ---------------- animação ----------------
## Animação procedural sobre o esqueleto (docs/07-navegacao.md §7.6):
## - empunhadura por família de arma (GRIPS): em que mão, que ponto do cabo fica no punho, como a
##   arma assenta na palma e onde vai a segunda mão (IK de dois ossos no braço livre);
## - posturas de braço (STANCES) por estado: relaxado, guarda (com alvo), corrida e golpe;
## - marcha e corrida por curvas de ângulos articulares (biomecânica humana), com o quadril na
##   altura que mantém o pé de apoio no chão;
## - parado com o peso numa perna (contrapposto), respirando e trocando o apoio de vez em quando.
##
## Braço (camada direta): [direção do braço (eixos do personagem: frente +Z, esquerda +X), torção,
## cotovelo, flexão do punho, desvio do punho (+ para o polegar), giro do antebraço]. Ângulos em
## radianos. O giro não é espelhado: + supina no braço esquerdo e prona no direito.
## Armas longas, arco, dardo, varinha e cetro usam a camada guiada pela arma (WPOSES, IK).
var speed := 0.0
var accel := 0.0
var turn := 0.0
var move_dir := Vector2(0.0, 1.0)
var _mdir := Vector2(0.0, 1.0)
var _back := false
var combat := false
var has_shield := false
var npc_variant := 0
var debug_freeze := false
var _base_basis := Basis()
var _speed_s := 0.0
var _run := 0.0
var _combat_w := 0.0
var _lean_f := 0.0
var _lean_s := 0.0
var _turn_amp := 0.0
var _hurt := -1.0
var _look_pos := Vector3.ZERO
var _look_w := 0.0
var _look_yaw := 0.0
var _look_pitch := 0.0
var _stand := 1.0
var _stand_target := 1.0
var _stand_in := 9.0
var _slide := 0.0
var _two_w := 0.0
var _arrow_on := false
var fingers := {}          # "l"/"r" -> { dedo: [idx1, idx2, idx3] }
var grip_node: Node3D      # segura a arma; desliza ao longo do cabo
var weapon_mesh: Node3D
var arrow_node: Node3D
var grip := {}
var _grip_x := 0.07
var _palm_y := 0.024
var _thigh_len := 0.4
var _shin_len := 0.4
var _hand_curl := {"l": 0.2, "r": 0.2}
var _arm_k := 1.0                 # braço do modelo / braço de referência (0,49 m)
var _s0_off := Vector3(0, 0.45, 0) # centro dos ombros − quadril (repouso, espaço do personagem)
var _s0 := Vector3(0, 1.28, 0)     # centro dos ombros de referência neste quadro
var _string_pt := Vector3.INF      # ponto da corda puxada (mundo); INF = corda em repouso
var string_parts := []             # corda do arco em dois segmentos (durante o disparo)
var string_rest: Node3D
var _thumb_curl := {"l": 0.2, "r": 0.2}
var _upper_len := 0.25            # braço e antebraço no espaço do personagem (estimativa do cotovelo)
var _fore_len := 0.24
# ação em curso (golpe ou habilidade, Moves): linha do tempo montada, tempo e conjuração segurada
var _act := {}
var _act_t := 0.0
var _act_holding := false
var _act_hold_until := 0.0
var _act_skill := ""
var _basic_last := -1
var _rng := RandomNumberGenerator.new()
# troca de movimento sem estalo: o estado de onde a mistura parte (corpo e braços) e quanto já misturou
const XF_LEN := 0.16
var _xf_t := -1.0
var _xf_body := {}
var _xf_arms := {}
var _out_body := {}
var _out_arms := {}
# ---- estados do corpo inteiro (D186): caído, levantar, beber, desfazer e formar em brasas ----
# caído (morto ou derrubado): _dp vai de 0 (em pé) a 1 (agachado: os joelhos cederam) e a 2 (deitado de lado); a
# queda e o levantar são curvas de _dp no tempo (_dp_keys: [instante, _dp, curva])
var _down := false
var _down_dead := true
var _dp := 0.0
var _dp_keys: Array = []
var _dp_t := 0.0
var _fall_side := 1.0      # +1 tomba para a esquerda (+X), −1 para a direita: o lado contrário ao da mão da arma
var _fade_w := 0.0         # cor apagada do caído (0..1)
var _dropped: Node3D       # a arma caída ao lado do corpo
var _drop_t := -1.0
var _drop_from := Transform3D()
var _drop_to := Transform3D()
var _pick_t := -1.0        # a arma voltando do chão para a mão no começo do levantar
var _pick_from := Transform3D()
# desfazer em brasas (some) e formar (aparece): tempo decorrido (−1 = parado) e duração
var _vanish_t := -1.0
var _vanish_len := 0.3
var _hidden := false
var _form_t := -1.0
var _form_len := 0.4
var _fx_dbg := Vector3(-1.0, 0.0, 1.0)   # sonda: [apagado, desfazer, sentido] fixos (x < 0 = não fixado)
# bebida: tempo decorrido (−1 = não está bebendo), tônico (hp/mp) e o frasco na mão livre
const DRINK_LEN := 1.2
var _drink_t := -1.0
var _drink_kind := "hp"
var _flask: Node3D
var _flask_side := ""
# saia longa (peça rígida presa ao quadril): raio da barra e comprimento (m); agachado, ajoelhado ou caído ela inclina
# com as coxas e encurta para a barra não entrar no chão (_fit_skirt)
const SKIRT_R := 0.3
const SKIRT_LEN := 0.72
var _long_skirt: Node3D

## Empunhaduras em que o gume fica do lado dos nós dos dedos (giro de −90° no cabo, D63) — e o arco, cujo
## "gume" é a direção do tiro, também para onde apontam os dedos.
const KNUCKLE_EDGE := ["sword_1h", "axe_1h", "hammer_1h", "sword_2h", "axe_2h", "bow"]

## Empunhadura por família. hand: mão da arma. slide: ponto do cabo (metros da arma, ao longo do
## eixo da arma a partir da origem do punho) que fica na mão: [relaxado, guarda, corrida].
## two: ponto da segunda mão por postura (−1 = só uma mão). tilt: quanto a ponta foge do polegar
## para o lado dos dedos (o cabo atravessa a palma na diagonal); roll: gira o gume no eixo da arma.
const GRIPS := {
	"": {"hand": "r", "slide": [0.0, 0.0, 0.0], "two": [-1.0, -1.0, -1.0], "tilt": 0.0, "roll": 0.0},
	"sword_1h": {"hand": "r", "slide": [0.0, 0.0, 0.0], "two": [-1.0, -1.0, -1.0], "tilt": 0.3, "roll": -1.571},
	"axe_1h": {"hand": "r", "slide": [-0.04, -0.02, -0.04], "two": [-1.0, -1.0, -1.0], "tilt": 0.3, "roll": -1.571},
	"hammer_1h": {"hand": "r", "slide": [-0.04, -0.02, -0.04], "two": [-1.0, -1.0, -1.0], "tilt": 0.3, "roll": -1.571},
	"claw": {"hand": "r", "slide": [0.0, 0.0, 0.0], "two": [-1.0, -1.0, -1.0], "tilt": 0.0, "roll": 0.0, "fist": true},
	"sword_2h": {"hand": "r", "slide": [0.0, 0.0, 0.0], "two": [-1.0, -1.0, -1.0], "tilt": 0.15, "roll": -1.571},
	"axe_2h": {"hand": "r", "slide": [0.0, 0.2, 0.0], "two": [-1.0, -1.0, -1.0], "tilt": 0.15, "roll": -1.571},
	"spear_2h": {"hand": "r", "slide": [0.5, 0.12, 0.55], "two": [-1.0, -1.0, -1.0], "tilt": 0.4, "roll": 0.0},
	"bow": {"hand": "l", "slide": [0.0, 0.0, 0.0], "two": [-1.0, -1.0, -1.0], "tilt": 0.0, "roll": 0.0},
	"javelin": {"hand": "r", "slide": [0.3, 0.3, 0.4], "two": [-1.0, -1.0, -1.0], "tilt": 0.3, "roll": 0.0},
	"staff_2h": {"hand": "r", "slide": [0.6, 0.45, 0.6], "two": [-1.0, -1.0, -1.0], "tilt": 0.2, "roll": 0.0},
	"wand": {"hand": "r", "slide": [0.0, 0.0, 0.0], "two": [-1.0, -1.0, -1.0], "tilt": 1.3, "roll": 0.0},
	"scepter": {"hand": "r", "slide": [0.02, 0.02, 0.02], "two": [-1.0, -1.0, -1.0], "tilt": 0.0, "roll": 0.0},
}

# braço relaxado (sem arma)
const ARM_RELAX_R := [Vector3(-0.3, -0.95, 0.06), 0.0, 0.3, 0.12, 0.0, 0.0]
const ARM_RELAX_L := [Vector3(0.3, -0.95, 0.06), 0.0, 0.3, 0.12, 0.0, 0.0]
const ARM_RUN_R := [Vector3(-0.22, -0.97, 0.0), 0.0, 1.45, 0.1, 0.0, 0.0]
const ARM_RUN_L := [Vector3(0.22, -0.97, 0.0), 0.0, 1.45, 0.1, 0.0, 0.0]
const ARM_GUARD_FIST_R := [Vector3(-0.35, -0.72, 0.6), 0.2, 2.0, 0.1, 0.0, 0.0]
const ARM_GUARD_FIST_L := [Vector3(0.35, -0.72, 0.6), 0.2, 2.0, 0.1, 0.0, 0.0]
# escudo de frente para o oponente, borda superior na altura do queixo (antebraço supinado)
const ARM_SHIELD_GUARD := [Vector3(0.4, -0.38, 0.83), 0.28, 1.77, 0.0, 0.0, 1.06]
# mão livre de quem luta com uma arma só: à frente, meio aberta, para equilibrar e aparar
const ARM_GUARD_CHECK_L := [Vector3(0.1, -0.59, 0.8), -0.66, 0.94, -0.47, 0.0, -0.15]

## Posturas por família: braço da arma ("w") e braço livre ("o") em cada estado (golpes e habilidades
## ficam em moves.gd e são tocados por cima destas posturas).
const STANCES := {
	"": {
		"relaxed": {"w": ARM_RELAX_R, "o": ARM_RELAX_L},
		"guard": {"w": ARM_GUARD_FIST_R, "o": ARM_GUARD_FIST_L},
		"run": {"w": ARM_RUN_R, "o": ARM_RUN_L},
	},
	"sword_1h": {
		"relaxed": {"w": [Vector3(-0.29, -0.95, 0.08), -0.15, 0.12, 0.15, -0.62, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.25, -0.9, 0.35), -0.15, 1.2, 0.1, -0.45, -0.25], "o": ARM_GUARD_CHECK_L},
		"run": {"w": [Vector3(-0.22, -0.97, 0.0), -0.2, 1.0, 0.2, -0.8, -0.15], "o": ARM_RUN_L},
	},
	"axe_2h": {
		"relaxed": {"w": [Vector3(-0.25, -0.6, 0.76), -0.4, 2.2, 0.0, 0.7, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.3, -0.85, 0.42), 0.0, 1.0, 0.0, 0.6, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.25, -0.6, 0.76), -0.4, 2.2, 0.0, 0.7, 0.0], "o": ARM_RUN_L},
	},
	"spear_2h": {
		"relaxed": {"w": [Vector3(-0.3, -0.93, 0.2), 0.0, 1.25, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.35, -0.88, -0.3), 0.0, 0.6, 0.0, -0.7, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.25, -0.96, 0.1), 0.0, 0.9, 0.0, -0.2, 0.0], "o": ARM_RUN_L},
	},
	"bow": {
		"relaxed": {"w": [Vector3(0.3, -0.94, 0.15), 0.0, 0.9, 0.0, 0.5, 0.0], "o": ARM_RELAX_R},
		"guard": {"w": [Vector3(0.25, -0.4, 0.88), -0.9, 0.5, 0.0, 0.0, 0.0], "o": [Vector3(-0.35, -0.6, 0.72), 0.0, 1.9, 0.2, 0.0, 0.0]},
		"run": {"w": [Vector3(0.25, -0.96, 0.05), 0.0, 1.0, 0.0, 0.4, 0.0], "o": ARM_RUN_R},
	},
	"javelin": {
		"relaxed": {"w": [Vector3(-0.28, -0.94, 0.18), 0.0, 1.2, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.6, 0.55, -0.58), 0.0, 1.5, 0.0, 0.0, 0.0], "o": ARM_SHIELD_GUARD},
		"run": {"w": [Vector3(-0.25, -0.96, 0.1), 0.0, 1.0, 0.0, -0.2, 0.0], "o": ARM_RUN_L},
	},
	"staff_2h": {
		"relaxed": {"w": [Vector3(-0.35, -0.9, 0.25), 0.0, 1.35, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.3, -0.85, 0.42), 0.0, 1.1, 0.0, 0.5, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.25, -0.96, 0.1), 0.0, 1.1, 0.0, -0.3, 0.0], "o": ARM_RUN_L},
	},
	"wand": {
		"relaxed": {"w": [Vector3(-0.28, -0.95, 0.12), 0.0, 0.4, 0.0, -0.4, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.35, -0.55, 0.76), 0.0, 1.2, 0.0, 0.2, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.24, -0.96, 0.0), 0.0, 1.3, 0.0, -0.3, 0.0], "o": ARM_RUN_L},
	},
	"scepter": {
		"relaxed": {"w": [Vector3(-0.25, -0.95, 0.2), 0.0, 1.1, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.3, -0.7, 0.65), 0.0, 1.4, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.22, -0.97, 0.05), 0.0, 1.4, 0.0, 0.0, 0.0], "o": ARM_RUN_L},
	},
	"claw": {
		"relaxed": {"w": [Vector3(-0.3, -0.95, 0.06), 0.0, 0.35, 0.1, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": ARM_GUARD_FIST_R, "o": ARM_GUARD_FIST_L},
		"run": {"w": ARM_RUN_R, "o": ARM_RUN_L},
	},
}

## Poses guiadas pela arma (IK): a mão vai até onde a arma deve estar. Pontos em metros a partir do
## centro dos ombros (corpo de referência com braço de 0,49 m; escala pelo braço de cada modelo),
## com +Z à frente e +X à esquerda; "a" = eixo da arma (para a ponta), "e" = lado do gume / da palma
## (arco: direção do tiro), "pole" = para onde aponta o cotovelo. "plant": o pé da arma encosta no
## chão (desliza na mão). "two": segunda mão (metros ao longo da arma a partir da mão principal).
## "swing": balanço da mão com a passada. "draw": mão da corda na corda (puxada em metros).
## "yaw"/"lean": giro e inclinação do tronco na guarda. Números conferidos por um modelo do braço
## (alcance e punho).
const WPOSES := {
	"spear_2h": {
		"relaxed": {"p": Vector3(-0.220, -0.200, 0.240), "a": Vector3(0.000, 0.971, 0.240), "e": Vector3(0.999, 0.008, -0.033), "pole": Vector3(-0.500, -1.000, -0.350), "plant": 0.425},
		"walk": {"p": Vector3(-0.220, -0.180, 0.220), "a": Vector3(0.000, 0.971, 0.240), "e": Vector3(1.000, 0.005, -0.022), "pole": Vector3(-0.500, -1.000, -0.350), "slide": 0.620, "swing": 0.040},
		"guard": {"p": Vector3(-0.160, -0.370, 0.040), "a": Vector3(0.120, 0.220, 0.968), "e": Vector3(0.844, 0.491, -0.216), "pole": Vector3(-0.800, -0.600, -0.200), "yaw": -0.450, "lean": 0.100, "two": 0.500},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, 0.340, 0.940), "e": Vector3(0.987, 0.151, -0.055), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.130},
	},
	"staff_2h": {
		"relaxed": {"p": Vector3(-0.240, -0.200, 0.180), "a": Vector3(-0.050, 0.979, 0.200), "e": Vector3(0.991, 0.024, 0.128), "pole": Vector3(-0.400, -1.000, -0.600), "plant": 0.395},
		"walk": {"p": Vector3(-0.240, -0.180, 0.180), "a": Vector3(-0.050, 0.979, 0.200), "e": Vector3(0.992, 0.025, 0.125), "pole": Vector3(-0.400, -1.000, -0.600), "slide": 0.620, "swing": 0.040},
		"guard": {"p": Vector3(-0.150, -0.380, 0.100), "a": Vector3(0.120, 0.618, 0.777), "e": Vector3(0.963, 0.117, -0.241), "pole": Vector3(-0.500, -1.000, -0.350), "yaw": -0.250, "two": 0.420},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, 0.361, 0.933), "e": Vector3(0.989, 0.141, -0.054), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.120},
	},
	"axe_2h": {
		"relaxed": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"walk": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"guard": {"p": Vector3(-0.034, -0.194, 0.395), "a": Vector3(-0.121, 0.884, 0.452), "e": Vector3(0.469, -0.350, 0.811), "pole": Vector3(-0.500, -1.000, -0.350), "yaw": -0.200, "two": -0.280},
		"run": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
	},
	"javelin": {
		"relaxed": {"p": Vector3(-0.240, -0.470, 0.100), "a": Vector3(0.000, 0.548, 0.837), "e": Vector3(1.000, -0.026, 0.017), "pole": Vector3(-0.500, -1.000, -0.350)},
		"walk": {"p": Vector3(-0.240, -0.470, 0.100), "a": Vector3(0.000, 0.548, 0.837), "e": Vector3(1.000, -0.026, 0.017), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.050},
		"guard": {"p": Vector3(-0.200, -0.300, 0.220), "a": Vector3(0.060, 0.348, 0.935), "e": Vector3(0.922, 0.340, -0.185), "pole": Vector3(-0.800, -0.600, -0.200), "yaw": -0.300},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, 0.301, 0.954), "e": Vector3(0.988, 0.148, -0.047), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.130},
	},
	"bow": {
		"relaxed": {"p": Vector3(0.220, -0.430, 0.120), "a": Vector3(0.000, 0.862, 0.507), "e": Vector3(-0.049, -0.506, 0.861), "pole": Vector3(0.500, -1.000, -0.350)},
		"walk": {"p": Vector3(0.220, -0.430, 0.120), "a": Vector3(0.000, 0.862, 0.507), "e": Vector3(-0.049, -0.506, 0.861), "pole": Vector3(0.500, -1.000, -0.350), "swing": 0.050},
		"guard": {"p": Vector3(0.120, -0.300, 0.320), "a": Vector3(0.150, 0.975, 0.160), "e": Vector3(-0.279, -0.120, 0.953), "pole": Vector3(0.500, -1.000, -0.350), "yaw": -0.300, "draw": 0.000},
		"run": {"p": Vector3(0.210, -0.440, 0.080), "a": Vector3(0.000, 0.800, 0.600), "e": Vector3(-0.108, -0.596, 0.795), "pole": Vector3(0.500, -1.000, -0.350), "swing": 0.100},
	},
	"wand": {
		"relaxed": {"p": Vector3(-0.220, -0.500, 0.120), "a": Vector3(0.000, -0.600, 0.800), "e": Vector3(1.000, -0.009, -0.006), "pole": Vector3(-0.500, -1.000, -0.350)},
		"walk": {"p": Vector3(-0.220, -0.500, 0.120), "a": Vector3(0.000, -0.600, 0.800), "e": Vector3(1.000, -0.009, -0.006), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.060},
		"guard": {"p": Vector3(-0.140, -0.220, 0.340), "a": Vector3(0.050, 0.249, 0.967), "e": Vector3(0.717, 0.665, -0.208), "pole": Vector3(-0.600, -1.000, -0.300)},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, -0.503, 0.865), "e": Vector3(0.939, 0.297, 0.173), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.130},
	},
	"scepter": {
		"relaxed": {"p": Vector3(-0.220, -0.420, 0.180), "a": Vector3(0.000, 0.862, 0.507), "e": Vector3(1.000, 0.010, -0.017), "pole": Vector3(-0.500, -1.000, -0.350)},
		"walk": {"p": Vector3(-0.220, -0.420, 0.180), "a": Vector3(0.000, 0.862, 0.507), "e": Vector3(1.000, 0.010, -0.017), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.050},
		"guard": {"p": Vector3(-0.140, -0.220, 0.300), "a": Vector3(0.000, 0.954, 0.301), "e": Vector3(0.942, 0.101, -0.320), "pole": Vector3(-0.600, -1.000, -0.300)},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, 0.600, 0.800), "e": Vector3(0.989, 0.119, -0.089), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.130},
	},
	"sword_2h": {
		"relaxed": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"walk": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"guard": {"p": Vector3(-0.034, -0.194, 0.395), "a": Vector3(-0.121, 0.884, 0.452), "e": Vector3(0.469, -0.350, 0.811), "pole": Vector3(-0.500, -1.000, -0.350), "yaw": -0.200, "two": -0.110},
		"run": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
	},
}

## Famílias que compartilham a postura de outra.
const STANCE_ALIAS := {"axe_1h": "sword_1h", "hammer_1h": "sword_1h", "sword_2h": "axe_2h"}

## Curvas da marcha (graus, ciclo de uma perna: 0 = contato do calcanhar). Fonte: médias da
## literatura de análise de marcha (flexão de quadril, joelho e dorsiflexão do tornozelo).
const WALK_HIP := [[0.0, 25.0], [0.1, 21.0], [0.3, 5.0], [0.5, -10.0], [0.62, -4.0], [0.75, 18.0], [0.87, 27.0]]
const WALK_KNEE := [[0.0, 4.0], [0.15, 18.0], [0.4, 5.0], [0.6, 38.0], [0.72, 62.0], [0.86, 30.0], [0.96, 5.0]]
const WALK_ANKLE := [[0.0, 0.0], [0.08, -6.0], [0.42, 10.0], [0.6, -16.0], [0.7, -6.0], [0.85, 3.0]]
const RUN_HIP := [[0.0, 32.0], [0.2, 8.0], [0.4, -12.0], [0.55, 4.0], [0.8, 50.0], [0.92, 40.0]]
const RUN_KNEE := [[0.0, 18.0], [0.14, 42.0], [0.4, 18.0], [0.62, 115.0], [0.82, 70.0], [0.95, 22.0]]
const RUN_ANKLE := [[0.0, 2.0], [0.15, 16.0], [0.4, -22.0], [0.6, 0.0], [0.85, 4.0]]

## Passada de lado: amplitude e ciclo em relação à de frente (D186); o ciclo encurta mais que a amplitude porque o
## pé de lado anda menos no apoio (conferido pela sonda).
const LATERAL_AMP := 0.55
const LATERAL_CYCLE := 0.35
## Amplitude da coxa na corrida em relação à curva média (a passada longa de quem corre; D186).
const RUN_HIP_K := 1.45
## Comprimento do ciclo da passada (dois passos, metros do modelo) por velocidade (m/s do modelo): o pé de apoio
## anda para trás, no corpo, o que o corpo anda para a frente — conferido pela sonda (--animprobe --states --check:
## calcanhar e ponta, no chão, deslizam menos de 20% do que o corpo anda de 0,8 a 6,2 m/s; D186).
const STRIDE := [[0.6, 1.17], [1.25, 1.22], [2.0, 1.42], [2.8, 1.8], [3.85, 2.0], [4.8, 2.05]]

static func stride_cycle(vm: float) -> float:
	if vm <= float(STRIDE[0][0]):
		return float(STRIDE[0][1])
	for i in range(1, STRIDE.size()):
		if vm <= float(STRIDE[i][0]):
			var a: Array = STRIDE[i - 1]
			var b: Array = STRIDE[i]
			return lerpf(float(a[1]), float(b[1]), (vm - float(a[0])) / (float(b[0]) - float(a[0])))
	return float(STRIDE[STRIDE.size() - 1][1])

## Amplitude da passada pela direção do movimento: de frente e de costas inteira, de lado 55% (sem cruzar as
## pernas).
func _dir_amp() -> float:
	return _mdir.y * _mdir.y + _mdir.x * _mdir.x * LATERAL_AMP

## Ciclo da passada pela direção: de lado, passos mais curtos e mais rápidos, para o pé de apoio não deslizar.
func _dir_cycle() -> float:
	return _mdir.y * _mdir.y + _mdir.x * _mdir.x * LATERAL_CYCLE

## Eixo em que a coxa balança: perpendicular à direção do movimento, no chão (de costas, a da direção contrária: a
## passada é a de frente tocada ao contrário).
func _swing_axis() -> Vector3:
	var d := -_mdir if _back else _mdir
	var th := atan2(d.x, d.y)
	return Vector3(cos(th), 0.0, -sin(th))

static func _curve(keys: Array, u: float) -> float:
	u = fposmod(u, 1.0)
	var n := keys.size()
	var i := n - 1
	for k in n:
		if float(keys[k][0]) <= u:
			i = k
	var i0 := (i - 1 + n) % n
	var i2 := (i + 1) % n
	var i3 := (i + 2) % n
	var u1 := float(keys[i][0])
	var u2 := float(keys[i2][0])
	if u2 <= u1:
		u2 += 1.0
	var uu := u if u >= u1 else u + 1.0
	var t := clampf((uu - u1) / maxf(u2 - u1, 1e-4), 0.0, 1.0)
	var p0 := float(keys[i0][1])
	var p1 := float(keys[i][1])
	var p2 := float(keys[i2][1])
	var p3 := float(keys[i3][1])
	var t2 := t * t
	var t3 := t2 * t
	return 0.5 * (2.0 * p1 + (-p0 + p2) * t + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * t2 + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * t3)

# ---------------- montagem: dedos, medidas e arma ----------------
func _setup_fingers() -> void:
	var fmt: String = cfg.get("finger_fmt", "")
	var names: Dictionary = cfg.get("finger_names", {})
	for side in ["l", "r"]:
		var S := "L" if side == "l" else "R"
		var d := {}
		for f in names.keys():
			var lst := []
			for n in [1, 2, 3]:
				var bn := fmt.replace("{s}", S).replace("{f}", names[f]).replace("{n}", str(n))
				var idx := _find_bone(bn)
				if idx >= 0:
					var parent := skel.get_bone_parent(idx)
					lst.append({"idx": idx, "pg": skel.get_bone_global_rest(parent).basis.get_rotation_quaternion() if parent >= 0 else Quaternion.IDENTITY, "bg": skel.get_bone_global_rest(idx).basis.get_rotation_quaternion()})
			d[f] = lst
		fingers[side] = d

func _measure_limbs() -> void:
	_thigh_len = _bone_len("l_upper_leg", "l_lower_leg")
	_shin_len = _bone_len("l_lower_leg", "l_foot")
	# a empunhadura fica sobre as falanges proximais (um pouco antes da base dos dedos)
	var mid: Array = fingers.get("r", {}).get("middle", [])
	if bones.has("r_hand") and not mid.is_empty():
		var hp: Vector3 = skel.get_bone_global_rest(bones["r_hand"]["idx"]).origin
		var fp: Vector3 = skel.get_bone_global_rest(mid[0]["idx"]).origin
		_grip_x = hp.distance_to(fp) * 1.05
		_palm_y = _grip_x * 0.36
	# medidas no espaço do personagem para as poses guiadas pela arma
	var s2r := _skel_to_root()
	_upper_len = _bone_len("l_upper_arm", "l_lower_arm") * s2r.basis.get_scale().x
	_fore_len = _bone_len("l_lower_arm", "l_hand") * s2r.basis.get_scale().x
	_arm_k = (_bone_len("l_upper_arm", "l_lower_arm") + _bone_len("l_lower_arm", "l_hand")) * s2r.basis.get_scale().x / 0.492
	if bones.has("hips") and bones.has("l_upper_arm") and bones.has("r_upper_arm"):
		var hp0: Vector3 = s2r * skel.get_bone_global_rest(bones["hips"]["idx"]).origin
		var sl: Vector3 = s2r * skel.get_bone_global_rest(bones["l_upper_arm"]["idx"]).origin
		var sr: Vector3 = s2r * skel.get_bone_global_rest(bones["r_upper_arm"]["idx"]).origin
		_s0 = (sl + sr) * 0.5
		_s0_off = _s0 - hp0

## Base da arma na mão, na pose T: ponta para o lado do polegar (+Z), gume para a palma (−Y).
## O arco vai na mão esquerda, com o tiro saindo na direção dos dedos (o braço aponta o alvo).
func _grip_basis(fam: String, side: String) -> Basis:
	var g: Dictionary = GRIPS.get(fam, GRIPS[""])
	var sgn := 1.0 if side == "l" else -1.0
	var b: Basis
	if fam == "bow":
		b = Basis(Vector3(0, 1, 0), Vector3(0, 0, 1), Vector3(1, 0, 0))
	elif fam == "claw":
		# garra: lâminas seguindo os dedos, gume para baixo
		b = Basis(Vector3(0, 0, -sgn), Vector3(sgn, 0, 0), Vector3(0, -1, 0))
	else:
		b = Basis(Vector3(1, 0, 0), Vector3(0, 0, 1), Vector3(0, -1, 0))
	var tilt := Basis(Vector3.UP, float(g["tilt"]) * sgn)
	return (tilt * b * Basis(Vector3.UP, float(g["roll"]))).orthonormalized()

func _attach_weapon(w: Node3D) -> void:
	grip = GRIPS.get(weapon_family, GRIPS[""])
	var side: String = grip["hand"]
	var sgn := 1.0 if side == "l" else -1.0
	var holder := _attach(side + "_hand", Vector3(_grip_x * sgn, -_palm_y, 0.0), Quaternion.IDENTITY, _grip_basis(weapon_family, side).get_rotation_quaternion())
	if holder == null:
		return
	grip_node = Node3D.new()
	holder.add_child(grip_node)
	grip_node.add_child(w)
	weapon_mesh = w
	weapon_holder = holder
	_slide = float(grip["slide"][0])
	grip_node.position = Vector3(0, -_slide, 0)
	if weapon_family == "bow":
		# flecha na corda durante o disparo: vai da mão da corda até o punho do arco (eixo −Z)
		arrow_node = Node3D.new()
		add_child(arrow_node)
		Gear.part(arrow_node, Gear.cyl(0.005, 0.005, 0.72, 5), Gear.mat(Color("#8a6a4a"), false), Vector3(0, 0, -0.36), Vector3.ONE, Vector3(90, 0, 0))
		Gear.part(arrow_node, Gear.cyl(0.0, 0.014, 0.05, 5), Gear.mat(Gear.STEEL, false), Vector3(0, 0, -0.74), Vector3.ONE, Vector3(-90, 0, 0))
		Gear.part(arrow_node, Gear.box(Vector3(0.002, 0.03, 0.07)), Gear.mat(Color("#c03a2a"), false), Vector3(0, 0, -0.03))
		arrow_node.visible = false
		# corda: a reta de repouso some enquanto a mão puxa; dois segmentos vão das pontas à mão
		for ch in w.get_children():
			if ch is MeshInstance3D and (ch as Node3D).position.distance_to(Vector3(0, 0, -0.115)) < 0.002:
				string_rest = ch
		for i in 2:
			var seg := Gear.part(self, Gear.cyl(0.003, 0.003, 1.0, 4), Gear.mat(Color("#efe6d2"), false), Vector3.ZERO)
			seg.visible = false
			string_parts.append(seg)

# ---------------- controle externo ----------------
func set_moving(m: bool) -> void:
	moving = m
	speed = 3.6 if m else 0.0

func set_motion(p_speed: float, p_accel: float, p_turn: float) -> void:
	speed = p_speed
	accel = p_accel
	turn = p_turn
	moving = p_speed > 0.15

## Em combate (com alvo): postura de guarda.
func set_combat(c: bool) -> void:
	combat = c

## Para onde anda em relação a para onde olha (x: esquerda, y: frente; D186): andando devagar virado para o alvo, a
## passada vai de costas ou de lado (as pernas balançam na direção do movimento, com passos mais curtos).
func set_move_dir(local: Vector2) -> void:
	if local.length() > 0.01:
		move_dir = local.normalized()

## Olhar para um ponto do mundo (peso 0 = olhar livre).
func set_look_target(pos: Vector3, weight: float) -> void:
	_look_pos = pos
	_look_w = weight

## Ataque básico (evento hit sem habilidade): uma das variações da família da arma, nunca a mesma duas vezes
## seguidas; no crítico, o mesmo golpe com o floreio maior (Moves.critical).
func play_attack(crit := false) -> void:
	var cat := Moves.category(weapon_family)
	var n := Moves.basic_count(cat)
	var v := _rng.randi_range(0, n - 1)
	if v == _basic_last:
		v = (v + 1 + _rng.randi_range(0, n - 2)) % n
	_basic_last = v
	var m := Moves.basic(cat, v)
	if crit:
		m = Moves.critical(m, cat)
	_start_action(m)
	express("angry", 0.85, 0.7)

## Habilidade sem dados (quem chama não sabe o tipo): o disparo mágico.
func play_cast() -> void:
	play_skill("spell", {})

## Habilidade (evento cast): o movimento do tipo da habilidade (Moves.skill), na empunhadura da arma. Se é a
## conjuração com tempo que está segurando, só solta.
func play_skill(kind: String, opts := {}) -> void:
	if _act_holding and not _act.is_empty() and str(opts.get("skill", "")) == _act_skill:
		release_cast()
		return
	_start_action(_skill_motion(kind, opts))
	var face := str(_act.get("face", "angry" if bool(_act.get("guard", true)) else ""))
	if face != "":
		express(face, 0.75, 0.8)

## Conjuração com tempo (cast_start): o movimento vai até o instante "hold" e segura ali até a habilidade sair
## (cast), ser cancelada (cast_cancel) ou o tempo passar com folga (o fim não chega a quem não é o dono quando a
## habilidade falha no fim). Movimento sem "hold" espera o cast para tocar inteiro.
func begin_cast(kind: String, opts: Dictionary, secs: float) -> void:
	var m := _skill_motion(kind, opts)
	if not m.has("hold"):
		return
	_start_action(m)
	_act_skill = str(opts.get("skill", ""))
	_act_holding = true
	_act_hold_until = _t + secs + 0.8

## A conjuração segurada saiu: o movimento segue do ponto em que segurava.
func release_cast() -> void:
	_act_holding = false

## Conjuração interrompida: solta na hora (mistura curta de volta à postura).
func cancel_cast() -> void:
	_act_holding = false
	if not _act.is_empty():
		_snapshot()
		_act = {}

## Durante um salto ou investida o corpo não vira para onde desliza (o servidor o leva de lado ou para trás).
func face_locked() -> bool:
	return (not _act.is_empty() and bool(_act.get("lock", false))) or is_down()

## Em salto ou investida (o movimento leva o corpo pelo chão): o salto de posição é dele, não um teleporte.
func act_locked() -> bool:
	return not _act.is_empty() and bool(_act.get("lock", false))

## Duração do movimento em curso (s), para quem precisa virar o personagem para o alvo enquanto ele dura.
func action_seconds() -> float:
	return float(_act.get("dur", 0.0)) if not _act.is_empty() else 0.0

## Segundos até o disparo do movimento em curso (corda solta, azagaia fora da mão, foco disparando), para o
## projétil do ataque básico sair na hora certa.
func release_in() -> float:
	if _act.is_empty():
		return 0.0
	var r := -1.0
	if _act.has("arrow"):
		r = float(_act["arrow"][1])
	elif _act.has("throw"):
		r = float(_act["throw"][0])
	elif _act.has("release"):
		r = float(_act["release"])
	if r < 0.0:
		return 0.0
	return maxf(0.0, r * float(_act["dur"]) - _act_t)

func _skill_motion(kind: String, opts: Dictionary) -> Dictionary:
	var o := opts.duplicate()
	o["shield"] = has_shield
	return Moves.skill(kind, Moves.category(weapon_family), o)

func _start_action(m: Dictionary) -> void:
	_snapshot()
	_act = Moves.compile(m)
	_act_t = 0.0
	_act_holding = false
	_act_skill = ""

## Guarda o estado aplicado agora como ponto de partida da mistura para o próximo movimento (ou para a postura).
func _snapshot() -> void:
	if _out_body.is_empty() and _out_arms.is_empty():
		return
	_xf_body = _out_body.duplicate()
	_xf_arms = _out_arms.duplicate()
	if _xf_body.has("spin"):
		_xf_body["spin"] = wrapf(float(_xf_body["spin"]), -PI, PI)
	_xf_t = 0.0

func play_hurt() -> void:
	express("hurt", 0.8, 0.45)
	_hurt = 0.0

## Ativa uma expressão facial por alguns segundos (peso 0–1).
func express(name: String, weight: float, seconds: float) -> void:
	if not expr_targets.has(name):
		return
	for k in expr_until.keys():
		if k != name:
			expr_until[k] = -1.0
	expr_until[name] = _t + seconds
	expr_weight[name + "_target"] = weight

# ---------------- estados do corpo inteiro (D186) ----------------
## Caído (morto, ou derrubado como o Caio) ou de pé. A queda: os joelhos cedem (agacha com os pés plantados), a arma
## escapa da mão e cai deitada ao lado, e o corpo tomba de lado para o lado contrário ao da arma; o levantar volta
## pelo mesmo caminho e pega a arma do chão. instant: já no estado, sem a queda (quem aparece na tela já caído).
## dead: olhos fechados e a cor bem apagada (derrubado: um pouco).
func set_down(down: bool, dead := true, instant := false) -> void:
	_down_dead = dead
	if down == _down:
		return
	_down = down
	if down:
		# golpe ou gole em curso (cai no meio dele, o que é comum): não some de um quadro para o outro — a ação mistura de
		# volta à postura (XF_LEN) e o frasco desce no resto do gole enquanto os joelhos cedem
		if not instant and not _act.is_empty():
			_snapshot()
		else:
			_xf_t = -1.0
		_act = {}
		_act_holding = false
		if not instant and _drink_t >= 0.0:
			_drink_t = maxf(_drink_t, DRINK_LEN * 0.8)
		else:
			_drink_t = -1.0
			if _flask:
				_flask.scale = Vector3.ZERO
		_fall_side = -1.0 if grip.get("hand", "r") == "l" else 1.0
		if instant:
			_dp = 2.0
			_dp_keys = []
			_drop_weapon(true)
			_fade_w = 1.0 if dead else 0.5
		else:
			_dp_keys = _fall_keys(_dp)
			_dp_t = 0.0
	else:
		_pick_t = -1.0
		if instant:
			_dp = 0.0
			_dp_keys = []
			_remove_dropped()
			_fade_w = 0.0
		else:
			_dp_keys = _rise_keys(_dp)
			_dp_t = 0.0

## Caído ou ainda caindo/levantando (o corpo não vira para onde desliza nem para o alvo).
func is_down() -> bool:
	return _down or _dp > 0.01

## Segundos até o corpo terminar de se levantar (0 = de pé).
func rise_seconds() -> float:
	if _down or _dp_keys.is_empty():
		return 0.0
	return maxf(0.0, float(_dp_keys[_dp_keys.size() - 1][0]) - _dp_t)

## Desfaz o corpo em brasas (teleporte, renascer longe, saída do mapa); no fim fica invisível até appear().
func vanish(secs := 0.3) -> void:
	_vanish_t = 0.0
	_vanish_len = maxf(0.05, secs)
	_form_t = -1.0
	_drink_t = -1.0

## Forma o corpo em brasas, dos pés para cima (chegada ao mapa, fim do teleporte). crouched: forma agachado e
## então se levanta (renascer no posto, depois da queda do grupo no calabouço).
func appear(secs := 0.4, crouched := false) -> void:
	_vanish_t = -1.0
	_hidden = false
	if model:
		model.visible = true
	_form_t = 0.0
	_form_len = maxf(0.05, secs)
	if crouched:
		_remove_dropped()
		_pick_t = -1.0
		_fade_w = 0.0   # corpo novo: sem a cor apagada de quem caiu
		_dp = 1.0
		_dp_t = 0.0
		_dp_keys = [] if _down else _rise_keys(1.0)

## Bebe um tônico (evento drink): a mão livre leva o frasco à boca sem largar a arma (vermelho: vida; azul: mana),
## a cabeça vai para trás no gole e o frasco some no fim.
func play_drink(kind: String) -> void:
	if is_down() or _hidden or skel == null:
		return
	_drink_kind = kind
	_ensure_flask()
	_drink_t = 0.0

## Segundos até o fim do gole (a faísca da cor sobe nessa hora; world.gd).
func drink_spark_in() -> float:
	return maxf(0.0, DRINK_LEN * 0.74 - _drink_t) if _drink_t >= 0.0 else 0.0

## Curvas de _dp no tempo: [instante (s), _dp, curva até ele ("in" acelera, "out" freia, "io" suave)].
static func _fall_keys(d0: float) -> Array:
	var ks := [[0.0, d0, ""]]
	var t := 0.0
	if d0 < 1.0:
		t += 0.3 * (1.0 - d0)
		ks.append([t, 1.0, "io"])
	t += 0.42 * clampf(2.0 - maxf(d0, 1.0), 0.05, 1.0)
	ks.append([t, 2.0, "in"])
	# o corpo bate no chão e assenta
	ks.append([t + 0.1, 1.95, "out"])
	ks.append([t + 0.24, 2.0, "io"])
	return ks

static func _rise_keys(d0: float) -> Array:
	var ks := [[0.0, d0, ""]]
	var t := 0.0
	if d0 > 1.0:
		t += 0.55 * (d0 - 1.0)
		ks.append([t, 1.0, "io"])
	t += 0.55 * clampf(minf(d0, 1.0), 0.05, 1.0)
	ks.append([t, 0.0, "io"])
	return ks

static func _keys_eval(ks: Array, t: float) -> float:
	if ks.is_empty():
		return 0.0
	if t <= float(ks[0][0]):
		return float(ks[0][1])
	for i in range(1, ks.size()):
		var t1 := float(ks[i][0])
		if t <= t1:
			var t0 := float(ks[i - 1][0])
			var u := clampf((t - t0) / maxf(t1 - t0, 1e-4), 0.0, 1.0)
			match str(ks[i][2]):
				"in":
					u = u * u
				"out":
					u = 1.0 - (1.0 - u) * (1.0 - u)
				"io":
					u = u * u * (3.0 - 2.0 * u)
			return lerpf(float(ks[i - 1][1]), float(ks[i][1]), u)
	return float(ks[ks.size() - 1][1])

## Avança queda/levantar, desfazer/formar, arma caindo/voltando, bebida e cor (a cada quadro, mesmo fora da tela).
func _body_advance(delta: float) -> void:
	var dissolve := 0.0
	var up := 1.0
	if _vanish_t >= 0.0:
		_vanish_t += delta
		dissolve = clampf(_vanish_t / _vanish_len, 0.0, 1.0)
		if _vanish_t >= _vanish_len:
			_vanish_t = -1.0
			_hidden = true
			model.visible = false
			_remove_dropped()   # a arma caída se desfaz junto com o corpo
	elif _hidden:
		dissolve = 1.0
	elif _form_t >= 0.0:
		_form_t += delta
		dissolve = 1.0 - clampf(_form_t / _form_len, 0.0, 1.0)
		up = -1.0
		if _form_t >= _form_len:
			_form_t = -1.0
			dissolve = 0.0
	# queda e levantar; o levantar espera o corpo terminar de se formar
	var busy := _hidden or _vanish_t >= 0.0 or _form_t >= 0.0
	if not _dp_keys.is_empty() and not busy:
		_dp_t += delta
		_dp = _keys_eval(_dp_keys, _dp_t)
		if _dp_t >= float(_dp_keys[_dp_keys.size() - 1][0]):
			_dp = float(_dp_keys[_dp_keys.size() - 1][1])
			_dp_keys = []
	if _down and _dp > 0.55:
		_drop_weapon(false)   # a mão solta a arma quando os joelhos cedem
	if not _down and _dropped != null and _pick_t < 0.0 and not busy and _drop_t < 0.0:
		_pick_t = 0.0
		_pick_from = _dropped.transform
	_drop_advance(delta)
	if _drink_t >= 0.0:
		_drink_t += delta
		if _drink_t >= DRINK_LEN:
			_drink_t = -1.0
			if _flask:
				_flask.scale = Vector3.ZERO
	var fade_to := (1.0 if _down_dead else 0.5) if _down else 0.0
	_fade_w = move_toward(_fade_w, fade_to, delta * (1.1 if _down else 2.2))
	_fx_set(_fade_w, dissolve, up)

# ---------------- a arma caída ----------------
## A arma escapa da mão: uma cópia dela cai e fica deitada no chão ao lado do corpo (do lado da mão da arma, ao
## longo do corpo), e a da mão some até o levantar.
func _drop_weapon(instant: bool) -> void:
	if weapon_mesh == null or _dropped != null or not weapon_mesh.visible or not is_inside_tree():
		return
	# a cópia sai com os materiais compartilhados (o efeito em curso volta a pegar tudo no quadro seguinte)
	_fx_refresh()
	var gt := weapon_mesh.global_transform
	var d := weapon_mesh.duplicate() as Node3D
	add_child(d)
	d.global_transform = gt
	_dropped = d
	weapon_mesh.visible = false
	if arrow_node:
		arrow_node.visible = false
	_drop_from = d.transform
	_drop_to = _drop_rest(_drop_from.basis.get_scale())
	if instant:
		d.transform = _drop_to
		_drop_t = -1.0
	else:
		_drop_t = 0.0

## Onde a arma fica no chão (espaço do personagem): deitada (a face larga para cima, encostada no chão), ao longo do
## corpo, do lado da mão da arma e com o meio dela ao lado do quadril.
func _drop_rest(sc: Vector3) -> Transform3D:
	var box := _weapon_box()
	var side := -_fall_side
	var axis := Vector3(side * 0.28, 0.0, 1.0).normalized()
	var b := _wbasis(axis, Vector3(1.0, 0.0, 0.0).rotated(Vector3.UP, atan2(axis.x, axis.z)))
	var mid := (box.position.y + box.size.y * 0.5) * sc.y
	var p := Vector3(side * 0.42, -box.position.x * sc.x + 0.004, 0.05) - axis * mid
	return Transform3D(Basis(b.x * sc.x, b.y * sc.y, b.z * sc.z), p)

## Caixa da arma no espaço do modelo dela (y = eixo, para a ponta), pelas caixas das malhas.
func _weapon_box() -> AABB:
	var out := AABB()
	var first := true
	if weapon_mesh == null:
		return out
	for mi in weapon_mesh.find_children("*", "MeshInstance3D", true, false):
		var m := mi as MeshInstance3D
		if m.mesh == null:
			continue
		var xf := Transform3D.IDENTITY
		var n: Node = m
		while n != null and n != weapon_mesh:
			if n is Node3D:
				xf = (n as Node3D).transform * xf
			n = n.get_parent()
		var box: AABB = xf * m.get_aabb()
		out = box if first else out.merge(box)
		first = false
	return out

## Cai acelerando até o chão (e assenta); ao levantar, sobe do chão para a mão e volta a ser a arma da mão.
func _drop_advance(delta: float) -> void:
	if _dropped == null:
		return
	if _drop_t >= 0.0:
		_drop_t += delta
		var u := clampf(_drop_t / 0.32, 0.0, 1.0)
		var p: Vector3 = _drop_from.origin.lerp(_drop_to.origin, u)
		p.y = lerpf(_drop_from.origin.y, _drop_to.origin.y, u * u)
		if _drop_t > 0.32:
			p.y += 0.035 * sin(clampf((_drop_t - 0.32) / 0.12, 0.0, 1.0) * PI)
		var q := _drop_from.basis.get_rotation_quaternion().slerp(_drop_to.basis.get_rotation_quaternion(), smoothstep(0.0, 1.0, u))
		var sc := _drop_from.basis.get_scale()
		_dropped.transform = Transform3D(Basis(q).scaled(sc), p)
		if _drop_t >= 0.44:
			_drop_t = -1.0
			_dropped.transform = _drop_to
	elif _pick_t >= 0.0 and weapon_mesh != null:
		_pick_t += delta
		var u2 := smoothstep(0.0, 1.0, clampf(_pick_t / 0.3, 0.0, 1.0))
		var hand: Transform3D = global_transform.affine_inverse() * weapon_mesh.global_transform
		var q2 := _pick_from.basis.get_rotation_quaternion().slerp(hand.basis.get_rotation_quaternion(), u2)
		_dropped.transform = Transform3D(Basis(q2).scaled(_pick_from.basis.get_scale()), _pick_from.origin.lerp(hand.origin, u2))
		if _pick_t >= 0.3:
			_remove_dropped()

func _remove_dropped() -> void:
	_drop_t = -1.0
	_pick_t = -1.0
	if _dropped != null:
		_dropped.queue_free()
		_dropped = null
		_fx_refresh()
	if weapon_mesh:
		weapon_mesh.visible = true

# ---------------- o frasco do tônico ----------------
## Mão da bebida: a livre (a contrária à da arma; no arco, a da corda).
func _drink_side() -> String:
	return "r" if grip.get("hand", "r") == "l" else "l"

## Frasco redondo na mão livre, seguro como um cabo (o gargalo sai do lado do polegar), com o líquido da cor do tônico.
func _ensure_flask() -> void:
	var side := _drink_side()
	if _flask != null and _flask_side != side:
		_flask.get_parent().get_parent().queue_free()
		_flask = null
	if _flask == null:
		var sgn := 1.0 if side == "l" else -1.0
		var holder := _attach(side + "_hand", Vector3(_grip_x * sgn, -_palm_y, 0.0), Quaternion.IDENTITY, _grip_basis("", side).get_rotation_quaternion())
		if holder == null:
			return
		_flask = Node3D.new()
		holder.add_child(_flask)
		_flask_side = side
	for ch in _flask.get_children():
		ch.queue_free()
	var liquid := Color("#e0303a") if _drink_kind != "mp" else Color("#3a6ae6")
	var glow := Color(0.5, 0.05, 0.08) if _drink_kind != "mp" else Color(0.08, 0.18, 0.6)
	# bojo (o fundo sai do lado do mindinho), gargalo de vidro e rolha
	Gear.part(_flask, Gear.sphere(0.037, 12, 8), Gear.mat(liquid, true, glow), Vector3(0, -0.026, 0), Vector3(1.0, 1.1, 1.0))
	Gear.part(_flask, Gear.cyl(0.013, 0.016, 0.05, 8), Gear.mat(Color("#d8e4ea"), true, Color(0.12, 0.14, 0.16)), Vector3(0, 0.03, 0))
	Gear.part(_flask, Gear.cyl(0.016, 0.014, 0.022, 8), Gear.mat(Color("#8a5a32")), Vector3(0, 0.064, 0))
	_flask.scale = Vector3.ZERO
	_fx_refresh()

# ---------------- efeitos de cor do corpo: apagado e brasas (D186) ----------------
## Variante de cada shader do corpo com os efeitos (fx_body.gdshaderinc). O renderizador de compatibilidade não tem
## uniformes por instância e os materiais são compartilhados entre personagens: enquanto um efeito dura, este
## personagem usa cópias com a variante; no fim volta aos compartilhados.
const FX_SHADERS := {
	"res://shaders/toon_tex.gdshader": preload("res://shaders/toon_tex_fx.gdshader"),
	"res://shaders/toon_tex_2s.gdshader": preload("res://shaders/toon_tex_2s_fx.gdshader"),
	"res://shaders/toon.gdshader": preload("res://shaders/toon_fx.gdshader"),
	"res://shaders/outline.gdshader": preload("res://shaders/outline_fx.gdshader"),
	"res://shaders/outline_self.gdshader": preload("res://shaders/outline_self_fx.gdshader"),
}
const EMBER := Color(1.0, 0.62, 0.25)
var _fx_slots := []    # [MeshInstance3D, superfície (−1 = material_override), material compartilhado]
var _fx_copies := []   # cópias em uso
var _fx_alpha := {}    # cópia de StandardMaterial3D (brilho dos olhos) -> alfa original
var _fx_last := Vector3(-1.0, -1.0, 0.0)

## Aplica apagado (0..1) e desfazer (0..1; up: 1 some pelos pés, −1 forma pelos pés) no corpo, na arma, nos
## acessórios, no frasco e na arma caída.
func _fx_set(fade: float, dissolve: float, up := 1.0) -> void:
	if _fx_dbg.x >= 0.0:
		fade = _fx_dbg.x
		dissolve = _fx_dbg.y
		up = _fx_dbg.z
	if fade <= 0.001 and dissolve <= 0.001:
		if not _fx_slots.is_empty():
			_fx_restore()
		_fx_last = Vector3(-1.0, -1.0, 0.0)
		return
	if _fx_slots.is_empty():
		_fx_capture()
	var now := Vector3(fade, dissolve, up)
	if now.is_equal_approx(_fx_last) and dissolve <= 0.001:
		return
	_fx_last = now
	var base := global_position if is_inside_tree() else Vector3.ZERO
	var height := 1.6 * maxf(0.2, scale.x)
	for m in _fx_copies:
		if m is ShaderMaterial:
			var sm := m as ShaderMaterial
			sm.set_shader_parameter("fx_fade", fade)
			sm.set_shader_parameter("fx_dissolve", dissolve)
			sm.set_shader_parameter("fx_base", base)
			sm.set_shader_parameter("fx_up", up)
			sm.set_shader_parameter("fx_height", height)
			sm.set_shader_parameter("fx_edge", EMBER)
		elif m is StandardMaterial3D:
			var c: Color = (m as StandardMaterial3D).albedo_color
			c.a = float(_fx_alpha.get(m, 1.0)) * (1.0 - smoothstep(0.15, 0.5, dissolve))
			(m as StandardMaterial3D).albedo_color = c

## Troca os materiais compartilhados por cópias com a variante dos efeitos (uma cópia por material).
func _fx_capture() -> void:
	var map := {}
	var roots: Array = [model]
	if _dropped != null:
		roots.append(_dropped)
	for r in roots:
		if r == null:
			continue
		for node in (r as Node).find_children("*", "MeshInstance3D", true, false):
			var mi := node as MeshInstance3D
			if mi.material_override != null:
				var c := _fx_copy(mi.material_override, map)
				if c != null:
					_fx_slots.append([mi, -1, mi.material_override])
					mi.material_override = c
				continue
			if mi.mesh == null:
				continue
			for i in mi.mesh.get_surface_count():
				var src := mi.get_surface_override_material(i)
				if src == null:
					continue
				var c2 := _fx_copy(src, map)
				if c2 != null:
					_fx_slots.append([mi, i, src])
					mi.set_surface_override_material(i, c2)

func _fx_copy(mat: Material, map: Dictionary) -> Material:
	if map.has(mat):
		return map[mat]
	var out: Material = null
	if mat is ShaderMaterial and (mat as ShaderMaterial).shader != null and FX_SHADERS.has((mat as ShaderMaterial).shader.resource_path):
		var src := mat as ShaderMaterial
		var sm := ShaderMaterial.new()
		sm.shader = FX_SHADERS[src.shader.resource_path]
		for u in src.shader.get_shader_uniform_list():
			var nm: String = u["name"]
			sm.set_shader_parameter(nm, src.get_shader_parameter(nm))
		sm.render_priority = src.render_priority
		if src.next_pass != null:
			var np := _fx_copy(src.next_pass, map)
			sm.next_pass = np if np != null else src.next_pass
		out = sm
	elif mat is StandardMaterial3D and (mat as StandardMaterial3D).transparency != BaseMaterial3D.TRANSPARENCY_DISABLED:
		out = mat.duplicate()
		_fx_alpha[out] = (mat as StandardMaterial3D).albedo_color.a
	if out != null:
		map[mat] = out
		_fx_copies.append(out)
	return out

## Volta aos materiais compartilhados.
func _fx_restore() -> void:
	for sl in _fx_slots:
		var mi: MeshInstance3D = sl[0]
		if not is_instance_valid(mi):
			continue
		if int(sl[1]) < 0:
			mi.material_override = sl[2]
		else:
			mi.set_surface_override_material(int(sl[1]), sl[2])
	_fx_slots.clear()
	_fx_copies.clear()
	_fx_alpha.clear()

## Malhas novas (arma caída, frasco) entram no efeito em curso.
func _fx_refresh() -> void:
	if _fx_slots.is_empty():
		return
	_fx_restore()
	_fx_last = Vector3(-1.0, -1.0, 0.0)

## Para capturas de teste: congela num estado conhecido (velocidade em m/s do mundo, fase da
## passada 0..1, combate, instante 0..1 do movimento ou −1, a variação do ataque básico e, se dado, outro
## movimento qualquer de Moves — habilidade ou crítico — no lugar do ataque básico).
func debug_pose(p_speed: float, phase01: float, p_combat: bool, attack_t := -1.0, variant := 0, motion := {}) -> void:
	debug_freeze = true
	_down = false
	_dp = 0.0
	_dp_keys = []
	_drink_t = -1.0
	_remove_dropped()
	_fx_dbg = Vector3(-1.0, 0.0, 1.0)
	_fx_set(0.0, 0.0)
	_mdir = move_dir
	_back = _mdir.y < -0.35
	speed = p_speed
	combat = p_combat
	var v := p_speed / maxf(0.2, scale.x)
	_speed_s = v
	_amp = smoothstep(0.04, 0.55, v)
	_run = smoothstep(1.7, 3.2, v)
	_combat_w = 1.0 if p_combat else 0.0
	_phase = phase01 * TAU
	_turn_amp = 0.0
	_lean_f = 0.0
	_lean_s = 0.0
	_stand = 1.0
	_two_w = 1.0 if (p_combat or attack_t >= 0.0) and _two_point(1) >= -0.5 else 0.0
	_slide = _target_slide()
	if grip_node:
		grip_node.position = Vector3(0, -_slide, 0)
	if attack_t >= 0.0:
		debug_motion(motion if not motion.is_empty() else Moves.basic(Moves.category(weapon_family), variant), attack_t)
		return
	_act = {}
	_xf_t = -1.0
	_pose(0.0)

## Para capturas de teste: congela um movimento (Moves.basic, Moves.critical ou Moves.skill) no instante t
## (0..1), por cima do estado deixado por debug_pose.
func debug_motion(m: Dictionary, t: float) -> void:
	debug_freeze = true
	_xf_t = -1.0
	_xf_body = {}
	_xf_arms = {}
	_out_body = {}
	_out_arms = {}
	_act = Moves.compile(m) if not m.is_empty() else {}
	_act_t = clampf(t, 0.0, 1.0) * float(m.get("dur", 0.5))
	_act_holding = false
	if not _act.is_empty() and _two_point(1) >= -0.5:
		_two_w = 1.0
	_pose(0.0)

## Para capturas de teste (D186): congela um estado do corpo no instante u (0..1), por cima do estado deixado por
## debug_pose — "queda", "caido", "levantar" (do chão), "levantar_agachado" (renascer no posto), "beber" e
## "beber_mana", "desfazer", "formar" e "apagado".
func debug_state(kind: String, u: float) -> void:
	debug_freeze = true
	_act = {}
	_xf_t = -1.0
	_out_body = {}
	_out_arms = {}
	_drink_t = -1.0
	_remove_dropped()
	_fx_dbg = Vector3(-1.0, 0.0, 1.0)
	_down = false
	_down_dead = true
	_dp = 0.0
	_dp_keys = []
	_fall_side = -1.0 if grip.get("hand", "r") == "l" else 1.0
	var fade := 0.0
	match kind:
		"queda":
			var ks := _fall_keys(0.0)
			var tt := u * float(ks[ks.size() - 1][0])
			_down = true
			_dp = _keys_eval(ks, tt)
			fade = clampf(tt * 1.1, 0.0, 1.0)
		"caido":
			_down = true
			_dp = 2.0
			fade = 1.0
		"levantar", "levantar_agachado":
			var ks2 := _rise_keys(2.0 if kind == "levantar" else 1.0)
			_dp = _keys_eval(ks2, u * float(ks2[ks2.size() - 1][0]))
			fade = clampf(1.0 - u * 2.0, 0.0, 1.0) if kind == "levantar" else 0.0
		"beber", "beber_mana":
			_drink_kind = "mp" if kind == "beber_mana" else "hp"
			_ensure_flask()
			_drink_t = u * DRINK_LEN
		"desfazer":
			_fx_dbg = Vector3(0.0, u, 1.0)
		"formar":
			_fx_dbg = Vector3(0.0, 1.0 - u, -1.0)
		"apagado":
			fade = 1.0
	_pose(0.0)
	# a arma escapa da mão quando os joelhos cedem e fica deitada ao lado
	if (kind == "queda" and _dp > 0.55) or kind == "caido" or (kind == "levantar" and u < 0.12):
		_drop_weapon(true)
		_pose(0.0)
	_fade_w = fade
	_fx_set(fade, 0.0, 1.0)

# ---------------- quadro a quadro ----------------
# Desempenho (opções gráficas): no modo leve, personagens a mais de anim_max_dist metros da câmera não
# recalculam a pose; fora do campo de visão, ninguém recalcula (fica a última pose até voltar à tela).
static var anim_max_dist := 0.0  # 0 = sem limite

func _should_pose() -> bool:
	var cam := get_viewport().get_camera_3d() if is_inside_tree() else null
	if cam == null:
		return true
	var head := global_position + Vector3(0, 1.0, 0)
	if anim_max_dist > 0.0 and cam.global_position.distance_to(head) > anim_max_dist:
		return false
	return cam.is_position_in_frustum(head) or cam.global_position.distance_to(head) < 4.0

func _process(delta: float) -> void:
	if skel == null:
		return
	_t += delta
	if debug_freeze:
		_pose(0.0)
		return
	_body_advance(delta)
	_act_advance(delta)
	var sc := maxf(0.2, scale.x)
	var v := speed / sc
	_speed_s = lerpf(_speed_s, v, clampf(delta * 10.0, 0.0, 1.0))
	_amp = lerpf(_amp, smoothstep(0.04, 0.55, _speed_s), clampf(delta * 9.0, 0.0, 1.0))
	_run = lerpf(_run, smoothstep(1.7, 3.2, _speed_s), clampf(delta * 5.0, 0.0, 1.0))
	var fighting := not _act.is_empty() and bool(_act.get("guard", true))
	_combat_w = lerpf(_combat_w, 1.0 if combat or fighting else 0.0, clampf(delta * 4.0, 0.0, 1.0))
	_turn_amp = lerpf(_turn_amp, clampf(absf(turn) * 0.22, 0.0, 0.55) * (1.0 - _amp), clampf(delta * 6.0, 0.0, 1.0))
	var ma := lerp_angle(atan2(_mdir.x, _mdir.y), atan2(move_dir.x, move_dir.y), clampf(delta * 6.0, 0.0, 1.0))
	_mdir = Vector2(sin(ma), cos(ma))
	# de costas, a passada de frente tocada ao contrário (o pé de apoio vem de trás para a frente)
	if _mdir.y < -0.35:
		_back = true
	elif _mdir.y > -0.15:
		_back = false
	var cycle := stride_cycle(_speed_s) * _dir_cycle()
	# salto e investida: o corpo desliza com as pernas da ação; a passada não corre junto
	if _act.is_empty() or not bool(_act.get("force_legs", false)):
		_phase += (TAU * _speed_s * delta / cycle) * (-1.0 if _back else 1.0) + absf(turn) * delta * 1.4 * (1.0 - _amp)
	# troca do pé de apoio parado (a cada 8–14 s), suave
	_stand_in -= delta
	if _stand_in <= 0.0:
		_stand_in = randf_range(8.0, 14.0)
		_stand_target = -_stand_target
	_stand = lerpf(_stand, _stand_target, clampf(delta * 1.6, 0.0, 1.0))
	# corpo inteiro: inclina ao acelerar/frear e para dentro das curvas
	_lean_f = lerpf(_lean_f, clampf(accel * 0.012, -0.13, 0.11), clampf(delta * 6.0, 0.0, 1.0))
	_lean_s = lerpf(_lean_s, clampf(-turn * speed * 0.018, -0.26, 0.26), clampf(delta * 6.0, 0.0, 1.0))
	# ponto do cabo na mão e segunda mão
	_slide = lerpf(_slide, _target_slide(), clampf(delta * 6.0, 0.0, 1.0))
	if grip_node:
		grip_node.position = Vector3(0, -_slide, 0)
	var want_two := 1.0 if _two_point(1) >= -0.5 and (_combat_w > 0.5 or not _act.is_empty()) and _run < 0.6 and _dp <= 0.001 else 0.0
	_two_w = lerpf(_two_w, want_two, clampf(delta * 8.0, 0.0, 1.0))
	# olhar
	var yaw_t := 0.0
	var pitch_t := 0.0
	if _look_w > 0.01:
		var local := global_transform.affine_inverse() * _look_pos
		var yy := atan2(local.x, local.z)
		if absf(yy) < 1.9:
			yaw_t = clampf(yy, -1.05, 1.05) * _look_w
			pitch_t = clampf(atan2(local.y - 1.35, maxf(0.3, Vector2(local.x, local.z).length())), -0.5, 0.45) * _look_w
	_look_yaw = lerpf(_look_yaw, yaw_t, clampf(delta * 5.0, 0.0, 1.0))
	_look_pitch = lerpf(_look_pitch, pitch_t, clampf(delta * 5.0, 0.0, 1.0))
	if not _should_pose():
		return
	_pose(delta)
	_face(delta)

func _face(delta: float) -> void:
	_blink_in -= delta
	if _blink_in <= 0.0 and _blink_t < 0.0:
		_blink_t = 0.0
		_blink_in = randf_range(2.2, 5.0)
	var bv := 0.0
	if _blink_t >= 0.0:
		_blink_t += delta
		bv = 1.0 - absf(_blink_t / 0.07 - 1.0)
		if _blink_t >= 0.14:
			_blink_t = -1.0
			bv = 0.0
	var face_busy := false
	var dead_eyes := _down and _down_dead and _dp > 0.6
	for ename in expr_targets.keys():
		var target: float = float(expr_weight.get(ename + "_target", 0.0)) if _t < float(expr_until[ename]) and not dead_eyes else 0.0
		var w: float = lerpf(float(expr_weight[ename]), target, clampf(delta * 12.0, 0.0, 1.0))
		expr_weight[ename] = w
		if w > 0.05:
			face_busy = true
		for t in expr_targets[ename]:
			(t[0] as MeshInstance3D).set_blend_shape_value(t[1], w)
	if dead_eyes:
		bv = 1.0
		face_busy = false
	if not moving and _act.is_empty() and not is_down():
		_smile_in -= delta
		if _smile_in <= 0.0:
			_smile_in = randf_range(7.0, 14.0)
			express("happy", 0.65, 1.6)
	for b in blink_meshes:
		(b[0] as MeshInstance3D).set_blend_shape_value(b[1], 0.0 if face_busy else clampf(bv, 0.0, 1.0))

func _stance_family() -> String:
	var f := weapon_family
	if STANCE_ALIAS.has(f):
		f = STANCE_ALIAS[f]
	return f if STANCES.has(f) else ""

func _target_slide() -> float:
	if grip.is_empty():
		return 0.0
	var s: Array = grip["slide"]
	var wpd: Dictionary = WPOSES.get(_wpose_family(), {})
	if wpd.is_empty():
		var base := lerpf(float(s[0]), float(s[1]), _combat_w)
		return lerpf(base, float(s[2]), _run * _amp)
	var a := clampf(_amp + _turn_amp, 0.0, 1.0)
	var sw := _state_weights(a, _combat_w, a * _run)
	var rel := float(s[0])
	var rd: Dictionary = wpd["relaxed"]
	if rd.has("plant"):
		# o pé da arma encosta no chão: o cabo desliza na mão até a ponta de baixo tocar o solo
		var av: Vector3 = (rd["a"] as Vector3).normalized()
		var hy: float = _s0.y + (rd["p"] as Vector3).y * _arm_k
		rel = hy / maxf(av.y, 0.2) - float(rd["plant"])
	var wd: Dictionary = wpd.get("walk", rd)
	var walk := float(wd.get("slide", rel))
	return rel * float(sw[0]) + walk * float(sw[1]) + float(s[1]) * float(sw[2]) + float(s[2]) * float(sw[3])

## Ponto do cabo da segunda mão (estado 0 relaxado, 1 guarda, 2 corrida); −1 = uma mão só.
func _two_point(state: int) -> float:
	if grip.is_empty():
		return -1.0
	var wpd: Dictionary = WPOSES.get(_wpose_family(), {})
	if not wpd.is_empty():
		var d: Dictionary = wpd[["relaxed", "guard", "run"][state]]
		return _slide + float(d["two"]) if d.has("two") else -1.0
	return float(grip["two"][state])

# ---------------- ossos auxiliares ----------------
static func _arc(a: Vector3, b: Vector3) -> Quaternion:
	var an := a.normalized()
	var bn := b.normalized()
	var d := an.dot(bn)
	if d > 0.99999:
		return Quaternion.IDENTITY
	if d < -0.99999:
		var axis := an.cross(Vector3.UP)
		if axis.length() < 1e-3:
			axis = an.cross(Vector3.RIGHT)
		return Quaternion(axis.normalized(), PI)
	return Quaternion(an.cross(bn).normalized(), acos(clampf(d, -1.0, 1.0)))

## Rotação do braço (D no espaço do personagem) a partir do vetor de postura.
func _arm_d(side: String, a: Array) -> Array:
	var sgn := 1.0 if side == "l" else -1.0
	var dir: Vector3 = (a[0] as Vector3).normalized()
	var q_u := Quaternion(dir, float(a[1]) * sgn) * _arc(Vector3(sgn, 0, 0), dir)
	var q_l := Quaternion(Vector3.UP, -float(a[2]) * sgn)
	# punho: supinação (eixo do antebraço), desvio (+ polegar) e flexão (palma)
	var q_h := Quaternion(Vector3.BACK, -float(a[3]) * sgn) * Quaternion(Vector3.UP, -float(a[4]) * sgn) * Quaternion(Vector3.RIGHT, -float(a[5]) * sgn)
	return [q_u, q_l, q_h]

static func _mix_arm(a: Array, b: Array, t: float) -> Array:
	if t <= 0.0:
		return a
	if t >= 1.0:
		return b
	return [(a[0] as Vector3).lerp(b[0], t).normalized(), lerpf(a[1], b[1], t), lerpf(a[2], b[2], t), lerpf(a[3], b[3], t), lerpf(a[4], b[4], t), lerpf(a[5], b[5], t)]

## Balanço do braço na marcha: gira a direção em torno do eixo esquerda-direita.
static func _swing_arm(a: Array, swing: float, elbow_add: float) -> Array:
	var dir := (a[0] as Vector3).rotated(Vector3.RIGHT, -swing)
	return [dir, a[1], float(a[2]) + elbow_add, a[3], a[4], a[5]]

func _finger_pose(side: String, curl: float, thumb: float, index := -1.0) -> void:
	var d: Dictionary = fingers.get(side, {})
	if d.is_empty():
		return
	var sgn := 1.0 if side == "l" else -1.0
	var per := {"index": [1.15, 1.35, 0.9], "middle": [1.25, 1.4, 0.9], "ring": [1.3, 1.4, 0.95], "little": [1.35, 1.35, 1.0]}
	for f in ["index", "middle", "ring", "little"]:
		var segs: Array = d.get(f, [])
		var c := index if (f == "index" and index >= 0.0) else curl
		for i in segs.size():
			var a: float = float(per[f][i]) * c + (0.06 * i if c < 0.3 else 0.0)
			_bone_raw(segs[i], Quaternion(Vector3.BACK, -a * sgn))
	var th: Array = d.get("thumb", [])
	for i in th.size():
		var ta: float = [0.35, 0.5, 0.45][i] * thumb
		_bone_raw(th[i], Quaternion(Vector3.UP, 0.35 * thumb * sgn * (1.0 if i == 0 else 0.0)) * Quaternion(Vector3.RIGHT, ta))

func _bone_raw(b: Dictionary, d_model: Quaternion) -> void:
	var d: Quaternion = s_rot.inverse() * d_model * s_rot
	skel.set_bone_pose_rotation(b["idx"], ((b["pg"] as Quaternion).inverse() * d * (b["bg"] as Quaternion)).normalized())

## Define a rotação global de um osso (espaço do esqueleto), misturando com a atual.
func _set_global_rot(idx: int, basis_g: Basis, weight: float) -> void:
	var parent := skel.get_bone_parent(idx)
	var pg: Basis = skel.get_bone_global_pose(parent).basis.orthonormalized() if parent >= 0 else Basis()
	var local := (pg.inverse() * basis_g.orthonormalized()).get_rotation_quaternion()
	var cur := skel.get_bone_pose_rotation(idx)
	skel.set_bone_pose_rotation(idx, cur.slerp(local, weight).normalized())

## Quadro anatômico da mão na pose T (colunas: dedos, polegar×dedos, polegar), no esqueleto.
func _hand_frame_t(side: String) -> Basis:
	var f := Basis(Vector3(1, 0, 0), Vector3(0, 1, 0), Vector3(0, 0, 1)) if side == "l" else Basis(Vector3(-1, 0, 0), Vector3(0, -1, 0), Vector3(0, 0, 1))
	return Basis(s_rot.inverse()) * f

## IK de dois ossos: leva a mão a segurar o cabo no ponto dado (mundo), com o polegar apontando
## para a ponta da arma e o cotovelo para o lado do polo (eixos do personagem).
func _ik_grip(side: String, point_w: Vector3, axis_w: Vector3, pole_m: Vector3, weight: float) -> void:
	var ku := side + "_upper_arm"
	var kl := side + "_lower_arm"
	var kh := side + "_hand"
	if weight <= 0.001 or not (bones.has(ku) and bones.has(kl) and bones.has(kh)):
		return
	var iu: int = bones[ku]["idx"]
	var il: int = bones[kl]["idx"]
	var ih: int = bones[kh]["idx"]
	var inv := skel.global_transform.affine_inverse()
	var point := inv * point_w
	var axis := (skel.global_transform.basis.inverse() * axis_w).normalized()
	var pole := (skel.global_transform.basis.inverse() * (global_transform.basis * pole_m)).normalized()
	var ft := _hand_frame_t(side)
	var palm_sgn := -1.0 if side == "l" else 1.0
	for pass_i in 2:
		var gu := skel.get_bone_global_pose(iu)
		var gl := skel.get_bone_global_pose(il)
		var gh := skel.get_bone_global_pose(ih)
		# quadro desejado da mão: polegar no eixo do cabo, dedos continuando o antebraço
		var fore := (gh.origin - gl.origin).normalized()
		var fing := (fore - axis * axis.dot(fore))
		if fing.length() < 1e-3:
			fing = pole.cross(axis)
		fing = fing.normalized()
		var fd := Basis(fing, axis.cross(fing), axis)
		var wrist := point - fd * Vector3(_grip_x, palm_sgn * _palm_y, 0.0)
		var S := gu.origin
		var E := gl.origin
		var L1 := S.distance_to(E)
		var L2 := E.distance_to(gh.origin)
		var to_t := wrist - S
		var dd := clampf(to_t.length(), 0.01, (L1 + L2) * 0.999)
		var n := to_t.normalized()
		var p := pole - n * n.dot(pole)
		if p.length() < 1e-3:
			p = Vector3.DOWN
		p = p.normalized()
		var a := (L1 * L1 - L2 * L2 + dd * dd) / (2.0 * dd)
		var hgt := sqrt(maxf(0.0, L1 * L1 - a * a))
		var e2 := S + n * a + p * hgt
		_set_global_rot(iu, Basis(_arc(E - S, e2 - S)) * gu.basis, weight)
		gl = skel.get_bone_global_pose(il)
		gh = skel.get_bone_global_pose(ih)
		_set_global_rot(il, Basis(_arc(gh.origin - gl.origin, S + n * dd - gl.origin)) * gl.basis, weight)
		if pass_i == 1:
			var rest_h: Basis = skel.get_bone_global_rest(ih).basis
			_finish_hand(side, (fd * ft.inverse()) * rest_h, weight)

## Posição e eixo atuais da arma (mundo), calculados direto do esqueleto (sem esperar o anexo).
func _weapon_point_w(y: float) -> Array:
	if weapon_holder == null or grip_node == null:
		return []
	var side: String = grip["hand"]
	var ih: int = bones[side + "_hand"]["idx"]
	var t: Transform3D = skel.global_transform * skel.get_bone_global_pose(ih) * weapon_holder.transform * grip_node.transform * weapon_mesh.transform
	return [t * Vector3(0, y, 0), (t.basis * Vector3.UP).normalized()]

# ---------------- pose ----------------
func _pose(delta: float) -> void:
	var force := not _act.is_empty() and bool(_act.get("force_legs", false))
	var a := clampf(_amp + _turn_amp, 0.0, 1.0)
	if force:
		a = 0.0  # investida e salto: as pernas são da ação, não da passada (o corpo desliza pelo chão)
	# caído (D186): kc = agachado (os joelhos cederam), kl = deitado de lado; sem passada nem guarda
	var kc := clampf(_dp, 0.0, 1.0)
	var kl := clampf(_dp - 1.0, 0.0, 1.0)
	var downing := _dp > 0.001
	# caindo, os braços amolecem com os joelhos; levantando (vivo), a mão da arma já a segura na postura
	var limp := maxf(smoothstep(0.25, 0.85, kc) * (1.0 if _down else 0.35), kl) if downing else 0.0
	a *= 1.0 - kc
	var wk := a * (1.0 - _run)
	var rn := a * _run
	var idle := 1.0 - a
	var cw := _combat_w * (1.0 - kc)
	if downing and not _down:
		cw = maxf(cw, kc * 0.9)   # levantando: a arma vem para a guarda, à frente do corpo (não arrasta no chão)
	var drink_w := _drink_weight()
	var ph := _phase / TAU
	var breath := sin(_t * 1.7)
	var stand := _stand * idle * (1.0 - cw * 0.7)
	var sw := _state_weights(a, cw, rn)
	var wpd: Dictionary = WPOSES.get(_wpose_family(), {})
	# giro e inclinação do tronco da postura (guarda das armas guiadas); a ação parte deles
	var spine_yaw := 0.0
	var spine_lean := 0.0
	if not wpd.is_empty():
		var gd: Dictionary = wpd["guard"]
		spine_yaw = float(gd.get("yaw", 0.0)) * sw[2]
		spine_lean = float(gd.get("lean", 0.0)) * sw[2]
		# levantando do chão a guarda já vem, mas o tronco só gira para ela depois de sair de deitado (deitado de lado,
		# o giro levava o braço de cima para dentro do chão)
		spine_yaw *= 1.0 - kl
	var acting := not _act.is_empty() or _xf_t >= 0.0
	var ab := _act_body({"yaw": spine_yaw, "lean": spine_lean}) if acting else {}
	if downing:
		ab = _down_body(ab, kc, kl)
	var spin := float(ab.get("spin", 0.0))
	var body_basis := Basis(Vector3.UP, spin) * Basis.from_euler(Vector3(_lean_f * (1.0 - kc), 0.0, _lean_s * (1.0 - kc))) * _base_basis
	model.transform = _topple(kl) * Transform3D(body_basis, Vector3.ZERO)
	# ---- pernas: marcha/corrida por curvas + parado (contrapposto) + guarda ----
	var leg := {}
	var drop := {}
	var gait := {}
	var kd := _dir_amp()
	for side in ["l", "r"]:
		var u := ph if side == "l" else ph + 0.5
		var hip := (deg_to_rad(_curve(WALK_HIP, u)) * wk + deg_to_rad(_curve(RUN_HIP, u)) * rn * RUN_HIP_K) * kd
		gait[side] = hip
		var knee := deg_to_rad(_curve(WALK_KNEE, u)) * wk + deg_to_rad(_curve(RUN_KNEE, u)) * rn
		var ankle := deg_to_rad(_curve(WALK_ANKLE, u)) * wk + deg_to_rad(_curve(RUN_ANKLE, u)) * rn
		var sgn := 1.0 if side == "l" else -1.0
		# parado: perna de apoio esticada, a outra solta (joelho levemente dobrado, à frente)
		var free := clampf(-stand * sgn, 0.0, 1.0)
		var hip_s := idle * (0.03 + free * 0.06)
		var knee_s := idle * (0.05 + free * 0.17)
		# guarda: pé esquerdo à frente, direito atrás, joelhos flexionados
		hip_s += cw * idle * (0.32 if side == "l" else -0.12)
		knee_s += cw * idle * (0.42 if side == "l" else 0.36)
		hip += hip_s
		knee += knee_s
		leg[side] = [hip, knee, ankle, hip_s - knee_s, hip_s, knee_s, 0.0]
		drop[side] = _thigh_len + _shin_len - (_thigh_len * cos(hip) + _shin_len * cos(hip - knee))
	var support := minf(float(drop["l"]), float(drop["r"]))
	# ---- pernas da ação: pés plantados (ou no passo pedido) enquanto o quadril agacha, avança ou pula ----
	var lw := 0.0
	var hip_off := Vector3.ZERO
	var hip_twist := float(ab.get("hip", 0.0))
	if not ab.is_empty():
		lw = clampf(float(_act.get("legs", 1.0)) if not _act.is_empty() else 1.0, 0.0, 1.0) * (1.0 if force else idle)
		if lw > 0.001:
			hip_off = _legs_ik(leg, drop, support, ab, lw)
	if kl > 0.0:
		_lie_legs(leg, kl)
	for side in ["l", "r"]:
		var sgn := 1.0 if side == "l" else -1.0
		var hip: float = leg[side][0]
		var knee: float = leg[side][1]
		var ankle: float = leg[side][2]
		# pé: ângulo do tornozelo da marcha + compensação da parte estática (pé paralelo ao chão)
		var flat: float = leg[side][3]
		var splay := 0.1 + 0.08 * idle
		var abduct := (0.035 + 0.03 * cw) * idle + 0.015
		var abd_act: float = leg[side][6]
		# o giro da bacia da ação não torce os pés plantados (a coxa gira de volta)
		var twist_back := -hip_twist * lw
		# a passada balança a coxa na direção do movimento (de costas, de lado); o resto do ângulo fica na frente
		var dyn: float = float(gait[side]) * (1.0 - lw) * (1.0 - kl)
		var swing_q := Quaternion(_swing_axis(), -dyn) * Quaternion(Vector3.RIGHT, -(hip - dyn))
		_bone(side + "_upper_leg", Quaternion(Vector3.UP, twist_back) * swing_q * Quaternion(Vector3.BACK, abduct * sgn + abd_act - _stand * idle * 0.05) * Quaternion(Vector3.UP, splay * sgn))
		_bone(side + "_lower_leg", Quaternion(Vector3.RIGHT, knee))
		_bone(side + "_foot", Quaternion(Vector3.RIGHT, -ankle + flat) * Quaternion(Vector3.BACK, -(abduct * sgn + abd_act)))
	# ---- quadril: altura pelo pé de apoio (o mais baixo encosta no chão) + voo da corrida ----
	var flight := rn * 0.03 * absf(sin(_phase))
	var sway := wk * 0.018 * sin(_phase) + 0.022 * stand
	_set_offset("hips", Vector3(sway, -support + flight - 0.02 * cw * idle, 0.0) + hip_off)
	var hip_l: float = leg["l"][0]
	var hip_r: float = leg["r"][0]
	var pelvis_yaw := -(hip_l - hip_r) * (0.12 * wk + 0.16 * rn) * absf(_mdir.y) - 0.22 * cw * idle + hip_twist
	var pelvis_roll := 0.05 * stand + wk * 0.04 * cos(_phase)
	_bone("hips", Quaternion(Vector3.UP, pelvis_yaw) * Quaternion(Vector3.BACK, pelvis_roll) * Quaternion(Vector3.RIGHT, 0.04 * rn))
	_fit_skirt(leg, kl)
	# susto ao levar golpe
	var hurt := 0.0
	if _hurt >= 0.0:
		_hurt += delta
		hurt = smoothstep(0.0, 0.08, _hurt) * (1.0 - smoothstep(0.08, 0.4, _hurt))
		if _hurt > 0.4:
			_hurt = -1.0
	# ---- braços: postura da família (relaxado ↔ guarda ↔ corrida) + balanço da marcha ----
	var fam := _stance_family()
	var st: Dictionary = STANCES[fam]
	var wside: String = grip.get("hand", "r") if not grip.is_empty() else "r"
	var oside := "l" if wside == "r" else "r"
	var o_guard: Array = ARM_SHIELD_GUARD if has_shield else st["guard"]["o"]
	var w_arm: Array = _mix_arm(_mix_arm(st["relaxed"]["w"], st["guard"]["w"], cw), st["run"]["w"], rn)
	var o_arm: Array = _mix_arm(_mix_arm(st["relaxed"]["o"], o_guard, cw), st["run"]["o"], rn)
	# balanço oposto às pernas: o braço direito vai à frente quando o pé esquerdo pisa (fase 0)
	# de lado, os braços quase não balançam
	var swing_amp := (0.3 * wk + 0.55 * rn) * absf(_mdir.y)
	var swing_l := -cos(_phase) * swing_amp
	var swing_r := cos(_phase) * swing_amp
	# arma de golpe pesa: o braço que a carrega balança menos
	var heavy := 0.6 if weapon_family in ["wand", "scepter", "claw"] else 0.35
	if wside == "r":
		w_arm = _swing_arm(w_arm, swing_r * (heavy if weapon_family != "" else 1.0) * (1.0 - cw * 0.8), 0.0)
		o_arm = _swing_arm(o_arm, swing_l * (1.0 - cw * 0.8) * (0.4 if has_shield else 1.0), 0.15 * maxf(0.0, -swing_l) * rn)
	else:
		w_arm = _swing_arm(w_arm, swing_l * 0.5 * (1.0 - cw * 0.8), 0.0)
		o_arm = _swing_arm(o_arm, swing_r * (1.0 - cw * 0.8), 0.15 * maxf(0.0, -swing_r) * rn)
	if downing:
		w_arm = _mix_arm(w_arm, _limp_arm(wside, kl), limp).duplicate()
		o_arm = _mix_arm(o_arm, _limp_arm(oside, kl), limp).duplicate()
	# respiração e soltura dos braços parado
	w_arm[2] = float(w_arm[2]) + breath * 0.02 * idle
	o_arm[2] = float(o_arm[2]) + breath * 0.025 * idle
	spine_yaw = float(ab.get("yaw", spine_yaw))
	spine_lean = float(ab.get("lean", spine_lean))
	var u_act := _act_u()
	# flecha na corda e azagaia na mão, conforme o momento do movimento
	if arrow_node:
		var ar: Array = _act.get("arrow", []) if not _act.is_empty() else []
		arrow_node.visible = not ar.is_empty() and u_act > float(ar[0]) and u_act < float(ar[1])
	if weapon_mesh and weapon_family == "javelin" and _dropped == null:
		var th: Array = _act.get("throw", []) if not _act.is_empty() else []
		weapon_mesh.visible = th.is_empty() or not (u_act > float(th[0]) and u_act < float(th[1]))
	# ---- tronco, pescoço e cabeça ----
	var roll := float(ab.get("roll", 0.0))
	var head_up := float(ab.get("head", 0.0)) + _drink_head()
	var neck_roll := -_fall_side * 0.32 * kl
	var lean := (0.04 * wk + 0.2 * rn) * maxf(0.0, _mdir.y) + 0.025 * breath * idle - 0.22 * hurt + 0.06 * cw * idle + spine_lean
	var counter := -pelvis_yaw * 0.85 + spine_yaw
	# em guarda/golpe a cabeça compensa todo o giro do tronco para manter os olhos no oponente
	var look_comp := 1.0 + cw
	_bone("spine", Quaternion(Vector3.RIGHT, lean) * Quaternion(Vector3.UP, counter * 0.6) * Quaternion(Vector3.BACK, -pelvis_roll * 0.7 + roll * 0.6))
	_bone("chest", Quaternion(Vector3.RIGHT, 0.02 * breath - 0.04 * rn) * Quaternion(Vector3.UP, counter * 0.4) * Quaternion(Vector3.BACK, -pelvis_roll * 0.3 + roll * 0.4))
	_bone("neck", Quaternion(Vector3.RIGHT, -0.04 * a - 0.1 * rn - lean * 0.3 + head_up * 0.4) * Quaternion(Vector3.UP, _look_yaw * 0.4 * (1.0 - limp) - counter * 0.3 * look_comp) * Quaternion(Vector3.BACK, neck_roll))
	var look_idle := sin(_t * 0.37) * 0.08 * idle * (1.0 - absf(_look_yaw)) * (1.0 - cw)
	_bone("head", Quaternion(Vector3.RIGHT, sin(_t * 0.6) * 0.03 * idle - _look_pitch * 0.6 - 0.12 * hurt - lean * 0.2 + head_up * 0.6) * Quaternion(Vector3.UP, look_idle + _look_yaw * 0.6 - counter * 0.2 * look_comp) * Quaternion(Vector3.BACK, 0.04 * stand - roll * 0.3))
	# ---- aplica braços (camada direta) ----
	var qw := _arm_d(wside, w_arm)
	var qo := _arm_d(oside, o_arm)
	_bone(wside + "_upper_arm", qw[0])
	_bone(wside + "_lower_arm", qw[1])
	_bone(wside + "_hand", qw[2])
	_bone(oside + "_upper_arm", qo[0])
	_bone(oside + "_lower_arm", qo[1])
	_bone(oside + "_hand", qo[2])
	# ---- alvo da arma: pose da postura (tabela guiada) ou a da mão já posta; a ação parte dele ----
	var tgt := {}
	if weapon_mesh and not wpd.is_empty():
		_s0 = _shoulder_ref()
		tgt = _wpose_blend(wpd, sw, wside)
		if downing and weapon_family == "bow":
			# agachado, o arco deita para a frente (a ponta de baixo não entra no chão)
			var tb := Basis(Vector3.RIGHT, 0.9 * kc)
			tgt["a"] = (tb * (tgt["a"] as Vector3)).normalized()
			tgt["e"] = (tb * (tgt["e"] as Vector3)).normalized()
	var o_curl := (0.22 * (1.0 - cw) + (0.45 if weapon_family in ["axe_1h", "hammer_1h", "sword_1h"] else 0.9) * cw) if not has_shield else 0.9
	var string_w := float(tgt.get("off", [0, 0, 0, 0, 0.0])[4]) if weapon_family == "bow" and tgt.has("off") else 0.0
	var arms := {}
	var arm_base := {}
	var rot := Basis(Vector3.UP, spin)
	if acting:
		_s0 = _shoulder_ref()
		arm_base = _arm_base(tgt, wside, spin, o_curl, string_w)
		arms = _act_arms(arm_base)
	# ---- dedos ----
	var w_curl := 1.0 if weapon_family != "" else (0.95 * cw + 0.22 * (1.0 - cw))
	var w_thumb := 1.0 if weapon_family != "" else (0.8 * cw + 0.25 * (1.0 - cw))
	if _dropped != null:
		w_curl = 0.32
		w_thumb = 0.3
	var g_w := _two_w * (1.0 - limp)
	if acting:
		g_w = clampf(float(arms.get("g", _two_w)), 0.0, 1.0)
	if drink_w > 0.0 and _flask_side == oside:
		g_w *= 1.0 - drink_w   # a mão de apoio sai do cabo para beber
	if downing:
		o_curl = lerpf(o_curl, 0.3, limp)
	if weapon_family == "bow" and (cw > 0.5 or acting):
		# mão da corda: dedos em gancho na corda; abre ao soltar
		o_curl = lerpf(0.12, 0.55, clampf(float(arms.get("dw", string_w)) if acting else 1.0, 0.0, 1.0))
	var index := -1.0
	if acting:
		o_curl = float(arms.get("oc", o_curl))
		var pt := clampf(float(arms.get("pt", 0.0)), 0.0, 1.0)
		if pt > 0.01:
			index = lerpf(o_curl, 0.04, pt)
	_finger_pose(wside, w_curl, w_thumb)
	_finger_pose(oside, lerpf(o_curl, 1.0, g_w), lerpf(0.25, 1.0, g_w) if index < 0.0 else 0.7, index)
	# ---- camada da arma: a mão vai até onde a arma deve estar (IK) ----
	var off_spec: Array = []
	var two_rel := -999.0
	var slide_now := _slide
	_string_pt = Vector3.INF
	var final := tgt
	if acting:
		final = _act_target(arms, arm_base, wside, rot)
	if not final.is_empty():
		slide_now = float(final.get("slide", _slide))
		if grip_node and absf(slide_now - _slide) > 1e-4:
			grip_node.position = Vector3(0, -slide_now, 0)
		if weapon_mesh and not wpd.is_empty():
			if _dropped == null and limp < 0.999:
				_ik_weapon(wside, final, 1.0 - limp)
		elif acting:
			var wik := clampf(float(arms.get("wik", 0.0)), 0.0, 1.0)
			if weapon_holder:
				_ik_weapon(wside, final, wik)
			else:
				_ik_bare_hand(wside, final, wik)
		off_spec = tgt.get("off", [])
		two_rel = float(final.get("two", -999.0))
	# ---- mão livre: segunda mão no cabo, mão da ação, corda do arco ou pose de morador ----
	var two := (slide_now + two_rel) if two_rel > -900.0 else _two_point(1)
	var did_off := false
	if g_w > 0.01 and two >= -0.5:
		two = _reach_two(oside, two, slide_now)
		var wp := _weapon_point_w(two)
		if not wp.is_empty():
			var pole2 := Vector3(0.6 if oside == "l" else -0.6, -1.0, -0.4)
			_ik_grip(oside, wp[0], wp[1], pole2, g_w)
			did_off = true
	if acting:
		did_off = _act_off_hand(oside, arms, final, rot) or did_off
	if not did_off and not off_spec.is_empty() and float(off_spec[4]) > 0.01:
		_ik_hand_free(oside, off_spec[0], off_spec[1], off_spec[2], off_spec[3], float(off_spec[4]))
		if off_spec.size() > 5 and float(off_spec[5]) > 0.5:
			_string_pt = _root_to_world(off_spec[0] + (off_spec[1] as Vector3) * 0.035 * _arm_k)
	elif not did_off and npc_variant > 0 and weapon_family == "":
		_npc_hands(idle * (1.0 - limp))
	if _drink_t >= 0.0 and _flask != null:
		_pose_drink(_flask_side, drink_w)
		if drink_w > 0.3 and weapon_family == "bow":
			_string_pt = Vector3.INF   # a mão da corda está no frasco
	if acting:
		_out_body = ab
		_out_arms = arms
	else:
		_out_body = {}
		_out_arms = {}
	if not aims.is_empty():
		_solve_aims()
	if arrow_node and arrow_node.visible:
		_place_arrow()
	if string_parts.size() == 2:
		_place_string()

## Ponto do cabo da segunda mão ao alcance do ombro dela: o pedido ou, se o braço não chega, o mais perto dele que
## chega, deslizando em direção à mão principal (sem encostar nela) — a mão nunca fica solta ao lado do cabo.
func _reach_two(oside: String, two_abs: float, slide_now: float) -> float:
	var w0 := _weapon_point_w(slide_now)
	if w0.is_empty() or not bones.has(oside + "_upper_arm"):
		return two_abs
	var sh: Vector3 = skel.global_transform * skel.get_bone_global_pose(bones[oside + "_upper_arm"]["idx"]).origin
	var k := global_transform.basis.get_scale().x
	var reach := (_upper_len + _fore_len + _grip_x * model.scale.x * 0.8) * k * 0.985
	var p0: Vector3 = w0[0]
	var ax: Vector3 = (w0[1] as Vector3) * k   # metros da arma → mundo (o personagem pode estar em escala)
	var rel := two_abs - slide_now
	if (p0 + ax * rel).distance_to(sh) <= reach:
		return two_abs
	var lo := 0.12 * signf(rel)
	if (p0 + ax * lo).distance_to(sh) > reach:
		return two_abs
	var hi := rel
	for i in 10:
		var mid := (lo + hi) * 0.5
		if (p0 + ax * mid).distance_to(sh) <= reach:
			lo = mid
		else:
			hi = mid
	return slide_now + lo

# ---------------- caído e bebendo: camadas do corpo (D186) ----------------
## Braços soltos: pendurados enquanto os joelhos cedem; deitado, o de baixo estendido à frente rente ao chão e o de
## cima caído por cima, com a mão no chão diante do peito.
const ARM_HANG_L := [Vector3(0.24, -0.92, 0.3), 0.0, 0.35, 0.25, 0.0, 0.0]
const ARM_HANG_R := [Vector3(-0.24, -0.92, 0.3), 0.0, 0.35, 0.25, 0.0, 0.0]
## Pivô do tombo: a borda do corpo do lado da queda, no chão (metros do personagem, a partir do meio dos pés).
const TOPPLE_PIVOT := 0.2

## Canais do corpo do caído, por cima dos da ação (a queda a cancela): agacha com os pés plantados, curva o tronco e
## baixa a cabeça; deitado, o tronco se ajeita e encosta a cabeça no chão.
func _down_body(ab: Dictionary, kc: float, kl: float) -> Dictionary:
	var out := ab.duplicate()
	var deep := (_thigh_len + _shin_len) * 0.5
	out["cr"] = deep * smoothstep(0.0, 1.0, kc) * (1.0 - 0.3 * kl)
	out["fz"] = -0.05 * kc
	out["lean"] = 0.48 * kc - 0.26 * kl
	out["head"] = 0.42 * kc - 0.3 * kl
	out["roll"] = -_fall_side * 0.12 * kl
	out.erase("spin")
	out.erase("hop")
	return out

## Tombo de lado: o corpo inteiro gira no eixo da frente em volta da borda do lado da queda, rente ao chão.
func _topple(kl: float) -> Transform3D:
	if kl <= 0.0001:
		return Transform3D.IDENTITY
	var piv := Vector3(_fall_side * TOPPLE_PIVOT, 0.0, 0.0)
	var r := Basis(Vector3.BACK, -_fall_side * (PI * 0.5 - 0.05) * kl)
	return Transform3D(Basis.IDENTITY, piv) * Transform3D(r, Vector3.ZERO) * Transform3D(Basis.IDENTITY, -piv)

## Pernas do deitado: dobradas e soltas, a de cima um pouco mais à frente.
func _lie_legs(leg: Dictionary, kl: float) -> void:
	for side in ["l", "r"]:
		var top: bool = (side == "l") != (_fall_side > 0.0)
		var hip_t := deg_to_rad(62.0 if top else 34.0)
		var knee_t := deg_to_rad(78.0 if top else 58.0)
		var l: Array = leg[side]
		l[0] = lerpf(float(l[0]), hip_t, kl)
		l[1] = lerpf(float(l[1]), knee_t, kl)
		l[2] = float(l[2]) * (1.0 - kl)
		l[3] = lerpf(float(l[3]), hip_t - knee_t + deg_to_rad(18.0), kl)
		l[6] = float(l[6]) * (1.0 - kl) + (0.08 if top else -0.04) * _fall_side * kl

## Saia longa: peça rígida presa ao quadril, que de pé desce até perto dos tornozelos. Agachado (queda, renascer,
## golpes que ajoelham) as coxas vão para a frente e a barra entraria no chão com os joelhos saindo pela frente: a
## saia inclina para a frente com a média das coxas, achata de lado quando o corpo está deitado e encurta até o ponto
## mais baixo da barra ficar a 2 cm do chão. De pé, andando e correndo fica como era (a média das coxas é pequena).
func _fit_skirt(leg: Dictionary, kl: float) -> void:
	if _long_skirt == null or not bones.has("hips"):
		return
	var thigh := (float(leg["l"][0]) + float(leg["r"][0])) * 0.5
	var tilt := clampf(thigh - 0.35, 0.0, 1.3) * 0.85
	var flat := 1.0 - 0.45 * kl
	var rot := Basis(Vector3.RIGHT, -tilt)
	# a saia no espaço do personagem, pela pose atual do quadril (o anexo do osso só se atualiza no quadro seguinte)
	var holder := _long_skirt.get_parent() as Node3D
	var t_hold: Transform3D = _skel_to_root() * skel.get_bone_global_pose(bones["hips"]["idx"]) * holder.transform
	var b0: Basis = t_hold.basis * rot * Basis.from_scale(Vector3(flat, 1.0, 1.0))
	var down: float = (b0 * Vector3(0.0, -SKIRT_LEN, 0.0)).y
	var sy := 1.0
	if down < -1e-3:
		for k in 8:
			var ph := TAU * float(k) / 8.0
			var y0: float = t_hold.origin.y + (b0 * Vector3(SKIRT_R * cos(ph), 0.0, SKIRT_R * sin(ph))).y
			sy = minf(sy, (y0 - 0.02) / -down)
	sy = clampf(sy, 0.3, 1.0)
	_long_skirt.transform = Transform3D(rot * Basis.from_scale(Vector3(flat, sy, 1.0)), Vector3.ZERO)

func _limp_arm(side: String, kl: float) -> Array:
	var sgn := 1.0 if side == "l" else -1.0
	var hang: Array = ARM_HANG_L if side == "l" else ARM_HANG_R
	if kl <= 0.0:
		return hang
	var s := _fall_side
	var lie: Array
	# o de baixo gira o antebraço para o dorso (onde fica o escudo) olhar para cima: o escudo deita no chão em vez de
	# entrar nele; o de cima cai à frente do peito com a mão apoiada no chão, sem afundar (conferido pela sonda)
	if sgn == s:
		lie = [Vector3(0.18 * s, 0.38, 0.9), 0.0, 0.45, 0.1, 0.0, -1.2]
	else:
		lie = [Vector3(0.15 * s, -0.45, 0.85), 0.0, 0.9, 0.3, 0.0, 0.0]
	return _mix_arm(hang, lie, kl)

func _drink_u() -> float:
	return clampf(_drink_t / DRINK_LEN, 0.0, 1.0) if _drink_t >= 0.0 else -1.0

## Peso da mão no frasco: sobe até a boca no primeiro quarto e desce no último.
func _drink_weight() -> float:
	var u := _drink_u()
	if u < 0.0 or _flask == null:
		return 0.0
	return smoothstep(0.0, 0.25, u) * (1.0 - smoothstep(0.76, 1.0, u))

## O gole: o frasco vira para cima e a cabeça vai para trás.
static func _drink_tip(u: float) -> float:
	return smoothstep(0.3, 0.46, u) * (1.0 - smoothstep(0.64, 0.78, u))

func _drink_head() -> float:
	var u := _drink_u()
	return -0.38 * _drink_tip(u) if u >= 0.0 else 0.0

## Mão livre com o frasco à boca: o gargalo nos lábios, o polegar para a boca e o cotovelo para fora (com escudo
## nesse braço, para baixo: o escudo fica de lado, sem cobrir o rosto).
func _pose_drink(side: String, w: float) -> void:
	var u := _drink_u()
	_flask.scale = Vector3.ONE * smoothstep(0.02, 0.12, u) * (1.0 - smoothstep(0.86, 0.96, u))
	if w <= 0.001 or not bones.has("head"):
		return
	var tip := _drink_tip(u)
	var sgn := 1.0 if side == "l" else -1.0
	var mouth := _bone_point("head", cfg.get("mouth", Vector3(0.0, 0.008, 0.08)))
	var ax := Vector3(-0.3 * sgn, 0.25, -0.92).lerp(Vector3(-0.16 * sgn, -0.42, -0.89), tip).normalized()
	var grip_p := mouth - ax * 0.078
	# cotovelo baixo e um pouco à frente (o antebraço sobe quase de pé até a boca); com escudo nesse braço, mais
	# junto do corpo, e o escudo fica de lado
	var shielded := has_shield and side == "l"
	var pole := Vector3(0.3 * sgn, -1.0, 0.3) if shielded else Vector3(0.55 * sgn, -1.0, 0.2)
	var f := _forearm_dir(side, grip_p, pole)
	var fing := f - ax * ax.dot(f)
	if fing.length() < 1e-3:
		fing = Vector3.UP - ax * ax.dot(Vector3.UP)
	_ik_hand_free(side, grip_p, fing.normalized(), ax, pole, w)
	_finger_pose(side, lerpf(0.35, 0.95, w), lerpf(0.3, 0.9, w))

## Ponto preso a um osso (espaço do personagem): off nos eixos do personagem na pose de repouso, em unidades do
## esqueleto (como em _attach).
func _bone_point(key: String, off: Vector3) -> Vector3:
	var b: Dictionary = bones[key]
	var gh := skel.get_bone_global_pose(b["idx"])
	var rest := skel.get_bone_global_rest(b["idx"])
	var rot: Basis = gh.basis.orthonormalized() * rest.basis.orthonormalized().inverse()
	return _skel_to_root() * (gh.origin + rot * (Basis(s_rot.inverse()) * off))

# ---------------- ações: avaliação e aplicação ----------------
func _act_advance(delta: float) -> void:
	if _xf_t >= 0.0:
		_xf_t += delta
		if _xf_t >= XF_LEN:
			_xf_t = -1.0
			_xf_body = {}
			_xf_arms = {}
	if _act.is_empty():
		return
	var dur := float(_act["dur"])
	_act_t += delta
	if _act_holding:
		_act_t = minf(_act_t, float(_act["hold"]) * dur)
		if _t > _act_hold_until:
			_act_holding = false
	if _act_t >= dur:
		_act = {}
		if _xf_t < 0.0:
			# terminou (mesmo fora da tela, sem pose recalculada): a próxima ação parte da postura
			_out_body = {}
			_out_arms = {}

func _act_u() -> float:
	if _act.is_empty():
		return 1.0
	return clampf(_act_t / maxf(float(_act["dur"]), 0.05), 0.0, 1.0)

## Canais do corpo no instante atual (giro, inclinação, pernas, giro do corpo inteiro), com a mistura de troca.
func _act_body(base: Dictionary) -> Dictionary:
	var out := {}
	if not _act.is_empty():
		out = Moves.eval(_act, _act_u(), base, false)
		if _act_holding and _act_t >= float(_act["hold"]) * float(_act["dur"]) - 1e-3:
			# segurando a conjuração: treme de leve, juntando força
			out["yaw"] = float(out.get("yaw", base.get("yaw", 0.0))) + sin(_t * 47.0) * 0.012
			out["lean"] = float(out.get("lean", base.get("lean", 0.0))) + sin(_t * 31.0) * 0.008
	if _xf_t >= 0.0:
		out = _xf_mix(_xf_body, out, smoothstep(0.0, XF_LEN, _xf_t), base)
	return out

## Canais dos braços no instante atual, a partir da base (pose da postura), com a mistura de troca.
func _act_arms(base: Dictionary) -> Dictionary:
	var out := {}
	if not _act.is_empty():
		out = Moves.eval(_act, _act_u(), base, true)
	if _xf_t >= 0.0:
		out = _xf_mix(_xf_arms, out, smoothstep(0.0, XF_LEN, _xf_t), base)
	return out

## Mistura dois estados (o de onde a troca parte e o atual); canal que falta num deles vale a base — a mão livre,
## sem base, fica no alvo do outro (o peso dela é que sobe ou desce).
func _xf_mix(from: Dictionary, to: Dictionary, k: float, base: Dictionary) -> Dictionary:
	var out := {}
	for ch in from.keys():
		var b = to.get(ch, from[ch]) if ch in Moves.HOLD_START else to.get(ch, base.get(ch, Vector3.ZERO if ch in Moves.VEC_CH else 0.0))
		out[ch] = lerp(from[ch], b, k)
	for ch in to.keys():
		if out.has(ch):
			continue
		var b0 = to[ch] if ch in Moves.HOLD_START else base.get(ch, Vector3.ZERO if ch in Moves.VEC_CH else 0.0)
		out[ch] = lerp(b0, to[ch], k)
	return out

## Base dos canais dos braços (espaço de referência, sem o giro do corpo): a pose da arma na postura — da tabela
## guiada, ou lida da mão já posta pela camada direta —, a segunda mão, o ponto do cabo, a corda e os dedos.
func _arm_base(tgt: Dictionary, wside: String, spin: float, o_curl: float, string_w: float) -> Dictionary:
	var p: Vector3
	var ax: Vector3
	var e: Vector3
	var pole: Vector3
	var slide := _slide
	# segunda mão: ponto ao longo da arma a partir da mão principal (−999 = arma de uma mão)
	var two_rel := _two_point(1) - _slide if _two_point(1) >= -0.5 else -999.0
	if not tgt.is_empty():
		p = tgt["p"]
		ax = tgt["a"]
		e = tgt["e"]
		pole = tgt["pole"]
		slide = float(tgt.get("slide", _slide))
		if tgt.has("two"):
			two_rel = float(tgt["two"])
	else:
		var held := _held_pose(wside)
		var unspin := Basis(Vector3.UP, -spin)
		p = _s0 + unspin * ((held[0] as Vector3) - _s0)
		ax = unspin * (held[1] as Vector3)
		e = unspin * (held[2] as Vector3)
		pole = unspin * (held[3] as Vector3)
	var draw := 0.0
	var gd: Dictionary = WPOSES.get(_wpose_family(), {}).get("guard", {})
	if gd.has("draw"):
		draw = float(gd["draw"])
	# a pose lida da mão já posta (camada direta) é natural: as chaves de gume natural partem dela sem misturar gumes
	return {"wp": (p - _s0) / _arm_k, "wa": ax, "we": e, "wpo": pole, "sl": slide, "g": _two_w, "two": two_rel,
		"dr": draw, "dw": string_w, "oc": o_curl, "ea": 0.0 if not tgt.is_empty() else 1.0}

## Alvo final da arma (espaço do personagem): ponto, eixo, gume (natural quando a chave pede), polo, ponto do
## cabo e segunda mão — tudo girado junto com o corpo no giro.
func _act_target(arms: Dictionary, base: Dictionary, wside: String, rot: Basis) -> Dictionary:
	var wp: Vector3 = arms.get("wp", base["wp"])
	var wa: Vector3 = (arms.get("wa", base["wa"]) as Vector3).normalized()
	var we: Vector3 = (arms.get("we", base["we"]) as Vector3).normalized()
	var wpo: Vector3 = (arms.get("wpo", base["wpo"]) as Vector3).normalized()
	var p := _s0 + rot * (wp * _arm_k)
	var ax := rot * wa
	var pole := rot * wpo
	# o gume explícito (da postura ou da chave) acompanha o giro do eixo: fica perpendicular a ele no caminho
	var a_from: Vector3 = (base["wa"] as Vector3).normalized() if not arms.has("we") else wa
	if a_from.dot(wa) > -0.98:
		we = Quaternion(a_from, wa) * we
	var e := rot * we
	var ea := clampf(float(arms.get("ea", 0.0)), 0.0, 1.0)
	if ea > 0.001:
		var nat := _natural_edge(wside, p, ax, pole)
		ax = ax.slerp(nat[0], ea).normalized() if ax.dot(nat[0]) > -0.99 else nat[0]
		e = e.slerp(nat[1], ea).normalized() if e.dot(nat[1]) > -0.99 else nat[1]
	return {"p": p, "a": ax, "e": e, "pole": pole, "slide": float(arms.get("sl", base["sl"])), "two": float(arms.get("two", base["two"]))}

## Mão livre da ação: o alvo da chave ("o", com os dedos naturais para a palma pedida) e, no arco, a mão na corda
## puxando ("dr"); as duas se misturam pelos pesos. Devolve se a mão foi posta.
func _act_off_hand(oside: String, arms: Dictionary, final: Dictionary, rot: Basis) -> bool:
	var ow := clampf(float(arms.get("ow", 0.0)), 0.0, 1.0)
	var dw := clampf(float(arms.get("dw", 0.0)), 0.0, 1.0) if weapon_family == "bow" and not final.is_empty() else 0.0
	if ow <= 0.01 and dw <= 0.01:
		return false
	var free: Array = []
	if ow > 0.01:
		var op := _s0 + rot * ((arms["op"] as Vector3) * _arm_k)
		var palm := (rot * (arms["opa"] as Vector3)).normalized()
		var opo := (rot * (arms["opo"] as Vector3)).normalized()
		var fr := _free_hand(oside, op, palm, opo, rot * (arms.get("ofi", Vector3.ZERO) as Vector3))
		free = [op, fr[0], fr[1], opo]
	var on_string: Array = []
	if dw > 0.01:
		var spec := _string_spec(final, float(arms.get("dr", 0.0)))
		on_string = [spec[0], spec[1], spec[2], spec[3]]
	var tgt_h: Array = free if on_string.is_empty() else on_string
	if not free.is_empty() and not on_string.is_empty():
		var f := ow / (ow + dw)
		tgt_h = [(on_string[0] as Vector3).lerp(free[0], f), (on_string[1] as Vector3).slerp(free[1], f), (on_string[2] as Vector3).slerp(free[2], f), (on_string[3] as Vector3).slerp(free[3], f).normalized()]
	_ik_hand_free(oside, tgt_h[0], tgt_h[1], tgt_h[2], tgt_h[3], maxf(ow, dw))
	if dw > 0.5 and dw >= ow:
		_string_pt = _root_to_world((on_string[0] as Vector3) + (on_string[1] as Vector3) * 0.035 * _arm_k)
	return true

## Pernas da ação: cada pé fica no seu lugar de apoio (o da postura base, mais o passo pedido) enquanto o quadril
## agacha, avança, vai para o lado ou pula; quadril e joelho saem de uma IK de dois ossos no plano da perna, o pé
## fica paralelo ao chão e falta de alcance vira agachamento (o pé nunca sai do chão sozinho, nem desliza).
## Mistura com os ângulos da postura por lw. Devolve o deslocamento do quadril (espaço do personagem).
func _legs_ik(leg: Dictionary, drop: Dictionary, support: float, ab: Dictionary, lw: float) -> Vector3:
	var t1 := _thigh_len
	var s1 := _shin_len
	var reach := (t1 + s1) * 0.985
	var height := t1 + s1 - support
	var cr := float(ab.get("cr", 0.0))
	var fz := float(ab.get("fz", 0.0))
	var fx := float(ab.get("fx", 0.0))
	var hop := float(ab.get("hop", 0.0))
	# o pé solto da postura parada vai assentando no chão ao longo do movimento
	var u := _act_u()
	var settle := smoothstep(0.0, 0.25, u) * (1.0 - smoothstep(0.8, 1.0, u)) if not _act.is_empty() else 0.0
	var tg := {}
	var need := 0.0
	for side in ["l", "r"]:
		var hs: float = leg[side][4]
		var ks: float = leg[side][5]
		var z0 := t1 * sin(hs) + s1 * sin(hs - ks)
		var stp: Vector3 = ab.get(side + "f", Vector3.ZERO)
		var lift0 := (float(drop[side]) - support) * (1.0 - settle)
		var zt := z0 + stp.z - fz
		var xt := stp.x - fx
		var lift := lift0 + stp.y
		tg[side] = [xt, zt, lift]
		need = maxf(need, height - cr - lift - sqrt(maxf(reach * reach - zt * zt - xt * xt, 0.0)))
	cr += maxf(0.0, need)
	for side in ["l", "r"]:
		var xt: float = tg[side][0]
		var zt: float = tg[side][1]
		var yt := maxf(0.05, height - cr - float(tg[side][2]))
		var yp := sqrt(yt * yt + xt * xt)
		var d := clampf(sqrt(zt * zt + yp * yp), 0.05, (t1 + s1) * 0.999)
		var phi := atan2(zt, yp)
		var al := acos(clampf((t1 * t1 + d * d - s1 * s1) / (2.0 * t1 * d), -1.0, 1.0))
		var be := acos(clampf((s1 * s1 + d * d - t1 * t1) / (2.0 * s1 * d), -1.0, 1.0))
		var hip_ik := phi + al
		var knee_ik := al + be
		var l: Array = leg[side]
		l[0] = lerpf(float(l[0]), hip_ik, lw)
		l[1] = lerpf(float(l[1]), knee_ik, lw)
		l[2] = float(l[2]) * (1.0 - lw)
		l[3] = lerpf(float(l[3]), hip_ik - knee_ik, lw)
		l[6] = atan2(xt, yt) * lw
	return Vector3(fx, -cr + hop, fz) * lw

## Pose atual da arma no espaço do personagem, lida do esqueleto já posto: [ponto de pega, eixo, gume, polo do
## cotovelo]. Sem arma, a mão vazia vira uma arma virtual (eixo no polegar, "gume" na palma).
func _held_pose(side: String) -> Array:
	var s2r := _skel_to_root()
	var ih: int = bones[side + "_hand"]["idx"]
	var gh: Transform3D = skel.get_bone_global_pose(ih)
	var p: Vector3
	var ax: Vector3
	var e: Vector3
	if weapon_holder:
		var t: Transform3D = s2r * gh * weapon_holder.transform
		p = t.origin
		ax = t.basis.y.normalized()
		e = t.basis.z.normalized()
	else:
		var fd: Basis = gh.basis.orthonormalized() * skel.get_bone_global_rest(ih).basis.orthonormalized().inverse() * _hand_frame_t(side)
		var palm_sgn := -1.0 if side == "l" else 1.0
		p = s2r * (gh.origin + fd * Vector3(_grip_x, palm_sgn * _palm_y, 0.0))
		var fing := (s2r.basis * fd.x).normalized()
		ax = (s2r.basis * fd.z).normalized()
		e = ax.cross(fing) if side == "r" else fing.cross(ax)
	var sh: Vector3 = s2r * skel.get_bone_global_pose(bones[side + "_upper_arm"]["idx"]).origin
	var el: Vector3 = s2r * skel.get_bone_global_pose(bones[side + "_lower_arm"]["idx"]).origin
	var wr: Vector3 = s2r * gh.origin
	var pole := el - (sh + wr) * 0.5
	if pole.length() < 1e-4:
		pole = Vector3(-0.5 if side == "r" else 0.5, -1.0, -0.35)
	return [p, ax, e, pole.normalized()]

## Mão vazia na pose de arma virtual pedida (eixo = polegar, "gume" = palma).
func _ik_bare_hand(side: String, tgt: Dictionary, weight: float) -> void:
	var ax: Vector3 = (tgt["a"] as Vector3).normalized()
	var e: Vector3 = tgt["e"]
	e = (e - ax * ax.dot(e)).normalized()
	var fing := e.cross(ax) if side == "r" else ax.cross(e)
	_ik_hand_free(side, tgt["p"], fing, ax, tgt["pole"], weight)

## Direção do antebraço (espaço do personagem) estimada pela IK de dois ossos até o ponto, com o cotovelo para
## o lado do polo.
func _forearm_dir(side: String, p: Vector3, pole: Vector3) -> Vector3:
	var sh: Vector3 = _skel_to_root() * skel.get_bone_global_pose(bones[side + "_upper_arm"]["idx"]).origin
	var l1 := _upper_len
	var l2 := _fore_len
	var to := p - sh
	var d := clampf(to.length(), 0.05, (l1 + l2) * 0.999)
	var n := to.normalized()
	var pp := pole - n * n.dot(pole)
	if pp.length() < 1e-3:
		pp = Vector3.DOWN - n * n.dot(Vector3.DOWN)
	pp = pp.normalized()
	var aa := (l1 * l1 - l2 * l2 + d * d) / (2.0 * d)
	var h := sqrt(maxf(0.0, l1 * l1 - aa * aa))
	var el := sh + n * aa + pp * h
	return (sh + n * d - el).normalized()

## Arco de ângulos entre o antebraço e o eixo da arma que o punho alcança nesta empunhadura: o cabo atravessa a
## palma inclinado ("tilt") e o punho desvia até 35° para o lado do dedo mínimo (55° com as duas mãos no cabo,
## que empurram a mão de cima) e 20° para o do polegar. A garra segue os dedos.
func _grip_arc() -> Array:
	if weapon_family == "claw":
		return [0.0, 30.0]
	var tilt := rad_to_deg(float(grip.get("tilt", 0.0)))
	var ulnar := 55.0 if weapon_family in ["axe_2h", "sword_2h", "spear_2h", "staff_2h"] else 35.0
	return [maxf(0.0, 90.0 - tilt - ulnar), 90.0 - tilt + 20.0]

## Gume natural para o eixo pedido: o eixo vai para dentro do arco que o punho alcança (se estiver fora) e os nós
## dos dedos seguem o antebraço — nenhuma chave entorta o pulso. Devolve [eixo, gume].
func _natural_edge(side: String, p: Vector3, ax: Vector3, pole: Vector3) -> Array:
	var f := _forearm_dir(side, p, pole)
	var arc := _grip_arc()
	var th := rad_to_deg(ax.angle_to(f))
	if th < float(arc[0]) or th > float(arc[1]):
		# gira no plano antebraço–eixo; com o eixo quase no antebraço esse plano não existe e a arma ergue a ponta
		# (polegar para cima), como quem soca segurando o cabo
		var axis := f.cross(ax) if th > 15.0 else f.cross(Vector3.UP)
		if axis.length() < 1e-3:
			axis = f.cross(pole)
		if axis.length() > 1e-4:
			ax = f.rotated(axis.normalized(), deg_to_rad(clampf(th, float(arc[0]), float(arc[1]))))
	var fp := f - ax * ax.dot(f)
	if fp.length() < 1e-3:
		fp = pole - ax * ax.dot(pole)
	fp = fp.normalized()
	if weapon_family in KNUCKLE_EDGE:
		return [ax, fp]
	if weapon_family == "claw":
		var down := Vector3.DOWN - ax * ax.dot(Vector3.DOWN)
		return [ax, down.normalized() if down.length() > 1e-3 else fp]
	return [ax, ax.cross(fp) if side == "r" else fp.cross(ax)]

## Dedos e polegar da mão livre para a palma pedida: os dedos seguem o antebraço (mais a dica), na palma.
func _free_hand(side: String, p: Vector3, palm: Vector3, pole: Vector3, hint: Vector3) -> Array:
	var f := _forearm_dir(side, p, pole) + hint
	var fp := f - palm * palm.dot(f)
	if fp.length() < 1e-3:
		fp = Vector3.UP - palm * palm.dot(Vector3.UP)
	fp = fp.normalized()
	var th := palm.cross(fp) if side == "l" else fp.cross(palm)
	return [fp, th.normalized()]

## Família da tabela de poses da arma (entrada própria primeiro, senão a da família parecida).
func _wpose_family() -> String:
	var f := weapon_family
	if not WPOSES.has(f) and STANCE_ALIAS.has(f):
		f = STANCE_ALIAS[f]
	return f

## Pesos dos estados [parado, andando, guarda, correndo] (somam 1).
func _state_weights(a: float, cw: float, rn: float) -> Array:
	var mv := clampf(a * 2.5, 0.0, 1.0)
	var guard := cw * (1.0 - rn)
	var rest := (1.0 - cw) * (1.0 - rn)
	return [rest * (1.0 - mv), rest * mv, guard, rn]

## Centro dos ombros de referência (segue o quadril: agacha, balança e oscila com ele, mas não gira
## com o tronco), no espaço do personagem.
func _shoulder_ref() -> Vector3:
	if not bones.has("hips"):
		return _s0_off
	var hp: Vector3 = _skel_to_root() * skel.get_bone_global_pose(bones["hips"]["idx"]).origin
	return hp + _s0_off

## Transformação do espaço do esqueleto para o do personagem (inclui a inclinação do modelo).
func _skel_to_root() -> Transform3D:
	var t := Transform3D.IDENTITY
	var n: Node = skel
	while n != null and n != self:
		if n is Node3D:
			t = (n as Node3D).transform * t
		n = n.get_parent()
	return t

func _root_to_world(p: Vector3) -> Vector3:
	return global_transform * p

## Mistura as poses da arma dos estados e converte para o espaço do personagem.
func _wpose_blend(wpd: Dictionary, sw: Array, wside: String) -> Dictionary:
	var names := ["relaxed", "walk", "guard", "run"]
	var tp := Vector3.ZERO
	var ta := Vector3.ZERO
	var te := Vector3.ZERO
	var tpole := Vector3.ZERO
	var wsum := 0.0
	var c := cos(_phase) * (1.0 if wside == "r" else -1.0)
	for i in 4:
		var wgt: float = sw[i]
		if wgt < 0.0001:
			continue
		var ps: Dictionary = wpd.get(names[i], wpd["relaxed"])
		var pp: Vector3 = ps["p"]
		var swing := float(ps.get("swing", 0.0))
		if swing > 0.0:
			pp += Vector3(0.0, 0.15 * swing * absf(c), swing * c)
		tp += pp * wgt
		ta += (ps["a"] as Vector3) * wgt
		te += (ps["e"] as Vector3) * wgt
		tpole += (ps["pole"] as Vector3) * wgt
		wsum += wgt
	wsum = maxf(wsum, 1e-4)
	var out := {"p": _s0 + tp / wsum * _arm_k, "a": ta.normalized(), "e": te.normalized(), "pole": tpole.normalized(), "slide": _slide}
	var gd: Dictionary = wpd["guard"]
	if gd.has("two"):
		out["two"] = float(gd["two"])
	if gd.has("draw") and sw[2] > 0.01:
		var spec := _string_spec(out, float(gd["draw"]))
		spec[4] = float(sw[2])
		out["off"] = spec
	return out

## Mão da corda: ponto de pega um pouco atrás da corda (puxada por draw), dedos para o arco.
func _string_spec(pose: Dictionary, draw: float) -> Array:
	var e: Vector3 = pose["e"]
	var ax: Vector3 = pose["a"]
	var pt: Vector3 = (pose["p"] as Vector3) - e * (0.115 + draw * _arm_k) - e * 0.035 * _arm_k
	return [pt, e, ax, Vector3(-1.0, -0.4, -0.5), 1.0, 1.0]

## Base da arma a partir do eixo (ponta) e do lado do gume (ortogonalizado).
static func _wbasis(axis: Vector3, edge: Vector3) -> Basis:
	var y := axis.normalized()
	var z := edge - y * y.dot(edge)
	if z.length() < 1e-3:
		z = Vector3.BACK - y * y.dot(Vector3.BACK)
		if z.length() < 1e-3:
			z = Vector3.UP
	z = z.normalized()
	return Basis(y.cross(z), y, z)

## Leva a mão da arma até a pose desejada da arma: o ponto de pega (onde a mão fecha) vai ao ponto
## pedido e a arma fica com o eixo e o gume pedidos.
func _ik_weapon(side: String, tgt: Dictionary, weight := 1.0) -> void:
	if weapon_holder == null or not bones.has(side + "_hand"):
		return
	var to_s := _skel_to_root().affine_inverse()
	var wb := _wbasis(tgt["a"], tgt["e"])
	var w_s: Basis = (to_s.basis * wb).orthonormalized()
	var hb: Basis = (w_s * weapon_holder.transform.basis.orthonormalized().inverse()).orthonormalized()
	var p_s: Vector3 = to_s * (tgt["p"] as Vector3)
	var hand_o: Vector3 = p_s - hb * weapon_holder.position
	_ik_arm_tf(side, Transform3D(hb, hand_o), tgt["pole"], weight)

## IK de dois ossos até o pulso (espaço do esqueleto) e rotação final da mão.
func _ik_arm_tf(side: String, hand_s: Transform3D, pole_m: Vector3, weight: float) -> void:
	if _ik_two_bone(side, hand_s.origin, pole_m, weight):
		_finish_hand(side, hand_s.basis, weight)

## Gira a mão para a base pedida, passando metade da torção (prono-supinação) para o antebraço.
func _finish_hand(side: String, basis_s: Basis, weight: float) -> void:
	var il: int = bones[side + "_lower_arm"]["idx"]
	var ih: int = bones[side + "_hand"]["idx"]
	var gl := skel.get_bone_global_pose(il)
	var gh := skel.get_bone_global_pose(ih)
	var axis := (gh.origin - gl.origin).normalized()
	var rest_rel: Basis = skel.get_bone_global_rest(il).basis.orthonormalized().inverse() * skel.get_bone_global_rest(ih).basis.orthonormalized()
	var nat: Basis = gl.basis.orthonormalized() * rest_rel
	var g: Quaternion = (basis_s.orthonormalized() * nat.inverse()).get_rotation_quaternion()
	var tw := wrapf(2.0 * atan2(Vector3(g.x, g.y, g.z).dot(axis), g.w), -PI, PI)
	_set_global_rot(il, Basis(axis, tw * 0.5) * gl.basis.orthonormalized(), weight)
	_set_global_rot(ih, basis_s.orthonormalized(), weight)

## Resolve ombro-cotovelo para o pulso chegar ao alvo; retorna false se faltar osso.
func _ik_two_bone(side: String, wrist: Vector3, pole_m: Vector3, weight: float) -> bool:
	var ku := side + "_upper_arm"
	var kl := side + "_lower_arm"
	var kh := side + "_hand"
	if not (bones.has(ku) and bones.has(kl) and bones.has(kh)):
		return false
	var iu: int = bones[ku]["idx"]
	var il: int = bones[kl]["idx"]
	var ih: int = bones[kh]["idx"]
	var pole := (_skel_to_root().basis.inverse() * pole_m).normalized()
	var gu := skel.get_bone_global_pose(iu)
	var gl := skel.get_bone_global_pose(il)
	var gh := skel.get_bone_global_pose(ih)
	var sh := gu.origin
	var el := gl.origin
	var l1 := sh.distance_to(el)
	var l2 := el.distance_to(gh.origin)
	var to_t := wrist - sh
	var dd := clampf(to_t.length(), 0.01, (l1 + l2) * 0.999)
	var n := to_t.normalized()
	var pp := pole - n * n.dot(pole)
	if pp.length() < 1e-3:
		pp = Vector3.DOWN - n * n.dot(Vector3.DOWN)
	pp = pp.normalized()
	var a := (l1 * l1 - l2 * l2 + dd * dd) / (2.0 * dd)
	var hgt := sqrt(maxf(0.0, l1 * l1 - a * a))
	var e2 := sh + n * a + pp * hgt
	_set_global_rot(iu, Basis(_arc(el - sh, e2 - sh)) * gu.basis, weight)
	gl = skel.get_bone_global_pose(il)
	gh = skel.get_bone_global_pose(ih)
	_set_global_rot(il, Basis(_arc(gh.origin - gl.origin, sh + n * dd - gl.origin)) * gl.basis, weight)
	return true

## Mão livre num ponto (de pega) com dedos e polegar apontando nas direções dadas (personagem).
func _ik_hand_free(side: String, point_m: Vector3, fingers_m: Vector3, thumb_m: Vector3, pole_m: Vector3, weight: float) -> void:
	if weight <= 0.001 or not bones.has(side + "_hand"):
		return
	var to_s := _skel_to_root().affine_inverse()
	var point := to_s * point_m
	var thumb := (to_s.basis * thumb_m).normalized()
	var fing := (to_s.basis * fingers_m)
	fing = (fing - thumb * thumb.dot(fing)).normalized()
	var fd := Basis(fing, thumb.cross(fing), thumb)
	var palm_sgn := -1.0 if side == "l" else 1.0
	var wrist := point - fd * Vector3(_grip_x, palm_sgn * _palm_y, 0.0)
	var ih: int = bones[side + "_hand"]["idx"]
	if _ik_two_bone(side, wrist, pole_m, weight):
		var rest_h: Basis = skel.get_bone_global_rest(ih).basis
		_finish_hand(side, (fd * _hand_frame_t(side).inverse()) * rest_h, weight)

## Corda do arco em dois segmentos (ponta de cima → mão → ponta de baixo) enquanto é puxada.
func _place_string() -> void:
	var drawn := _string_pt != Vector3.INF and weapon_mesh != null and weapon_mesh.visible
	if string_rest:
		string_rest.visible = not drawn
	for sp in string_parts:
		(sp as Node3D).visible = drawn
	if not drawn:
		return
	var side: String = grip["hand"]
	var ih: int = bones[side + "_hand"]["idx"]
	var t: Transform3D = skel.global_transform * skel.get_bone_global_pose(ih) * weapon_holder.transform * grip_node.transform * weapon_mesh.transform
	var tips := [t * Vector3(0, 0.54, -0.11), t * Vector3(0, -0.54, -0.11)]
	for i in 2:
		var a: Vector3 = tips[i]
		var d := _string_pt - a
		var ln := d.length()
		if ln < 0.01:
			continue
		var sp: Node3D = string_parts[i]
		var y := d / ln
		var x := y.cross(Vector3.UP if absf(y.y) < 0.95 else Vector3.RIGHT).normalized()
		var z := x.cross(y).normalized()
		sp.global_transform = Transform3D(Basis(x, y * ln, z), a + d * 0.5)

## Põe a flecha entre a mão da corda e o punho do arco.
func _place_arrow() -> void:
	if not bones.has("r_hand"):
		return
	var rh: Transform3D = skel.global_transform * skel.get_bone_global_pose(bones["r_hand"]["idx"])
	var fr := (rh.basis * (Basis(s_rot.inverse()) * Vector3(-_grip_x, 0, 0)))
	var nock := rh.origin + fr
	var bp := _weapon_point_w(0.0)
	if bp.is_empty():
		return
	var tip: Vector3 = bp[0]
	if nock.distance_to(tip) < 0.05:
		return
	arrow_node.global_position = nock
	arrow_node.look_at(tip, Vector3.UP)
	arrow_node.scale = Vector3.ONE

## Moradores: mãos juntas à frente (1) ou para trás (2), por IK em relação ao quadril.
func _npc_hands(idle: float) -> void:
	if not bones.has("hips"):
		return
	var hips_g: Transform3D = skel.global_transform * skel.get_bone_global_pose(bones["hips"]["idx"])
	var fwd := (global_transform.basis * Vector3.BACK).normalized()
	var left := (global_transform.basis * Vector3.RIGHT).normalized()
	var up := (global_transform.basis * Vector3.UP).normalized()
	var sc := scale.x * model.scale.x
	var front := 0.17 if npc_variant == 1 else -0.14
	var center := hips_g.origin + fwd * front * sc + up * (-0.02 if npc_variant == 1 else 0.02) * sc
	for side in ["l", "r"]:
		var sgn := 1.0 if side == "l" else -1.0
		var p := center + left * sgn * 0.035 * sc
		var axis := (left * -sgn * 0.6 + up * 0.8).normalized()
		_ik_grip(side, p, axis, Vector3(sgn * 0.8, -0.6, -0.3 if npc_variant == 1 else 0.4), idle)
		_finger_pose(side, 0.55, 0.45)

## Restrição de mira: gira o osso para que seu eixo aponte para o osso de origem.
func _solve_aims() -> void:
	for a in aims:
		var pg: Transform3D = skel.get_bone_global_pose(a["parent"]) if int(a["parent"]) >= 0 else Transform3D()
		var g0: Transform3D = pg * (a["rest"] as Transform3D)
		var v0: Vector3 = (g0.basis.orthonormalized() * (a["axis"] as Vector3)).normalized()
		var target: Vector3 = skel.get_bone_global_pose(a["src"]).origin
		var v1: Vector3 = target - g0.origin
		if v1.length() < 1e-5:
			continue
		v1 = v1.normalized()
		var gq: Quaternion = g0.basis.get_rotation_quaternion()
		if v0.dot(v1) < 0.99999:
			gq = Quaternion(v0, v1) * gq
		var lq: Quaternion = pg.basis.get_rotation_quaternion().inverse() * gq
		skel.set_bone_pose_rotation(a["idx"], lq.normalized())
