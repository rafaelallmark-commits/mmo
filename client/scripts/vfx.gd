extends Node3D
## Efeitos visuais de combate, a partir dos eventos do servidor (cast, hit, heal, buff, shield,
## ground, warn, warn_cancel, mech, debuff, cleanse): cortes, projéteis, leques, linhas, áreas, curas,
## escudos, marcações de perigo (círculo, cone e linha), explosões, puxões, drenagem de mana e as marcas
## dos efeitos negativos nos personagens.
## Tudo com malhas simples, materiais aditivos e tweens curtos (não interfere na simulação).
## Cada efeito também toca o seu som (autoload Sfx, client/scripts/audio.gd): ar cortado, disparo,
## impacto conforme a arma ou a família do monstro, curas, escudos e os sinos de aviso do chefe.

const Gear := preload("res://scripts/gear.gd")

var world # world.gd
var _mats := {}
var _warns := {}  # id do aviso de monstro -> nó raiz da marcação (warn_cancel apaga)
const WARN_SEE := 60.0  # avisos de monstro a mais disso do jogador não são desenhados nem soam

const COLORS := {
	"phys": Color(1.0, 0.95, 0.85),
	"magic": Color(1.0, 0.5, 0.18),
	"sacred": Color(1.0, 0.88, 0.45),
	"heal": Color(0.45, 1.0, 0.55),
	"buff": Color(1.0, 0.8, 0.35),
	"shield": Color(0.5, 0.8, 1.0),
	"debuff": Color(0.75, 0.45, 1.0),
	"danger": Color(1.0, 0.25, 0.15),
}

func glow(c: Color, alpha := 0.85) -> StandardMaterial3D:
	var key := "%s|%s" % [c.to_html(), alpha]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.no_depth_test = false
	m.albedo_color = Color(c.r, c.g, c.b, alpha)
	_mats[key] = m
	return m

func _mesh(mesh: Mesh, mat: Material, pos: Vector3, parent: Node3D = null) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = (mat as StandardMaterial3D).duplicate() if mat is StandardMaterial3D else mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	(parent if parent else self).add_child(mi)
	mi.position = pos
	return mi

func _fade_out(mi: MeshInstance3D, t: float, delay := 0.0) -> Tween:
	var tw := create_tween()
	if delay > 0.0:
		tw.tween_interval(delay)
	var m: StandardMaterial3D = mi.material_override
	tw.tween_property(m, "albedo_color:a", 0.0, t)
	tw.tween_callback(mi.queue_free)
	return tw

func _sparks(at: Vector3, c: Color, amount := 14, speed := 3.0, up := 1.0, life := 0.45) -> void:
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.amount = amount
	p.lifetime = life
	p.explosiveness = 0.95
	p.direction = Vector3(0, up, 0)
	p.spread = 70.0
	p.initial_velocity_min = speed * 0.5
	p.initial_velocity_max = speed
	p.gravity = Vector3(0, -6.0 * (1.0 - up * 0.5), 0)
	p.scale_amount_min = 0.04
	p.scale_amount_max = 0.09
	p.mesh = Gear.sphere(1.0, 4, 2)
	p.material_override = glow(c, 1.0)
	add_child(p)
	p.global_position = at
	p.emitting = true
	get_tree().create_timer(life + 0.3).timeout.connect(p.queue_free)

func _pos(eid) -> Variant:
	if eid == null or not world.entities.has(eid):
		return null
	return world.entities[eid]["node"].position

func _yaw_to(a: Vector3, b: Vector3) -> float:
	return atan2(b.x - a.x, b.z - a.z)

# ---------------- sons ----------------
const BLADES := ["axe_1h", "axe_2h", "sword_1h", "sword_2h", "spear_2h"]
const HEAVY := ["axe_2h", "sword_2h", "spear_2h", "staff_2h"]
const CASTERS := ["wand", "scepter", "staff_2h", "staff"]

## Quem bate: família da arma do jogador, ou "m_" + família do monstro (beast, machine, spirit).
func _attacker(eid) -> String:
	if eid == null or not world.entities.has(eid):
		return ""
	var d: Dictionary = world.entities[eid]["data"]
	if d["k"] == "p":
		return world._weapon_family(d.get("w"))
	return "m_" + String(world.main.defs.get("monsters", {}).get(d.get("def", ""), {}).get("family", "beast"))

## Disparo à distância: arco, azagaia ou foco mágico.
func _launch_sound(fam: String, at: Vector3, magic := false) -> void:
	if magic or fam in CASTERS:
		Sfx.play("spell_cast", at)
	elif fam == "bow":
		Sfx.play("bow_release", at)
	else:
		Sfx.play("javelin_throw", at)

## Ar cortado pelo golpe corpo a corpo (armas de duas mãos e monstros grandes soam mais pesados).
func _swing_sound(att: String, at: Vector3) -> void:
	if att in HEAVY:
		Sfx.play("swing_heavy", at)
	elif att == "m_machine":
		Sfx.play("swing_heavy", at, -2.0, 0.8)
	else:
		Sfx.play("swing_light", at)

## Impacto: lâmina, contusão, flecha, magia ou mordida, conforme quem bate.
func _impact_sound(att: String, at: Vector3, magic: bool, crit: bool, delay := 0.0) -> void:
	var snd := "hit_blunt"
	if magic or att == "m_spirit":
		snd = "spell_impact"
	elif att in BLADES:
		snd = "hit_blade"
	elif att in ["bow", "javelin"]:
		snd = "arrow_hit"
	elif att == "m_beast":
		snd = "hit_flesh"
	var vol := 3.0 if crit else 0.0
	var pitch := 0.9 if crit else 1.0
	if delay > 0.0:
		Sfx.play_later(delay, snd, at, vol, pitch)
	else:
		Sfx.play(snd, at, vol, pitch)

# ---------------- primitivas ----------------
## Corte em arco (meia-lua) na frente de quem bate.
func slash(at: Vector3, yaw: float, c: Color, size := 1.1) -> void:
	var root := Node3D.new()
	add_child(root)
	root.position = at + Vector3(0, 1.0, 0)
	root.rotation = Vector3(randf_range(-0.5, 0.5), yaw, randf_range(-0.8, 0.8))
	var t := TorusMesh.new()
	t.inner_radius = size * 0.82
	t.outer_radius = size
	t.rings = 24
	t.ring_segments = 3
	var mi := _mesh(t, glow(c), Vector3.ZERO, root)
	mi.scale = Vector3(1, 0.15, 1)
	root.scale = Vector3.ONE * 0.6
	var tw := create_tween()
	tw.tween_property(root, "scale", Vector3.ONE * 1.1, 0.16).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(root, "rotation:y", yaw + 1.2, 0.16)
	tw.tween_property(mi.material_override, "albedo_color:a", 0.0, 0.12)
	tw.tween_callback(root.queue_free)

## Projétil (bola de energia ou flecha) de a até b; chama on_arrive no impacto.
func projectile(a: Vector3, b: Vector3, c: Color, arrow := false, time := 0.22, on_arrive := Callable()) -> void:
	var from := a + Vector3(0, 1.2, 0)
	var to := b + Vector3(0, 0.9, 0)
	var node: MeshInstance3D
	if arrow:
		node = _mesh(Gear.cyl(0.02, 0.02, 0.7, 4), glow(c, 0.95), from)
		node.look_at_from_position(from, to + Vector3(0.001, 0, 0), Vector3.UP)
		node.rotate_object_local(Vector3.RIGHT, PI / 2.0)
	else:
		node = _mesh(Gear.sphere(0.16, 8, 4), glow(c, 0.95), from)
		var halo := _mesh(Gear.sphere(0.3, 8, 4), glow(c, 0.35), Vector3.ZERO, node)
		halo.name = "halo"
	var tw := create_tween()
	tw.tween_property(node, "position", to, time).set_trans(Tween.TRANS_SINE)
	tw.tween_callback(func():
		if on_arrive.is_valid():
			on_arrive.call()
		node.queue_free())

## Clarão no ponto de impacto.
func impact(at: Vector3, c: Color, big := false) -> void:
	var mi := _mesh(Gear.sphere(0.25 if not big else 0.5, 10, 6), glow(c, 0.9), at + Vector3(0, 0.9, 0))
	var tw := create_tween()
	tw.tween_property(mi, "scale", Vector3.ONE * (2.2 if big else 1.6), 0.14)
	tw.parallel().tween_property(mi.material_override, "albedo_color:a", 0.0, 0.18)
	tw.tween_callback(mi.queue_free)
	_sparks(at + Vector3(0, 0.9, 0), c, 18 if big else 10, 4.0 if big else 2.6)

## Anel que se expande no chão.
func ring(at: Vector3, radius: float, c: Color, time := 0.45, width := 0.25) -> void:
	var t := TorusMesh.new()
	t.inner_radius = maxf(0.05, 1.0 - width / maxf(radius, 0.1))
	t.outer_radius = 1.0
	t.rings = 48
	t.ring_segments = 4
	var mi := _mesh(t, glow(c, 0.8), at + Vector3(0, 0.12, 0))
	mi.scale = Vector3(0.2, 0.05, 0.2) * radius
	var tw := create_tween()
	tw.tween_property(mi, "scale", Vector3(radius, 0.05 * radius, radius), time).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(mi.material_override, "albedo_color:a", 0.0, time).set_delay(time * 0.4)
	tw.tween_callback(mi.queue_free)

## Leque no chão (cone) à frente.
func cone(at: Vector3, yaw: float, range: float, angle_deg: float, c: Color) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := 16
	var half := deg_to_rad(angle_deg) / 2.0
	for i in n:
		var a0 := -half + (2.0 * half) * i / n
		var a1 := -half + (2.0 * half) * (i + 1) / n
		st.add_vertex(Vector3.ZERO)
		st.add_vertex(Vector3(sin(a0), 0, cos(a0)) * range)
		st.add_vertex(Vector3(sin(a1), 0, cos(a1)) * range)
	var mi := _mesh(st.commit(), glow(c, 0.55), at + Vector3(0, 0.15, 0))
	mi.rotation.y = yaw
	mi.scale = Vector3.ONE * 0.3
	var tw := create_tween()
	tw.tween_property(mi, "scale", Vector3.ONE, 0.14)
	tw.tween_property(mi.material_override, "albedo_color:a", 0.0, 0.25)
	tw.tween_callback(mi.queue_free)

## Faixa reta (golpe em linha / investida).
func line(at: Vector3, yaw: float, length: float, width: float, c: Color) -> void:
	var mi := _mesh(Gear.box(Vector3(width, 0.04, length)), glow(c, 0.6), Vector3.ZERO)
	mi.position = at + Vector3(sin(yaw), 0, cos(yaw)) * (length / 2.0) + Vector3(0, 0.15, 0)
	mi.rotation.y = yaw
	mi.scale = Vector3(1, 1, 0.1)
	var tw := create_tween()
	tw.tween_property(mi, "scale", Vector3.ONE, 0.12)
	tw.tween_property(mi.material_override, "albedo_color:a", 0.0, 0.3)
	tw.tween_callback(mi.queue_free)

## Coluna de luz subindo (cura, bênção) presa à entidade.
func column(eid, c: Color, time := 0.8) -> void:
	if eid == null or not world.entities.has(eid):
		return
	var node: Node3D = world.entities[eid]["node"]
	var inv := 1.0 / maxf(node.scale.x, 0.01)
	var mi := _mesh(Gear.cyl(0.55, 0.65, 2.2, 16), glow(c, 0.35), Vector3(0, 1.1 * inv, 0), node)
	mi.scale = Vector3(inv, inv * 0.2, inv)
	var tw := create_tween()
	tw.tween_property(mi, "scale", Vector3(inv, inv, inv), 0.2)
	tw.tween_property(mi.material_override, "albedo_color:a", 0.0, time)
	tw.tween_callback(mi.queue_free)
	var p := CPUParticles3D.new()
	p.amount = 18
	p.lifetime = 0.9
	p.one_shot = true
	p.explosiveness = 0.6
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 0.5
	p.direction = Vector3(0, 1, 0)
	p.spread = 15.0
	p.gravity = Vector3(0, 1.5, 0)
	p.initial_velocity_min = 0.6
	p.initial_velocity_max = 1.4
	p.scale_amount_min = 0.05
	p.scale_amount_max = 0.1
	p.mesh = Gear.sphere(1.0, 4, 2)
	p.material_override = glow(c, 1.0)
	node.add_child(p)
	p.position = Vector3(0, 0.4 * inv, 0)
	p.scale = Vector3.ONE * inv
	p.emitting = true
	get_tree().create_timer(1.4).timeout.connect(p.queue_free)

## Bolha de escudo que acompanha a entidade pelo tempo dado.
func bubble(eid, c: Color, ms: float) -> void:
	if eid == null or not world.entities.has(eid):
		return
	var node: Node3D = world.entities[eid]["node"]
	var old := node.get_node_or_null("VfxShield")
	if old:
		old.queue_free()
	var inv := 1.0 / maxf(node.scale.x, 0.01)
	var mi := _mesh(Gear.sphere(1.0, 16, 10), glow(c, 0.22), Vector3(0, 1.0 * inv, 0), node)
	mi.name = "VfxShield"
	mi.scale = Vector3(0.9, 1.15, 0.9) * inv * 0.2
	var tw := create_tween()
	tw.tween_property(mi, "scale", Vector3(0.9, 1.15, 0.9) * inv, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_interval(maxf(0.1, ms / 1000.0 - 0.6))
	tw.tween_property(mi.material_override, "albedo_color:a", 0.0, 0.4)
	tw.tween_callback(mi.queue_free)

## Conjuração com tempo (castMs): anel que gira aos pés de quem conjura e se fecha no fim; some se for
## interrompida. Cor pela habilidade (magia/sagrado/físico).
func on_cast_start(m: Dictionary) -> void:
	var eid = m.get("eid")
	if eid == null or not world.entities.has(eid):
		return
	var node: Node3D = world.entities[eid]["node"]
	on_cast_cancel(m)
	var s: Dictionary = world.main.defs["skills"].get(m.get("skill", ""), {})
	var eff: Dictionary = s.get("effect", {})
	var c: Color = COLORS["magic"] if eff.get("damageType", "") == "magic" or eff.get("kind", "") in ["delayed_aoe", "spell"] else (COLORS["sacred"] if eff.get("kind", "") == "resurrect" else COLORS["buff"])
	var inv := 1.0 / maxf(node.scale.x, 0.01)
	var t := TorusMesh.new()
	t.inner_radius = 0.55
	t.outer_radius = 0.62
	var mi := _mesh(t, glow(c, 0.75), Vector3(0, 0.06 * inv, 0), node)
	mi.name = "VfxCast"
	mi.scale = Vector3.ONE * inv * 1.4
	var secs := maxf(0.2, float(m.get("ms", 1000)) / 1000.0)
	var tw := create_tween()
	tw.set_parallel(true)
	tw.tween_property(mi, "rotation:y", TAU * secs, secs)
	tw.tween_property(mi, "scale", Vector3.ONE * inv * 0.35, secs).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(mi.queue_free)

func on_cast_cancel(m: Dictionary) -> void:
	var eid = m.get("eid")
	if eid == null or not world.entities.has(eid):
		return
	var old: Node = world.entities[eid]["node"].get_node_or_null("VfxCast")
	if old:
		old.queue_free()

## Espiral roxa (enfraquecido, lento, marcado).
func swirl(eid, c: Color) -> void:
	if eid == null or not world.entities.has(eid):
		return
	var node: Node3D = world.entities[eid]["node"]
	var inv := 1.0 / maxf(node.scale.x, 0.01)
	var t := TorusMesh.new()
	t.inner_radius = 0.5
	t.outer_radius = 0.6
	t.ring_segments = 4
	var mi := _mesh(t, glow(c, 0.7), Vector3(0, 1.6 * inv, 0), node)
	mi.scale = Vector3(inv, inv * 0.2, inv)
	var tw := create_tween()
	tw.tween_property(mi, "position:y", 0.1 * inv, 0.6)
	tw.parallel().tween_property(mi, "rotation:y", TAU, 0.6)
	tw.tween_property(mi.material_override, "albedo_color:a", 0.0, 0.2)
	tw.tween_callback(mi.queue_free)

## Raiz de uma marcação de perigo: as malhas e o tween ficam presos a ela, então apagar a raiz
## (aviso cancelado: o monstro foi atordoado ou morreu) para tudo de uma vez.
func _warn_root(at: Vector3) -> Node3D:
	var root := Node3D.new()
	add_child(root)
	root.position = at
	return root

## Material das marcações de perigo no chão: mistura comum (não soma luz como os efeitos), para o
## vermelho ler igual na grama clara, na terra e na pedra escura do calabouço.
func warn_mat(c: Color, alpha: float) -> StandardMaterial3D:
	var key := "warn|%s|%s" % [c.to_html(), alpha]
	if _mats.has(key):
		return _mats[key]
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.render_priority = 1
	m.albedo_color = Color(c.r, c.g, c.b, alpha)
	_mats[key] = m
	return m

## As marcações acompanham o relevo: cada vértice fica WARN_LIFT acima do chão naquele ponto (a borda,
## um pouco mais). Um plano na altura do centro deixava enterrada parte da borda no lado mais alto — até
## um quarto dela nos círculos de 5 m dos canais.
const WARN_LIFT := 0.1

## Altura do chão sob um ponto da marcação (coordenadas locais da raiz), mais a folga.
func _ground_local(root: Node3D, lx: float, lz: float, lift: float) -> float:
	return world.ground_y(root.position.x + lx, root.position.z + lz) - root.position.y + lift

## Malha sobre o relevo a partir de uma grade de pontos locais no chão (lista de linhas de Vector2 x, z):
## cada quadrado da grade vira dois triângulos, com a altura do chão em cada vértice. Não gire a malha
## depois: as alturas já são as do lugar onde ela fica.
func _drape(root: Node3D, grid: Array, lift: float) -> ArrayMesh:
	var rows := []
	for line_pts in grid:
		var row := []
		for q in line_pts:
			row.append(Vector3(q.x, _ground_local(root, q.x, q.y, lift), q.y))
		rows.append(row)
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in rows.size() - 1:
		var a: Array = rows[i]
		var b: Array = rows[i + 1]
		for j in a.size() - 1:
			for v in [a[j], a[j + 1], b[j + 1], a[j], b[j + 1], b[j]]:
				st.add_vertex(v)
	return st.commit()

## Grade polar de um disco ou de uma coroa (raio r0 a r1), do ângulo a0 ao a1 (no chão, direção (sin, cos),
## a mesma do yaw dos avisos).
func _polar(r0: float, r1: float, rings: int, a0: float, a1: float, segs: int) -> Array:
	var grid := []
	for i in rings + 1:
		var r := lerpf(r0, r1, float(i) / rings)
		var line_pts := []
		for j in segs + 1:
			var a := lerpf(a0, a1, float(j) / segs)
			line_pts.append(Vector2(sin(a), cos(a)) * r)
		grid.append(line_pts)
	return grid

## Grade de uma faixa reta de p a q com a largura dada (bordas de linha e de cone).
func _strip(p: Vector2, q: Vector2, width: float, steps: int) -> Array:
	var d := q - p
	var side := Vector2(d.y, -d.x).normalized() * (width / 2.0)
	var grid := []
	for i in steps + 1:
		var c := p.lerp(q, float(i) / steps)
		grid.append([c - side, c + side])
	return grid

## Preenchimento do círculo que enche do centro para fora (reach, em metros), sobre o relevo: o disco
## inteiro já está lá; o shader só desenha até reach.
const WARN_FILL_SHADER := """
shader_type spatial;
render_mode unshaded, cull_disabled, blend_mix, depth_draw_never, shadows_disabled;
uniform vec4 tint : source_color = vec4(1.0, 0.25, 0.15, 0.32);
uniform float reach = 0.0;
uniform float fade = 1.0;
varying vec2 flat_pos;
void vertex() {
	flat_pos = VERTEX.xz;
}
void fragment() {
	if (length(flat_pos) > reach) {
		discard;
	}
	ALBEDO = tint.rgb;
	ALPHA = tint.a * fade;
}
"""
var _fill_shader: Shader

func _fill_mat(c: Color, alpha: float) -> ShaderMaterial:
	if _fill_shader == null:
		_fill_shader = Shader.new()
		_fill_shader.code = WARN_FILL_SHADER
	var m := ShaderMaterial.new()
	m.shader = _fill_shader
	m.render_priority = 2
	m.set_shader_parameter("tint", Color(c.r, c.g, c.b, alpha))
	# os tweens partem do valor guardado no material: os dois começam definidos
	m.set_shader_parameter("reach", 0.0)
	m.set_shader_parameter("fade", 1.0)
	return m

## Marcação de perigo no chão (chefe ou monstro avisa antes de atacar): a área inteira fica marcada de
## leve, com a borda forte, e o vermelho enche do centro para fora até o golpe.
## end_sound: o som quando o círculo se completa; end_fx: o efeito do golpe (ver _warn_end).
func warn_circle(at: Vector3, radius: float, ms: float, c := COLORS["danger"], end_sound := "spell_impact", end_fx := "") -> Node3D:
	var root := _warn_root(at)
	var segs := clampi(int(radius * 10.0), 24, 64)
	var area := _drape(root, _polar(0.0, radius, clampi(int(radius), 2, 8), 0.0, TAU, segs), WARN_LIFT)
	var base := _mesh(area, warn_mat(c, 0.12), Vector3.ZERO, root)
	var bw := clampf(radius * 0.05, 0.12, 0.3)
	var e := _mesh(_drape(root, _polar(radius - bw, radius, 1, 0.0, TAU, segs), WARN_LIFT + 0.03), warn_mat(c, 0.9), Vector3.ZERO, root)
	var fill_mat := _fill_mat(c, 0.32)
	fill_mat.set_shader_parameter("reach", radius * 0.05)
	_mesh(area, fill_mat, Vector3(0, 0.01, 0), root)
	var tw := root.create_tween()
	tw.tween_property(fill_mat, "shader_parameter/reach", radius, ms / 1000.0)
	tw.tween_callback(func():
		_warn_end(end_fx, at, radius, c)
		if end_sound != "":
			Sfx.play(end_sound, at, 1.0, 0.85))
	tw.tween_property(fill_mat, "shader_parameter/fade", 0.0, 0.2)
	tw.parallel().tween_property(base.material_override, "albedo_color:a", 0.0, 0.2)
	tw.parallel().tween_property(e.material_override, "albedo_color:a", 0.0, 0.2)
	tw.tween_callback(root.queue_free)
	return root

## Marcação de perigo em linha (investida, corrida no trilho, descarga): faixa com as bordas acesas,
## cada vez mais vermelha até o golpe.
func warn_line(at: Vector3, yaw: float, length: float, width: float, ms: float, c := COLORS["danger"]) -> Node3D:
	var root := _warn_root(at)
	var fwd := Vector2(sin(yaw), cos(yaw))
	var side := Vector2(cos(yaw), -sin(yaw)) * (width / 2.0)
	var steps := clampi(int(ceil(length)), 2, 48)
	var grid := []
	for i in steps + 1:
		var mid := fwd * (length * i / steps)
		grid.append([mid - side, mid, mid + side])
	var mi := _mesh(_drape(root, grid, WARN_LIFT), warn_mat(c, 0.16), Vector3.ZERO, root)
	for s in [side, -side]:
		_mesh(_drape(root, _strip(s, s + fwd * length, 0.12, steps), WARN_LIFT + 0.03), warn_mat(c, 0.9), Vector3.ZERO, root)
	_mesh(_drape(root, _strip(side + fwd * length, -side + fwd * length, 0.12, 2), WARN_LIFT + 0.03), warn_mat(c, 0.9), Vector3.ZERO, root)
	var tw := root.create_tween()
	tw.tween_property(mi.material_override, "albedo_color:a", 0.5, ms / 1000.0)
	tw.tween_callback(func():
		line(at, yaw, length, width, c)
		Sfx.play("spell_fire", at + Vector3(fwd.x, 0, fwd.y) * (length / 2.0), -1.0, 1.25))
	tw.tween_property(mi.material_override, "albedo_color:a", 0.0, 0.15)
	tw.tween_callback(root.queue_free)
	return root

## Marcação de perigo em cone à frente (Cone de Faíscas do Soldador): as duas bordas e o arco acesos e o
## leque cada vez mais vermelho até o golpe.
func warn_cone(at: Vector3, yaw: float, reach: float, angle_deg: float, ms: float, c := COLORS["danger"], end_fx := "") -> Node3D:
	var root := _warn_root(at)
	var half := deg_to_rad(angle_deg) / 2.0
	var segs := clampi(int(angle_deg / 4.0), 8, 45)
	var rings := clampi(int(reach), 2, 8)
	var fan := _mesh(_drape(root, _polar(0.0, reach, rings, yaw - half, yaw + half, segs), WARN_LIFT), warn_mat(c, 0.14), Vector3.ZERO, root)
	# bordas do leque: as duas retas e o arco (só o arco do cone, não o círculo inteiro)
	for a in [yaw - half, yaw + half]:
		_mesh(_drape(root, _strip(Vector2.ZERO, Vector2(sin(a), cos(a)) * reach, 0.12, rings), WARN_LIFT + 0.03), warn_mat(c, 0.9), Vector3.ZERO, root)
	_mesh(_drape(root, _polar(reach - 0.12, reach, 1, yaw - half, yaw + half, segs), WARN_LIFT + 0.03), warn_mat(c, 0.9), Vector3.ZERO, root)
	var tw := root.create_tween()
	tw.tween_property(fan.material_override, "albedo_color:a", 0.5, ms / 1000.0)
	tw.tween_callback(func():
		cone(at, yaw, reach, angle_deg, c)
		_warn_end(end_fx, at + Vector3(sin(yaw), 0, cos(yaw)) * (reach * 0.5), reach * 0.5, c)
		Sfx.play("spell_fire", at, 0.0, 1.1))
	tw.tween_property(fan.material_override, "albedo_color:a", 0.0, 0.15)
	tw.tween_callback(root.queue_free)
	return root

## O golpe avisado saiu: explosão de vapor ou escória, lama do arrasto, onda do grito, choque do fio,
## faíscas do soldador; os demais, o impacto com anel de sempre.
func _warn_end(fx: String, at: Vector3, radius: float, c: Color) -> void:
	match fx:
		"steam_burst", "steam_vent":
			explosion(at, radius, Color(0.92, 0.92, 0.95))
		"slag_burst":
			explosion(at, radius, Color(1.0, 0.55, 0.2))
		"drag":
			ring(at, radius, Color(0.55, 0.4, 0.25), 0.5, 0.6)
			_sparks(at, Color(0.45, 0.33, 0.2), 26, 3.0, 0.3, 0.6)
		"disorienting_cry", "mother_cry":
			waves(at, radius, COLORS["debuff"])
		"seal":
			waves(at, radius, Color(0.65, 0.75, 1.0))
		"conduit_web":
			impact(at, Color(0.5, 0.9, 1.0), true)
			_sparks(at + Vector3(0, 0.4, 0), Color(0.6, 0.95, 1.0), 28, 5.0, 0.8, 0.35)
		"spark_cone":
			_sparks(at + Vector3(0, 0.6, 0), Color(1.0, 0.7, 0.3), 30, 5.0, 0.5, 0.4)
		_:
			impact(at, c, true)
			ring(at, radius, c, 0.35)

## Explosão (Sapo-Bomba, Escória, vapor da Bomba-Mestra): clarão, anel e coluna de fumaça.
func explosion(at: Vector3, radius: float, c: Color) -> void:
	impact(at, c, true)
	ring(at, radius, c, 0.45, 0.5)
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.amount = 40
	p.lifetime = 1.1
	p.explosiveness = 0.9
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = radius * 0.4
	p.direction = Vector3(0, 1, 0)
	p.spread = 35.0
	p.gravity = Vector3(0, 1.2, 0)
	p.initial_velocity_min = 1.5
	p.initial_velocity_max = 3.5
	p.scale_amount_min = 0.12
	p.scale_amount_max = 0.3
	p.mesh = Gear.sphere(1.0, 6, 3)
	p.material_override = glow(c, 0.35)
	add_child(p)
	p.global_position = at + Vector3(0, 0.3, 0)
	p.emitting = true
	get_tree().create_timer(1.6).timeout.connect(p.queue_free)
	Sfx.play("steam_vent", at, -2.0, 1.3)

## Ondas que se abrem (grito, selo).
func waves(at: Vector3, radius: float, c: Color) -> void:
	for i in 3:
		var t := TorusMesh.new()
		t.inner_radius = 0.9
		t.outer_radius = 1.0
		t.rings = 40
		t.ring_segments = 4
		var mi := _mesh(t, glow(c, 0.7), at + Vector3(0, 0.6 + i * 0.25, 0))
		mi.scale = Vector3.ONE * 0.3
		var tw := mi.create_tween()
		tw.tween_interval(i * 0.12)
		tw.tween_property(mi, "scale", Vector3(radius, 0.15 * radius, radius), 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.parallel().tween_property(mi.material_override, "albedo_color:a", 0.0, 0.45)
		tw.tween_callback(mi.queue_free)

## Corrente que arrasta (puxão da Draga): de quem foi puxado até o monstro.
func chain(a: Vector3, b: Vector3, c: Color) -> void:
	var from := a + Vector3(0, 0.9, 0)
	var to := b + Vector3(0, 0.9, 0)
	var d := from.distance_to(to)
	if d < 0.05:
		return
	var mid := from.lerp(to, 0.5)
	var mi := _mesh(Gear.cyl(0.06, 0.06, d, 6), glow(c, 0.9), mid)
	mi.look_at_from_position(mid, to + Vector3(0.001, 0, 0), Vector3.UP)
	mi.rotate_object_local(Vector3.RIGHT, PI / 2.0)
	var tw := mi.create_tween()
	tw.tween_interval(0.25)
	tw.tween_property(mi.material_override, "albedo_color:a", 0.0, 0.35)
	tw.tween_callback(mi.queue_free)
	_sparks(a, c, 18, 2.5, 0.3, 0.5)

## Faixa de perigo sobre o relevo (o segundo toque do tutorial): pedaços de 2 m, cada um na altura do chão,
## que acendem juntos e estouram no fim do aviso (a linha inteira de uma vez sumiria nas subidas).
func warn_strip(x: float, z: float, yaw: float, length: float, width: float, ms: float, c := COLORS["danger"]) -> void:
	var dir := Vector2(sin(yaw), cos(yaw))
	var n := maxi(1, int(ceil(length / 2.0)))
	var seg := length / float(n)
	for k in n:
		var p: Vector3 = world._gpos(x + dir.x * seg * (k + 0.5), z + dir.y * seg * (k + 0.5)) + Vector3(0, 0.12, 0)
		var mi := _mesh(Gear.box(Vector3(width, 0.04, seg + 0.06)), glow(c, 0.3), p)
		mi.rotation.y = yaw
		var first: bool = k == 0
		var tw := create_tween()
		tw.tween_property(mi.material_override, "albedo_color:a", 0.75, ms / 1000.0)
		tw.tween_callback(func():
			impact(p, c, false)
			if first:
				Sfx.play("spell_fire", world._gpos(x + dir.x * length / 2.0, z + dir.y * length / 2.0), 0.0, 1.15))
		tw.tween_property(mi.material_override, "albedo_color:a", 0.0, 0.3)
		tw.tween_callback(mi.queue_free)

# ---------------- eventos do servidor ----------------
func on_cast(m: Dictionary) -> void:
	var s: Dictionary = world.main.defs.get("skills", {}).get(m.get("skill", ""), {})
	var src = _pos(m.get("eid"))
	if s.is_empty() or src == null:
		return
	var eff: Dictionary = s.get("effect", {})
	var kind: String = eff.get("kind", "")
	var dtype: String = eff.get("damageType", "phys")
	var c: Color = COLORS.get(dtype, COLORS["phys"])
	var tgt = _pos(m.get("target"))
	var point = null
	if m.has("x") and m.get("x") != null:
		point = world._gpos(float(m["x"]), float(m["z"]))
	var aim = tgt if tgt != null else point
	var yaw: float = world.entities[m["eid"]]["yaw"]
	if aim != null:
		yaw = _yaw_to(src, aim)
	var node: Node3D = world.entities[m["eid"]]["node"]
	if node.has_method("play_attack") and kind in ["strike", "cone_strike", "line_strike", "charge", "aoe_strike", "pull", "spell", "debuff"]:
		node.play_attack()
	elif node.has_method("play_cast"):
		node.play_cast()
	var rng = s.get("range", 3.0)
	var reach: float = 3.0 if str(rng) == "weapon" else float(rng)
	var fam := _attacker(m.get("eid"))
	match kind:
		"strike", "aoe_strike":
			if tgt != null and src.distance_to(tgt) > 3.5:
				projectile(src, tgt, c, dtype == "phys", 0.25)
				_launch_sound(fam, src, dtype != "phys")
			elif tgt != null:
				slash(src.lerp(tgt, 0.6), yaw, c, 1.2)
				Sfx.play("swing_heavy", src)
			if kind == "aoe_strike":
				ring(src, float(eff.get("radius", 3.0)), COLORS["sacred"])
				Sfx.play("spell_impact", src, -2.0, 1.2)
		"spell":
			if tgt != null:
				projectile(src, tgt, c, false, 0.3)
			Sfx.play("spell_cast", src)
		"cone_strike":
			cone(src, yaw, reach, float(eff.get("angleDeg", 90)), c)
			if int(eff.get("projectiles", 0)) > 0:
				var half := deg_to_rad(float(eff.get("angleDeg", 60))) / 2.0
				for i in int(eff["projectiles"]):
					var a := yaw - half + 2.0 * half * (i + 0.5) / int(eff["projectiles"])
					projectile(src, src + Vector3(sin(a), 0, cos(a)) * reach, c, true, 0.25)
				_launch_sound(fam, src)
			else:
				Sfx.play("swing_heavy", src, 1.0, 0.9)
		"line_strike":
			line(src, yaw, reach, float(eff.get("width", 1.5)), c)
			if fam in ["bow", "javelin"]:
				_launch_sound(fam, src)
			else:
				Sfx.play("swing_heavy", src, 1.0, 0.85)
		"charge", "dash":
			_sparks(src, Color(0.85, 0.75, 0.6), 16, 2.0, 0.4, 0.6)
			Sfx.play("swing_heavy", src, -2.0, 0.7)
			if kind == "charge" and tgt != null:
				line(src, yaw, src.distance_to(tgt), 0.8, c)
		"pull":
			if tgt != null:
				line(src, yaw, src.distance_to(tgt), 0.15, COLORS["debuff"])
			Sfx.play("javelin_throw", src, -2.0, 0.75)
		"ground_aoe", "aoe_spell", "delayed_aoe":
			var at = point if point != null else (tgt if tgt != null else src)
			var magic := dtype == "magic"
			_launch_sound(fam, src, magic)
			if kind == "delayed_aoe":
				warn_circle(at, float(eff.get("radius", 4.0)), float(eff.get("delayMs", 2000)), COLORS["magic"], "spell_fire")
			else:
				projectile(src, at, c, false, 0.3, func():
					impact(at, c, true)
					ring(at, float(eff.get("radius", 3.0)), c)
					Sfx.play("spell_fire" if magic else "arrow_hit", at, 0.0 if magic else 2.0, 1.0 if magic else 0.85))
		"heal", "party_heal":
			column(m.get("target") if m.get("target") != null else m.get("eid"), COLORS["heal"])
			if kind == "party_heal":
				ring(src, 8.0, COLORS["heal"], 0.6)
			Sfx.play("spell_cast", src, -6.0, 1.3)   # o sino da cura soa em quem é curado (on_heal)
		"buff_self", "party_buff", "aura_damage":
			column(m.get("eid"), COLORS["buff"], 0.5)
			ring(src, 3.0 if kind != "party_buff" else 8.0, COLORS["buff"])
			if kind == "aura_damage":
				Sfx.play("spell_cast", src, 0.0, 0.8)   # os reforços soam em on_buff
		"debuff":
			if tgt != null:
				var victim = m.get("target")
				projectile(src, tgt, COLORS["debuff"], false, 0.25, func():
					swirl(victim, COLORS["debuff"])
					var vp = _pos(victim)
					if vp != null:
						Sfx.play("debuff", vp))
		"taunt_area":
			ring(src, float(eff.get("radius", 6.0)), COLORS["danger"], 0.5, 0.4)
			Sfx.play("shield_up", src, 1.0, 0.7)
		"guard_ally", "shield_ally", "shield_self":
			var who = m.get("target") if m.get("target") != null else m.get("eid")
			var wp = _pos(who)
			if wp != null and kind == "guard_ally":
				line(src, _yaw_to(src, wp), src.distance_to(wp), 0.12, COLORS["shield"])
				Sfx.play("shield_up", wp, -2.0, 0.9)   # escudos com valor soam em on_shield
		"resurrect":
			column(m.get("target"), COLORS["sacred"], 1.2)
			var rp = _pos(m.get("target"))
			if rp != null:
				Sfx.play("heal_chime", rp, 2.0, 0.8)

## Golpe recebido: faísca no alvo; ataques básicos à distância viram flecha ou bola.
func on_hit(m: Dictionary, src_family: String) -> void:
	var dst = _pos(m.get("dst"))
	if dst == null or m.get("skill", null) == "dot":
		return
	var src = _pos(m.get("src"))
	var c: Color = COLORS["magic"] if m.get("magic", false) else COLORS["phys"]
	var att := _attacker(m.get("src"))
	var magic: bool = m.get("magic", false)
	var crit: bool = m.get("crit", false)
	if m.get("skill", null) == null and src != null and src_family in ["bow", "javelin", "staff_2h", "wand", "scepter", "staff"]:
		var arrow: bool = src_family in ["bow", "javelin"]
		var miss: bool = m.get("miss", false)
		_launch_sound(src_family, src, not arrow)
		projectile(src, dst, c if not arrow else Color(0.95, 0.9, 0.75), arrow, 0.18, func():
			if not miss:
				impact(dst, c, crit)
				_impact_sound(att, dst, magic or not arrow, crit))
		return
	var melee: bool = src != null and m.get("skill", null) == null and src.distance_to(dst) < 4.0
	if melee:
		_swing_sound(att, src)
	if m.get("miss", false):
		return
	impact(dst, c, crit)
	# o impacto soa logo depois do ar cortado pelo golpe
	_impact_sound(att, dst, magic, crit, 0.06 if melee else 0.0)
	if melee:
		slash(src.lerp(dst, 0.65), _yaw_to(src, dst), Color(1, 1, 1), 0.9)

func on_heal(m: Dictionary) -> void:
	column(m.get("dst"), COLORS["heal"], 0.6)
	var p = _pos(m.get("dst"))
	if p != null:
		Sfx.play("heal_chime", p)

func on_buff(m: Dictionary) -> void:
	column(m.get("eid"), COLORS["buff"], 0.5)
	var p = _pos(m.get("eid"))
	if p != null:
		Sfx.play("buff", p)

func on_shield(m: Dictionary) -> void:
	bubble(m.get("eid"), COLORS["shield"], float(m.get("ms", 4000)))
	var p = _pos(m.get("eid"))
	if p != null:
		Sfx.play("shield_up", p)

## Aviso do servidor: { shape: circle|cone|line, x, z, radius | yaw, range, angleDeg | yaw, length, width,
## ms, kind, name?, src?, id? }. Chefe (sem src): a válvula que vai ventilar toca o "primeiro toque"
## (sino grave) e, no lugar dela, o assobio de vapor que cresce até estourar; as linhas de descarga tocam
## o "segundo toque" (duas batidas, mais urgente) — o motivo da abertura volta como aviso de perigo
## (docs/02 §5.3). Monstro do mapa (src): o sino soa no lugar do monstro, e só perto do jogador.
func on_warn(m: Dictionary) -> void:
	var at: Vector3 = world._gpos(float(m["x"]), float(m["z"]))
	var c: Color = Color(1.0, 0.7, 0.2) if m.get("color", "") == "amber" else COLORS["danger"]
	var shape: String = m.get("shape", "circle")
	var kind: String = m.get("kind", "line" if shape == "line" else "circle")
	var ms := float(m.get("ms", 1500))
	var from_monster: bool = m.get("src", null) != null
	if from_monster:
		if world.my_pos().distance_to(at) > WARN_SEE:
			return
		Sfx.play("bell_warn_1", at, -6.0, 1.15)
		world.monster_windup(m.get("src"), ms, float(m["yaw"]) if shape in ["cone", "line"] and m.has("yaw") else null)
	else:
		Sfx.warn(kind)
		if kind == "valve":
			Sfx.play("steam_vent", at)
	if kind == "bell2":
		# segundo toque do tutorial: a faixa fica no terreno aberto da Estrada Velha
		warn_strip(float(m["x"]), float(m["z"]), float(m.get("yaw", 0.0)), float(m.get("length", 10.0)), float(m.get("width", 2.0)), ms, c)
		return
	var root: Node3D
	if shape == "line":
		root = warn_line(at, float(m.get("yaw", 0.0)), float(m.get("length", 10.0)), float(m.get("width", 2.0)), ms, c)
	elif shape == "cone":
		root = warn_cone(at, float(m.get("yaw", 0.0)), float(m.get("range", 6.0)), float(m.get("angleDeg", 70.0)), ms, c, kind)
	else:
		var snd := "spell_impact"
		if kind == "valve" or (from_monster and kind.ends_with("burst")):
			snd = ""   # a válvula só assobia; a explosão tem o próprio som
		root = warn_circle(at, float(m.get("radius", 3.0)), ms, c, snd, kind if from_monster else "")
	if m.has("id"):
		var id := str(m["id"])
		_warns[id] = root
		root.tree_exiting.connect(func(): _warns.erase(id))

## O golpe avisado não vai sair (monstro atordoado ou morto no meio do aviso): a marcação some.
func on_warn_cancel(m: Dictionary) -> void:
	var root = _warns.get(str(m.get("id", "")), null)
	if root != null and is_instance_valid(root):
		root.queue_free()
	world.monster_windup_cancel(m.get("src"))

## Eventos das mecânicas dos monstros: explosão ao morrer, puxão, drenagem de mana, eco, investida,
## reforços chamados ou sumindo, troca de pressão.
func on_mech(m: Dictionary) -> void:
	match str(m.get("kind", "")):
		"burst":
			var at: Vector3 = world._gpos(float(m["x"]), float(m["z"]))
			if world.my_pos().distance_to(at) <= WARN_SEE:
				Sfx.play("spell_impact", at, 2.0, 0.7)
		"pull":
			var src = _pos(m.get("eid"))
			for v in m.get("dst", []):
				var vp = _pos(v)
				if src != null and vp != null:
					chain(vp, src, Color(0.6, 0.45, 0.28))
				# fui puxado: o servidor parou meu caminho; o personagem desliza até onde a Draga o deixou
				if v == world.main.ch.get("eid", ""):
					world.halt_prediction()
			if src != null:
				Sfx.play("javelin_throw", src, 0.0, 0.6)
		"drain":
			var a = _pos(m.get("dst"))
			var b = _pos(m.get("eid"))
			if a != null:
				world._float_text(a, "−%d mana" % int(m.get("amount", 0)), Color("#7fb2ff"), 40)
				if b != null:
					projectile(a, b, Color(0.4, 0.6, 1.0), false, 0.35)
		"echo":
			var e = _pos(m.get("eid"))
			var d = _pos(m.get("dst"))
			if e != null:
				waves(e, 1.6, COLORS["debuff"])
				Sfx.play("bell_warn_2", e, -6.0, 1.5)
				if d != null:
					projectile(e, d, COLORS["debuff"], false, 0.22)
		"dash":
			var a2: Vector3 = world._gpos(float(m["x0"]), float(m["z0"]))
			var b2: Vector3 = world._gpos(float(m["x1"]), float(m["z1"]))
			if a2.distance_to(b2) > 0.3:
				line(a2, _yaw_to(a2, b2), a2.distance_to(b2), 1.2, Color(1.0, 0.85, 0.6))
				_sparks(b2, Color(1.0, 0.8, 0.5), 20, 3.5, 0.4, 0.5)
				Sfx.play("swing_heavy", b2, 2.0, 0.7)
		"summon":
			var at2: Vector3 = world._gpos(float(m["x"]), float(m["z"]))
			ring(at2, 4.0, COLORS["danger"], 0.6, 0.4)
			Sfx.play("alarm_pulse", at2, -6.0, 1.2)
		"vanish":
			var p = _pos(m.get("eid"))
			if p != null:
				_sparks(p + Vector3(0, 0.8, 0), COLORS["debuff"], 18, 2.0, 0.6, 0.6)
		"pressure":
			var p2 = _pos(m.get("eid"))
			if p2 != null:
				var high: bool = m.get("phase", "") == "high"
				column(m.get("eid"), Color(1.0, 0.45, 0.3) if high else Color(0.55, 0.75, 1.0), 0.6)
				Sfx.play("steam_vent", p2, -4.0, 1.4 if high else 0.8)

# ---------------- efeitos negativos nos personagens ----------------
const DEBUFF_COLORS := {
	"stun": Color(1.0, 0.85, 0.3),
	"disoriented": Color(0.75, 0.45, 1.0),
	"mired": Color(0.6, 0.45, 0.28),
	"leeched": Color(0.45, 0.65, 1.0),
	"sealed": Color(0.7, 0.75, 0.9),
}

## Marca do efeito negativo presa ao personagem pelo tempo dado (renovada se vier de novo): anel que gira
## acima da cabeça (atordoado, desorientado), na altura do peito (sanguessuga, selado) ou nos pés (atolado).
func on_debuff(m: Dictionary) -> void:
	var eid = m.get("eid")
	if eid == null or not world.entities.has(eid):
		return
	var node: Node3D = world.entities[eid]["node"]
	var id := str(m.get("id", ""))
	var key := "VfxDebuff_" + id
	var old := node.get_node_or_null(key)
	var fresh := old == null
	if old:
		old.name = key + "_velho"
		old.queue_free()
	var inv := 1.0 / maxf(node.scale.x, 0.01)
	var c: Color = DEBUFF_COLORS.get(id, COLORS["debuff"])
	var y := 2.05 if id in ["stun", "disoriented"] else (0.08 if id == "mired" else 1.1)
	var mark := Node3D.new()
	mark.name = key
	node.add_child(mark)
	mark.position = Vector3(0, y * inv, 0)
	var t := TorusMesh.new()
	t.inner_radius = 0.42 if id != "mired" else 0.55
	t.outer_radius = 0.5 if id != "mired" else 0.75
	t.ring_segments = 4
	var ring_mesh := _mesh(t, glow(c, 0.75), Vector3.ZERO, mark)
	ring_mesh.scale = Vector3(inv, inv * 0.25, inv)
	if id in ["stun", "disoriented"]:
		for i in 3:
			var a := TAU * i / 3.0
			_mesh(Gear.sphere(0.08, 6, 3), glow(c, 1.0), Vector3(cos(a) * 0.46, 0.05, sin(a) * 0.46) * inv, mark)
	var secs := maxf(0.2, float(m.get("ms", 2000)) / 1000.0)
	var spin := mark.create_tween().set_loops()
	spin.tween_property(mark, "rotation:y", TAU, 0.9 if id == "disoriented" else 1.6).from(0.0)
	var life := mark.create_tween()
	life.tween_interval(secs)
	life.tween_callback(mark.queue_free)
	if fresh:
		Sfx.play("debuff", node.position, -2.0)

## A Alvorada tirou o efeito negativo: a marca some.
func on_cleanse(m: Dictionary) -> void:
	var eid = m.get("eid")
	if eid == null or not world.entities.has(eid):
		return
	var node: Node3D = world.entities[eid]["node"]
	var mark := node.get_node_or_null("VfxDebuff_" + str(m.get("id", "stun")))
	if mark:
		mark.queue_free()
		_sparks(node.position + Vector3(0, 1.2, 0), COLORS["sacred"], 14, 2.0, 0.8, 0.5)
