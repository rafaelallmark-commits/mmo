extends Node3D
## Efeitos visuais de combate, a partir dos eventos do servidor (cast, hit, heal, buff, shield,
## ground, warn): cortes, projéteis, leques, linhas, áreas, curas, escudos, marcações de perigo.
## Tudo com malhas simples, materiais aditivos e tweens curtos (não interfere na simulação).

const Gear := preload("res://scripts/gear.gd")

var world # world.gd
var _mats := {}

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

## Marcação de perigo no chão (o chefe avisa antes de atacar): círculo vermelho que enche.
func warn_circle(at: Vector3, radius: float, ms: float, c := COLORS["danger"]) -> void:
	var edge := TorusMesh.new()
	edge.inner_radius = 0.94
	edge.outer_radius = 1.0
	edge.rings = 48
	edge.ring_segments = 4
	var e := _mesh(edge, glow(c, 0.9), at + Vector3(0, 0.1, 0))
	e.scale = Vector3(radius, 0.05 * radius, radius)
	var fill := _mesh(Gear.cyl(1.0, 1.0, 0.02, 40), glow(c, 0.3), at + Vector3(0, 0.08, 0))
	fill.scale = Vector3(0.05, 1, 0.05)
	var tw := create_tween()
	tw.tween_property(fill, "scale", Vector3(radius, 1, radius), ms / 1000.0)
	tw.tween_callback(func():
		impact(at, c, true)
		ring(at, radius, c, 0.35))
	tw.tween_property(fill.material_override, "albedo_color:a", 0.0, 0.2)
	tw.parallel().tween_property(e.material_override, "albedo_color:a", 0.0, 0.2)
	tw.tween_callback(func():
		fill.queue_free()
		e.queue_free())

## Marcação de perigo em linha (investida, jato).
func warn_line(at: Vector3, yaw: float, length: float, width: float, ms: float, c := COLORS["danger"]) -> void:
	var mi := _mesh(Gear.box(Vector3(width, 0.03, length)), glow(c, 0.35), at + Vector3(sin(yaw), 0, cos(yaw)) * (length / 2.0) + Vector3(0, 0.1, 0))
	mi.rotation.y = yaw
	var tw := create_tween()
	tw.tween_property(mi.material_override, "albedo_color:a", 0.65, ms / 1000.0)
	tw.tween_callback(func(): line(at, yaw, length, width, c))
	tw.tween_property(mi.material_override, "albedo_color:a", 0.0, 0.15)
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
	match kind:
		"strike", "aoe_strike":
			if tgt != null and src.distance_to(tgt) > 3.5:
				projectile(src, tgt, c, dtype == "phys", 0.25)
			elif tgt != null:
				slash(src.lerp(tgt, 0.6), yaw, c, 1.2)
			if kind == "aoe_strike":
				ring(src, float(eff.get("radius", 3.0)), COLORS["sacred"])
		"spell":
			if tgt != null:
				projectile(src, tgt, c, false, 0.3)
		"cone_strike":
			cone(src, yaw, reach, float(eff.get("angleDeg", 90)), c)
			if int(eff.get("projectiles", 0)) > 0:
				var half := deg_to_rad(float(eff.get("angleDeg", 60))) / 2.0
				for i in int(eff["projectiles"]):
					var a := yaw - half + 2.0 * half * (i + 0.5) / int(eff["projectiles"])
					projectile(src, src + Vector3(sin(a), 0, cos(a)) * reach, c, true, 0.25)
		"line_strike":
			line(src, yaw, reach, float(eff.get("width", 1.5)), c)
		"charge", "dash":
			_sparks(src, Color(0.85, 0.75, 0.6), 16, 2.0, 0.4, 0.6)
			if kind == "charge" and tgt != null:
				line(src, yaw, src.distance_to(tgt), 0.8, c)
		"pull":
			if tgt != null:
				line(src, yaw, src.distance_to(tgt), 0.15, COLORS["debuff"])
		"ground_aoe", "aoe_spell", "delayed_aoe":
			var at = point if point != null else (tgt if tgt != null else src)
			if kind == "delayed_aoe":
				warn_circle(at, float(eff.get("radius", 4.0)), float(eff.get("delayMs", 2000)), COLORS["magic"])
			else:
				projectile(src, at, c, false, 0.3, func():
					impact(at, c, true)
					ring(at, float(eff.get("radius", 3.0)), c))
		"heal", "party_heal":
			column(m.get("target") if m.get("target") != null else m.get("eid"), COLORS["heal"])
			if kind == "party_heal":
				ring(src, 8.0, COLORS["heal"], 0.6)
		"buff_self", "party_buff", "aura_damage":
			column(m.get("eid"), COLORS["buff"], 0.5)
			ring(src, 3.0 if kind != "party_buff" else 8.0, COLORS["buff"])
		"debuff":
			if tgt != null:
				projectile(src, tgt, COLORS["debuff"], false, 0.25, func(): swirl(m.get("target"), COLORS["debuff"]))
		"taunt_area":
			ring(src, float(eff.get("radius", 6.0)), COLORS["danger"], 0.5, 0.4)
		"guard_ally", "shield_ally", "shield_self":
			var who = m.get("target") if m.get("target") != null else m.get("eid")
			var wp = _pos(who)
			if wp != null and kind == "guard_ally":
				line(src, _yaw_to(src, wp), src.distance_to(wp), 0.12, COLORS["shield"])
		"resurrect":
			column(m.get("target"), COLORS["sacred"], 1.2)

## Golpe recebido: faísca no alvo; ataques básicos à distância viram flecha ou bola.
func on_hit(m: Dictionary, src_family: String) -> void:
	var dst = _pos(m.get("dst"))
	if dst == null or m.get("skill", null) == "dot":
		return
	var src = _pos(m.get("src"))
	var c: Color = COLORS["magic"] if m.get("magic", false) else COLORS["phys"]
	if m.get("skill", null) == null and src != null and src_family in ["bow", "javelin", "staff_2h", "wand", "scepter", "staff"]:
		var arrow: bool = src_family in ["bow", "javelin"]
		var miss: bool = m.get("miss", false)
		projectile(src, dst, c if not arrow else Color(0.95, 0.9, 0.75), arrow, 0.18, func():
			if not miss:
				impact(dst, c, m.get("crit", false)))
		return
	if m.get("miss", false):
		return
	impact(dst, c, m.get("crit", false))
	if src != null and m.get("skill", null) == null and src.distance_to(dst) < 4.0:
		slash(src.lerp(dst, 0.65), _yaw_to(src, dst), Color(1, 1, 1), 0.9)

func on_heal(m: Dictionary) -> void:
	column(m.get("dst"), COLORS["heal"], 0.6)

func on_buff(m: Dictionary) -> void:
	column(m.get("eid"), COLORS["buff"], 0.5)

func on_shield(m: Dictionary) -> void:
	bubble(m.get("eid"), COLORS["shield"], float(m.get("ms", 4000)))

## Aviso do servidor (chefes): { shape: circle|line, x, z, radius | yaw, length, width, ms }
func on_warn(m: Dictionary) -> void:
	var at: Vector3 = world._gpos(float(m["x"]), float(m["z"]))
	var c: Color = Color(1.0, 0.7, 0.2) if m.get("color", "") == "amber" else COLORS["danger"]
	if m.get("shape", "circle") == "line":
		warn_line(at, float(m.get("yaw", 0.0)), float(m.get("length", 10.0)), float(m.get("width", 2.0)), float(m.get("ms", 1500)), c)
	else:
		warn_circle(at, float(m.get("radius", 3.0)), float(m.get("ms", 1500)), c)
