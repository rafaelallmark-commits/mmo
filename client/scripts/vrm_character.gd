extends Node3D
## Personagem de anime a partir de um modelo VRM (glTF binário): materiais com cel shading
## sobre a textura original, recolor por classe (cabelo, olhos, roupa), partes escondidas,
## animação procedural no esqueleto (pose relaxada, andar, respirar, piscar, golpear) e
## arma/acessórios presos aos ossos.
##
## As rotações são definidas nos eixos do personagem (frente +Z, esquerda +X) num "espaço
## normalizado": para cada osso, pose_local = Rg_pai⁻¹ · D · Rg_osso, onde Rg são as rotações
## globais de repouso. Assim a mesma animação serve para modelos com eixos de ossos diferentes.

const TOON_TEX := preload("res://shaders/toon_tex.gdshader")
const TOON_TEX_2S := preload("res://shaders/toon_tex_2s.gdshader")
const HIDDEN := preload("res://shaders/hidden.gdshader")
const OUTLINE := preload("res://shaders/outline.gdshader")
const Gear := preload("res://scripts/gear.gd")

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
var _attack := -1.0
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
					lk.add_child(Gear.skirt(look.get("cape", outfit), trim, waist + 0.01, 0.3, 0.72))
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
var _attack_variant := 0
var _attack_dur := 0.5
var _cast := -1.0
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

## Posturas por família: braço da arma ("w") e braço livre ("o") em cada estado, e os golpes como
## sequência de chaves [tempo 0..1, braço da arma, braço livre (ou null), giro do tronco, inclinação].
const STANCES := {
	"": {
		"relaxed": {"w": ARM_RELAX_R, "o": ARM_RELAX_L},
		"guard": {"w": ARM_GUARD_FIST_R, "o": ARM_GUARD_FIST_L},
		"run": {"w": ARM_RUN_R, "o": ARM_RUN_L},
		"attack": [[0.35, [Vector3(-0.3, -0.8, -0.5), 0.2, 2.1, 0.1, 0.0, 0.0], null, -0.35, 0.0], [0.5, [Vector3(-0.08, -0.05, 1.0), 0.0, 0.1, 0.0, 0.0, 0.0], null, 0.35, 0.12], [0.7, [Vector3(-0.1, -0.15, 0.98), 0.0, 0.3, 0.0, 0.0, 0.0], null, 0.3, 0.1]],
	},
	"sword_1h": {
		"relaxed": {"w": [Vector3(-0.29, -0.95, 0.08), -0.15, 0.12, 0.15, -0.62, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.25, -0.9, 0.35), -0.15, 1.2, 0.1, -0.45, -0.25], "o": ARM_GUARD_CHECK_L},
		"run": {"w": [Vector3(-0.22, -0.97, 0.0), -0.2, 1.3, 0.2, 0.25, -0.15], "o": ARM_RUN_L},
		"attack": [[0.35, [Vector3(-0.82, -0.29, 0.49), -1.2, 2.1, -0.35, -0.35, -1.15], null, -0.35, -0.08], [0.52, [Vector3(-0.25, -0.38, 0.89), -1.0, 0.35, 0.0, -0.6, 0.0], null, 0.35, 0.18], [0.7, [Vector3(0.1, -0.8, 0.6), -1.0, 0.3, 0.0, -0.6, 0.0], null, 0.45, 0.15]],
	},
	"axe_2h": {
		"relaxed": {"w": [Vector3(-0.25, -0.6, 0.76), -0.4, 2.2, 0.0, 0.7, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.3, -0.85, 0.42), 0.0, 1.0, 0.0, 0.6, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.25, -0.6, 0.76), -0.4, 2.2, 0.0, 0.7, 0.0], "o": ARM_RUN_L},
		"attack": [[0.35, [Vector3(-0.4, 0.8, -0.45), 0.2, 1.9, 0.0, 0.7, 0.0], null, 0.3, -0.1], [0.52, [Vector3(-0.1, -0.4, 0.9), 0.0, 0.3, 0.0, -0.2, 0.0], null, -0.3, 0.22], [0.7, [Vector3(0.05, -0.85, 0.5), 0.0, 0.4, 0.0, -0.3, 0.0], null, -0.35, 0.2]],
	},
	"spear_2h": {
		"relaxed": {"w": [Vector3(-0.3, -0.93, 0.2), 0.0, 1.25, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.35, -0.88, -0.3), 0.0, 0.6, 0.0, -0.7, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.25, -0.96, 0.1), 0.0, 0.9, 0.0, -0.2, 0.0], "o": ARM_RUN_L},
		"attack": [[0.38, [Vector3(-0.4, -0.75, -0.55), 0.0, 1.4, 0.0, -0.6, 0.0], null, 0.3, -0.05], [0.52, [Vector3(-0.15, -0.35, 0.92), 0.0, 0.15, 0.0, -1.0, 0.0], null, -0.25, 0.2], [0.72, [Vector3(-0.15, -0.35, 0.92), 0.0, 0.2, 0.0, -1.0, 0.0], null, -0.25, 0.18]],
	},
	"bow": {
		"relaxed": {"w": [Vector3(0.3, -0.94, 0.15), 0.0, 0.9, 0.0, 0.5, 0.0], "o": ARM_RELAX_R},
		"guard": {"w": [Vector3(0.25, -0.4, 0.88), -0.9, 0.5, 0.0, 0.0, 0.0], "o": [Vector3(-0.35, -0.6, 0.72), 0.0, 1.9, 0.2, 0.0, 0.0]},
		"run": {"w": [Vector3(0.25, -0.96, 0.05), 0.0, 1.0, 0.0, 0.4, 0.0], "o": ARM_RUN_R},
		"attack": [[0.35, [Vector3(0.05, 0.05, 1.0), -1.57, 0.05, 0.0, 0.0, 0.0], [Vector3(-0.92, 0.12, -0.38), 0.0, 2.6, 0.2, 0.0, 0.0], 0.45, 0.0], [0.5, [Vector3(0.05, 0.05, 1.0), -1.57, 0.05, 0.0, 0.0, 0.0], [Vector3(-0.95, 0.15, -0.3), 0.0, 2.2, 0.0, 0.0, 0.0], 0.45, 0.0], [0.72, [Vector3(0.05, 0.0, 1.0), -1.57, 0.08, 0.0, 0.0, 0.0], [Vector3(-0.95, 0.1, -0.3), 0.0, 2.2, 0.0, 0.0, 0.0], 0.4, 0.0]],
	},
	"javelin": {
		"relaxed": {"w": [Vector3(-0.28, -0.94, 0.18), 0.0, 1.2, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.6, 0.55, -0.58), 0.0, 1.5, 0.0, 0.0, 0.0], "o": ARM_SHIELD_GUARD},
		"run": {"w": [Vector3(-0.25, -0.96, 0.1), 0.0, 1.0, 0.0, -0.2, 0.0], "o": ARM_RUN_L},
		"attack": [[0.38, [Vector3(-0.55, 0.45, -0.7), 0.0, 1.4, 0.0, 0.0, 0.0], null, 0.5, -0.05], [0.5, [Vector3(-0.2, 0.75, 0.62), 0.0, 0.2, 0.0, 0.0, 0.0], null, -0.2, 0.15], [0.68, [Vector3(0.1, -0.5, 0.85), 0.0, 0.5, 0.0, 0.0, 0.0], null, -0.4, 0.18]],
	},
	"staff_2h": {
		"relaxed": {"w": [Vector3(-0.35, -0.9, 0.25), 0.0, 1.35, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.3, -0.85, 0.42), 0.0, 1.1, 0.0, 0.5, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.25, -0.96, 0.1), 0.0, 1.1, 0.0, -0.3, 0.0], "o": ARM_RUN_L},
		"attack": [[0.38, [Vector3(-0.3, 0.2, 0.93), 0.0, 1.0, 0.0, 0.8, 0.0], null, 0.15, -0.05], [0.52, [Vector3(-0.15, 0.1, 0.98), 0.0, 0.2, 0.0, -0.4, 0.0], null, -0.1, 0.1], [0.72, [Vector3(-0.15, 0.05, 0.98), 0.0, 0.25, 0.0, -0.35, 0.0], null, -0.1, 0.08]],
	},
	"wand": {
		"relaxed": {"w": [Vector3(-0.28, -0.95, 0.12), 0.0, 0.4, 0.0, -0.4, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.35, -0.55, 0.76), 0.0, 1.2, 0.0, 0.2, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.24, -0.96, 0.0), 0.0, 1.3, 0.0, -0.3, 0.0], "o": ARM_RUN_L},
		"attack": [[0.38, [Vector3(-0.5, 0.5, -0.3), 0.0, 1.6, 0.0, 0.4, 0.0], null, -0.3, -0.05], [0.5, [Vector3(-0.1, 0.05, 0.99), 0.0, 0.1, 0.0, -0.1, 0.0], null, 0.2, 0.08], [0.7, [Vector3(-0.1, 0.0, 0.99), 0.0, 0.15, 0.0, -0.1, 0.0], null, 0.2, 0.06]],
	},
	"scepter": {
		"relaxed": {"w": [Vector3(-0.25, -0.95, 0.2), 0.0, 1.1, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": [Vector3(-0.3, -0.7, 0.65), 0.0, 1.4, 0.0, 0.0, 0.0], "o": ARM_RELAX_L},
		"run": {"w": [Vector3(-0.22, -0.97, 0.05), 0.0, 1.4, 0.0, 0.0, 0.0], "o": ARM_RUN_L},
		"attack": [[0.38, [Vector3(-0.25, 0.95, 0.15), 0.0, 0.3, 0.0, 0.0, 0.0], null, -0.1, -0.08], [0.55, [Vector3(-0.1, 0.2, 0.97), 0.0, 0.15, 0.0, -0.2, 0.0], null, 0.1, 0.06], [0.75, [Vector3(-0.1, 0.15, 0.97), 0.0, 0.2, 0.0, -0.2, 0.0], null, 0.1, 0.05]],
	},
	"claw": {
		"relaxed": {"w": [Vector3(-0.3, -0.95, 0.06), 0.0, 0.35, 0.1, 0.0, 0.0], "o": ARM_RELAX_L},
		"guard": {"w": ARM_GUARD_FIST_R, "o": ARM_GUARD_FIST_L},
		"run": {"w": ARM_RUN_R, "o": ARM_RUN_L},
		"attack": [[0.35, [Vector3(-0.3, -0.85, -0.4), 0.2, 2.0, 0.0, 0.0, 0.0], null, -0.35, 0.0], [0.5, [Vector3(-0.1, -0.1, 0.99), 0.0, 0.05, 0.0, 0.0, 0.0], null, 0.35, 0.12], [0.7, [Vector3(-0.1, -0.2, 0.97), 0.0, 0.2, 0.0, 0.0, 0.0], null, 0.3, 0.1]],
	},
}

## Poses guiadas pela arma (IK): a mão vai até onde a arma deve estar. Pontos em metros a partir do
## centro dos ombros (corpo de referência com braço de 0,49 m; escala pelo braço de cada modelo),
## com +Z à frente e +X à esquerda; "a" = eixo da arma (para a ponta), "e" = lado do gume / da palma
## (arco: direção do tiro), "pole" = para onde aponta o cotovelo. "plant": o pé da arma encosta no
## chão (desliza na mão). "two": segunda mão (metros ao longo da arma a partir da mão principal).
## "swing": balanço da mão com a passada. "draw": mão da corda na corda (puxada em metros).
## Golpes: chaves com "t" (0..1), giro "yaw" e inclinação "lean" do tronco; "off" = mão livre
## [ponto, dedos, polegar, polo]. Números conferidos por um modelo do braço (alcance e punho).
const WPOSES := {
	"spear_2h": {
		"relaxed": {"p": Vector3(-0.220, -0.200, 0.240), "a": Vector3(0.000, 0.971, 0.240), "e": Vector3(0.999, 0.008, -0.033), "pole": Vector3(-0.500, -1.000, -0.350), "plant": 0.425},
		"walk": {"p": Vector3(-0.220, -0.180, 0.220), "a": Vector3(0.000, 0.971, 0.240), "e": Vector3(1.000, 0.005, -0.022), "pole": Vector3(-0.500, -1.000, -0.350), "slide": 0.620, "swing": 0.040},
		"guard": {"p": Vector3(-0.160, -0.370, 0.040), "a": Vector3(0.120, 0.220, 0.968), "e": Vector3(0.844, 0.491, -0.216), "pole": Vector3(-0.800, -0.600, -0.200), "yaw": -0.450, "lean": 0.100, "two": 0.500},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, 0.340, 0.940), "e": Vector3(0.987, 0.151, -0.055), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.130},
		"attack": [
			{"t": 0.30, "p": Vector3(-0.200, -0.340, -0.080), "a": Vector3(0.120, 0.200, 0.972), "e": Vector3(0.874, 0.443, -0.199), "pole": Vector3(-0.800, -0.600, -0.200), "yaw": -0.600, "lean": 0.050, "two": 0.550},
			{"t": 0.50, "p": Vector3(-0.060, -0.320, 0.240), "a": Vector3(0.050, 0.120, 0.991), "e": Vector3(0.571, 0.811, -0.127), "pole": Vector3(-1.000, -0.300, 0.000), "yaw": 0.100, "lean": 0.220, "two": 0.250},
			{"t": 0.70, "p": Vector3(-0.060, -0.320, 0.220), "a": Vector3(0.050, 0.120, 0.991), "e": Vector3(0.566, 0.815, -0.127), "pole": Vector3(-1.000, -0.300, 0.000), "yaw": 0.080, "lean": 0.200, "two": 0.270},
		],
	},
	"staff_2h": {
		"relaxed": {"p": Vector3(-0.240, -0.200, 0.180), "a": Vector3(-0.050, 0.979, 0.200), "e": Vector3(0.991, 0.024, 0.128), "pole": Vector3(-0.400, -1.000, -0.600), "plant": 0.395},
		"walk": {"p": Vector3(-0.240, -0.180, 0.180), "a": Vector3(-0.050, 0.979, 0.200), "e": Vector3(0.992, 0.025, 0.125), "pole": Vector3(-0.400, -1.000, -0.600), "slide": 0.620, "swing": 0.040},
		"guard": {"p": Vector3(-0.150, -0.380, 0.100), "a": Vector3(0.120, 0.618, 0.777), "e": Vector3(0.963, 0.117, -0.241), "pole": Vector3(-0.500, -1.000, -0.350), "yaw": -0.250, "two": 0.420},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, 0.361, 0.933), "e": Vector3(0.989, 0.141, -0.054), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.120},
		"attack": [
			{"t": 0.35, "p": Vector3(-0.180, -0.200, 0.120), "a": Vector3(0.050, 0.923, 0.381), "e": Vector3(0.995, -0.014, -0.098), "pole": Vector3(-0.500, -1.000, -0.350), "yaw": -0.300, "two": 0.420},
			{"t": 0.52, "p": Vector3(-0.120, -0.360, 0.220), "a": Vector3(0.080, 0.501, 0.862), "e": Vector3(0.799, 0.485, -0.356), "pole": Vector3(-1.000, -0.500, -0.100), "yaw": 0.100, "lean": 0.100, "two": 0.300},
			{"t": 0.75, "p": Vector3(-0.120, -0.350, 0.210), "a": Vector3(0.080, 0.520, 0.850), "e": Vector3(0.787, 0.491, -0.374), "pole": Vector3(-1.000, -0.500, -0.100), "yaw": 0.080, "lean": 0.080, "two": 0.300},
		],
	},
	"axe_2h": {
		"relaxed": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"walk": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"guard": {"p": Vector3(-0.034, -0.194, 0.395), "a": Vector3(-0.121, 0.884, 0.452), "e": Vector3(0.469, -0.350, 0.811), "pole": Vector3(-0.500, -1.000, -0.350), "yaw": -0.200, "two": -0.280},
		"run": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"attack": [
			{"t": 0.35, "p": Vector3(-0.120, 0.180, 0.020), "a": Vector3(-0.150, 0.450, -0.880), "e": Vector3(0.786, 0.595, 0.170), "pole": Vector3(-0.800, -0.300, 0.300), "yaw": -0.300, "lean": -0.100, "two": -0.280},
			{"t": 0.52, "p": Vector3(0.000, -0.080, 0.440), "a": Vector3(0.050, -0.301, 0.952), "e": Vector3(0.493, 0.837, 0.238), "pole": Vector3(-0.300, -1.000, -0.600), "yaw": 0.150, "lean": 0.200, "two": -0.110, "slide": -0.020},
			{"t": 0.70, "p": Vector3(0.030, -0.360, 0.280), "a": Vector3(0.050, -0.905, 0.422), "e": Vector3(0.827, 0.275, 0.491), "pole": Vector3(-0.300, -1.000, -0.400), "yaw": 0.200, "lean": 0.300, "two": -0.110, "slide": -0.020},
		],
	},
	"javelin": {
		"relaxed": {"p": Vector3(-0.240, -0.470, 0.100), "a": Vector3(0.000, 0.548, 0.837), "e": Vector3(1.000, -0.026, 0.017), "pole": Vector3(-0.500, -1.000, -0.350)},
		"walk": {"p": Vector3(-0.240, -0.470, 0.100), "a": Vector3(0.000, 0.548, 0.837), "e": Vector3(1.000, -0.026, 0.017), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.050},
		"guard": {"p": Vector3(-0.200, -0.300, 0.220), "a": Vector3(0.060, 0.348, 0.935), "e": Vector3(0.922, 0.340, -0.185), "pole": Vector3(-0.800, -0.600, -0.200), "yaw": -0.300},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, 0.301, 0.954), "e": Vector3(0.988, 0.148, -0.047), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.130},
		"attack": [
			{"t": 0.38, "p": Vector3(-0.320, 0.200, -0.180), "a": Vector3(0.050, 0.249, 0.967), "e": Vector3(-0.959, -0.258, 0.116), "pole": Vector3(-0.500, -0.300, -1.000), "yaw": -0.600},
			{"t": 0.50, "p": Vector3(-0.140, 0.300, 0.200), "a": Vector3(0.000, 0.200, 0.980), "e": Vector3(-0.557, 0.814, -0.166), "pole": Vector3(-0.700, -0.500, -0.200), "yaw": 0.300, "lean": 0.100},
			{"t": 0.70, "p": Vector3(0.020, -0.300, 0.350), "a": Vector3(0.302, -0.302, 0.905), "e": Vector3(-0.779, 0.469, 0.416), "pole": Vector3(-0.500, -1.000, -0.350), "yaw": 0.450, "lean": 0.150},
		],
	},
	"bow": {
		"relaxed": {"p": Vector3(0.220, -0.430, 0.120), "a": Vector3(0.000, 0.862, 0.507), "e": Vector3(-0.049, -0.506, 0.861), "pole": Vector3(0.500, -1.000, -0.350)},
		"walk": {"p": Vector3(0.220, -0.430, 0.120), "a": Vector3(0.000, 0.862, 0.507), "e": Vector3(-0.049, -0.506, 0.861), "pole": Vector3(0.500, -1.000, -0.350), "swing": 0.050},
		"guard": {"p": Vector3(0.120, -0.300, 0.320), "a": Vector3(0.151, 0.956, 0.252), "e": Vector3(-0.279, -0.203, 0.939), "pole": Vector3(0.500, -1.000, -0.350), "yaw": -0.300, "draw": 0.000},
		"run": {"p": Vector3(0.210, -0.440, 0.080), "a": Vector3(0.000, 0.800, 0.600), "e": Vector3(-0.108, -0.596, 0.795), "pole": Vector3(0.500, -1.000, -0.350), "swing": 0.100},
		"attack": [
			{"t": 0.18, "p": Vector3(0.020, 0.020, 0.500), "a": Vector3(0.100, 0.995, 0.000), "e": Vector3(-0.712, 0.072, 0.699), "pole": Vector3(1.000, 0.000, -0.300), "yaw": -0.600, "draw": 0.100},
			{"t": 0.36, "p": Vector3(-0.070, 0.080, 0.640), "a": Vector3(0.120, 0.993, 0.000), "e": Vector3(0.000, 0.000, 1.000), "pole": Vector3(1.000, 0.000, -0.300), "yaw": -0.850, "draw": 0.450},
			{"t": 0.50, "p": Vector3(-0.070, 0.080, 0.640), "a": Vector3(0.120, 0.993, 0.000), "e": Vector3(0.000, 0.000, 1.000), "pole": Vector3(1.000, 0.000, -0.300), "yaw": -0.850, "off": [Vector3(-0.140, 0.090, -0.020), Vector3(0.201, 0.301, 0.932), Vector3(0.000, 0.949, -0.316), Vector3(-1.000, -0.400, -0.600)]},
			{"t": 0.70, "p": Vector3(-0.020, 0.060, 0.620), "a": Vector3(0.120, 0.993, 0.000), "e": Vector3(0.000, 0.000, 1.000), "pole": Vector3(1.000, 0.000, -0.300), "yaw": -0.800, "off": [Vector3(-0.150, 0.000, 0.000), Vector3(0.202, -0.202, 0.958), Vector3(0.000, 0.949, -0.316), Vector3(-1.000, -0.600, -0.400)]},
		],
	},
	"wand": {
		"relaxed": {"p": Vector3(-0.220, -0.500, 0.120), "a": Vector3(0.000, -0.600, 0.800), "e": Vector3(1.000, -0.009, -0.006), "pole": Vector3(-0.500, -1.000, -0.350)},
		"walk": {"p": Vector3(-0.220, -0.500, 0.120), "a": Vector3(0.000, -0.600, 0.800), "e": Vector3(1.000, -0.009, -0.006), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.060},
		"guard": {"p": Vector3(-0.140, -0.220, 0.340), "a": Vector3(0.050, 0.249, 0.967), "e": Vector3(0.717, 0.665, -0.208), "pole": Vector3(-0.600, -1.000, -0.300)},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, -0.503, 0.865), "e": Vector3(0.939, 0.297, 0.173), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.130},
		"attack": [
			{"t": 0.38, "p": Vector3(-0.260, 0.080, -0.020), "a": Vector3(0.000, 0.954, 0.301), "e": Vector3(-0.786, -0.186, 0.589), "pole": Vector3(-0.800, -0.600, -0.200), "yaw": -0.300},
			{"t": 0.50, "p": Vector3(-0.100, -0.060, 0.450), "a": Vector3(0.050, 0.080, 0.995), "e": Vector3(-0.696, 0.717, -0.023), "pole": Vector3(-0.600, -1.000, -0.300), "yaw": 0.200, "lean": 0.080},
			{"t": 0.70, "p": Vector3(-0.100, -0.080, 0.430), "a": Vector3(0.050, 0.060, 0.997), "e": Vector3(-0.664, 0.747, -0.012), "pole": Vector3(-0.600, -1.000, -0.300), "yaw": 0.180, "lean": 0.060},
		],
	},
	"scepter": {
		"relaxed": {"p": Vector3(-0.220, -0.420, 0.180), "a": Vector3(0.000, 0.862, 0.507), "e": Vector3(1.000, 0.010, -0.017), "pole": Vector3(-0.500, -1.000, -0.350)},
		"walk": {"p": Vector3(-0.220, -0.420, 0.180), "a": Vector3(0.000, 0.862, 0.507), "e": Vector3(1.000, 0.010, -0.017), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.050},
		"guard": {"p": Vector3(-0.140, -0.220, 0.300), "a": Vector3(0.000, 0.954, 0.301), "e": Vector3(0.942, 0.101, -0.320), "pole": Vector3(-0.600, -1.000, -0.300)},
		"run": {"p": Vector3(-0.200, -0.450, 0.050), "a": Vector3(0.000, 0.600, 0.800), "e": Vector3(0.989, 0.119, -0.089), "pole": Vector3(-0.500, -1.000, -0.350), "swing": 0.130},
		"attack": [
			{"t": 0.38, "p": Vector3(-0.160, 0.220, 0.300), "a": Vector3(0.000, 0.751, 0.661), "e": Vector3(0.778, 0.415, -0.471), "pole": Vector3(-1.000, 0.600, -0.200), "yaw": -0.100},
			{"t": 0.55, "p": Vector3(-0.120, -0.200, 0.380), "a": Vector3(0.000, 0.702, 0.712), "e": Vector3(0.781, 0.444, -0.438), "pole": Vector3(-0.800, 0.300, -0.300), "yaw": 0.100, "lean": 0.060},
			{"t": 0.75, "p": Vector3(-0.120, -0.210, 0.370), "a": Vector3(0.000, 0.702, 0.712), "e": Vector3(0.779, 0.446, -0.440), "pole": Vector3(-0.800, 0.300, -0.300), "yaw": 0.100, "lean": 0.050},
		],
	},
	"sword_2h": {
		"relaxed": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"walk": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"guard": {"p": Vector3(-0.034, -0.194, 0.395), "a": Vector3(-0.121, 0.884, 0.452), "e": Vector3(0.469, -0.350, 0.811), "pole": Vector3(-0.500, -1.000, -0.350), "yaw": -0.200, "two": -0.110},
		"run": {"p": Vector3(-0.130, 0.000, 0.200), "a": Vector3(-0.100, 0.449, -0.888), "e": Vector3(-0.091, 0.885, 0.457), "pole": Vector3(0.000, -1.000, 0.600)},
		"attack": [
			{"t": 0.35, "p": Vector3(-0.150, 0.120, 0.060), "a": Vector3(-0.120, 0.858, -0.499), "e": Vector3(0.760, 0.403, 0.510), "pole": Vector3(-0.800, -0.300, 0.300), "yaw": -0.300, "lean": -0.100, "two": -0.110},
			{"t": 0.52, "p": Vector3(0.000, -0.080, 0.440), "a": Vector3(0.050, -0.301, 0.952), "e": Vector3(0.493, 0.837, 0.238), "pole": Vector3(-0.300, -1.000, -0.600), "yaw": 0.150, "lean": 0.200, "two": -0.110, "slide": -0.020},
			{"t": 0.70, "p": Vector3(0.030, -0.360, 0.280), "a": Vector3(0.050, -0.905, 0.422), "e": Vector3(0.827, 0.275, 0.491), "pole": Vector3(-0.300, -1.000, -0.400), "yaw": 0.200, "lean": 0.300, "two": -0.110, "slide": -0.020},
		],
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

## Olhar para um ponto do mundo (peso 0 = olhar livre).
func set_look_target(pos: Vector3, weight: float) -> void:
	_look_pos = pos
	_look_w = weight

func play_attack() -> void:
	_attack = 0.0
	_attack_variant += 1
	var ranged := weapon_family in ["bow", "javelin", "wand", "scepter", "staff_2h"]
	_attack_dur = 0.55 if ranged else 0.5
	express("angry", 0.85, 0.7)

## Conjuração (habilidades de cura, reforço, área): ergue a arma/foco e aponta.
func play_cast() -> void:
	if _attack < 0.0:
		_attack = 0.0
		_attack_dur = 0.6

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

## Para capturas de teste: congela num estado conhecido (velocidade em m/s do mundo, fase da
## passada 0..1, combate, instante do golpe 0..1 ou −1).
func debug_pose(p_speed: float, phase01: float, p_combat: bool, attack_t := -1.0, variant := 0) -> void:
	debug_freeze = true
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
	_attack_variant = variant
	_attack = attack_t * _attack_dur if attack_t >= 0.0 else -1.0
	_stand = 1.0
	_two_w = 1.0 if (p_combat or attack_t >= 0.0) and _two_point(1) >= -0.5 else 0.0
	_slide = _target_slide()
	if grip_node:
		grip_node.position = Vector3(0, -_slide, 0)
	_pose(0.0)

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
	var sc := maxf(0.2, scale.x)
	var v := speed / sc
	_speed_s = lerpf(_speed_s, v, clampf(delta * 10.0, 0.0, 1.0))
	_amp = lerpf(_amp, smoothstep(0.04, 0.55, _speed_s), clampf(delta * 9.0, 0.0, 1.0))
	_run = lerpf(_run, smoothstep(1.7, 3.2, _speed_s), clampf(delta * 5.0, 0.0, 1.0))
	_combat_w = lerpf(_combat_w, 1.0 if combat or _attack >= 0.0 else 0.0, clampf(delta * 4.0, 0.0, 1.0))
	_turn_amp = lerpf(_turn_amp, clampf(absf(turn) * 0.22, 0.0, 0.55) * (1.0 - _amp), clampf(delta * 6.0, 0.0, 1.0))
	var cycle := lerpf(1.25, 2.9, smoothstep(0.8, 3.6, _speed_s))
	_phase += TAU * _speed_s * delta / cycle + absf(turn) * delta * 1.4 * (1.0 - _amp)
	# troca do pé de apoio parado (a cada 8–14 s), suave
	_stand_in -= delta
	if _stand_in <= 0.0:
		_stand_in = randf_range(8.0, 14.0)
		_stand_target = -_stand_target
	_stand = lerpf(_stand, _stand_target, clampf(delta * 1.6, 0.0, 1.0))
	# corpo inteiro: inclina ao acelerar/frear e para dentro das curvas
	_lean_f = lerpf(_lean_f, clampf(accel * 0.012, -0.13, 0.11), clampf(delta * 6.0, 0.0, 1.0))
	_lean_s = lerpf(_lean_s, clampf(-turn * speed * 0.018, -0.26, 0.26), clampf(delta * 6.0, 0.0, 1.0))
	model.transform.basis = Basis.from_euler(Vector3(_lean_f, 0.0, _lean_s)) * _base_basis
	# ponto do cabo na mão e segunda mão
	_slide = lerpf(_slide, _target_slide(), clampf(delta * 6.0, 0.0, 1.0))
	if grip_node:
		grip_node.position = Vector3(0, -_slide, 0)
	var want_two := 1.0 if _two_point(1) >= -0.5 and (_combat_w > 0.5 or _attack >= 0.0) and _run < 0.6 else 0.0
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
	for ename in expr_targets.keys():
		var target: float = float(expr_weight.get(ename + "_target", 0.0)) if _t < float(expr_until[ename]) else 0.0
		var w: float = lerpf(float(expr_weight[ename]), target, clampf(delta * 12.0, 0.0, 1.0))
		expr_weight[ename] = w
		if w > 0.05:
			face_busy = true
		for t in expr_targets[ename]:
			(t[0] as MeshInstance3D).set_blend_shape_value(t[1], w)
	if not moving and _attack < 0.0:
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

func _finger_pose(side: String, curl: float, thumb: float) -> void:
	var d: Dictionary = fingers.get(side, {})
	if d.is_empty():
		return
	var sgn := 1.0 if side == "l" else -1.0
	var per := {"index": [1.15, 1.35, 0.9], "middle": [1.25, 1.4, 0.9], "ring": [1.3, 1.4, 0.95], "little": [1.35, 1.35, 1.0]}
	for f in ["index", "middle", "ring", "little"]:
		var segs: Array = d.get(f, [])
		for i in segs.size():
			var a: float = float(per[f][i]) * curl + (0.06 * i if curl < 0.3 else 0.0)
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
	var a := clampf(_amp + _turn_amp, 0.0, 1.0)
	var wk := a * (1.0 - _run)
	var rn := a * _run
	var idle := 1.0 - a
	var cw := _combat_w
	var ph := _phase / TAU
	var breath := sin(_t * 1.7)
	var stand := _stand * idle * (1.0 - cw * 0.7)
	# ---- pernas: marcha/corrida por curvas + parado (contrapposto) + guarda ----
	var leg := {}
	var drop := {}
	for side in ["l", "r"]:
		var u := ph if side == "l" else ph + 0.5
		var hip := deg_to_rad(_curve(WALK_HIP, u)) * wk + deg_to_rad(_curve(RUN_HIP, u)) * rn
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
		leg[side] = [hip, knee, ankle, hip_s - knee_s]
		drop[side] = _thigh_len + _shin_len - (_thigh_len * cos(hip) + _shin_len * cos(hip - knee))
	for side in ["l", "r"]:
		var sgn := 1.0 if side == "l" else -1.0
		var hip: float = leg[side][0]
		var knee: float = leg[side][1]
		var ankle: float = leg[side][2]
		# pé: ângulo do tornozelo da marcha + compensação da parte estática (pé paralelo ao chão)
		var flat: float = leg[side][3]
		var splay := 0.1 + 0.08 * idle
		var abduct := (0.035 + 0.03 * cw) * idle + 0.015
		_bone(side + "_upper_leg", Quaternion(Vector3.RIGHT, -hip) * Quaternion(Vector3.BACK, abduct * sgn - _stand * idle * 0.05) * Quaternion(Vector3.UP, splay * sgn))
		_bone(side + "_lower_leg", Quaternion(Vector3.RIGHT, knee))
		_bone(side + "_foot", Quaternion(Vector3.RIGHT, -ankle + flat) * Quaternion(Vector3.BACK, -abduct * sgn))
	# ---- quadril: altura pelo pé de apoio (o mais baixo encosta no chão) + voo da corrida ----
	var support := minf(float(drop["l"]), float(drop["r"]))
	var flight := rn * 0.03 * absf(sin(_phase))
	var sway := wk * 0.018 * sin(_phase) + 0.022 * stand
	_set_offset("hips", Vector3(sway, -support + flight - 0.02 * cw * idle, 0.0))
	var hip_l: float = leg["l"][0]
	var hip_r: float = leg["r"][0]
	var pelvis_yaw := -(hip_l - hip_r) * (0.12 * wk + 0.16 * rn) - 0.22 * cw * idle
	var pelvis_roll := 0.05 * stand + wk * 0.04 * cos(_phase)
	_bone("hips", Quaternion(Vector3.UP, pelvis_yaw) * Quaternion(Vector3.BACK, pelvis_roll) * Quaternion(Vector3.RIGHT, 0.04 * rn))
	# ---- golpe ----
	var atk := -1.0
	if _attack >= 0.0:
		if not debug_freeze:
			_attack += delta
		atk = clampf(_attack / maxf(0.1, _attack_dur), 0.0, 1.0)
		if atk >= 1.0 and not debug_freeze:
			_attack = -1.0
			atk = -1.0
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
	var wpd: Dictionary = WPOSES.get(_wpose_family(), {})
	var wside: String = grip.get("hand", "r") if not grip.is_empty() else "r"
	var oside := "l" if wside == "r" else "r"
	var o_guard: Array = ARM_SHIELD_GUARD if has_shield else st["guard"]["o"]
	var w_arm: Array = _mix_arm(_mix_arm(st["relaxed"]["w"], st["guard"]["w"], cw), st["run"]["w"], rn)
	var o_arm: Array = _mix_arm(_mix_arm(st["relaxed"]["o"], o_guard, cw), st["run"]["o"], rn)
	# balanço oposto às pernas: o braço direito vai à frente quando o pé esquerdo pisa (fase 0)
	var swing_amp := 0.3 * wk + 0.55 * rn
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
	# respiração e soltura dos braços parado
	w_arm[2] = float(w_arm[2]) + breath * 0.02 * idle
	o_arm[2] = float(o_arm[2]) + breath * 0.025 * idle
	var sw := _state_weights(a, cw, rn)
	var spine_yaw := 0.0
	var spine_lean := 0.0
	if not wpd.is_empty():
		var gd: Dictionary = wpd["guard"]
		spine_yaw = float(gd.get("yaw", 0.0)) * sw[2]
		spine_lean = float(gd.get("lean", 0.0)) * sw[2]
	var ik_keys: Array = []
	if atk >= 0.0:
		var use_b := _attack_variant % 2 == 1
		if wpd.has("attack"):
			ik_keys = wpd["attack_b"] if (use_b and wpd.has("attack_b")) else wpd["attack"]
			var body := _attack_body(ik_keys, atk, spine_yaw, spine_lean)
			spine_yaw = body[0]
			spine_lean = body[1]
		else:
			var keys: Array = st["attack_b"] if (use_b and st.has("attack_b")) else st["attack"]
			var r := _attack_pose(keys, atk, w_arm, o_arm)
			w_arm = r[0]
			o_arm = r[1]
			spine_yaw = r[2]
			spine_lean = r[3]
		if arrow_node:
			arrow_node.visible = atk > 0.12 and atk < 0.5
	elif arrow_node:
		arrow_node.visible = false
	# dardo: some da mão depois do arremesso e volta (outro dardo da aljava)
	if weapon_mesh and weapon_family == "javelin":
		weapon_mesh.visible = not (atk > 0.52 and atk < 0.95)
	# ---- tronco, pescoço e cabeça ----
	var lean := 0.04 * wk + 0.2 * rn + 0.025 * breath * idle - 0.22 * hurt + 0.06 * cw * idle + spine_lean
	var counter := -pelvis_yaw * 0.85 + spine_yaw
	# em guarda/golpe a cabeça compensa todo o giro do tronco para manter os olhos no oponente
	var look_comp := 1.0 + cw
	_bone("spine", Quaternion(Vector3.RIGHT, lean) * Quaternion(Vector3.UP, counter * 0.6) * Quaternion(Vector3.BACK, -pelvis_roll * 0.7))
	_bone("chest", Quaternion(Vector3.RIGHT, 0.02 * breath - 0.04 * rn) * Quaternion(Vector3.UP, counter * 0.4) * Quaternion(Vector3.BACK, -pelvis_roll * 0.3))
	_bone("neck", Quaternion(Vector3.RIGHT, -0.04 * a - 0.1 * rn - lean * 0.3) * Quaternion(Vector3.UP, _look_yaw * 0.4 - counter * 0.3 * look_comp))
	var look_idle := sin(_t * 0.37) * 0.08 * idle * (1.0 - absf(_look_yaw)) * (1.0 - cw)
	_bone("head", Quaternion(Vector3.RIGHT, sin(_t * 0.6) * 0.03 * idle - _look_pitch * 0.6 - 0.12 * hurt - lean * 0.2) * Quaternion(Vector3.UP, look_idle + _look_yaw * 0.6 - counter * 0.2 * look_comp) * Quaternion(Vector3.BACK, 0.04 * stand))
	# ---- aplica braços (camada direta) ----
	var qw := _arm_d(wside, w_arm)
	var qo := _arm_d(oside, o_arm)
	_bone(wside + "_upper_arm", qw[0])
	_bone(wside + "_lower_arm", qw[1])
	_bone(wside + "_hand", qw[2])
	_bone(oside + "_upper_arm", qo[0])
	_bone(oside + "_lower_arm", qo[1])
	_bone(oside + "_hand", qo[2])
	# ---- dedos ----
	var w_curl := 1.0 if weapon_family != "" else (0.95 * cw + 0.22 * (1.0 - cw))
	var w_thumb := 1.0 if weapon_family != "" else (0.8 * cw + 0.25 * (1.0 - cw))
	var o_open := 0.45 if weapon_family in ["axe_1h", "hammer_1h", "sword_1h"] else 0.9
	var o_curl := (0.22 * (1.0 - cw) + o_open * cw) if not has_shield else 0.9
	if weapon_family == "bow" and (atk >= 0.0 or cw > 0.5):
		# mão da corda: dedos em gancho na corda; abre ao soltar
		o_curl = 0.55 if (atk < 0.0 or atk < 0.5) else 0.12
	_finger_pose(wside, w_curl, w_thumb)
	_finger_pose(oside, lerpf(o_curl, 1.0, _two_w), lerpf(0.25, 1.0, _two_w))
	# ---- camada da arma: a mão vai até onde a arma deve estar (IK) ----
	var off_spec: Array = []
	var two_rel := -999.0
	var slide_now := _slide
	_string_pt = Vector3.INF
	if weapon_mesh and not wpd.is_empty():
		_s0 = _shoulder_ref()
		var tgt := _wpose_blend(wpd, sw, wside)
		if not ik_keys.is_empty():
			tgt = _attack_wpose(ik_keys, atk, tgt)
		slide_now = float(tgt.get("slide", _slide))
		if grip_node and absf(slide_now - _slide) > 1e-4:
			grip_node.position = Vector3(0, -slide_now, 0)
		_ik_weapon(wside, tgt)
		off_spec = tgt.get("off", [])
		two_rel = float(tgt.get("two", -999.0))
	# ---- mão livre: segunda mão no cabo, corda do arco ou pose de morador ----
	var two := (slide_now + two_rel) if two_rel > -900.0 else _two_point(1)
	if _two_w > 0.01 and two >= -0.5:
		var wp := _weapon_point_w(two)
		if not wp.is_empty():
			var pole2 := Vector3(0.6 if oside == "l" else -0.6, -1.0, -0.4)
			_ik_grip(oside, wp[0], wp[1], pole2, _two_w)
	elif not off_spec.is_empty() and float(off_spec[4]) > 0.01:
		_ik_hand_free(oside, off_spec[0], off_spec[1], off_spec[2], off_spec[3], float(off_spec[4]))
		if off_spec.size() > 5 and float(off_spec[5]) > 0.5:
			_string_pt = _root_to_world(off_spec[0] + (off_spec[1] as Vector3) * 0.035 * _arm_k)
	elif npc_variant > 0 and weapon_family == "":
		_npc_hands(idle)
	if not aims.is_empty():
		_solve_aims()
	if arrow_node and arrow_node.visible:
		_place_arrow()
	if string_parts.size() == 2:
		_place_string()

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

## Giro do tronco e inclinação no instante t do golpe (começa e termina na postura base).
func _attack_body(keys: Array, t: float, base_yaw: float, base_lean: float) -> Array:
	var prev_t := 0.0
	var py := base_yaw
	var pl := base_lean
	for k in keys.size() + 1:
		var last := k == keys.size()
		var kd: Dictionary = {} if last else keys[k]
		var kt: float = 1.0 if last else float(kd["t"])
		var ky: float = base_yaw if last else float(kd.get("yaw", 0.0))
		var kl: float = base_lean if last else float(kd.get("lean", 0.0))
		if t <= kt:
			var f := smoothstep(0.0, 1.0, (t - prev_t) / maxf(kt - prev_t, 1e-3))
			return [lerpf(py, ky, f), lerpf(pl, kl, f)]
		prev_t = kt
		py = ky
		pl = kl
	return [base_yaw, base_lean]

## Pose da arma no golpe: começa e termina na pose base; entre chaves, interpola ponto e eixos.
func _attack_wpose(keys: Array, t: float, base: Dictionary) -> Dictionary:
	var prev_t := 0.0
	var prev: Dictionary = base
	for k in keys.size() + 1:
		var last := k == keys.size()
		var kt: float = 1.0 if last else float((keys[k] as Dictionary)["t"])
		var kd: Dictionary = base if last else _key_root(keys[k], base)
		if t <= kt:
			var f := smoothstep(0.0, 1.0, (t - prev_t) / maxf(kt - prev_t, 1e-3))
			return _mix_wpose(prev, kd, f)
		prev_t = kt
		prev = kd
	return base

## Chave do golpe no espaço do personagem (mão livre resolvida: explícita ou na corda).
func _key_root(key: Dictionary, base: Dictionary) -> Dictionary:
	var out := {"p": _s0 + (key["p"] as Vector3) * _arm_k, "a": key["a"], "e": key["e"], "pole": key["pole"]}
	# ponto do cabo na mão nesta chave (a mão de cima desliza até a de baixo no golpe)
	out["slide"] = float(key["slide"]) if key.has("slide") else float(base.get("slide", _slide))
	if key.has("two"):
		out["two"] = float(key["two"])
	elif base.has("two"):
		out["two"] = base["two"]
	if key.has("off"):
		var o: Array = key["off"]
		out["off"] = [_s0 + (o[0] as Vector3) * _arm_k, o[1], o[2], o[3], 1.0, 0.0]
	elif key.has("draw"):
		out["off"] = _string_spec(out, float(key["draw"]))
	return out

func _mix_wpose(a: Dictionary, b: Dictionary, f: float) -> Dictionary:
	if f <= 0.0:
		return a
	if f >= 1.0:
		return b
	var out := {
		"p": (a["p"] as Vector3).lerp(b["p"], f),
		"a": _nlerp(a["a"], b["a"], f),
		"e": _nlerp(a["e"], b["e"], f),
		"pole": _nlerp(a["pole"], b["pole"], f),
		"slide": lerpf(float(a.get("slide", _slide)), float(b.get("slide", _slide)), f),
	}
	if a.has("two") and b.has("two"):
		out["two"] = lerpf(float(a["two"]), float(b["two"]), f)
	elif b.has("two") and f > 0.5:
		out["two"] = b["two"]
	elif a.has("two") and f <= 0.5:
		out["two"] = a["two"]
	var oa: Array = a.get("off", [])
	var ob: Array = b.get("off", [])
	if not oa.is_empty() and not ob.is_empty():
		out["off"] = [(oa[0] as Vector3).lerp(ob[0], f), _nlerp(oa[1], ob[1], f), _nlerp(oa[2], ob[2], f), _nlerp(oa[3], ob[3], f), lerpf(float(oa[4]), float(ob[4]), f), lerpf(float(oa[5]), float(ob[5]), f)]
	elif not ob.is_empty():
		var o2 := ob.duplicate()
		o2[4] = float(ob[4]) * f
		out["off"] = o2
	elif not oa.is_empty():
		var o3 := oa.duplicate()
		o3[4] = float(oa[4]) * (1.0 - f)
		out["off"] = o3
	return out

static func _nlerp(a: Vector3, b: Vector3, f: float) -> Vector3:
	var v := a.lerp(b, f)
	return v.normalized() if v.length() > 1e-4 else b

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
func _ik_weapon(side: String, tgt: Dictionary) -> void:
	if weapon_holder == null or not bones.has(side + "_hand"):
		return
	var to_s := _skel_to_root().affine_inverse()
	var wb := _wbasis(tgt["a"], tgt["e"])
	var w_s: Basis = (to_s.basis * wb).orthonormalized()
	var hb: Basis = (w_s * weapon_holder.transform.basis.orthonormalized().inverse()).orthonormalized()
	var p_s: Vector3 = to_s * (tgt["p"] as Vector3)
	var hand_o: Vector3 = p_s - hb * weapon_holder.position
	_ik_arm_tf(side, Transform3D(hb, hand_o), tgt["pole"], 1.0)

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

## Interpola as chaves do golpe a partir da postura atual (início e fim = postura base).
func _attack_pose(keys: Array, t: float, w_base: Array, o_base: Array) -> Array:
	var prev_t := 0.0
	var prev_w: Array = w_base
	var prev_o: Array = o_base
	var prev_yaw := 0.0
	var prev_lean := 0.0
	for k in keys.size() + 1:
		var kt: float = 1.0 if k == keys.size() else float(keys[k][0])
		var kw: Array = w_base if k == keys.size() else keys[k][1]
		var ko: Array = o_base
		if k < keys.size() and keys[k][2] != null:
			ko = keys[k][2]
		var kyaw: float = 0.0 if k == keys.size() else float(keys[k][3])
		var klean: float = 0.0 if k == keys.size() else float(keys[k][4])
		if t <= kt:
			var f := smoothstep(0.0, 1.0, (t - prev_t) / maxf(kt - prev_t, 1e-3))
			return [_mix_arm(prev_w, kw, f), _mix_arm(prev_o, ko, f), lerpf(prev_yaw, kyaw, f), lerpf(prev_lean, klean, f)]
		prev_t = kt
		prev_w = kw
		prev_o = ko
		prev_yaw = kyaw
		prev_lean = klean
	return [w_base, o_base, 0.0, 0.0]

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
