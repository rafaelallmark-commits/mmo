extends Node3D
## Calibração (--lightprobe): mede a curva do tonemapping do ambiente do jogo com
## quadrados sem iluminação de albedo conhecido.

const Art := preload("res://scripts/art.gd")

func start() -> void:
	var env := WorldEnvironment.new()
	var e: Environment = Art.environment("estrada_velha")
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color.BLACK
	e.fog_enabled = false
	env.environment = e
	add_child(env)
	var vals := [0.25, 0.5, 0.75, 1.0, 1.25]
	for i in vals.size():
		var q := MeshInstance3D.new()
		var pm := PlaneMesh.new()
		pm.size = Vector2(0.8, 0.8)
		q.mesh = pm
		var s := StandardMaterial3D.new()
		s.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		s.albedo_color = Color(vals[i], vals[i], vals[i]) if vals[i] <= 1.0 else Color(1, 1, 1)
		if vals[i] > 1.0:
			s.emission_enabled = false
		q.material_override = s
		q.position = Vector3(-2.0 + i * 1.0, 0, 0)
		add_child(q)
	var cam := Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = 5.0
	cam.position = Vector3(0, 5, 0)
	cam.rotation_degrees = Vector3(-90, 0, 0)
	add_child(cam)
	cam.current = true
	await get_tree().create_timer(0.6).timeout
	var img := get_viewport().get_texture().get_image()
	var w := img.get_width()
	var h := img.get_height()
	for i in 4:
		var px := int(w * 0.5 + (-2.0 + i * 1.0) / 5.0 * h)
		print("[luz] sem iluminação, albedo %.2f → pixel %.3f" % [vals[i], img.get_pixel(px, h / 2).r])
	get_tree().quit(0)
