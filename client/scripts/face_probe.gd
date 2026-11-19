extends Node3D
## Compara o rosto: modelo original (materiais importados) × personagem VRM do jogo.
## --faceprobe=pasta

const VrmChar := preload("res://scripts/vrm_character.gd")
const Art := preload("res://scripts/art.gd")

func start(dir: String) -> void:
	var env := WorldEnvironment.new()
	env.environment = Art.environment("estrada_velha")
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-40, -30, 0)
	sun.light_energy = 1.0
	sun.shadow_enabled = OS.get_cmdline_user_args().has("--shadow")
	add_child(sun)
	Art.publish_sun(sun)
	for i in 2:
		var model_id: String = ["boy", "girl"][i]
		var raw: Node3D = load(VrmChar.MODELS[model_id]["path"]).instantiate()
		raw.position = Vector3(-0.35 + i * 1.6, 0, 0)
		add_child(raw)
		var c = VrmChar.new()
		c.setup(model_id, {"outfit": Color("#b5562c"), "pants": Color("#3a2a22"), "boots": Color("#4a3428"), "hair": Color("#4a2e22"), "eyes": Color("#c0702a"), "trim": Color("#d9a441")}, "", [], null)
		c.position = Vector3(0.35 + i * 1.6, 0, 0)
		add_child(c)
	var cam := Camera3D.new()
	add_child(cam)
	cam.fov = 30
	cam.position = Vector3(0.8, 1.3, 2.6)
	cam.look_at(Vector3(0.8, 1.25, 0))
	cam.current = true
	await get_tree().create_timer(1.0).timeout
	var img := get_viewport().get_texture().get_image()
	img.save_png(dir + "/rostos.png")
	print("[rosto] salvo")
	get_tree().quit(0)
