extends Node3D
## Vitrine de arte: --gallery=pasta salva capturas das 8 classes, dos monstros, de NPCs, dos objetos de
## missão (art.gd quest_object, pelo kind ou pelo prefixo do id) e das peças da prova de classe.

const Art = preload("res://scripts/art.gd")
var out_dir := ""
var cam: Camera3D
var _step := 0
var _until := 0
const CLASSES := [["breaker", "axe_1h"], ["bastion", "hammer_1h"], ["pikeman", "spear_2h"], ["warden", "bow"], ["dawnshield", "sword_1h"], ["windwalker", "javelin"], ["veilsinger", "scepter"], ["emberweaver", "staff_2h"]]
const MONSTERS := [
	{"id": "furrow_rat", "family": "beast", "level": 1, "rank": "normal", "aggro": "passive"},
	{"id": "ember_beetle", "family": "beast", "level": 2, "rank": "normal", "aggro": "passive"},
	{"id": "rust_hound", "family": "beast", "level": 3, "rank": "normal", "aggro": "aggressive"},
	{"id": "ballast_lizard", "family": "beast", "level": 4, "rank": "normal", "aggro": "passive"},
	{"id": "ash_boar", "family": "beast", "level": 5, "rank": "normal", "aggro": "aggressive"},
	{"id": "cracked_foreman", "family": "machine", "level": 4, "rank": "elite", "aggro": "aggressive"},
	{"id": "echoer", "family": "spirit", "level": 14, "rank": "normal", "aggro": "aggressive"},
]

## Um de cada modelo de objeto de missão (o id e o kind decidem o modelo, como nos mapas).
const OBJECTS := [
	{"id": "marker_1", "name": "Marco de rota"}, {"id": "page_heron_1", "name": "Páginas"}, {"id": "fuse_box_1", "name": "Fusíveis"},
	{"id": "order_vault", "name": "Cofre"}, {"id": "gauge_1", "name": "Medidor"}, {"id": "thermo_1", "name": "Medição térmica"},
	{"id": "valve_1", "name": "Válvula"}, {"id": "main_valve", "kind": "defense", "name": "Válvula principal"},
	{"id": "voice_tube_1", "name": "Tubo de voz"}, {"id": "reply_tube", "name": "Tubo de resposta"}, {"id": "old_post", "name": "Máquina do posto"},
	{"id": "deep_seal_1", "name": "Selo"}, {"id": "ilda_cart", "kind": "escort", "name": "Carroça parada"},
	{"id": "board_ambar", "kind": "board", "name": "Quadro de missões"}, {"id": "rescue_bento", "name": "Bento"}, {"id": "rescue_caio", "name": "Caio"},
]
## Peças e aliados da prova de classe.
const TRIAL := [
	{"id": "trial_pillar", "model": "pillar", "family": "machine", "level": 10, "rank": "normal"},
	{"id": "trial_dummy", "model": "dummy", "family": "beast", "level": 10, "rank": "normal"},
	{"id": "trial_target", "model": "target", "family": "beast", "level": 10, "rank": "normal"},
	{"id": "trial_bell", "model": "bell", "family": "machine", "level": 10, "rank": "normal"},
	{"id": "trial_archer", "model": "archer", "family": "machine", "level": 10, "rank": "normal", "aggro": "aggressive"},
	{"id": "trial_runner", "model": "runner", "family": "machine", "level": 10, "rank": "normal", "aggro": "aggressive"},
	{"id": "trial_spark", "family": "spirit", "level": 10, "rank": "normal"},
]

func _tag(text: String, pos: Vector3) -> void:
	var l := Label3D.new()
	l.text = text
	l.font_size = 40
	l.pixel_size = 0.006
	l.outline_size = 8
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.position = pos
	add_child(l)

func start(dir: String) -> void:
	out_dir = dir
	var env := WorldEnvironment.new()
	env.environment = Art.environment("estrada_velha")
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40, -30, 0)
	sun.light_energy = 1.05
	sun.shadow_enabled = true
	add_child(sun)
	Art.publish_sun(sun)
	var g := PlaneMesh.new()
	g.size = Vector2(60, 60)
	Art.part(self, g, Art.ground(Color("#857549"), Color("#677a44")), Vector3.ZERO)
	for i in CLASSES.size():
		var c := Art.character(CLASSES[i][0], CLASSES[i][1])
		c.position = Vector3(-5.25 + i * 1.5, 0, 0)
		add_child(c)
	for i in MONSTERS.size():
		var m := Art.monster(MONSTERS[i])
		m.position = Vector3(-6.0 + i * 2.0, 0, -6)
		add_child(m)
	for i in 4:
		var n := Art.character("", "", true, Color.from_hsv(i * 0.22, 0.35, 0.75), i * 7919)
		n.position = Vector3(-2.25 + i * 1.5, 0, 3)
		add_child(n)
	for i in OBJECTS.size():
		var o: Node3D = Art.quest_object(OBJECTS[i])
		var row := i / 8
		o.position = Vector3(-10.5 + (i % 8) * 3.0, 0, 12.0 + row * 5.0)
		add_child(o)
		_tag(OBJECTS[i]["name"], o.position + Vector3(0, 2.7, 0))
	for i in TRIAL.size():
		var m := Art.monster(TRIAL[i])
		m.position = Vector3(-12.0 + i * 3.0, 0, -14.0)
		add_child(m)
	var ap := Art.trial_ally("apprentice", 11)
	ap.position = Vector3(9.0, 0, -14.0)
	ap.scale = Vector3.ONE * 1.3
	add_child(ap)
	var pg := Art.trial_ally("pilgrim", 23)
	pg.position = Vector3(12.0, 0, -14.0)
	pg.scale = Vector3.ONE * 1.3
	add_child(pg)
	# o próprio personagem com o contorno da classe, ao lado de um igual com o contorno escuro
	var mine := Art.character("emberweaver", "staff_2h")
	mine.position = Vector3(-1.0, 0, 22.0)
	Art.tint_outline(mine, Art.CLASS_OUTLINE["emberweaver"])
	add_child(mine)
	var other := Art.character("emberweaver", "staff_2h")
	other.position = Vector3(1.0, 0, 22.0)
	add_child(other)
	cam = Camera3D.new()
	cam.fov = 40
	add_child(cam)
	cam.current = true
	_shot_pos(0)
	_until = Time.get_ticks_msec() + 800

func _shot_pos(i: int) -> void:
	match i:
		0:
			cam.position = Vector3(0, 2.0, 8.0)
			cam.look_at(Vector3(0, 1.0, 0))
		1:
			cam.position = Vector3(-3.0, 1.7, 3.2)
			cam.look_at(Vector3(-3.0, 1.15, 0))
		2:
			cam.position = Vector3(3.0, 1.7, 3.2)
			cam.look_at(Vector3(3.0, 1.15, 0))
		3:
			cam.position = Vector3(0, 2.2, -1.5)
			cam.look_at(Vector3(0, 0.6, -6))
		4:
			cam.position = Vector3(0, 14, 12)
			cam.look_at(Vector3(0, 0, -1))
		5:
			cam.position = Vector3(-5.25, 1.42, 0.75)
			cam.look_at(Vector3(-5.25, 1.36, 0))
		6:
			cam.position = Vector3(0.75, 1.42, 0.75)
			cam.look_at(Vector3(0.75, 1.36, 0))
		7:
			cam.position = Vector3(0.0, 5.5, 3.0)
			cam.look_at(Vector3(0.0, 0.8, 12.5))
		8:
			cam.position = Vector3(0.0, 5.5, 8.0)
			cam.look_at(Vector3(0.0, 0.8, 17.5))
		9:
			cam.position = Vector3(0.0, 6.0, -4.5)
			cam.look_at(Vector3(0.0, 1.0, -14.0))
		10:
			cam.position = Vector3(0.0, 2.2, 26.0)
			cam.look_at(Vector3(0.0, 1.1, 22.0))

func _process(_d: float) -> void:
	if Time.get_ticks_msec() < _until:
		return
	var names := ["classes", "classes_esq", "classes_dir", "monstros", "visao_de_jogo", "rosto_menino", "rosto_menina", "objetos_missao_1", "objetos_missao_2", "pecas_prova", "contorno_classe"]
	get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out_dir, names[_step]])
	print("[gallery] ", names[_step])
	_step += 1
	if _step >= names.size():
		get_tree().quit(0)
		return
	_shot_pos(_step)
	_until = Time.get_ticks_msec() + 500
