extends RefCounted
## Movimento no cliente (ver docs/07-navegacao.md, "Movimento fluido"):
## - Clock: estima o relógio da zona (campo `now` dos snapshots, já com a escala de tempo do
##   servidor) e desenha o mundo um pouco no passado, para sempre haver dois snapshots entre os
##   quais interpolar.
## - Track: amostras (tempo, posição, velocidade) de uma entidade; interpolação de Hermite usa as
##   velocidades enviadas pelo servidor, então curvas e frenagens saem redondas.
## - Predictor: o próprio personagem segue na hora o caminho que o servidor devolveu ao comando
##   `move`, com a mesma aceleração e frenagem de server/src/nav.js (followPath).

static func now_ms() -> float:
	return float(Time.get_ticks_usec()) / 1000.0

class Clock:
	var rate := 1.0           # ms da zona por ms local (escala de tempo do servidor)
	var latest := -1.0        # `now` do snapshot mais recente
	var latest_local := 0.0
	var render := -1.0        # instante da zona que está sendo desenhado
	var delay_ms := 150.0     # atraso de interpolação, em ms locais (1,5 snapshot a 10 Hz)
	var _hist: Array = []     # [[now, local]] para medir a taxa numa janela de ~2 s

	func on_snapshot(now_srv: float) -> void:
		var loc: float = _now()
		if latest >= 0.0 and now_srv + 1.0 < latest:
			# relógio voltou (outra zona/instância): recomeça
			_hist.clear()
			render = -1.0
		latest = now_srv
		latest_local = loc
		_hist.append([now_srv, loc])
		while _hist.size() > 24:
			_hist.pop_front()
		if _hist.size() >= 4:
			var a: Array = _hist[0]
			var b: Array = _hist[_hist.size() - 1]
			var dl: float = float(b[1]) - float(a[1])
			if dl > 250.0:
				rate = clampf((float(b[0]) - float(a[0])) / dl, 0.05, 64.0)

	func target() -> float:
		return latest + (_now() - latest_local) * rate - delay_ms * rate

	## Avança o relógio pelo tempo REAL decorrido (não pelo delta do quadro, que o motor pode
	## suavizar). Retorna quanto tempo da zona (s) passou neste quadro, para a previsão.
	var _last_adv := -1.0
	func advance(_delta: float) -> float:
		var loc := _now()
		var el := 0.0 if _last_adv < 0.0 else clampf(loc - _last_adv, 0.0, 250.0)
		_last_adv = loc
		if latest < 0.0:
			return el * rate / 1000.0
		var tgt := target()
		if render < 0.0 or absf(render - tgt) > 800.0 * rate:
			render = tgt
			return el * rate / 1000.0
		render += el * rate
		# corrige a deriva aos poucos (chegada irregular dos pacotes)
		render += (tgt - render) * clampf(el / 1000.0 * 2.0, 0.0, 1.0)
		return el * rate / 1000.0

	static func _now() -> float:
		return float(Time.get_ticks_usec()) / 1000.0

class Track:
	var t: Array = []   # tempo da zona (ms)
	var p: Array = []   # Vector2
	var v: Array = []   # Vector2 (m/s)

	func push(ts: float, pos: Vector2, vel: Vector2) -> void:
		if not t.is_empty() and ts <= float(t[t.size() - 1]):
			t[t.size() - 1] = ts
			p[p.size() - 1] = pos
			v[v.size() - 1] = vel
			return
		t.append(ts)
		p.append(pos)
		v.append(vel)
		while t.size() > 16:
			t.pop_front()
			p.pop_front()
			v.pop_front()

	func clear_to(ts: float, pos: Vector2) -> void:
		t = [ts]
		p = [pos]
		v = [Vector2.ZERO]

	func last_pos() -> Vector2:
		return p[p.size() - 1] if not p.is_empty() else Vector2.ZERO

	func last_vel() -> Vector2:
		return v[v.size() - 1] if not v.is_empty() else Vector2.ZERO

	## [posição, velocidade] no instante rt da zona.
	func sample(rt: float) -> Array:
		var n := t.size()
		if n == 0:
			return [Vector2.ZERO, Vector2.ZERO]
		if n == 1 or rt <= float(t[0]):
			return [p[0], v[0] if n == 1 else Vector2.ZERO]
		var last := n - 1
		if rt >= float(t[last]):
			# pacote atrasado: extrapola um pouco pela velocidade e depois segura
			var ext := minf((rt - float(t[last])) / 1000.0, 0.2)
			return [(p[last] as Vector2) + (v[last] as Vector2) * ext, v[last]]
		var i := last - 1
		while i > 0 and float(t[i]) > rt:
			i -= 1
		var t0 := float(t[i])
		var t1 := float(t[i + 1])
		var p0: Vector2 = p[i]
		var p1: Vector2 = p[i + 1]
		var span := maxf(t1 - t0, 1.0)
		var s := clampf((rt - t0) / span, 0.0, 1.0)
		if p0.distance_to(p1) > 8.0:
			# teleporte (portal, renascer): sem deslizar pelo mapa
			return [p1 if s > 0.5 else p0, Vector2.ZERO]
		var dt := span / 1000.0
		var v0: Vector2 = (v[i] as Vector2) * dt
		var v1: Vector2 = (v[i + 1] as Vector2) * dt
		# tangentes coerentes com o deslocamento (evita "laçadas" se a velocidade vier atrasada)
		var chord := p1 - p0
		var cl := chord.length()
		v0 = v0.limit_length(cl * 1.6 + 0.02)
		v1 = v1.limit_length(cl * 1.6 + 0.02)
		var s2 := s * s
		var s3 := s2 * s
		var pos := p0 * (2.0 * s3 - 3.0 * s2 + 1.0) + v0 * (s3 - 2.0 * s2 + s) + p1 * (-2.0 * s3 + 3.0 * s2) + v1 * (s3 - s2)
		var vel := (p0 * (6.0 * s2 - 6.0 * s) + v0 * (3.0 * s2 - 4.0 * s + 1.0) + p1 * (-6.0 * s2 + 6.0 * s) + v1 * (3.0 * s2 - 2.0 * s)) / dt
		return [pos, vel]

class Predictor:
	var active := false
	var pos := Vector2.ZERO
	var speed := 0.0
	var dir := Vector2.ZERO
	var path: Array = []      # Vector2
	var max_speed := 5.0
	var accel := 18.0
	var decel := 24.0
	var done_at := -1.0       # ms local em que terminou o caminho
	var bad_snaps := 0

	func start(from: Vector2, cur_vel: Vector2, pts: Array) -> void:
		if not active:
			pos = from
			speed = cur_vel.length()
			dir = cur_vel.normalized() if speed > 0.01 else dir
		path = []
		for q in pts:
			path.append(Vector2(float(q[0]), float(q[1])))
		active = true
		done_at = -1.0
		bad_snaps = 0

	func moving() -> bool:
		return active and (not path.is_empty() or speed > 0.0)

	func remaining() -> float:
		if path.is_empty():
			return 0.0
		var r := pos.distance_to(path[0])
		for i in range(1, path.size()):
			r += (path[i] as Vector2).distance_to(path[i - 1])
		return r

	## Mesmo algoritmo de followPath (server/src/nav.js), em tempo da zona.
	func step(dt: float) -> void:
		if path.is_empty():
			speed = maxf(0.0, speed - decel * dt)
			return
		var rem := remaining()
		if rem < 0.02:
			speed = 0.0
			path.clear()
			return
		var want := minf(max_speed, sqrt(2.0 * decel * rem))
		if speed < want:
			speed = minf(want, speed + accel * dt)
		else:
			speed = maxf(want, speed - decel * dt)
		var left := minf(speed * dt, rem)
		while left > 1e-6 and not path.is_empty():
			var tgt: Vector2 = path[0]
			var d := pos.distance_to(tgt)
			if d < 1e-6:
				path.pop_front()
				continue
			var s := minf(left, d)
			dir = (tgt - pos) / d
			pos += dir * s
			left -= s
			if s >= d - 1e-6:
				path.pop_front()
		if path.is_empty():
			speed = 0.0
