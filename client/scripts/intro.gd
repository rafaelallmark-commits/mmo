extends Node3D
## Abertura de ~40 s (docs/02-campanha.md, "Abertura"): a caravana na ponte antes do amanhecer, o
## primeiro toque do sino, o sulco vermelho, a margem que cede e Mara entregando o mapa. Cena em tempo
## real com câmera própria e legendas, sem interface; toca uma vez por personagem novo e pode ser pulada
## (Esc, Espaço, Enter ou o botão). Ao terminar, emite `finished` e o jogo segue no Posto da Ponte.

signal finished

const Art = preload("res://scripts/art.gd")
const DURATION := 40.0

var camera: Camera3D
var _t := 0.0
var _done := false
var _layer: CanvasLayer
var _subtitle: Label
var _fade: ColorRect
var _groove: Node3D
var _steam: CPUParticles3D
var _glow: OmniLight3D
var _env: Environment
var _bank: Array[Node3D] = []
var _people: Array = []        # [nó, posição inicial, posição final]
var _mara: Node3D
var _condutor: Node3D
var _hero: Node3D
var _map_prop: Node3D
var _cues_fired := {}
var shots_dir := ""            # conferência: grava capturas nestes instantes (--abertura=pasta)
const SHOT_TIMES := [3.0, 9.0, 13.0, 20.0, 27.0, 34.0, 39.0]

# legendas (início, fim, texto) — as falas do roteiro
const LINES := [
	[11.0, 16.0, "CONDUTOR: \"Deixa as caixas. Conta as pessoas.\""],
	[17.0, 23.5, "MARA: \"Três ficaram do outro lado. Eu volto pela margem.\""],
	[25.0, 29.5, "CONDUTOR: \"A margem já cedeu.\""],
	[31.0, 39.0, "MARA: \"Então vai pela estrada velha. Se ouvir o segundo toque, sai da ponte.\""],
]

# câmera: (tempo, posição, alvo) — elevada, mais baixa que a de jogo; desce às pedras e sobe no fim
const SHOTS := [
	[0.0, Vector3(10, 6.5, 10), Vector3(-6, 0.8, -7)],
	[6.0, Vector3(4, 3.5, 2), Vector3(-6, 0.8, -8)],
	[10.0, Vector3(-1.2, 2.4, -6.0), Vector3(-6, 0.8, -8.8)],
	[16.0, Vector3(2.5, 3.0, 3.5), Vector3(-4.5, 1.0, -4)],
	[24.0, Vector3(-1.5, 4.0, -3.0), Vector3(-8, 0.0, -15)],
	[30.0, Vector3(1.5, 2.2, 5.0), Vector3(-1.2, 1.3, 1.0)],
	[36.0, Vector3(0.5, 8.0, 11.0), Vector3(-1, 0.8, 0)],
	[40.0, Vector3(0.5, 10.0, 12.5), Vector3(-1, 0.8, 0)],
]

## class_id/weapon_family: o personagem do jogador, de pé no meio da caravana.
func setup(class_id: String, weapon_family: String) -> void:
	_hero = Art.character(class_id, weapon_family)
	_hero.position = Vector3(0, 0, 1.5)
	_hero.rotation.y = PI
	add_child(_hero)

func _ready() -> void:
	# antes do amanhecer: céu azul-escuro com o horizonte clareando, neblina azulada e sol baixo e frio
	var env := WorldEnvironment.new()
	var e: Environment = Art.environment("estrada_velha")
	var sky_mat := e.sky.sky_material as ShaderMaterial if e.sky else null
	if sky_mat:
		sky_mat.set_shader_parameter("top_color", Color("#141b33"))
		sky_mat.set_shader_parameter("horizon_color", Color("#6f6f9a"))
		sky_mat.set_shader_parameter("ground_color", Color("#1d2433"))
		sky_mat.set_shader_parameter("cloud_lit", Color("#b9a9c9"))
		sky_mat.set_shader_parameter("cloud_shade", Color("#3a4260"))
	e.ambient_light_color = Color("#7a88b8")
	e.ambient_light_energy = 0.45
	e.fog_enabled = true
	e.fog_light_color = Color("#6f80a6")
	e.fog_density = 0.022
	env.environment = e
	_env = e  # vai na câmera (camera.environment), que vence o ambiente do mundo escondido atrás
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-16, -75, 0)
	sun.light_color = Color("#a9b8e0")
	sun.light_energy = 0.6
	sun.shadow_enabled = true
	add_child(sun)
	Art.publish_sun(sun, Color(0.16, 0.18, 0.26))
	# margens (sem chão sob o rio, para a água aparecer) e o rio
	for bank in [[Vector3(0, 0, 26), Vector2(120, 58)], [Vector3(0, 0, -42), Vector2(120, 58)]]:
		var g := PlaneMesh.new()
		g.size = bank[1]
		# o chão do jogo não escurece com a luz da cena: as cores já vêm de antes do amanhecer
		Art.part(self, g, Art.ground(Color("#38423c"), Color("#2e3a33")), bank[0])
	# rio opaco e escuro (a água transparente mostraria o "chão" do céu por baixo)
	var river := PlaneMesh.new()
	river.size = Vector2(120, 12)
	var rmat := StandardMaterial3D.new()
	rmat.albedo_color = Color("#22324a")
	rmat.metallic_specular = 0.8
	rmat.roughness = 0.25
	Art.part(self, river, rmat, Vector3(0, -0.35, -8))
	# ponte de pedra: tabuleiro acima da água, pilares no rio e parapeitos
	Art.part(self, Art.box(Vector3(4.6, 0.5, 16)), Art.toon(Color("#8a8076")), Vector3(-6, 0.55, -8))
	for z in [-11.0, -5.0]:
		Art.part(self, Art.box(Vector3(3.8, 1.6, 1.2)), Art.toon(Color("#6e645b")), Vector3(-6, -0.4, z))
	for z in [-15.5, -0.5]:
		for x in [-8.1, -3.9]:
			Art.part(self, Art.cyl(0.25, 0.3, 1.4, 8), Art.toon(Color("#6e645b")), Vector3(x, 1.4, z))
	for x in [-8.15, -3.85]:
		Art.part(self, Art.box(Vector3(0.25, 0.45, 16)), Art.toon(Color("#7a7068")), Vector3(x, 1.0, -8))
	# sulco vermelho: começa fechado e se abre entre as pedras, brilhando como brasa
	_groove = Node3D.new()
	_groove.position = Vector3(-6, 0.81, -8.5)
	add_child(_groove)
	var ember := StandardMaterial3D.new()
	ember.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ember.albedo_color = Color(1.0, 0.32, 0.12)
	Art.part(_groove, Art.box(Vector3(0.22, 0.04, 7)), ember, Vector3.ZERO)
	_groove.scale = Vector3(1, 1, 0.01)
	_glow = OmniLight3D.new()
	_glow.light_color = Color(1.0, 0.35, 0.15)
	_glow.light_energy = 0.0
	_glow.omni_range = 7.0
	_glow.position = Vector3(-6, 1.2, -8.5)
	add_child(_glow)
	_steam = CPUParticles3D.new()
	_steam.position = Vector3(-6, 0.85, -8.5)
	_steam.amount = 40
	_steam.lifetime = 2.2
	_steam.emitting = false
	_steam.direction = Vector3.UP
	_steam.spread = 18.0
	_steam.initial_velocity_min = 0.5
	_steam.initial_velocity_max = 1.1
	_steam.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	_steam.emission_box_extents = Vector3(0.2, 0.05, 3.4)
	_steam.scale_amount_min = 0.6
	_steam.scale_amount_max = 1.4
	var puff := SphereMesh.new()
	puff.radius = 0.25
	puff.height = 0.5
	_steam.mesh = puff
	var sm := StandardMaterial3D.new()
	sm.albedo_color = Color(0.92, 0.9, 0.88, 0.35)
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	puff.material = sm
	add_child(_steam)
	# a margem do outro lado (cai no rio aos 24 s)
	for i in 6:
		var chunk := Node3D.new()
		chunk.position = Vector3(-14.0 + i * 3.2, 0.0, -14.6)
		Art.part(chunk, Art.box(Vector3(3.0, 0.9, 2.4)), Art.toon(Color("#6b6247")), Vector3.ZERO)
		if i % 2 == 0:
			Art.part(chunk, Art.box(Vector3(0.6, 0.6, 0.6)), Art.toon(Color("#b58a52")), Vector3(0.3, 0.65, 0.2))
		add_child(chunk)
		_bank.append(chunk)
	# carroças, caixas e lanternas da caravana
	for c in [[Vector3(-6, 0.8, -13.0), 0.0], [Vector3(-2.5, 0, 4.5), 0.4]]:
		var cart: Node3D = Art.cart()
		cart.position = c[0]
		cart.rotation.y = c[1]
		add_child(cart)
	for i in 4:
		Art.part(self, Art.box(Vector3(0.6, 0.6, 0.6)), Art.toon(Color("#b58a52")), Vector3(-0.6 + i * 0.7, 0.3 + (0.6 if i == 2 else 0.0), 2.4 + i * 0.3))
	for lp in [Vector3(-3, 0, 1), Vector3(-7.9, 0.8, -2.2), Vector3(-4.1, 0.8, -13.6)]:
		var lan := Art.lantern()
		lan.position = lp
		add_child(lan)
	# pessoas da caravana: atravessam de volta para o lado do posto entre 16 e 24 s
	var rng := RandomNumberGenerator.new()
	rng.seed = 11
	var colors := [Color("#a8743a"), Color("#6f8c9a"), Color("#8a5a6a"), Color("#7a8a4a"), Color("#9a6a3a")]
	for i in 5:
		var p: Node3D = Art.character("", "", true, colors[i], 100 + i)
		var from := Vector3(-6.0 + rng.randf_range(-1.2, 1.2), 0.8, -5.0 - i * 1.4)
		var to := Vector3(-1.5 + i * 1.4, 0, 4.5 + rng.randf_range(-0.6, 0.6))
		p.position = from
		p.rotation.y = 0.0
		add_child(p)
		_people.append([p, from, to])
	_condutor = Art.character("", "", true, Color("#7a5a3a"), 7)
	_condutor.position = Vector3(-3.0, 0, 1.2)
	_condutor.rotation.y = -2.4
	add_child(_condutor)
	_mara = Art.character("", "", true, Color("#4f6f8f"), 3)
	_mara.position = Vector3(-4.8, 0.8, -3.2)
	add_child(_mara)
	# o mapa dobrado que Mara entrega
	_map_prop = Node3D.new()
	Art.part(_map_prop, Art.box(Vector3(0.28, 0.04, 0.2)), Art.toon(Color("#d9c9a0")), Vector3.ZERO)
	_map_prop.visible = false
	add_child(_map_prop)
	for i in 30:
		var pp := Vector3(rng.randf_range(-30, 30), 0, rng.randf_range(-30, 25))
		if absf(pp.z + 8) < 7 or (absf(pp.x) < 6 and absf(pp.z) < 7):
			continue
		var prop: Node3D = Art.tree(rng, [Color("#4f6a34"), Color("#7a5a32"), Color("#5f7036")]) if rng.randf() < 0.6 else Art.rock(rng)
		prop.position = pp
		add_child(prop)
	camera = Camera3D.new()
	camera.fov = 42
	camera.environment = _env
	add_child(camera)
	camera.current = true
	_place_camera(0.0)
	_build_overlay()

func _build_overlay() -> void:
	_layer = CanvasLayer.new()
	_layer.layer = 50
	add_child(_layer)
	_subtitle = Label.new()
	_subtitle.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_subtitle.position = Vector2(-460, -120)
	_subtitle.size = Vector2(920, 60)
	_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_subtitle.autowrap_mode = TextServer.AUTOWRAP_WORD
	_subtitle.add_theme_font_size_override("font_size", 20)
	_subtitle.add_theme_color_override("font_color", Color("#f1e6cf"))
	_subtitle.add_theme_color_override("font_outline_color", Color("#120c0a"))
	_subtitle.add_theme_constant_override("outline_size", 8)
	_layer.add_child(_subtitle)
	var skip := Button.new()
	skip.text = "Pular (Esc)"
	skip.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	skip.position = Vector2(-150, -56)
	skip.size = Vector2(130, 36)
	skip.focus_mode = Control.FOCUS_NONE
	skip.pressed.connect(finish)
	_layer.add_child(skip)
	_fade = ColorRect.new()
	_fade.color = Color(0, 0, 0, 1)
	_fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_layer.add_child(_fade)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode in [KEY_ESCAPE, KEY_SPACE, KEY_ENTER, KEY_KP_ENTER]:
			get_viewport().set_input_as_handled()
			finish()

func finish() -> void:
	if _done:
		return
	_done = true
	finished.emit()

func _cue(name: String, at: float, fn: Callable) -> void:
	if _t >= at and not _cues_fired.has(name):
		_cues_fired[name] = true
		fn.call()

func _process(delta: float) -> void:
	if _done:
		return
	_t += delta
	# entra do preto e volta ao preto no último segundo
	_fade.color.a = clampf(1.0 - _t / 1.5, 0.0, 1.0) if _t < 2.0 else clampf((_t - (DURATION - 1.0)) / 1.0, 0.0, 1.0)
	_place_camera(_t)
	# legenda corrente
	var line := ""
	for l in LINES:
		if _t >= l[0] and _t < l[1]:
			line = l[2]
	_subtitle.text = line
	# primeiro toque (grave, de baixo): os animais param
	_cue("toque", 7.0, func(): Sfx.play("bell_warn_1", null, 2.0, 0.75))
	# o sulco se abre e solta vapor
	if _t >= 10.0:
		var k := clampf((_t - 10.0) / 4.0, 0.0, 1.0)
		_groove.scale = Vector3(1.0 + k * 0.6, 1.0, maxf(0.01, k))
		_glow.light_energy = k * (2.2 + sin(_t * 9.0) * 0.3)
		_steam.emitting = true
	# a caravana recua para o lado do posto
	if _t >= 16.0:
		var w := clampf((_t - 16.0) / 7.0, 0.0, 1.0)
		for p in _people:
			var node: Node3D = p[0]
			var prev := node.position
			node.position = (p[1] as Vector3).lerp(p[2], smoothstep(0.0, 1.0, w))
			if w < 1.0:
				node.look_at(Vector3(p[2].x, node.position.y, p[2].z) + Vector3(0, 0, 0.001), Vector3.UP)
				node.rotate_y(PI)
			_set_speed(node, prev.distance_to(node.position) / maxf(delta, 0.001) if w < 1.0 else 0.0)
	# Mara olha para trás (para a outra margem)
	if _t >= 18.0 and _t < 30.0:
		_mara.rotation.y = lerp_angle(_mara.rotation.y, 0.0, clampf(delta * 2.0, 0.0, 1.0))
	# a margem desmorona no rio
	_cue("margem", 24.0, func(): Sfx.play("gate_rumble", null, 3.0, 0.8))
	if _t >= 24.0:
		var f := clampf((_t - 24.0) / 4.0, 0.0, 1.0)
		for i in _bank.size():
			var c: Node3D = _bank[i]
			var d := clampf(f * 1.4 - i * 0.07, 0.0, 1.0)
			c.position.y = 0.0 - d * 2.4
			c.position.z = -14.6 + d * 1.8
			c.rotation.x = d * 0.9 * (1.0 if i % 2 == 0 else -1.0)
	# Mara vem até o jogador e entrega o mapa
	if _t >= 30.0:
		var m := clampf((_t - 30.0) / 3.0, 0.0, 1.0)
		var prev2 := _mara.position
		_mara.position = Vector3(-4.8, 0.8, -3.2).lerp(Vector3(-0.6, 0, 0.6), smoothstep(0.0, 1.0, m))
		_mara.look_at(_hero.position + Vector3(0, 0, 0.001) if _hero else Vector3(0, 0, 1.5), Vector3.UP)
		_mara.rotate_y(PI)
		_set_speed(_mara, prev2.distance_to(_mara.position) / maxf(delta, 0.001) if m < 1.0 else 0.0)
		if m >= 1.0:
			_map_prop.visible = true
			var h := clampf((_t - 33.5) / 1.5, 0.0, 1.0)
			_map_prop.position = Vector3(-0.45, 1.15, 0.85).lerp(Vector3(-0.05, 1.1, 1.3), h)
	_cue("longe", 36.0, func(): Sfx.play("bell_warn_1", null, -10.0, 0.7))
	if shots_dir != "":
		for st in SHOT_TIMES:
			_cue("shot%d" % int(st), st, func():
				var img := get_viewport().get_texture().get_image()
				DirAccess.make_dir_recursive_absolute(shots_dir)
				img.save_png("%s/abertura-%02d.png" % [shots_dir, int(st)]))
	if _t >= DURATION:
		finish()

func _set_speed(node: Node3D, v: float) -> void:
	if "speed" in node:
		node.speed = v

func _place_camera(t: float) -> void:
	var a = SHOTS[0]
	var b = SHOTS[SHOTS.size() - 1]
	for i in SHOTS.size() - 1:
		if t >= SHOTS[i][0] and t <= SHOTS[i + 1][0]:
			a = SHOTS[i]
			b = SHOTS[i + 1]
			break
	var span := maxf(0.001, float(b[0]) - float(a[0]))
	var k := smoothstep(0.0, 1.0, clampf((t - float(a[0])) / span, 0.0, 1.0))
	camera.position = (a[1] as Vector3).lerp(b[1], k)
	var look := (a[2] as Vector3).lerp(b[2], k)
	camera.look_at(look, Vector3.UP)
