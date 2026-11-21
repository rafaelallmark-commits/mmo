extends Node3D
## Diagnóstico: --vrmprobe=pasta carrega os modelos VRM importados, lista malhas,
## materiais, formas (blend shapes) e ossos, e salva uma captura de frente.

func start(dir: String) -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color("#555566")
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color.WHITE
	e.ambient_light_energy = 0.6
	env.environment = e
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-30, -20, 0)
	add_child(sun)
	var x := -0.6
	for path in ["res://assets/characters/pixiv_sample.glb", "res://assets/characters/seed_san.glb"]:
		var scn = load(path)
		if scn == null:
			print("[probe] FALHOU ao carregar ", path)
			continue
		var inst: Node3D = scn.instantiate()
		inst.position = Vector3(x, 0, 0)
		add_child(inst)
		x += 1.2
		print("[probe] ", path)
		for n in inst.find_children("*", "Skeleton3D", true, false):
			var sk := n as Skeleton3D
			print("[probe]   esqueleto ", sk.name, " ossos=", sk.get_bone_count(), " caminho=", inst.get_path_to(sk))
			var sec := []
			for bi in sk.get_bone_count():
				var bn := sk.get_bone_name(bi)
				if "Tops" in bn or "Sleeve" in bn or "Shoulder" in bn or "sleeve" in bn:
					sec.append("%s<-%s" % [bn, sk.get_bone_name(sk.get_bone_parent(bi))])
			print("[probe]   secundários: ", sec)
		for n in inst.find_children("*", "MeshInstance3D", true, false):
			var mi := n as MeshInstance3D
			var mats := []
			for i in mi.mesh.get_surface_count():
				var m := mi.mesh.surface_get_material(i)
				mats.append("%s(%s)" % [m.resource_name if m else "?", m.get_class() if m else ""])
			print("[probe]   malha ", mi.name, " superfícies=", mats, " blend=", mi.mesh.get_blend_shape_count(), " skin=", mi.skin != null)
			for i in mi.mesh.get_surface_count():
				var sm := mi.mesh.surface_get_material(i) as StandardMaterial3D
				if sm:
					print("[probe]     ", sm.resource_name, " transp=", sm.transparency, " textura=", sm.albedo_texture.resource_path.get_file() if sm.albedo_texture else "NENHUMA", " emissão=", sm.emission_enabled, " tex_emissão=", sm.emission_texture.resource_path.get_file() if sm.emission_texture else "-")
			if mi.mesh.get_blend_shape_count() > 0:
				var names := []
				for i in mini(mi.mesh.get_blend_shape_count(), 14):
					names.append(mi.mesh.get_blend_shape_name(i))
				print("[probe]     formas: ", names)
	var cam := Camera3D.new()
	add_child(cam)
	cam.position = Vector3(0, 1.0, 3.2)
	cam.look_at(Vector3(0, 0.85, 0))
	cam.current = true
	await get_tree().create_timer(1.0).timeout
	get_viewport().get_texture().get_image().save_png(dir + "/vrm_frente.png")
	cam.position = Vector3(2.8, 1.2, -1.6)
	cam.look_at(Vector3(0, 0.85, 0))
	await get_tree().create_timer(0.4).timeout
	get_viewport().get_texture().get_image().save_png(dir + "/vrm_lado.png")
	print("[probe] OK")
	get_tree().quit(0)
