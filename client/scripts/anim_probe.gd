extends Node3D
## Sonda dos golpes e das habilidades (moves.gd): --animprobe=pasta congela cada movimento em vários instantes,
## lado a lado (uma fileira de cópias do mesmo personagem, cada uma num instante), e salva uma captura por
## movimento — de perto, em 3/4 (_perto), e na câmera do jogo (_jogo). Os movimentos de cada personagem: as
## variações do ataque básico, o crítico e as seis habilidades da classe (data/skills.json, com as opções que o
## jogo usa). --set=classe ou --set=classe:arma filtra; --only=trecho filtra pelo nome do movimento.
## --check: em vez de capturar, confere os números de cada movimento em 25 instantes — pulso, mão longe do alvo,
## arma, mão ou cotovelo dentro do tronco ou da cabeça, pé plantado que desliza — e imprime o que passar.
## --states (D186): em vez dos golpes, os estados do corpo de cada personagem — empunhadura parado, em guarda,
## andando e correndo; passada e corrida; beber o tônico; a queda, o levantar (do chão e agachado, no posto), o
## desfazer e o formar em brasas. Com --check, confere a passada (pé de apoio que desliza no chão), a arma dentro
## do corpo ou do chão e a mão longe do frasco.
## --monsters (D186): a queda de cada família de monstro ao morrer (bicho, besouro, máquina, espírito).

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
## Estados do corpo (--states): [nome, o que congelar, instantes ou poses]. "loco": [m/s, em guarda] com a fase da
## passada nos instantes; "locos": uma pose por cópia [m/s, fase, em guarda]; "state": vrm_character.debug_state.
const STATE_JOBS := [
	["empunhadura", {"locos": [[0.0, 0.0, false], [0.0, 0.0, true], [1.6, 0.25, false], [1.6, 0.25, true], [5.0, 0.3, false]]}, ["parado", "guarda", "andando", "andando em guarda", "correndo"]],
	["andar", {"loco": [1.6, false]}, [0.0, 0.2, 0.4, 0.6, 0.8]],
	["correr", {"loco": [5.0, false]}, [0.0, 0.2, 0.4, 0.6, 0.8]],
	["guarda_andar", {"loco": [1.6, true]}, [0.0, 0.2, 0.4, 0.6, 0.8]],
	["costas", {"loco": [1.6, true], "dir": Vector2(0.0, -1.0)}, [0.0, 0.2, 0.4, 0.6, 0.8]],
	["de_lado", {"loco": [1.6, true], "dir": Vector2(1.0, 0.0)}, [0.0, 0.2, 0.4, 0.6, 0.8]],
	["beber", {"state": "beber"}, [0.08, 0.22, 0.42, 0.6, 0.88]],
	["beber_mana", {"state": "beber_mana"}, [0.08, 0.22, 0.42, 0.6, 0.88]],
	["queda", {"state": "queda"}, [0.12, 0.28, 0.45, 0.62, 1.0]],
	["caido", {"state": "caido", "u": 1.0, "turns": [0.0, 1.57, 3.14, -1.57]}, ["de frente", "de lado", "de costas", "do outro lado"]],
	["levantar", {"state": "levantar"}, [0.0, 0.2, 0.42, 0.65, 0.88]],
	["levantar_agachado", {"state": "levantar_agachado"}, [0.0, 0.25, 0.5, 0.75, 1.0]],
	["desfazer", {"state": "desfazer"}, [0.1, 0.3, 0.5, 0.7, 0.9]],
	["formar", {"state": "formar"}, [0.1, 0.3, 0.5, 0.7, 0.9]],
]
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
var states := false
var monsters := false
var skills := {}
var monster_defs := {}
## Monstros da sonda --monsters: um de cada jeito de cair (e os bichos de corpo diferente).
const DEATH_SET := ["furrow_rat", "ash_boar", "ballast_lizard", "ember_beetle", "digger_automaton", "echoer"]
const DEATH_FRAMES := [0.05, 0.2, 0.35, 0.5, 0.9]
var cam: Camera3D
var jobs: Array = []   # [nome do arquivo, classe, arma, mão sec., movimento]
var _job := -1
var _phase := 0
var _wait := 0
var chars: Array = []
var labels: Array = []
var issues := 0
var _gap := 1.35
# --states: detalhe de cada cópia (câmera perto de uma por vez, recortes juntos numa imagem só)
var _detail: Image
var _detail_i := 0

func start(dir: String, filter := "", p_only := "", p_check := false, p_states := false, p_monsters := false) -> void:
	out_dir = dir
	set_filter = filter
	only = p_only
	check = p_check
	states = p_states
	monsters = p_monsters
	# sorteios fixos (respiração e apoio de cada cópia): a conferência dá o mesmo resultado a cada rodada
	seed(186)
	skills = _load_skills()
	monster_defs = _load_json("monsters.json").get("monsters", {})
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

func _load_json(file: String) -> Dictionary:
	var f := FileAccess.open(ProjectSettings.globalize_path("res://").path_join("../data/" + file), FileAccess.READ)
	if f == null:
		return {}
	var d = JSON.parse_string(f.get_as_text())
	return d if d is Dictionary else {}

func _build_jobs() -> void:
	if monsters:
		for id in DEATH_SET:
			var md: Dictionary = monster_defs.get(id, {})
			if md.is_empty():
				continue
			_add_job("monstro_%s_%s_queda" % [str(md.get("family", "beast")), id], ["", id, ""], {"monster": id, "frames": DEATH_FRAMES, "name": id})
		return
	for st in SETS:
		var cls: String = st[0]
		var fam: String = st[1]
		var tag := "%s_%s" % [cls, fam]
		if set_filter != "" and not (set_filter == cls or set_filter == "%s:%s" % [cls, fam]):
			continue
		if states:
			for sj in STATE_JOBS:
				var sm: Dictionary = (sj[1] as Dictionary).duplicate()
				sm["frames"] = sj[2]
				sm["name"] = sj[0]
				_add_job("%s_estado_%s" % [tag, sj[0]], st, sm)
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
	var frames: Array = _frames(jb[4])
	var n := 1 if check else frames.size()
	var gap := 2.3 if str((jb[4] as Dictionary).get("state", "")) in ["queda", "levantar", "caido"] else 1.35
	_gap = gap
	for i in n:
		var c: Node3D
		if (jb[4] as Dictionary).has("monster"):
			var md: Dictionary = monster_defs.get(str(jb[4]["monster"]), {}).duplicate()
			md["id"] = str(jb[4]["monster"])
			c = Art.monster(md)
			c.scale = Vector3.ONE * 1.15
		else:
			c = Art.character(jb[1], jb[2], false, Color.WHITE, 0, jb[3])
		c.position = Vector3((i - (n - 1) * 0.5) * gap, 0, 0)
		c.rotation.y = 0.0 if check else TURN
		if (jb[4] as Dictionary).has("turns") and not check:
			c.rotation.y = float(jb[4]["turns"][i])
		add_child(c)
		chars.append(c)
		if not check:
			_label(("t=%.2f" % frames[i]) if not (frames[i] is String) else str(frames[i]), c.position + Vector3(0, 2.05, 0), 30)
	if not check:
		var m: Dictionary = jb[4]
		_label("%s  (%.2f s)" % [str(jb[0]), float(m.get("dur", 0.0))], Vector3(0, 2.4, -1.5), 30)
	_phase = 0
	_wait = 2

## Instantes (ou rótulos) de cada cópia do trabalho.
func _frames(m: Dictionary) -> Array:
	return m.get("frames", FRAMES)

func _pose_all() -> void:
	var jb: Array = jobs[_job]
	var m: Dictionary = jb[4]
	var frames: Array = _frames(m)
	for i in chars.size():
		var c: Node3D = chars[i]
		if m.has("monster") and c.has_method("debug_death"):
			c.debug_death(float(frames[i]))
			continue
		if not c.has_method("debug_pose"):
			continue
		if m.has("locos"):
			var lp: Array = m["locos"][i]
			c.debug_pose(float(lp[0]), float(lp[1]), bool(lp[2]))
		elif m.has("loco"):
			c.move_dir = m.get("dir", Vector2(0.0, 1.0))
			c.debug_pose(float(m["loco"][0]), float(frames[i]), bool(m["loco"][1]))
		elif m.has("state"):
			c.debug_pose(0.0, 0.0, false)
			c.debug_state(str(m["state"]), float(m.get("u", frames[i] if not (frames[i] is String) else 1.0)))
		else:
			c.debug_pose(0.0, 0.0, true)
			c.debug_motion(m, FRAMES[i])

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
			# fileira mais larga (corpo deitado): a câmera de perto recua e olha mais baixo
			var k := _gap / 1.35
			cam.position = Vector3(0.3, 1.75 + 0.6 * (k - 1.0), 6.4 * k)
			cam.look_at(Vector3(0, 1.0 - 0.4 * (k - 1.0), 0))
			_phase = 1
			_wait = 2
		1:
			_save(str(jb[0]) + "_perto")
			# câmera do jogo: alta (0,8 rad), do lado de sempre (−0,6), mais perto que os 18 m para caber a fileira
			var yaw := -0.6
			var pitch := 0.8
			var d := 9.5 * (_gap / 1.35)
			cam.fov = 40
			cam.position = Vector3(0, 1.2, 0) + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * d
			cam.look_at(Vector3(0, 1.0, 0))
			_phase = 2
			_wait = 2
		2:
			_save(str(jb[0]) + "_jogo")
			if not states and not monsters:
				_next_job()
				return
			_detail = Image.create(3 * DW, 2 * DH, false, Image.FORMAT_RGB8)
			_detail.fill(Color(0.15, 0.15, 0.15))
			_detail_i = 0
			_aim_detail()
			_phase = 3
			_wait = 2
		3:
			# recorte do meio da tela com a cópia da vez, no mosaico 3 × 2
			var img := get_viewport().get_texture().get_image()
			img.convert(Image.FORMAT_RGB8)
			var src := Rect2i(img.get_width() / 2 - DW / 2, img.get_height() / 2 - DH / 2, DW, DH)
			_detail.blit_rect(img, src, Vector2i((_detail_i % 3) * DW, (_detail_i / 3) * DH))
			_detail_i += 1
			if _detail_i < chars.size() and _detail_i < 6:
				_aim_detail()
				_wait = 2
				return
			var path := "%s/%s_detalhe.png" % [out_dir, str(jb[0])]
			_detail.save_png(path)
			print("[animprobe] ", path)
			_next_job()

## Recorte de cada cópia no mosaico de detalhe.
const DW := 560
const DH := 440

## Câmera perto da cópia da vez, de 3/4 e um pouco acima, mirando o quadril dela (deitado: de mais alto).
func _aim_detail() -> void:
	var c: Node3D = chars[_detail_i]
	var low: bool = str((jobs[_job][4] as Dictionary).get("state", "")) in ["queda", "levantar", "caido", "levantar_agachado"] or (jobs[_job][4] as Dictionary).has("monster")
	var at := c.position + Vector3(0.0, 1.0 if not low else 0.4, 0.0)
	if c.get("skel") != null and c.bones.has("hips"):
		at = c.skel.global_transform * c.skel.get_bone_global_pose(c.bones["hips"]["idx"]).origin
		at.y = maxf(at.y, 0.3) + (0.0 if low else 0.25)
	cam.fov = 34
	cam.position = at + (Vector3(1.5, 2.0, 3.1) if low else Vector3(1.0, 0.25, 2.5))
	cam.look_at(at)

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
	if (jb[4] as Dictionary).has("loco"):
		_check_loco(str(jb[0]), c, bool(jb[4]["loco"][1]), jb[4].get("dir", Vector2(0.0, 1.0)))
		return
	if (jb[4] as Dictionary).has("state") or (jb[4] as Dictionary).has("locos"):
		_check_state(jb, c)
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

## Passada (--states --check): em cada velocidade (de costas e de lado, só as de andar), calcanhar e ponta do pé, cada
## um enquanto está no chão, não devem andar no mundo enquanto o corpo segue; mede quanto deslizam (positivo: patinam
## na direção do movimento, a passada é curta para a velocidade; negativo: empurram o chão) em relação ao quanto o
## corpo andou com eles no chão. Escala 1,3 (a do jogo).
func _check_loco(name: String, c, combat: bool, dir := Vector2(0.0, 1.0)) -> void:
	c.scale = Vector3.ONE * 1.3
	c.move_dir = dir
	var d3 := Vector3(dir.x, 0.0, dir.y).normalized()
	var toe_key := {}
	for side in ["l", "r"]:
		for nm in ["J_Bip_%s_ToeBase" % side.to_upper(), "toe.%s" % side.to_upper()]:
			var i: int = c._find_bone(nm)
			if i >= 0:
				toe_key[side] = i
	c.debug_pose(0.0, 0.0, false)
	var rest := {}
	for side in ["l", "r"]:
		rest[side] = _foot_pts(c, side, toe_key)
	# de costas e de lado só andando devagar (world.gd: STRAFE_MAX = 2,4 m/s); de frente, até a corrida mais rápida
	var speeds: Array = [0.8, 1.6, 2.6, 3.6, 5.0, 6.2] if dir.y > 0.9 else [0.8, 1.6, 2.3]
	for v in speeds:
		var vm: float = v / 1.3
		c.debug_pose(0.0, 0.0, combat)
		var cycle: float = c.stride_cycle(vm) * c._dir_cycle()
		var n := 96
		var rows := []
		var lo := {}
		for i in n + 1:
			var u := float(i) / float(n)
			c.debug_pose(v, u if not c._back else 1.0 - u, combat)
			var row := {"b": v * u * cycle / vm}
			for side in ["l", "r"]:
				var pts: Array = _foot_pts(c, side, toe_key)
				for k in 2:
					var key: String = side + str(k)
					row[key] = pts[k]
					lo[key] = minf(float(lo.get(key, 1e9)), (pts[k] as Vector3).y)
			rows.append(row)
		var slide := 0.0
		var travel := 0.0
		var contact := 0
		# calcanhar e ponta separados, cada um no chão quando está a menos de 1,5 cm da sua altura mais baixa no
		# ciclo: enquanto está no chão, não pode andar no mundo (trocar o apoio do calcanhar para a ponta é o pé rolando)
		for i in range(1, rows.size()):
			var a: Dictionary = rows[i - 1]
			var b: Dictionary = rows[i]
			for key in lo.keys():
				var pa: Vector3 = a[key]
				var pb: Vector3 = b[key]
				if pa.y < float(lo[key]) + 0.015 and pb.y < float(lo[key]) + 0.015:
					var wa: Vector3 = pa + d3 * float(a["b"])
					var wb: Vector3 = pb + d3 * float(b["b"])
					slide += (wb - wa).dot(d3)
					travel += float(b["b"]) - float(a["b"])
					contact += 1
		var ratio := slide / maxf(travel, 1e-4)
		print("[loco] %s v=%.1f m/s: ciclo %.2f m, apoio %d%% do ciclo, desliza %+.0f%% do que o corpo anda" % [name, v, cycle, int(100.0 * contact / (4.0 * n)), ratio * 100.0])
		# a própria medida varia uns 10% (calcanhar e ponta, rolagem do pé): acima de 20%, o pé patina de verdade
		if absf(ratio) > 0.2:
			_warn(name, v, "pé de apoio desliza %+.0f%% a %.1f m/s" % [ratio * 100.0, v])

## Calcanhar (tornozelo) e ponta do pé no mundo.
func _foot_pts(c, side: String, toe_key: Dictionary) -> Array:
	var sk: Skeleton3D = c.skel
	var ankle: Vector3 = sk.global_transform * sk.get_bone_global_pose(c.bones[side + "_foot"]["idx"]).origin
	var toe := ankle
	if toe_key.has(side):
		toe = sk.global_transform * sk.get_bone_global_pose(int(toe_key[side])).origin
	return [ankle, toe]

## Estados parados (--states --check): arma dentro do tronco, da cabeça ou do chão; na bebida, o gargalo longe da boca.
func _check_state(jb: Array, c) -> void:
	var m: Dictionary = jb[4]
	var name: String = jb[0]
	var fam: String = jb[2]
	var worst := {}
	var poses := []
	if m.has("locos"):
		# andando e correndo, oito fases da passada (a arma balança com o braço)
		for lp in m["locos"]:
			if float(lp[0]) > 0.0:
				for k in 8:
					poses.append(["locos", [lp[0], float(k) / 8.0, lp[2]]])
			else:
				poses.append(["locos", lp])
	else:
		for i in 13:
			poses.append(["state", float(i) / 12.0])
	for ps in poses:
		var tag := ""
		if ps[0] == "locos":
			var lp: Array = ps[1]
			c.debug_pose(float(lp[0]), float(lp[1]), bool(lp[2]))
			tag = "%.1f m/s fase %.2f%s" % [float(lp[0]), float(lp[1]), " em guarda" if lp[2] else ""]
		else:
			c.debug_pose(0.0, 0.0, false)
			c.debug_state(str(m["state"]), float(ps[1]))
			tag = "u=%.2f" % float(ps[1])
		var sk: Skeleton3D = c.skel
		var gt := sk.global_transform
		var bp := func(key: String) -> Vector3:
			return gt * sk.get_bone_global_pose(c.bones[key]["idx"]).origin
		var hips: Vector3 = bp.call("hips")
		var neck: Vector3 = bp.call("neck")
		var head: Vector3 = bp.call("head") + Vector3(0, 0.1, 0)
		var core_a := hips + (neck - hips) * 0.15
		var core_b := neck - (neck - hips) * 0.1
		var lying: bool = float(c._dp) > 1.2
		if c.weapon_mesh and REACH.has(fam) and c.weapon_mesh.visible and not lying:
			var r: Array = REACH[fam]
			for i in 9:
				var y := lerpf(float(r[0]), float(r[1]), float(i) / 8.0)
				var wp: Array = c._weapon_point_w(y)
				if wp.is_empty():
					continue
				var q: Vector3 = wp[0]
				if _seg_dist(q, core_a, core_b) < 0.065:
					worst["arma no tronco (y=%.2f)" % y] = tag
				if q.distance_to(head) < 0.085:
					worst["arma na cabeça (y=%.2f)" % y] = tag
				# andando e correndo, a arma não passa por dentro das pernas (coxa e canela)
				if m.has("locos"):
					for side in ["l", "r"]:
						var hp2: Vector3 = bp.call(side + "_upper_leg")
						var kn2: Vector3 = bp.call(side + "_lower_leg")
						var an2: Vector3 = bp.call(side + "_foot")
						if minf(_seg_dist(q, hp2, kn2), _seg_dist(q, kn2, an2)) < 0.05:
							worst["arma na perna %s (y=%.2f)" % [side, y]] = tag
				# o pé da lança e do cajado encostam no chão de propósito (relaxed "plant"); o resto não entra nele
				if q.y < -0.03 and not (fam in ["spear_2h", "staff_2h"] and y < 0.0):
					worst["arma dentro do chão (y=%.2f, %.2f m)" % [y, q.y]] = tag
		if str(m.get("state", "")).begins_with("beber") and c._flask != null and float(c._drink_weight()) > 0.95:
			# o anexo do osso só se atualiza no quadro seguinte: a ponta do gargalo vem direto da pose da mão
			var holder: Node3D = c._flask.get_parent()
			var hand_i: int = c.bones[c._flask_side + "_hand"]["idx"]
			var neck_tip: Vector3 = gt * sk.get_bone_global_pose(hand_i) * holder.transform * c._flask.transform * Vector3(0, 0.075, 0)
			var mouth: Vector3 = c._root_to_world(c._bone_point("head", c.cfg.get("mouth", Vector3(0.0, 0.008, 0.08))))
			if neck_tip.distance_to(mouth) > 0.06:
				worst["gargalo longe da boca (%.0f cm)" % (neck_tip.distance_to(mouth) * 100.0)] = tag
		for side in ["l", "r"]:
			var fp: Vector3 = bp.call(side + "_foot")
			if fp.y < 0.02 and not lying:
				worst["pé %s abaixo do chão (%.2f)" % [side, fp.y]] = tag
		if lying:
			# deitado: nada do corpo muito abaixo do chão (quadril, peito, cabeça)
			for key in ["hips", "chest", "head"]:
				var bpos: Vector3 = bp.call(key)
				if bpos.y < 0.03:
					worst["%s dentro do chão (%.2f m)" % [key, bpos.y]] = tag
	for w in worst.keys():
		issues += 1
		print("[animcheck] %s %s: %s" % [name, str(worst[w]), w])
