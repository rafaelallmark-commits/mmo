extends Node3D
## Sonda dos golpes e das habilidades (moves.gd): --animprobe=pasta congela cada movimento em vários instantes,
## lado a lado (uma fileira de cópias do mesmo personagem, cada uma num instante), e salva uma captura por
## movimento — de perto, em 3/4 (_perto), e na câmera do jogo (_jogo). Os movimentos de cada personagem: as
## variações do ataque básico, o crítico e as seis habilidades da classe (data/skills.json, com as opções que o
## jogo usa). --set=classe ou --set=classe:arma filtra; --only=trecho filtra pelo nome do movimento.
## --check: em vez de capturar, confere os números de cada movimento em 25 instantes — pulso, mão longe do alvo,
## arma, mão ou cotovelo dentro do tronco ou da cabeça, pé plantado que desliza — e imprime o que passar.

const Art = preload("res://scripts/art.gd")
const Scenery = preload("res://scripts/scenery.gd")
const Moves = preload("res://scripts/moves.gd")

## [classe, arma, mão secundária ("?" = a da classe)]
const SETS := [
	["breaker", "axe_2h", "?"], ["breaker", "axe_1h", "?"],
	["warden", "bow", "quiver"],
	["emberweaver", "staff_2h", "?"], ["emberweaver", "wand", "?"],
	["dawnshield", "sword_1h", "shield"], ["dawnshield", "sword_2h", "?"],
	["pikeman", "spear_2h", "?"],
	["windwalker", "javelin", "light_shield"],
	["bastion", "hammer_1h", "shield"], ["bastion", "claw", "shield"],
	["veilsinger", "scepter", "?"], ["veilsinger", "staff_2h", "?"], ["veilsinger", "wand", "?"],
]
const FRAMES := [0.14, 0.32, 0.46, 0.6, 0.8]
## As cópias ficam viradas a 3/4 para a câmera de perto (o lado da arma e a profundidade aparecem).
const TURN := 0.7
## Extensão de cada arma ao longo do eixo (y do modelo da arma, gear.gd), para conferir se entra no corpo.
const REACH := {
	"axe_1h": [-0.13, 0.69], "axe_2h": [-0.17, 0.9], "hammer_1h": [-0.13, 0.64], "sword_1h": [-0.13, 0.82],
	"sword_2h": [-0.17, 1.04], "spear_2h": [-0.42, 1.69], "bow": [-0.54, 0.54], "javelin": [-0.25, 1.09],
	"wand": [-0.07, 0.4], "scepter": [-0.08, 0.5], "staff_2h": [-0.4, 1.35], "claw": [0.0, 0.28],
}

var out_dir := ""
var set_filter := ""
var only := ""
var check := false
var skills := {}
var cam: Camera3D
var jobs: Array = []   # [nome do arquivo, classe, arma, mão sec., movimento]
var _job := -1
var _phase := 0
var _wait := 0
var chars: Array = []
var labels: Array = []
var issues := 0

func start(dir: String, filter := "", p_only := "", p_check := false) -> void:
	out_dir = dir
	set_filter = filter
	only = p_only
	check = p_check
	skills = _load_skills()
	var env := WorldEnvironment.new()
	env.environment = Scenery.environment("pedrambar")
	env.environment.fog_enabled = false
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -35, 0)
	sun.light_color = Color("#fff4e6")
	sun.shadow_enabled = true
	add_child(sun)
	Art.publish_sun(sun)
	var g := PlaneMesh.new()
	g.size = Vector2(60, 60)
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color("#8a9a6a")
	var gi := MeshInstance3D.new()
	gi.mesh = g
	gi.material_override = gm
	add_child(gi)
	for kz in range(-6, 7):
		var l := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(30, 0.005, 0.015)
		l.mesh = bm
		var lm := StandardMaterial3D.new()
		lm.albedo_color = Color("#6a7a4a")
		l.material_override = lm
		l.position = Vector3(0, 0.003, kz * 0.5)
		add_child(l)
	cam = Camera3D.new()
	cam.fov = 40
	add_child(cam)
	cam.current = true
	_build_jobs()
	print("[animprobe] %d movimentos" % jobs.size())
	_next_job()

## Habilidades do jogo, lidas de data/skills.json (o cliente as recebe do servidor; a sonda roda sem servidor).
func _load_skills() -> Dictionary:
	var path := ProjectSettings.globalize_path("res://").path_join("../data/skills.json")
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_warning("sonda: sem data/skills.json em %s" % path)
		return {}
	var d = JSON.parse_string(f.get_as_text())
	return d.get("skills", {}) if d is Dictionary else {}

func _build_jobs() -> void:
	for st in SETS:
		var cls: String = st[0]
		var fam: String = st[1]
		var tag := "%s_%s" % [cls, fam]
		if set_filter != "" and not (set_filter == cls or set_filter == "%s:%s" % [cls, fam]):
			continue
		var cat := Moves.category(fam)
		for v in Moves.basic_count(cat):
			var m := Moves.basic(cat, v)
			_add_job("%s_basico%d_%s" % [tag, v, m["name"]], st, m)
		var mc := Moves.critical(Moves.basic(cat, 0), cat)
		_add_job("%s_critico_%s" % [tag, mc["name"]], st, mc)
		var ids := []
		for id in skills.keys():
			if str(skills[id].get("classId", "")) == cls:
				ids.append([int(skills[id].get("unlockLevel", 0)), str(id)])
		ids.sort()
		for pair in ids:
			var sid: String = pair[1]
			var opts := Moves.skill_opts(sid, skills)
			opts["shield"] = st[2] in ["shield", "light_shield"] or (st[2] == "?" and cls in ["bastion", "dawnshield", "windwalker"] and not fam in Art.TWO_HANDED)
			var ms := Moves.skill(str(opts["kind"]), cat, opts)
			_add_job("%s_hab%02d_%s_%s_%s" % [tag, int(pair[0]), sid, opts["kind"], ms["name"]], st, ms)

func _add_job(name: String, st: Array, m: Dictionary) -> void:
	if only != "" and not (only in name):
		return
	jobs.append([name, st[0], st[1], st[2], m])

func _clear() -> void:
	for c in chars:
		c.queue_free()
	for l in labels:
		l.queue_free()
	chars.clear()
	labels.clear()

func _label(text: String, pos: Vector3, size := 34) -> void:
	var l := Label3D.new()
	l.text = text
	l.font_size = size
	l.pixel_size = 0.006
	l.outline_size = 8
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = pos
	add_child(l)
	labels.append(l)

func _next_job() -> void:
	_clear()
	_job += 1
	if _job >= jobs.size():
		print("[animprobe] %s" % ("OK" if issues == 0 or not check else "conferido: %d avisos" % issues))
		get_tree().quit(0)
		return
	var jb: Array = jobs[_job]
	var n := 1 if check else FRAMES.size()
	for i in n:
		var c: Node3D = Art.character(jb[1], jb[2], false, Color.WHITE, 0, jb[3])
		c.position = Vector3((i - (n - 1) * 0.5) * 1.35, 0, 0)
		c.rotation.y = 0.0 if check else TURN
		add_child(c)
		chars.append(c)
		if not check:
			_label("t=%.2f" % FRAMES[i], c.position + Vector3(0, 2.05, 0), 30)
	if not check:
		var m: Dictionary = jb[4]
		_label("%s  (%.2f s)" % [str(jb[0]), float(m.get("dur", 0.0))], Vector3(0, 2.4, -1.5), 30)
	_phase = 0
	_wait = 2

func _pose_all() -> void:
	var jb: Array = jobs[_job]
	for i in chars.size():
		var c: Node3D = chars[i]
		if c.has_method("debug_pose"):
			c.debug_pose(0.0, 0.0, true)
			c.debug_motion(jb[4], FRAMES[i])

func _process(_d: float) -> void:
	if _job < 0 or _job >= jobs.size():
		return
	if _wait > 0:
		_wait -= 1
		if _wait == 1 and not check:
			_pose_all()
		return
	if check:
		_check_job()
		_next_job()
		return
	var jb: Array = jobs[_job]
	match _phase:
		0:
			cam.fov = 40
			cam.position = Vector3(0.3, 1.75, 6.4)
			cam.look_at(Vector3(0, 1.0, 0))
			_phase = 1
			_wait = 2
		1:
			_save(str(jb[0]) + "_perto")
			# câmera do jogo: alta (0,8 rad), do lado de sempre (−0,6), mais perto que os 18 m para caber a fileira
			var yaw := -0.6
			var pitch := 0.8
			var d := 9.5
			cam.fov = 40
			cam.position = Vector3(0, 1.2, 0) + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * d
			cam.look_at(Vector3(0, 1.0, 0))
			_phase = 2
			_wait = 2
		2:
			_save(str(jb[0]) + "_jogo")
			_next_job()

func _save(name: String) -> void:
	var path := "%s/%s.png" % [out_dir, name]
	get_viewport().get_texture().get_image().save_png(path)
	print("[animprobe] ", path)

# ---------------- conferência numérica ----------------
func _warn(name: String, t: float, what: String) -> void:
	issues += 1
	print("[animcheck] %s t=%.2f: %s" % [name, t, what])

## Distância de um ponto ao segmento a–b.
static func _seg_dist(p: Vector3, a: Vector3, b: Vector3) -> float:
	var ab := b - a
	var t := clampf((p - a).dot(ab) / maxf(ab.length_squared(), 1e-6), 0.0, 1.0)
	return p.distance_to(a + ab * t)

func _check_job() -> void:
	var jb: Array = jobs[_job]
	var c = chars[0]
	if not c.has_method("debug_motion"):
		return
	var m: Dictionary = jb[4]
	var name: String = jb[0]
	var fam: String = jb[2]
	var foot_prev := {}
	var worst := {}
	var steps := 25
	var has_step := false
	for key in m.get("keys", []):
		if (key as Dictionary).has("lf") or (key as Dictionary).has("rf") or (key as Dictionary).has("hop") or (key as Dictionary).has("spin"):
			has_step = true
	for si in range(1, steps - 1):
		# as pontas (t = 0 e 1) são a postura base, que não é deste movimento
		var t := float(si) / float(steps - 1)
		c.debug_pose(0.0, 0.0, true)
		c.debug_motion(m, t)
		var sk: Skeleton3D = c.skel
		var gt := sk.global_transform
		var bp := func(key: String) -> Vector3:
			return gt * sk.get_bone_global_pose(c.bones[key]["idx"]).origin
		var hips: Vector3 = bp.call("hips")
		var neck: Vector3 = bp.call("neck")
		var head: Vector3 = bp.call("head") + Vector3(0, 0.1, 0)
		var core_a := hips + (neck - hips) * 0.15
		var core_b := neck - (neck - hips) * 0.1
		# mão principal longe do alvo (alcance) e pulso
		var wside: String = c.grip.get("hand", "r") if not c.grip.is_empty() else "r"
		for side in ["l", "r"]:
			var el: Vector3 = bp.call(side + "_lower_arm")
			var wr: Vector3 = bp.call(side + "_hand")
			if _seg_dist(el, core_a, core_b) < 0.07:
				worst["cotovelo %s no tronco" % side] = t
			if _seg_dist(wr, core_a, core_b) < 0.06:
				worst["pulso %s no tronco" % side] = t
			if wr.distance_to(head) < 0.09:
				worst["pulso %s na cabeça" % side] = t
			# pulso: ângulo entre o antebraço e os dedos (mão na corda do arco não conta: a pose da corda é a da
			# guarda revisada; mão no cabo de duas mãos segura na diagonal e tem mais folga)
			var limit := 75.0
			if side != wside:
				var oa: Dictionary = c._out_arms
				if float(oa.get("dw", 0.0)) > 0.5:
					continue
				limit = 100.0 if float(oa.get("g", c._two_w)) > 0.5 else 85.0
			var ih: int = c.bones[side + "_hand"]["idx"]
			var gb: Basis = sk.get_bone_global_pose(ih).basis.orthonormalized()
			var fd: Basis = gb * sk.get_bone_global_rest(ih).basis.orthonormalized().inverse() * c._hand_frame_t(side)
			var fing: Vector3 = (gt.basis * fd.x).normalized()
			var fore := (wr - el).normalized()
			var ang := rad_to_deg(fore.angle_to(fing))
			if ang > limit:
				worst["pulso %s dobrado %d°" % [side, int(ang)]] = t
		# mão principal longe do alvo pedido (fora de alcance) e mão de apoio fora do cabo
		var oa2: Dictionary = c._out_arms
		var spin := float(c._out_body.get("spin", 0.0))
		if oa2.has("wp") and float(oa2.get("wik", 1.0 if c.WPOSES.has(c._wpose_family()) else 0.0)) > 0.9:
			var req: Vector3 = c._s0 + Basis(Vector3.UP, spin) * ((oa2["wp"] as Vector3) * c._arm_k)
			var got: Vector3 = c._held_pose(wside)[0]
			if req.distance_to(got) > 0.04:
				worst["mão longe do alvo (%.0f cm)" % (req.distance_to(got) * 100.0)] = t
		if c.weapon_mesh and float(oa2.get("g", c._two_w)) > 0.6 and float(oa2.get("two", -999.0)) > -900.0:
			var slide: float = -c.grip_node.position.y
			var hp: Array = c._weapon_point_w(slide + float(oa2["two"]))
			var oside2: String = "l" if wside == "r" else "r"
			var ih2: int = c.bones[oside2 + "_hand"]["idx"]
			var gh2: Transform3D = sk.get_bone_global_pose(ih2)
			var fd2: Basis = gh2.basis.orthonormalized() * sk.get_bone_global_rest(ih2).basis.orthonormalized().inverse() * c._hand_frame_t(oside2)
			var palm_sgn := -1.0 if oside2 == "l" else 1.0
			var gp: Vector3 = gt * (gh2.origin + fd2 * Vector3(c._grip_x, palm_sgn * c._palm_y, 0.0))
			# a mão de apoio pode deslizar no cabo até onde alcança: mede até a reta do cabo
			var r2: Array = REACH.get(fam, [-0.5, 1.5])
			var a0: Array = c._weapon_point_w(float(r2[0]))
			var a1: Array = c._weapon_point_w(float(r2[1]))
			if not hp.is_empty() and not a0.is_empty():
				var dh := _seg_dist(gp, a0[0], a1[0])
				if dh > 0.05:
					worst["mão de apoio fora do cabo (%.0f cm)" % (dh * 100.0)] = t
		# arma dentro do tronco ou da cabeça
		if c.weapon_mesh and REACH.has(fam) and c.weapon_mesh.visible:
			var r: Array = REACH[fam]
			for i in 9:
				var y := lerpf(float(r[0]), float(r[1]), float(i) / 8.0)
				var wp: Array = c._weapon_point_w(y)
				if wp.is_empty():
					continue
				var q: Vector3 = wp[0]
				if _seg_dist(q, core_a, core_b) < 0.065:
					worst["arma no tronco (y=%.2f)" % y] = t
				if q.distance_to(head) < 0.085:
					worst["arma na cabeça (y=%.2f)" % y] = t
		# pés: sem passo, pulo ou giro, o pé no chão não sai do lugar
		for side in ["l", "r"]:
			var fp: Vector3 = bp.call(side + "_foot")
			if fp.y < 0.03:
				worst["pé %s abaixo do chão (%.2f)" % [side, fp.y]] = t
			if foot_prev.has(side) and not has_step:
				var pv: Vector3 = foot_prev[side]
				var slide := Vector2(fp.x - pv.x, fp.z - pv.z).length()
				if slide > 0.025 and fp.y < 0.14 and pv.y < 0.14:
					worst["pé %s desliza %.0f mm" % [side, slide * 1000.0]] = t
			foot_prev[side] = fp
	for w in worst.keys():
		_warn(name, float(worst[w]), w)
