extends Node3D
## Vitrine de arte: --gallery=pasta salva capturas das 8 classes, dos monstros, de NPCs, dos objetos de
## missão (art.gd quest_object, pelo kind ou pelo prefixo do id), das peças e dos aliados da prova de classe
## e do contorno na cor da classe.

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

## Um de cada modelo de objeto de missão (o id e o kind decidem o modelo, como nos mapas), em duas fileiras.
const OBJECTS := [
	[{"id": "marker_1", "name": "Marco de rota"}, {"id": "page_heron_1", "name": "Páginas"}, {"id": "fuse_box_1", "name": "Fusíveis"},
	{"id": "order_vault", "name": "Cofre"}, {"id": "gauge_1", "name": "Medidor"}, {"id": "thermo_1", "name": "Medição térmica"},
	{"id": "valve_1", "name": "Válvula"}, {"id": "main_valve", "kind": "defense", "name": "Válvula principal"}],
	[{"id": "voice_tube_1", "name": "Tubo de voz"}, {"id": "reply_tube", "name": "Tubo de resposta"}, {"id": "old_post", "name": "Máquina do posto"},
	{"id": "deep_seal_1", "name": "Selo"}, {"id": "ilda_cart", "kind": "escort", "name": "Carroça parada"},
	{"id": "board_ambar", "kind": "board", "name": "Quadro de missões"}, {"id": "rescue_bento", "name": "Bento"}, {"id": "outro_qualquer", "name": "Sem modelo (cubo)"}],
]
## Peças da prova de classe (o pilar e o sino nos dois estados) e os monstros/aliados com aparência própria.
const PIECES := [
	{"id": "trial_pillar", "model": "pillar", "family": "machine", "level": 10, "rank": "normal", "_name": "Pilar blindado"},
	{"id": "trial_pillar", "model": "pillar", "family": "machine", "level": 10, "rank": "normal", "_name": "Pilar rachado", "_cracked": true},
	{"id": "trial_dummy", "model": "dummy", "family": "beast", "level": 10, "rank": "normal", "_name": "Boneco"},
	{"id": "trial_target", "model": "target", "family": "beast", "level": 10, "rank": "normal", "_name": "Alvo móvel", "_yaw": 90.0},
	{"id": "trial_bell", "model": "bell", "family": "machine", "level": 10, "rank": "normal", "_name": "Sino aceso"},
	{"id": "trial_bell", "model": "bell", "family": "machine", "level": 10, "rank": "normal", "_name": "Sino apagado", "_idle": true},
]
const FIGHTERS := [
	{"id": "trial_archer", "model": "archer", "family": "machine", "level": 10, "rank": "normal", "aggro": "aggressive", "_name": "Atirador"},
	{"id": "trial_runner", "model": "runner", "family": "machine", "level": 10, "rank": "normal", "aggro": "aggressive", "_name": "Perseguidor"},
	{"id": "trial_spark", "family": "spirit", "level": 10, "rank": "normal", "_name": "Fagulha"},
	{"id": "trial_construct", "family": "machine", "level": 10, "rank": "normal", "aggro": "aggressive", "_name": "Construto"},
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
	g.size = Vector2(130, 130)
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
	# objetos de missão: fileiras em z = 14 e z = 32, de frente (+z do modelo) para a câmera que olha de z menor
	for r in OBJECTS.size():
		var row: Array = OBJECTS[r]
		for i in row.size():
			var o: Node3D = Art.quest_object(row[i])
			o.position = Vector3(9.1 - i * 2.6, 0, 14.0 + r * 18.0)
			o.rotation.y = PI
			add_child(o)
			_tag(row[i]["name"], o.position + Vector3(0, 0.25, -1.3))
	# peças da prova em z = −20 e os que lutam em z = −34, de frente para a câmera que olha de z maior
	for i in PIECES.size():
		var d: Dictionary = PIECES[i]
		var m := Art.monster(d)
		m.position = Vector3(-6.5 + i * 2.6, 0, -20.0)
		m.rotation.y = deg_to_rad(float(d.get("_yaw", 0.0)))
		if d.get("_cracked", false):
			(m.get_meta("armor") as Node3D).visible = false
			(m.get_meta("cracks") as Node3D).visible = true
		if d.get("_idle", false):
			(m.get_meta("glow") as Node3D).visible = false
		add_child(m)
		_tag(str(d["_name"]), m.position + Vector3(0, 0.25, 1.4))
	for i in FIGHTERS.size():
		var m := Art.monster(FIGHTERS[i])
		m.position = Vector3(-6.5 + i * 2.6, 0, -34.0)
		m.scale = Vector3.ONE * 1.15
		add_child(m)
		_tag(str(FIGHTERS[i]["_name"]), m.position + Vector3(0, 0.25, 1.4))
	var allies := [["apprentice", "Aprendiz Lia", true], ["apprentice", "Aprendiz Brás", false], ["pilgrim", "Peregrino Odilon", false]]
	for i in allies.size():
		var a := Art.trial_ally(allies[i][0], hash(allies[i][1]), allies[i][2])
		a.position = Vector3(3.9 + i * 1.6, 0, -34.0)
		a.scale = Vector3.ONE * 1.3
		add_child(a)
		_tag(allies[i][1], a.position + Vector3(0, 0.25, 1.4))
	# o próprio personagem com o contorno da classe, ao lado de um igual com o contorno escuro
	var mine := Art.character("emberweaver", "staff_2h")
	mine.position = Vector3(-1.0, 0, 46.0)
	Art.tint_outline(mine, Art.CLASS_OUTLINE["emberweaver"])
	add_child(mine)
	var other := Art.character("emberweaver", "staff_2h")
	other.position = Vector3(1.0, 0, 46.0)
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
			cam.position = Vector3(0.0, 6.0, -1.5)
			cam.look_at(Vector3(0.0, 0.8, 14.0))
		8:
			cam.position = Vector3(0.0, 6.0, 16.5)
			cam.look_at(Vector3(0.0, 0.8, 32.0))
		9:
			cam.position = Vector3(0.0, 4.8, -8.0)
			cam.look_at(Vector3(0.0, 1.2, -20.0))
		10:
			cam.position = Vector3(0.0, 4.8, -22.0)
			cam.look_at(Vector3(0.0, 1.2, -34.0))
		11:
			cam.position = Vector3(0.0, 2.2, 50.0)
			cam.look_at(Vector3(0.0, 1.1, 46.0))
		12:
			# o contorno de longe, na distância da câmera do jogo
			cam.position = Vector3(0.0, 11.0, 60.0)
			cam.look_at(Vector3(0.0, 1.0, 46.0))

func _process(_d: float) -> void:
	if Time.get_ticks_msec() < _until:
		return
	var names := ["classes", "classes_esq", "classes_dir", "monstros", "visao_de_jogo", "rosto_menino", "rosto_menina", "objetos_missao_1", "objetos_missao_2", "pecas_prova", "prova_lutadores_aliados", "contorno_classe", "contorno_classe_longe"]
	get_viewport().get_texture().get_image().save_png("%s/%s.png" % [out_dir, names[_step]])
	print("[gallery] ", names[_step])
	_step += 1
	if _step >= names.size():
		get_tree().quit(0)
		return
	_shot_pos(_step)
	_until = Time.get_ticks_msec() + 500
