extends PanelContainer
## Mapa do lugar onde você está (tecla M, com o Mapa da Estrada Velha na bolsa; D166). Visto de cima, com o
## norte para cima (z = 0 no alto, como os mapas de docs/06): estradas, áreas bloqueadas (água em azul),
## casas, portais com o destino e o nível, NPCs com nome, o posto de guarda, você (seta na direção em que
## olha) e os membros do grupo no mesmo mapa. Tudo vem das definições do mapa (data/maps.json) e da
## posição atual; redesenha 5 vezes por segundo enquanto aberto.

const Theme_ = preload("res://scripts/ui_theme.gd")

const C_GROUND := Color("#4a5a36")
const C_GROUND_EDGE := Color("#2a2418")
const C_ROAD := Color("#c9a86a")
const C_WATER := Color("#3d6a8a")
const C_DRY := Color("#5e4a3a")
const C_RUIN := Color("#7a6e64")
const C_HOUSE := Color("#9a7a5a")
const C_POST := Color("#9fe3d8")
const C_PORTAL := Color("#ffb347")
const C_NPC := Color("#ffe39a")
const C_PARTY := Color("#7fc8ff")
const C_ME := Color("#ffe04a")

var main
var title: Label
var canvas: Control
var _acc := 0.0

func _ready() -> void:
	add_theme_stylebox_override("panel", Theme_.panel_style(0.96))
	# centrado na tela (offsets em volta do centro: o painel nasce já dentro da árvore)
	set_anchors_preset(Control.PRESET_CENTER)
	offset_left = -390.0
	offset_top = -290.0
	offset_right = 390.0
	offset_bottom = 290.0
	custom_minimum_size = Vector2(780, 580)
	var v := VBoxContainer.new()
	add_child(v)
	var top := HBoxContainer.new()
	v.add_child(top)
	title = Label.new()
	title.add_theme_color_override("font_color", Theme_.AMBER)
	title.add_theme_font_size_override("font_size", 18)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title)
	var close := Button.new()
	close.text = "Fechar (M)"
	close.focus_mode = Control.FOCUS_NONE
	close.pressed.connect(func(): visible = false)
	top.add_child(close)
	canvas = Control.new()
	canvas.custom_minimum_size = Vector2(760, 490)
	canvas.clip_contents = true
	canvas.draw.connect(_draw_map)
	v.add_child(canvas)
	var legend := Label.new()
	legend.text = "▲ você  ·  ● grupo  ·  ◎ posto de guarda (zona segura)  ·  ◆ portal  ·  • NPC  ·  azul: água  ·  marrom: área bloqueada"
	legend.add_theme_font_size_override("font_size", 11)
	legend.add_theme_color_override("font_color", Theme_.MUTED)
	v.add_child(legend)
	visible = false

func open() -> void:
	visible = true
	refresh()

func refresh() -> void:
	var m: Dictionary = main.map_def()
	var lr = m.get("levelRange", null)
	var lv := ""
	if lr is Array and lr.size() == 2 and not m.get("city", false):
		lv = "  ·  níveis %d–%d" % [int(lr[0]), int(lr[1])]
	title.text = "%s%s" % [m.get("name", "Mapa"), lv]
	canvas.queue_redraw()

func _process(delta: float) -> void:
	if not visible:
		return
	_acc += delta
	if _acc >= 0.2:
		_acc = 0.0
		canvas.queue_redraw()

# ---------------- desenho ----------------
var _s := 1.0
var _off := Vector2.ZERO
var _placed: Array = []  # retângulos dos rótulos já escritos neste quadro (para não sobrepor)

func _p(x, z) -> Vector2:
	return _off + Vector2(float(x), float(z)) * _s

func _text(at: Vector2, text: String, color: Color, size := 12, center := true) -> void:
	var font := canvas.get_theme_default_font()
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var pos := at - Vector2(w / 2.0 if center else 0.0, -size * 0.35)
	pos.x = clampf(pos.x, 2.0, canvas.size.x - w - 2.0)
	canvas.draw_string_outline(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, 4, Color(0.08, 0.06, 0.05, 0.9))
	canvas.draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, color)
	_placed.append(Rect2(pos - Vector2(0, size), Vector2(w, size * 1.3)))

## Rótulo perto de um ponto: acima, abaixo, à direita ou à esquerda — o primeiro lugar sem outro rótulo.
func _label_at(p: Vector2, text: String, color: Color, size := 12, gap := 9.0) -> void:
	var font := canvas.get_theme_default_font()
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	var tries := [Vector2(0, -gap), Vector2(0, gap + size * 0.6), Vector2(w / 2.0 + gap, 0), Vector2(-w / 2.0 - gap, 0), Vector2(0, -gap - size * 1.2), Vector2(0, gap + size * 1.8)]
	var best: Vector2 = tries[0]
	for off in tries:
		var c: Vector2 = p + off
		var r := Rect2(Vector2(c.x - w / 2.0, c.y + size * 0.35 - size), Vector2(w, size * 1.3))
		if not _placed.any(func(o): return (o as Rect2).intersects(r)):
			best = off
			break
	_text(p + best, text, color, size)

static func _is_water(name: String) -> bool:
	for k in ["Lagoa", "água", "Cisterna"]:
		if k in name:
			return true
	return false

func _draw_map() -> void:
	if main == null:
		return
	var m: Dictionary = main.map_def()
	var size: Array = m.get("size", [160, 100])
	var w := float(size[0])
	var h := float(size[1])
	var area := canvas.size
	_s = minf((area.x - 16.0) / w, (area.y - 16.0) / h)
	_off = (area - Vector2(w, h) * _s) / 2.0
	_placed.clear()
	var full := Rect2(_off, Vector2(w, h) * _s)
	canvas.draw_rect(full, C_GROUND)
	# estradas (largura de verdade, no mínimo 2 px)
	for r in m.get("roads", []):
		var pts := PackedVector2Array()
		for q in r.get("pts", []):
			pts.append(_p(q[0], q[1]))
		if pts.size() >= 2:
			canvas.draw_polyline(pts, C_ROAD, maxf(2.0, float(r.get("w", 3)) * _s), true)
	# casas das cidades (90°/270° trocam largura e fundo, como no servidor)
	for st in m.get("structures", []):
		var side: bool = int(st.get("rot", 0)) in [90, 270]
		var hw := (float(st["d"]) if side else float(st["w"])) / 2.0
		var hd := (float(st["w"]) if side else float(st["d"])) / 2.0
		var rr := Rect2(_p(float(st["x"]) - hw, float(st["z"]) - hd), Vector2(hw * 2.0, hd * 2.0) * _s)
		canvas.draw_rect(rr, C_HOUSE)
		canvas.draw_rect(rr, C_GROUND_EDGE, false, 1.0)
	# áreas bloqueadas: água, leitos secos, ruínas e construções
	for b in m.get("blocked", []):
		var nm := str(b.get("name", ""))
		var rect := Rect2(_p(b["x0"], b["z0"]), Vector2(float(b["x1"]) - float(b["x0"]), float(b["z1"]) - float(b["z0"])) * _s)
		var col := C_WATER if _is_water(nm) else (C_DRY if "Leito" in nm else C_RUIN)
		canvas.draw_rect(rect, col)
		canvas.draw_rect(rect, C_GROUND_EDGE, false, 1.5)
		if rect.size.x > 40.0 or rect.size.y > 40.0:
			_text(rect.get_center(), nm, Color("#efe6d6"), 11)
	canvas.draw_rect(full, C_GROUND_EDGE, false, 2.0)
	# rótulos por ordem de importância (os primeiros escolhem lugar antes): você, grupo, posto, portais, NPCs
	var labels := []
	# posto de guarda: círculo da zona segura (nas cidades a cidade inteira é segura: só o nome)
	var gp: Dictionary = m.get("guardPost", {})
	if not gp.is_empty():
		var gc := _p(gp["x"], gp["z"])
		var sr := float(gp.get("safeRadius", 0))
		var small_post := sr > 0.0 and sr < 30.0
		if small_post:
			canvas.draw_circle(gc, sr * _s, Color(C_POST, 0.16))
			canvas.draw_arc(gc, sr * _s, 0.0, TAU, 48, C_POST, 1.5, true)
		canvas.draw_circle(gc, 4.0, C_POST)
		labels.append([2, gc + Vector2(0, -(sr * _s if small_post else 0.0) + 4.0), "◎ %s" % gp.get("name", "Posto"), C_POST, 13])
	# portais com o destino e o nível mínimo
	for pt in m.get("portals", []):
		var pc := _p(pt["x"], pt["z"])
		_diamond(pc, 6.0, C_PORTAL)
		var dest: Dictionary = main.defs.get("maps", {}).get(pt.get("to", ""), {})
		var lvl := int(pt.get("minLevel", 1))
		labels.append([3, pc, "→ %s%s" % [dest.get("name", pt.get("to", "?")), (" (nível %d)" % lvl) if lvl > 1 else ""], C_PORTAL, 12])
	# NPCs com nome (sem o "o Condutor", "cartógrafa"...: só até a vírgula)
	for n in m.get("npcs", []):
		var nc := _p(n["x"], n["z"])
		canvas.draw_circle(nc, 3.5, C_NPC)
		labels.append([4, nc, str(n.get("name", "")).get_slice(",", 0), C_NPC, 11])
	# grupo: quem está neste mapa (posição do painel do grupo, atualizada a cada segundo)
	if main.party != null:
		var me_id := int(main.ch.get("id", -1))
		for mem in main.party.get("members", []):
			if int(mem.get("charId", -1)) == me_id or not mem.get("online", false) or str(mem.get("mapId", "")) != main.map_id or not mem.has("x"):
				continue
			var mc := _p(mem["x"], mem["z"])
			canvas.draw_circle(mc, 5.0, C_PARTY)
			canvas.draw_arc(mc, 5.0, 0.0, TAU, 16, C_GROUND_EDGE, 1.0)
			labels.append([1, mc, str(mem.get("name", "")), C_PARTY, 12])
	# você: seta na direção em que o personagem olha
	if main.world != null and not main.world.me().is_empty():
		var wp: Vector3 = main.world.my_pos()
		var yaw: float = float(main.world.me().get("yaw", 0.0))
		var dir := Vector2(sin(yaw), cos(yaw))
		var c := _p(wp.x, wp.z)
		var side := Vector2(-dir.y, dir.x)
		var tri := PackedVector2Array([c + dir * 11.0, c - dir * 6.0 + side * 6.5, c - dir * 3.0, c - dir * 6.0 - side * 6.5])
		canvas.draw_colored_polygon(tri, C_ME)
		canvas.draw_polyline(PackedVector2Array([tri[0], tri[1], tri[2], tri[3], tri[0]]), C_GROUND_EDGE, 1.5, true)
		labels.append([0, c, "você", C_ME, 12])
	labels.sort_custom(func(a, b): return int(a[0]) < int(b[0]))
	for l in labels:
		_label_at(l[1], l[2], l[3], l[4], 13.0 if int(l[0]) == 0 else 9.0)

func _diamond(c: Vector2, r: float, col: Color) -> void:
	var pts := PackedVector2Array([c + Vector2(0, -r), c + Vector2(r, 0), c + Vector2(0, r), c + Vector2(-r, 0)])
	canvas.draw_colored_polygon(pts, col)
	canvas.draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[0]]), C_GROUND_EDGE, 1.0, true)
