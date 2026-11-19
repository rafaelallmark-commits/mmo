extends Node3D
## Diagnóstico de animação: --poseprobe=pasta congela as classes (com as armas do kit e algumas
## variantes) em cada estado — parado, guarda, passada, corrida e golpe — e salva capturas de
## frente (3/4) e de lado. Usado para revisar empunhadura, postura e marcha.

const Art = preload("res://scripts/art.gd")
const Scenery = preload("res://scripts/scenery.gd")

const GROUPS := [
	[["breaker", "axe_1h"], ["bastion", "hammer_1h"], ["pikeman", "spear_2h"], ["warden", "bow"]],
	[["dawnshield", "sword_1h"], ["windwalker", "javelin"], ["veilsinger", "scepter"], ["emberweaver", "wand"]],
	[["breaker", "axe_2h"], ["dawnshield", "sword_2h"], ["emberweaver", "staff_2h"], ["bastion", "claw"]],
	[["npc", "0"], ["npc", "1"], ["npc", "2"], ["npc", "3"]],
]
# [nome, velocidade m/s, fase 0..1, combate, golpe 0..1 (−1 = não), vista lateral]
const STATES := [
	["parado", 0.0, 0.0, false, -1.0, false],
	["parado_lado", 0.0, 0.0, false, -1.0, true],
	["guarda", 0.0, 0.0, true, -1.0, false],
	["guarda_lado", 0.0, 0.0, true, -1.0, true],
	["andar_a", 1.6, 0.0, false, -1.0, true],
	["andar_b", 1.6, 0.25, false, -1.0, true],
	["correr_a", 5.0, 0.0, false, -1.0, true],
	["correr_b", 5.0, 0.3, false, -1.0, true],
	["golpe_preparo", 0.0, 0.0, true, 0.33, false],
	["golpe_tensao_lado", 0.0, 0.0, true, 0.37, true],
	["golpe_impacto", 0.0, 0.0, true, 0.5, false],
	["golpe_impacto_lado", 0.0, 0.0, true, 0.5, true],
]

var out_dir := ""
var cam: Camera3D
var chars := []
var _g := 0
var _s := 0
var _wait := 0
var only := ""

func start(dir: String, filter := "") -> void:
	out_dir = dir
	only = filter
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
	g.size = Vector2(40, 40)
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color("#8a9a6a")
	var gi := MeshInstance3D.new()
	gi.mesh = g
	gi.material_override = gm
	add_child(gi)
	# linhas de 0,5 m no chão para medir passos e apoio
	for k in range(-8, 9):
		var l := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(16, 0.005, 0.015)
		l.mesh = bm
		var lm := StandardMaterial3D.new()
		lm.albedo_color = Color("#6a7a4a")
		l.material_override = lm
		l.position = Vector3(0, 0.003, k * 0.5)
		add_child(l)
	cam = Camera3D.new()
	cam.fov = 34
	add_child(cam)
	cam.current = true
	_build_group(0)
	_wait = 3

func _build_group(i: int) -> void:
	for c in chars:
		c.queue_free()
	chars.clear()
	var grp: Array = GROUPS[i]
	for k in grp.size():
		var cls: String = grp[k][0]
		var fam: String = grp[k][1]
		var c: Node3D
		if cls == "npc":
			c = Art.character("", "", true, Color.from_hsv(0.08 + k * 0.2, 0.35, 0.75), 0)
			c.set("npc_variant", int(fam) % 3)
		else:
			c = Art.character(cls, fam)
		c.scale = Vector3.ONE * 1.3
		c.position = Vector3(-2.4 + k * 1.6, 0, 0)
		add_child(c)
		chars.append(c)

func _apply_state(st: Array) -> void:
	for c in chars:
		c.rotation.y = PI / 2.0 if st[5] else 0.0
		if c.has_method("debug_pose"):
			c.debug_pose(float(st[1]), float(st[2]), bool(st[3]), float(st[4]))
	if st[5]:
		cam.position = Vector3(0.0, 1.5, 7.4)
		cam.look_at(Vector3(0.0, 1.05, 0.0))
	else:
		cam.position = Vector3(2.2, 2.0, 6.6)
		cam.look_at(Vector3(0.0, 1.0, 0.0))

func _process(_d: float) -> void:
	if _wait > 0:
		_wait -= 1
		if _wait == 1:
			var st: Array = STATES[_s]
			_apply_state(st)
		return
	var st: Array = STATES[_s]
	if only == "" or only in st[0]:
		var path := "%s/g%d_%s.png" % [out_dir, _g + 1, st[0]]
		get_viewport().get_texture().get_image().save_png(path)
		print("[poseprobe] ", path)
	_s += 1
	if _s >= STATES.size():
		_s = 0
		_g += 1
		if _g >= GROUPS.size():
			print("[poseprobe] OK")
			get_tree().quit(0)
			return
		_build_group(_g)
		_wait = 4
		return
	_wait = 3
