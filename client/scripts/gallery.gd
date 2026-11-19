extends Node3D
## Vitrine de arte: --gallery=pasta salva capturas das 8 classes, dos monstros e de NPCs.

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

func _process(_d: float) -> void:
	if Time.get_ticks_msec() < _until:
		return
	var names := ["classes", "classes_esq", "classes_dir", "monstros", "visao_de_jogo", "rosto_menino", "rosto_menina"]
	get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out_dir, names[_step]])
	print("[gallery] ", names[_step])
	_step += 1
	if _step >= names.size():
		get_tree().quit(0)
		return
	_shot_pos(_step)
	_until = Time.get_ticks_msec() + 500
