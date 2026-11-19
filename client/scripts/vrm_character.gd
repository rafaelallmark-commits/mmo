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
	if weapon_family != "" and weapon_node != null:
		var w: Node3D = weapon_node
		var holder := _attach("r_hand", Vector3(-0.065, -0.012, 0.015), _idle_chain(["r_upper_arm", "r_lower_arm"]), Quaternion(Vector3.RIGHT, deg_to_rad(28)))
		if holder:
			holder.add_child(w)
			weapon_holder = holder
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
				var r: float = 0.21 if acc == "shield" else 0.15
				var sh := _attach("l_hand", Vector3(0.04, -0.01, 0.06), _idle_chain(["l_upper_arm", "l_lower_arm"]), Quaternion(Vector3.UP, deg_to_rad(25)))
				if sh:
					Gear.part(sh, Gear.cyl(r, r, 0.035, 26), Gear.mat(trim.darkened(0.35)), Vector3.ZERO, Vector3.ONE, Vector3(90, 0, 0))
					Gear.part(sh, Gear.cyl(r * 0.8, r * 0.8, 0.04, 26), Gear.mat(outfit), Vector3(0, 0, 0.004), Vector3.ONE, Vector3(90, 0, 0))
					Gear.part(sh, Gear.torus(r * 0.36, r * 0.44, 20), Gear.mat(trim), Vector3(0, 0, 0.024), Vector3.ONE, Vector3(90, 0, 0))
					Gear.part(sh, Gear.sphere(0.035), Gear.mat(trim), Vector3(0, 0, 0.03))
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
## Movimento dirigido pela velocidade real (m/s no mundo): a passada avança pela distância
## percorrida (sem "patinar"), mistura andar e correr, inclina o corpo ao acelerar/frear e nas
## curvas, dá passinhos ao girar parado e olha para o alvo.
var speed := 0.0
var accel := 0.0
var turn := 0.0
var _base_basis := Basis()
var _speed_s := 0.0
var _run := 0.0
var _lean_f := 0.0
var _lean_s := 0.0
var _turn_amp := 0.0
var _hurt := -1.0
var _look_pos := Vector3.ZERO
var _look_w := 0.0
var _look_yaw := 0.0
var _look_pitch := 0.0

func set_moving(m: bool) -> void:
	moving = m
	speed = 3.6 if m else 0.0

func set_motion(p_speed: float, p_accel: float, p_turn: float) -> void:
	speed = p_speed
	accel = p_accel
	turn = p_turn
	moving = p_speed > 0.15

## Olhar para um ponto do mundo (peso 0 = olhar livre).
func set_look_target(pos: Vector3, weight: float) -> void:
	_look_pos = pos
	_look_w = weight

func play_attack() -> void:
	_attack = 0.0
	express("angry", 0.85, 0.7)

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

func _process(delta: float) -> void:
	if skel == null:
		return
	_t += delta
	var sc := maxf(0.2, scale.x)
	var v := speed / sc
	_speed_s = lerpf(_speed_s, v, clampf(delta * 10.0, 0.0, 1.0))
	_amp = lerpf(_amp, smoothstep(0.04, 0.55, _speed_s), clampf(delta * 9.0, 0.0, 1.0))
	_run = lerpf(_run, smoothstep(1.7, 3.2, _speed_s), clampf(delta * 5.0, 0.0, 1.0))
	# passinhos ao girar parado
	_turn_amp = lerpf(_turn_amp, clampf(absf(turn) * 0.22, 0.0, 0.55) * (1.0 - _amp), clampf(delta * 6.0, 0.0, 1.0))
	var cycle := lerpf(1.25, 2.9, smoothstep(0.8, 3.6, _speed_s))
	_phase += TAU * _speed_s * delta / cycle + absf(turn) * delta * 1.4 * (1.0 - _amp)
	# corpo inteiro: inclina ao acelerar/frear e para dentro das curvas
	_lean_f = lerpf(_lean_f, clampf(accel * 0.012, -0.13, 0.11), clampf(delta * 6.0, 0.0, 1.0))
	_lean_s = lerpf(_lean_s, clampf(-turn * speed * 0.018, -0.26, 0.26), clampf(delta * 6.0, 0.0, 1.0))
	model.transform.basis = Basis.from_euler(Vector3(_lean_f, 0.0, _lean_s)) * _base_basis
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
	_pose(delta)
	# piscar
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
	# sorriso de vez em quando, parado
	if not moving and _attack < 0.0:
		_smile_in -= delta
		if _smile_in <= 0.0:
			_smile_in = randf_range(7.0, 14.0)
			express("happy", 0.65, 1.6)
	for b in blink_meshes:
		(b[0] as MeshInstance3D).set_blend_shape_value(b[1], 0.0 if face_busy else clampf(bv, 0.0, 1.0))

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

## Flexão do joelho ao longo do ciclo (pico no meio do balanço da perna).
static func _knee(ph: float, wk: float, rn: float) -> float:
	var bump := pow(maxf(0.0, -cos(ph + 0.35)), 1.3)
	return wk * (0.08 + 0.95 * bump) + rn * (0.3 + 1.7 * bump)

func _pose(delta: float) -> void:
	var a := clampf(_amp + _turn_amp, 0.0, 1.0)
	var wk := a * (1.0 - _run)
	var rn := a * _run
	var ph := _phase
	var breath := sin(_t * 1.7)
	var idle := 1.0 - a
	# pernas: coxa (mais à frente ao correr), joelho dobra no balanço, pé acompanha
	var thigh_amp := 0.4 * wk + 0.7 * rn
	var thigh_bias := -0.02 * wk - 0.22 * rn
	var lth := sin(ph) * thigh_amp + thigh_bias
	var rth := sin(ph + PI) * thigh_amp + thigh_bias
	_bone("l_upper_leg", _rx(lth - 0.015 * idle) * _rz(0.02 * idle))
	_bone("r_upper_leg", _rx(rth - 0.015 * idle) * _rz(-0.02 * idle))
	var kl := _knee(ph, wk, rn)
	var kr := _knee(ph + PI, wk, rn)
	_bone("l_lower_leg", _rx(kl + 0.04))
	_bone("r_lower_leg", _rx(kr + 0.04))
	_bone("l_foot", _rx(0.2 * sin(ph) * a - kl * 0.3 - 0.04))
	_bone("r_foot", _rx(0.2 * sin(ph + PI) * a - kr * 0.3 - 0.04))
	# quadril: sobe e desce (andar: alto no apoio; correr: alto no voo), gira com as pernas,
	# e parado troca o peso de uma perna para a outra
	var bob := wk * (0.022 * absf(cos(ph)) - 0.015) + rn * (0.05 * absf(sin(ph)) - 0.055)
	var shift := sin(_t * 0.55) * 0.012 * idle
	_set_offset("hips", Vector3(shift, bob, 0))
	_bone("hips", _ry(sin(ph) * (0.09 * wk + 0.12 * rn)) * _rz(cos(ph) * 0.035 * wk + shift * 1.6))
	# golpe
	var k := -1.0
	if _attack >= 0.0:
		_attack += delta
		k = clampf(_attack / 0.42, 0.0, 1.0)
		if k >= 1.0:
			_attack = -1.0
	var lift := smoothstep(0.0, 0.35, k) if k >= 0.0 else 0.0
	var strike := smoothstep(0.35, 0.8, k) if k >= 0.0 else 0.0
	var twist := 0.4 * lift - 0.75 * strike * lift
	# susto ao levar golpe
	var hurt := 0.0
	if _hurt >= 0.0:
		_hurt += delta
		hurt = smoothstep(0.0, 0.08, _hurt) * (1.0 - smoothstep(0.08, 0.4, _hurt))
		if _hurt > 0.4:
			_hurt = -1.0
	# tronco: inclina ao correr, gira contra o quadril, respira parado
	var lean := 0.06 * wk + 0.2 * rn + 0.03 * breath * idle - 0.22 * hurt
	_bone("spine", _rx(lean) * _ry(-sin(ph) * (0.12 * wk + 0.2 * rn) + twist))
	_bone("chest", _rx(0.02 * breath - 0.04 * rn) * _ry(-sin(ph) * 0.06 * rn))
	_bone("neck", _rx(-0.04 * a - 0.1 * rn) * _ry(_look_yaw * 0.4))
	var look_idle := sin(_t * 0.37) * 0.08 * idle * (1.0 - absf(_look_yaw))
	_bone("head", _rx(sin(_t * 0.6) * 0.035 * idle - _look_pitch * 0.6 - 0.12 * hurt) * _ry(look_idle + _look_yaw * 0.6))
	# braços: balanço oposto às pernas; correndo, cotovelos dobrados; braço da arma golpeia
	var down: float = cfg["arm_down"]
	var arm_amp := 0.36 * wk + 0.6 * rn
	var arm_l := -sin(ph) * arm_amp + breath * 0.015 * idle
	var arm_r := -sin(ph + PI) * arm_amp * (0.65 if weapon_family != "" else 1.0) + breath * 0.015 * idle
	var spread := 0.1 * rn + 0.12 * hurt
	_bone("l_upper_arm", _rx(-0.1 + arm_l) * _rz(-down + spread))
	_bone("l_lower_arm", _ry(-0.35 - 0.25 * wk - 1.05 * rn - 0.2 * maxf(0.0, -arm_l)))
	if k >= 0.0:
		var raise := -2.5 * lift + 2.9 * strike * lift
		_bone("r_upper_arm", _rx(-0.22 + raise) * _rz(down * (1.0 - 0.35 * lift)))
		_bone("r_lower_arm", _ry(0.75 - 0.6 * lift * (1.0 - strike)))
	else:
		_bone("r_upper_arm", _rx(-0.22 + arm_r) * _rz(down - spread))
		var base_r := 0.75 if weapon_family != "" else 0.35
		_bone("r_lower_arm", _ry(base_r + 0.15 * wk + maxf(0.0, 1.2 - base_r) * rn))
	if not aims.is_empty():
		_solve_aims()
