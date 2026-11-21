extends Node3D
## Cena 3D atrás das telas de menu: a ponte da abertura ao amanhecer, com um personagem
## em destaque (prévia da seleção e da criação). A câmera muda conforme a tela.

const Art = preload("res://scripts/art.gd")

var camera: Camera3D
var preview: Node3D
var view := "title"
var _t := 0.0
const VIEWS := {
	"title": [Vector3(9, 4.5, 13), Vector3(0, 1.6, -4)],
	"login": [Vector3(-7, 3.5, 9), Vector3(1, 1.4, 0)],
	"chars": [Vector3(-0.35, 1.3, 4.1), Vector3(-0.85, 0.95, 0)],
	"create": [Vector3(-0.35, 1.3, 4.1), Vector3(-0.85, 0.95, 0)],
}

func _ready() -> void:
	var env := WorldEnvironment.new()
	env.environment = Art.environment("estrada_velha")
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-35, -60, 0)
	sun.light_color = Color("#ffd9b0")
	sun.light_energy = 1.05
	sun.shadow_enabled = true
	add_child(sun)
	Art.publish_sun(sun)
	var ground := PlaneMesh.new()
	ground.size = Vector2(120, 120)
	Art.part(self, ground, Art.ground(Color("#857549"), Color("#677a44")), Vector3.ZERO)
	# rio e ponte de pedra
	var river := PlaneMesh.new()
	river.size = Vector2(120, 10)
	Art.part(self, river, Art.water(), Vector3(0, 0.03, -8))
	Art.part(self, Art.box(Vector3(4.5, 0.6, 14)), Art.toon(Color("#9a8e80")), Vector3(-6, 0.3, -8))
	for z in [-14.0, -2.0]:
		for x in [-8.1, -3.9]:
			Art.part(self, Art.cyl(0.25, 0.3, 1.6, 8), Art.toon(Color("#7a6e64")), Vector3(x, 0.8, z))
	# sulco vermelho entre as pedras (a abertura)
	Art.part(self, Art.box(Vector3(0.25, 0.05, 6)), Art.toon(Color("#ff4a2a"), false, Color(1.0, 0.25, 0.1)), Vector3(-6, 0.62, -9))
	# carroça e caixas
	Art.part(self, Art.box(Vector3(1.8, 0.8, 2.6)), Art.toon(Color("#8a5a32")), Vector3(-6, 1.1, -3.5))
	for i in 3:
		Art.part(self, Art.box(Vector3(0.6, 0.6, 0.6)), Art.toon(Color("#b58a52")), Vector3(-4.2 + i * 0.3, 0.3 + (0.6 if i == 2 else 0.0), -1.5 - i * 0.4))
	var lan := Art.lantern()
	lan.position = Vector3(-3, 0, 1)
	add_child(lan)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	for i in 40:
		var p := Vector3(rng.randf_range(-30, 30), 0, rng.randf_range(-30, 25))
		if absf(p.z + 8) < 7 or (absf(p.x) < 5 and absf(p.z) < 5):
			continue
		var prop: Node3D = Art.tree(rng, [Color("#6f8c3a"), Color("#a8743a"), Color("#8a9a3e")]) if rng.randf() < 0.55 else Art.rock(rng)
		prop.position = p
		add_child(prop)
	camera = Camera3D.new()
	camera.fov = 40
	add_child(camera)
	camera.current = true
	set_view("title")

func set_view(v: String) -> void:
	view = v
	if preview:
		preview.visible = v in ["chars", "create"]

## Tira o personagem da prévia (conta sem personagens, depois de excluir o último).
func clear_character() -> void:
	if preview:
		preview.queue_free()
		preview = null

## Mostra (ou troca) o personagem da prévia.
func show_character(class_id: String, weapon_family: String) -> void:
	if preview:
		preview.queue_free()
	preview = Art.character(class_id, weapon_family)
	preview.position = Vector3.ZERO
	add_child(preview)
	preview.visible = view in ["chars", "create"]

func _process(delta: float) -> void:
	_t += delta
	var target: Array = VIEWS.get(view, VIEWS["title"])
	var pos: Vector3 = target[0]
	if view == "title":
		pos = Vector3(cos(_t * 0.05) * 14.0, 4.5, sin(_t * 0.05) * 14.0 + 2.0)
	camera.position = camera.position.lerp(pos, clampf(delta * 5.0, 0.0, 1.0))
	camera.look_at(target[1], Vector3.UP)
	if preview:
		preview.rotation.y = sin(_t * 0.4) * 0.6
