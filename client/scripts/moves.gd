extends RefCounted
## Golpes e movimentos das habilidades dos personagens VRM (animação procedural; quem toca é vrm_character.gd,
## docs/07-navegacao.md §7.6). Cada movimento é uma linha do tempo curta (0,4 a 0,8 s) de chaves com "t" (0..1).
##
## Canais de uma chave (o que não aparece segue a curva entre as chaves vizinhas; antes da primeira e depois
## da última, a postura base daquele instante — parado, guarda, andando ou correndo):
##  "w": arma da mão principal [ponto de pega, eixo (para a ponta), gume, polo do cotovelo], em metros a partir do
##       centro dos ombros do corpo de referência (braço de 0,49 m; +Z à frente, +X à esquerda), como em WPOSES.
##       Gume null = natural: os nós dos dedos seguem o antebraço e o eixo fica no arco que o punho alcança
##       naquela empunhadura (vrm_character.gd, _natural_edge) — nenhuma chave entorta o pulso;
##  "o": mão livre [ponto, palma (para onde fica virada), polo do cotovelo, dica para os dedos (opcional)];
##  "oc": dedos da mão livre (0 aberta, 1 punho); "pt": indicador esticado (apontar);
##  "g": segunda mão no cabo (0–1, armas de duas mãos); "two": onde ela pega (metros ao longo da arma a partir da
##       mão principal); "sl": ponto do cabo na mão principal (lança, cajado);
##  "dr": corda do arco puxada (metros); −1 solta a corda (a mão sai dela);
##  "yaw", "lean", "roll", "head", "hip": giro do tronco (+ para a esquerda), inclinação para a frente, para o lado
##       (+ para a esquerda), cabeça (negativo ergue o queixo) e giro da bacia (rad);
##  "cr": agacha (m); "fz"/"fx": leva o quadril para a frente/para a esquerda com os pés plantados (m);
##       "hop": pulo (m; os pés sobem junto); "lf"/"rf": passo do pé esquerdo/direito [x, ergue, z] (m);
##       "spin": giro do corpo inteiro (rad; termina numa volta inteira);
##  "stop": a curva para nesta chave (preparo, pausa antes do golpe).
## Campos do movimento: "dur" (s), "hold" (conjuração com tempo: segura neste instante até a habilidade sair),
## "legs" (peso das pernas parado; 0 = só tronco e braços), "force_legs" (as pernas são da ação mesmo deslizando:
## investida, salto), "lock" (o corpo não vira para onde desliza), "arrow" [nocar, soltar] (flecha na corda),
## "throw" [soltar, volta] (a azagaia sai da mão), "guard" (entra em guarda), "face" (expressão).

## Canais que mexem nos braços (o resto é do corpo e das pernas).
const ARM_CH := ["wp", "wa", "we", "wpo", "ea", "wik", "sl", "g", "two", "op", "opa", "opo", "ofi", "ow", "oc", "pt", "dr", "dw"]
const VEC_CH := ["wp", "wa", "we", "wpo", "op", "opa", "opo", "ofi", "lf", "rf"]
## A mão livre fica parada no alvo enquanto o peso dela sobe e desce (o alvo não desliza da base).
const HOLD_START := ["op", "opa", "opo", "ofi"]
const HOLD_END := ["op", "opa", "opo", "ofi", "spin"]

static func v(x: float, y: float, z: float) -> Vector3:
	return Vector3(x, y, z)

static func k(t: float, ch: Dictionary) -> Dictionary:
	ch["t"] = t
	return ch

## Arma: ponto de pega, eixo, gume (null = natural) e polo do cotovelo.
static func w(p: Vector3, a: Vector3, e, pole: Vector3) -> Array:
	return [p, a.normalized(), (e as Vector3).normalized() if e is Vector3 else null, pole.normalized()]

## Mão livre: ponto, palma, polo do cotovelo e dica dos dedos.
static func o(p: Vector3, palm: Vector3, pole: Vector3, fingers := Vector3.ZERO) -> Array:
	return [p, palm.normalized(), pole.normalized(), fingers]

## Família da arma → categoria de empunhadura dos movimentos.
static func category(fam: String) -> String:
	match fam:
		"axe_2h", "sword_2h":
			return "two"
		"spear_2h":
			return "spear"
		"staff_2h":
			return "staff"
		"wand", "scepter":
			return "wand"
		"bow":
			return "bow"
		"javelin":
			return "javelin"
		"claw":
			return "claw"
	return "one"  # espada, machado e martelo de uma mão, mãos vazias

# ---------------- montagem e avaliação ----------------
static func _put(tr: Dictionary, ch: String, t: float, val, stop: bool) -> void:
	if val is int:
		val = float(val)
	if not tr.has(ch):
		tr[ch] = []
	(tr[ch] as Array).append([t, val, stop])

## Separa as chaves em canais (uma curva por canal), com a base nas pontas.
static func compile(m: Dictionary) -> Dictionary:
	var tr := {}
	for key in m.get("keys", []):
		var t := float(key["t"])
		var st := bool(key.get("stop", false))
		for ch in key.keys():
			match ch:
				"t", "stop":
					pass
				"w":
					var wv: Array = key["w"]
					_put(tr, "wp", t, wv[0], st)
					_put(tr, "wa", t, wv[1], st)
					if wv[2] != null:
						_put(tr, "we", t, wv[2], st)
						_put(tr, "ea", t, 0.0, st)
					else:
						_put(tr, "ea", t, 1.0, st)
					_put(tr, "wpo", t, wv[3], st)
					_put(tr, "wik", t, 1.0, st)
				"o":
					var ov: Array = key["o"]
					_put(tr, "op", t, ov[0], st)
					_put(tr, "opa", t, ov[1], st)
					_put(tr, "opo", t, ov[2], st)
					_put(tr, "ofi", t, ov[3] if ov.size() > 3 else Vector3.ZERO, st)
					_put(tr, "ow", t, 1.0, st)
				"dr":
					var d := float(key["dr"])
					if d >= 0.0:
						_put(tr, "dr", t, d, st)
						_put(tr, "dw", t, 1.0, st)
					else:
						_put(tr, "dw", t, 0.0, st)
				_:
					_put(tr, ch, t, key[ch], st)
	# gume natural: a troca entre o gume ajustado da postura e o natural acontece nos primeiros e nos últimos 7% do
	# movimento, com a mão ainda perto da postura (onde os dois quase coincidem); no caminho até o golpe vale o natural
	if tr.has("ea"):
		var ea: Array = tr["ea"]
		ea.sort_custom(func(x, y): return float(x[0]) < float(y[0]))
		if float(ea[0][1]) > 0.5 and float(ea[0][0]) > 0.12:
			ea.push_front([0.07, 1.0, false])
		if float(ea[ea.size() - 1][1]) > 0.5 and float(ea[ea.size() - 1][0]) < 0.88:
			ea.push_back([0.93, 1.0, false])
	var body_ch := []
	var arm_ch := []
	for ch in tr.keys():
		var lst: Array = tr[ch]
		lst.sort_custom(func(x, y): return float(x[0]) < float(y[0]))
		if float(lst[0][0]) > 0.001:
			lst.push_front([0.0, lst[0][1] if ch in HOLD_START else null, true])
		if float(lst[lst.size() - 1][0]) < 0.999:
			lst.push_back([1.0, lst[lst.size() - 1][1] if ch in HOLD_END else null, true])
		if ch in ARM_CH:
			arm_ch.append(ch)
		else:
			body_ch.append(ch)
	var out := m.duplicate()
	out["tracks"] = tr
	out["body_ch"] = body_ch
	out["arm_ch"] = arm_ch
	return out

## Valor de um canal no instante u: curva de Hermite que passa pelas chaves sem parar (o golpe atravessa o impacto
## em velocidade), com tangente zero nas pontas, nas chaves com "stop" e onde a curva muda de sentido — sem passar
## do ponto (tangentes monótonas, componente a componente). Valor null = base.
static func sample(track: Array, u: float, base):
	var n := track.size()
	var i := 0
	while i < n - 2 and u > float(track[i + 1][0]):
		i += 1
	var t0 := float(track[i][0])
	var t1 := float(track[i + 1][0])
	var v0 = _val(track, i, base)
	var v1 = _val(track, i + 1, base)
	var span := maxf(t1 - t0, 1e-4)
	var s := clampf((u - t0) / span, 0.0, 1.0)
	var m0 = _tangent(track, i, base) * span
	var m1 = _tangent(track, i + 1, base) * span
	var s2 := s * s
	var s3 := s2 * s
	return v0 * (2.0 * s3 - 3.0 * s2 + 1.0) + m0 * (s3 - 2.0 * s2 + s) + v1 * (-2.0 * s3 + 3.0 * s2) + m1 * (s3 - s2)

static func _val(track: Array, j: int, base):
	return track[j][1] if track[j][1] != null else base

## Tangente (por unidade de tempo) numa chave: média das inclinações vizinhas, zerada onde a curva vira (ou fica
## parada) e limitada a três vezes a menor das duas (Fritsch–Carlson).
static func _tangent(track: Array, j: int, base):
	var v = _val(track, j, base)
	if j == 0 or j == track.size() - 1 or bool(track[j][2]):
		return v * 0.0
	var dp := maxf(float(track[j][0]) - float(track[j - 1][0]), 1e-4)
	var dn := maxf(float(track[j + 1][0]) - float(track[j][0]), 1e-4)
	var sp = (v - _val(track, j - 1, base)) / dp
	var sn = (_val(track, j + 1, base) - v) / dn
	if v is float:
		return _mono(sp, sn)
	return Vector3(_mono(sp.x, sn.x), _mono(sp.y, sn.y), _mono(sp.z, sn.z))

static func _mono(sp: float, sn: float) -> float:
	if sp * sn <= 0.0:
		return 0.0
	var m := (sp + sn) * 0.5
	var lim := 3.0 * minf(absf(sp), absf(sn))
	return clampf(m, -lim, lim)

## Canais do corpo (arms = false) ou dos braços (arms = true) no instante u, com a base de cada canal.
static func eval(c: Dictionary, u: float, base: Dictionary, arms: bool) -> Dictionary:
	var out := {}
	var tr: Dictionary = c["tracks"]
	for ch in (c["arm_ch"] if arms else c["body_ch"]):
		out[ch] = sample(tr[ch], u, base.get(ch, Vector3.ZERO if ch in VEC_CH else 0.0))
	return out

# ---------------- pés e passos (reaproveitados) ----------------
## Passo de um pé ([x, z] em m) que sai em t0, planta em t1 e volta entre t2 e o fim, sempre erguendo o pé.
static func _step(keys: Array, side: String, x: float, z: float, t0: float, t1: float, t2: float) -> void:
	var ch := side + "f"
	keys.append(k(t0, {ch: v(x * 0.5, 0.07, z * 0.5)}))
	keys.append(k(t1, {ch: v(x, 0.0, z)}))
	keys.append(k(t2, {ch: v(x, 0.0, z)}))
	keys.append(k(t2 + (1.0 - t2) * 0.55, {ch: v(x * 0.5, 0.06, z * 0.5)}))

## Base mais larga (pés afastados para os lados), com os pés erguidos ao sair e ao voltar.
static func _wide(keys: Array, t1: float, t2: float, width := 0.06) -> void:
	_step(keys, "l", width, 0.04, t1 * 0.5, t1, t2)
	_step(keys, "r", -width, -0.03, t1 * 0.5 + 0.02, t1 + 0.02, t2)

## Junta chaves de mesmo instante (passos e pés com o resto) — a avaliação aceita chaves repetidas por canal,
## mas a ordem tem que ser crescente; compile ordena.
static func _m(name: String, dur: float, keys: Array, extra := {}) -> Dictionary:
	var m := {"name": name, "dur": dur, "keys": keys, "legs": 1.0, "guard": true}
	for key in extra.keys():
		m[key] = extra[key]
	return m

# ---------------- ataque básico ----------------
static func basic_count(cat: String) -> int:
	return 4 if cat == "spear" else 3

## Ataque básico: variante da categoria (corpo a corpo: diagonal, horizontal e de cima; lança: estocada,
## varrida, de cima e diagonal; arco: três puxadas até o rosto; azagaia: três arremessos; focos: três disparos).
static func basic(cat: String, variant: int) -> Dictionary:
	match cat:
		"two":
			return _two_basic(variant)
		"spear":
			return _spear_basic(variant)
		"staff":
			return _staff_basic(variant)
		"wand":
			return _wand_basic(variant)
		"bow":
			return _bow_basic(variant)
		"javelin":
			return _javelin_basic(variant)
		"claw":
			return _claw_basic(variant)
	return _one_basic(variant)

## Golpe crítico: o mesmo golpe com um floreio maior — corpo a corpo, azagaia e focos giram o corpo inteiro
## (com um pulinho) antes de golpear; o arco puxa mais fundo, inclina para trás e recua no disparo.
static func critical(m: Dictionary, cat: String) -> Dictionary:
	var out := m.duplicate(true)
	var keys: Array = []
	if cat == "bow":
		out["dur"] = minf(0.8, float(m["dur"]) * 1.3)
		for key in m["keys"]:
			var kk: Dictionary = (key as Dictionary).duplicate(true)
			if kk.has("dr") and float(kk["dr"]) > 0.3:
				kk["dr"] = float(kk["dr"]) * 1.15
				kk["lean"] = float(kk.get("lean", 0.0)) - 0.1
				kk["cr"] = float(kk.get("cr", 0.0)) + 0.06
			if kk.has("dr") and float(kk["dr"]) < 0.0:
				kk["hop"] = 0.045
				kk["lean"] = float(kk.get("lean", 0.0)) - 0.16
			kk["yaw"] = float(kk.get("yaw", 0.0)) * 1.1
			keys.append(kk)
		out["keys"] = keys
		if out.has("arrow"):
			out["arrow"] = [float(m["arrow"][0]), float(m["arrow"][1])]
		out["name"] = str(m["name"]) + "_critico"
		return out
	# giro: o golpe original vai para o fim (0,34..1) e o começo é uma volta inteira com pulo
	var a := 0.34
	out["dur"] = minf(0.8, float(m["dur"]) * 1.45)
	keys.append(k(0.04, {"spin": 0.0, "cr": 0.07, "stop": true}))
	keys.append(k(0.19, {"spin": PI, "hop": 0.07, "cr": 0.0}))
	keys.append(k(a, {"spin": TAU, "hop": 0.0, "cr": 0.09, "stop": true}))
	keys.append(k(1.0, {"spin": TAU}))
	for key in m["keys"]:
		var kk: Dictionary = (key as Dictionary).duplicate(true)
		kk["t"] = a + (1.0 - a) * float(kk["t"])
		for ch in ["yaw", "lean"]:
			if kk.has(ch):
				kk[ch] = float(kk[ch]) * 1.3
		kk["cr"] = float(kk.get("cr", 0.0)) + 0.05
		kk.erase("spin")
		kk.erase("hop")
		keys.append(kk)
	out["keys"] = keys
	for f in ["arrow", "throw"]:
		if m.has(f):
			out[f] = [a + (1.0 - a) * float(m[f][0]), a + (1.0 - a) * float(m[f][1])]
	if m.has("release"):
		out["release"] = a + (1.0 - a) * float(m["release"])
	out["name"] = str(m["name"]) + "_critico"
	return out

static func _one_basic(variant: int) -> Dictionary:
	match variant % 3:
		1:  # horizontal: da direita, varrendo a frente até a esquerda
			return _m("horizontal", 0.5, [
				k(0.3, {"w": w(v(-0.42, -0.05, 0.02), v(-0.4, 0.1, -0.91), null, v(-0.4, -1.0, -0.3)), "yaw": -0.6, "hip": -0.15, "cr": 0.03, "stop": true}),
				k(0.47, {"w": w(v(-0.1, -0.1, 0.47), v(0.88, 0.05, 0.47), null, v(-0.6, -1.0, 0.0)), "yaw": 0.0, "hip": 0.0, "lean": 0.1, "cr": 0.05}),
				k(0.63, {"w": w(v(0.24, -0.12, 0.3), v(0.35, 0.0, -0.94), null, v(-0.5, -1.0, 0.3)), "yaw": 0.6, "hip": 0.15, "lean": 0.08, "cr": 0.04}),
			])
		2:  # de cima: arma no alto da cabeça e desce reto à frente
			return _m("de_cima", 0.5, [
				k(0.3, {"w": w(v(-0.22, 0.36, -0.06), v(-0.05, 0.3, -0.95), null, v(-1.0, 0.3, 0.2)), "yaw": -0.15, "lean": -0.12, "head": -0.08, "stop": true}),
				k(0.47, {"w": w(v(-0.08, 0.0, 0.46), v(0.05, -0.85, 0.52), null, v(-0.9, -0.5, 0.0)), "yaw": 0.05, "lean": 0.22, "cr": 0.06}),
				k(0.63, {"w": w(v(-0.05, -0.3, 0.36), v(0.05, -0.95, 0.15), null, v(-0.8, -0.8, 0.1)), "lean": 0.26, "cr": 0.07}),
			])
	# diagonal: do alto do ombro direito para baixo e para a esquerda
	return _m("diagonal", 0.5, [
		k(0.3, {"w": w(v(-0.22, 0.2, -0.04), v(-0.3, 0.6, -0.74), null, v(-1.0, -0.2, 0.1)), "yaw": -0.5, "hip": -0.15, "lean": -0.04, "cr": 0.02, "stop": true}),
		k(0.47, {"w": w(v(-0.06, -0.08, 0.46), v(0.55, -0.7, 0.45), null, v(-1.0, -0.6, 0.0)), "yaw": 0.25, "hip": 0.1, "lean": 0.15, "cr": 0.05}),
		k(0.63, {"w": w(v(0.08, -0.34, 0.32), v(0.5, -0.82, 0.28), null, v(-0.8, -0.8, 0.2)), "yaw": 0.45, "hip": 0.15, "lean": 0.2, "cr": 0.05}),
	])

static func _claw_basic(variant: int) -> Dictionary:
	match variant % 3:
		1:  # gancho: o punho vem de fora, pela direita, e cruza a frente
			return _m("gancho", 0.48, [
				k(0.3, {"w": w(v(-0.4, -0.04, 0.1), v(-0.3, 0.0, 0.95), null, v(-0.4, -1.0, -0.3)), "yaw": -0.6, "hip": -0.15, "cr": 0.03, "stop": true}),
				k(0.46, {"w": w(v(-0.02, -0.05, 0.44), v(0.7, 0.0, 0.7), null, v(-0.9, -0.3, 0.0)), "yaw": 0.15, "lean": 0.1, "cr": 0.05}),
				k(0.62, {"w": w(v(0.16, -0.08, 0.34), v(0.92, 0.0, 0.25), null, v(-0.8, -0.4, 0.3)), "yaw": 0.5, "hip": 0.12, "lean": 0.08, "cr": 0.04}),
			])
		2:  # garra de cima: o punho sobe com as lâminas para o alto e desce rasgando à frente
			return _m("garra_de_cima", 0.5, [
				k(0.3, {"w": w(v(-0.3, 0.3, 0.02), v(-0.1, 1.0, 0.1), null, v(-1.0, 0.0, -0.2)), "yaw": -0.25, "lean": -0.1, "stop": true}),
				k(0.47, {"w": w(v(-0.06, -0.1, 0.45), v(0.05, -0.5, 0.86), null, v(-0.8, -0.6, 0.0)), "yaw": 0.1, "lean": 0.22, "cr": 0.06}),
				k(0.63, {"w": w(v(0.0, -0.3, 0.36), v(0.0, -0.9, 0.4), null, v(-0.7, -0.7, 0.1)), "yaw": 0.15, "lean": 0.26, "cr": 0.07}),
			])
	# soco reto: o punho recua junto do peito e sai reto, com o ombro atrás
	return _m("soco", 0.45, [
		k(0.3, {"w": w(v(-0.22, -0.12, 0.14), v(0.0, 0.0, 1.0), null, v(-0.6, -1.0, -0.4)), "yaw": -0.35, "cr": 0.03, "stop": true}),
		k(0.46, {"w": w(v(-0.08, -0.06, 0.52), v(0.08, 0.0, 1.0), null, v(-0.7, -0.8, 0.0)), "yaw": 0.25, "lean": 0.15, "fz": 0.06}),
		k(0.64, {"w": w(v(-0.1, -0.08, 0.47), v(0.08, 0.0, 1.0), null, v(-0.7, -0.8, 0.0)), "yaw": 0.2, "lean": 0.12, "fz": 0.05}),
	])

static func _two_basic(variant: int) -> Dictionary:
	match variant % 3:
		1:  # horizontal na altura da cintura, com as duas mãos
			return _m("horizontal", 0.55, [
				k(0.32, {"w": w(v(-0.34, -0.2, 0.1), v(-0.55, 0.15, -0.82), null, v(-0.4, -1.0, -0.3)), "g": 1.0, "yaw": -0.7, "hip": -0.2, "cr": 0.05, "stop": true}),
				k(0.5, {"w": w(v(-0.06, -0.2, 0.4), v(0.8, 0.05, 0.6), null, v(-0.6, -1.0, 0.0)), "g": 1.0, "yaw": 0.05, "cr": 0.08, "lean": 0.12}),
				k(0.66, {"w": w(v(0.24, -0.24, 0.36), v(0.4, 0.0, -0.92), null, v(-0.4, -1.0, 0.3)), "g": 1.0, "yaw": 0.6, "hip": 0.2, "cr": 0.06}),
			])
		2:  # de cima: a arma sobe acima da cabeça e cai reto
			return _m("de_cima", 0.55, [
				k(0.32, {"w": w(v(-0.06, 0.4, 0.14), v(0.0, 0.6, -0.8), null, v(-0.9, 0.3, 0.1)), "g": 1.0, "lean": -0.15, "head": -0.06, "stop": true}),
				k(0.5, {"w": w(v(-0.03, -0.1, 0.48), v(0.0, -0.5, 0.86), null, v(-0.6, -1.0, 0.0)), "g": 1.0, "lean": 0.28, "cr": 0.1}),
				k(0.66, {"w": w(v(-0.02, -0.32, 0.42), v(0.0, -0.85, 0.53), null, v(-0.5, -1.0, 0.1)), "g": 1.0, "lean": 0.32, "cr": 0.12}),
			])
	return _m("diagonal", 0.55, [
		k(0.32, {"w": w(v(-0.22, 0.16, 0.12), v(-0.45, 0.5, -0.74), null, v(-0.9, -0.3, 0.2)), "g": 1.0, "yaw": -0.55, "hip": -0.2, "lean": -0.05, "stop": true}),
		k(0.5, {"w": w(v(-0.02, -0.12, 0.42), v(0.55, -0.5, 0.67), null, v(-0.6, -1.0, 0.0)), "g": 1.0, "yaw": 0.3, "hip": 0.1, "lean": 0.22, "cr": 0.06}),
		k(0.66, {"w": w(v(0.14, -0.36, 0.38), v(0.5, -0.85, 0.15), null, v(-0.4, -1.0, 0.2)), "g": 1.0, "yaw": 0.45, "lean": 0.28, "cr": 0.08}),
	])

## Lança: a mão de trás (direita) perto do pé da haste e a da frente a meio metro, como na guarda.
const SPEAR_E0 := Vector3(0.874, 0.443, -0.199)
const SPEAR_E1 := Vector3(0.571, 0.811, -0.127)

static func _spear_basic(variant: int) -> Dictionary:
	match variant % 4:
		1:  # varrida: a ponta passa da direita para a esquerda na altura da cintura
			return _m("varrida", 0.55, [
				k(0.3, {"w": w(v(0.02, -0.3, 0.22), v(-0.55, 0.06, 0.83), null, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.3, "yaw": -0.5, "hip": -0.2, "stop": true}),
				k(0.5, {"w": w(v(-0.06, -0.3, 0.16), v(0.15, 0.06, 0.99), null, v(-0.8, -0.6, -0.1)), "g": 1.0, "two": 0.38, "yaw": 0.1, "lean": 0.15}),
				k(0.66, {"w": w(v(-0.12, -0.3, 0.12), v(0.75, 0.05, 0.66), null, v(-0.8, -0.6, 0.0)), "g": 1.0, "two": 0.32, "yaw": 0.5, "hip": 0.2}),
			])
		2:  # de cima: a lança sobe com as duas mãos e a ponta desce no alvo
			return _m("de_cima", 0.55, [
				k(0.32, {"w": w(v(-0.12, 0.2, -0.06), v(0.05, 0.5, 0.86), null, v(-0.9, 0.2, 0.0)), "g": 1.0, "two": 0.45, "lean": -0.12, "head": -0.05, "stop": true}),
				k(0.5, {"w": w(v(-0.08, -0.2, 0.18), v(0.05, -0.3, 0.95), null, v(-0.8, -0.6, 0.0)), "g": 1.0, "two": 0.4, "lean": 0.25, "cr": 0.07}),
				k(0.66, {"w": w(v(-0.08, -0.24, 0.16), v(0.05, -0.38, 0.92), null, v(-0.8, -0.6, 0.0)), "g": 1.0, "two": 0.4, "lean": 0.26, "cr": 0.08}),
			])
		3:  # diagonal: a ponta corta do alto à direita para baixo à esquerda
			return _m("diagonal", 0.55, [
				k(0.3, {"w": w(v(-0.2, -0.1, -0.06), v(-0.45, 0.6, 0.66), null, v(-0.9, -0.4, -0.1)), "g": 1.0, "two": 0.45, "yaw": -0.5, "lean": -0.04, "stop": true}),
				k(0.5, {"w": w(v(-0.08, -0.3, 0.16), v(0.25, -0.15, 0.96), null, v(-0.8, -0.6, 0.0)), "g": 1.0, "two": 0.42, "yaw": 0.15, "lean": 0.18, "cr": 0.05}),
				k(0.66, {"w": w(v(0.0, -0.36, 0.1), v(0.6, -0.4, 0.69), null, v(-0.7, -0.7, 0.1)), "g": 1.0, "two": 0.42, "yaw": 0.45, "lean": 0.2, "cr": 0.06}),
			])
	# estocada (a guarda recua o braço de trás; a ponta vai reto no alvo)
	return _m("estocada", 0.5, [
		k(0.3, {"w": w(v(-0.2, -0.34, -0.08), v(0.12, 0.2, 0.97), SPEAR_E0, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.55, "yaw": -0.6, "lean": 0.05, "stop": true}),
		k(0.5, {"w": w(v(-0.13, -0.32, 0.24), v(0.06, 0.12, 0.991), SPEAR_E1, v(-1.0, -0.3, 0.0)), "g": 1.0, "two": 0.25, "yaw": 0.1, "lean": 0.22, "fz": 0.07, "cr": 0.04}),
		k(0.7, {"w": w(v(-0.13, -0.32, 0.22), v(0.06, 0.12, 0.991), SPEAR_E1, v(-1.0, -0.3, 0.0)), "g": 1.0, "two": 0.27, "yaw": 0.08, "lean": 0.2, "fz": 0.06, "cr": 0.04}),
	])

static func _staff_basic(variant: int) -> Dictionary:
	match variant % 3:
		1:  # varrida: a cabeça do cajado vem da direita e aponta o alvo
			return _m("varrida", 0.55, [
				k(0.32, {"w": w(v(-0.16, -0.25, 0.14), v(-0.6, 0.7, 0.3), null, v(-0.6, -1.0, -0.3)), "g": 1.0, "two": 0.26, "yaw": -0.5, "stop": true}),
				k(0.5, {"w": w(v(-0.12, -0.3, 0.22), v(0.1, 0.5, 0.86), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "yaw": 0.15, "lean": 0.1}),
				k(0.7, {"w": w(v(-0.12, -0.31, 0.21), v(0.12, 0.48, 0.87), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "yaw": 0.12, "lean": 0.08}),
			], {"release": 0.46})
		2:  # de cima: o cajado sobe em pé com as duas mãos e desce apontando
			return _m("de_cima", 0.55, [
				k(0.32, {"w": w(v(-0.12, 0.1, 0.12), v(0.0, 0.98, 0.15), null, v(-0.9, -0.3, -0.2)), "g": 1.0, "two": 0.35, "lean": -0.08, "head": -0.08, "stop": true}),
				k(0.5, {"w": w(v(-0.1, -0.32, 0.24), v(0.05, 0.3, 0.95), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "lean": 0.15, "cr": 0.05}),
				k(0.7, {"w": w(v(-0.1, -0.33, 0.23), v(0.05, 0.32, 0.94), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "lean": 0.13, "cr": 0.05}),
			], {"release": 0.46})
	return _m("empurra", 0.55, [
		k(0.35, {"w": w(v(-0.18, -0.2, 0.12), v(0.05, 0.923, 0.381), Vector3(0.995, -0.014, -0.098), v(-0.5, -1.0, -0.35)), "g": 1.0, "two": 0.42, "yaw": -0.3, "stop": true}),
		k(0.52, {"w": w(v(-0.12, -0.36, 0.22), v(0.08, 0.501, 0.862), Vector3(0.799, 0.485, -0.356), v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "yaw": 0.1, "lean": 0.1}),
		k(0.75, {"w": w(v(-0.12, -0.35, 0.21), v(0.08, 0.52, 0.85), Vector3(0.787, 0.491, -0.374), v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "yaw": 0.08, "lean": 0.08}),
	], {"release": 0.48})

static func _wand_basic(variant: int) -> Dictionary:
	match variant % 3:
		1:  # de revés: o foco vem do ombro esquerdo e estala para a frente
			return _m("reves", 0.5, [
				k(0.34, {"w": w(v(0.1, 0.04, 0.34), v(0.7, 0.4, -0.6), null, v(-0.7, -0.5, -0.6)), "yaw": 0.35, "stop": true}),
				k(0.5, {"w": w(v(-0.18, -0.04, 0.44), v(-0.35, 0.05, 0.94), null, v(-0.8, -0.6, -0.1)), "yaw": -0.2, "lean": 0.08}),
				k(0.66, {"w": w(v(-0.22, -0.07, 0.4), v(-0.42, 0.0, 0.9), null, v(-0.8, -0.6, -0.1)), "yaw": -0.22, "lean": 0.06}),
			], {"release": 0.46})
		2:  # de cima: o foco sobe e desce apontando o alvo
			return _m("de_cima", 0.5, [
				k(0.34, {"w": w(v(-0.12, 0.34, 0.08), v(0.0, 0.8, -0.6), null, v(-1.0, 0.3, 0.0)), "lean": -0.08, "head": -0.06, "stop": true}),
				k(0.5, {"w": w(v(-0.08, 0.0, 0.46), v(0.0, -0.2, 0.98), null, v(-0.8, -0.6, 0.0)), "lean": 0.12}),
				k(0.66, {"w": w(v(-0.08, -0.02, 0.45), v(0.0, -0.22, 0.97), null, v(-0.8, -0.6, 0.0)), "lean": 0.1}),
			], {"release": 0.46})
	return _m("estalo", 0.5, [
		k(0.36, {"w": w(v(-0.26, 0.08, -0.02), v(0.0, 0.954, 0.301), null, v(-0.8, -0.6, -0.2)), "yaw": -0.3, "stop": true}),
		k(0.5, {"w": w(v(-0.1, -0.06, 0.45), v(0.05, 0.08, 0.995), null, v(-0.6, -1.0, -0.3)), "yaw": 0.2, "lean": 0.08}),
		k(0.7, {"w": w(v(-0.1, -0.08, 0.43), v(0.05, 0.06, 0.997), null, v(-0.6, -1.0, -0.3)), "yaw": 0.18, "lean": 0.06}),
	], {"release": 0.46})

## Arco (na mão esquerda): e = direção do tiro, a = braço de cima do arco. A mão da corda vai à corda e puxa
## até o rosto ("dr" em metros); "dr": −1 solta.
const BOW_POLE := Vector3(1.0, 0.0, -0.3)
const STRING_POLE := Vector3(-1.0, -0.4, -0.6)

static func _bow_basic(variant: int) -> Dictionary:
	match variant % 3:
		1:  # tiro rápido: puxada curta até a bochecha, solta logo
			return _m("rapido", 0.45, [
				k(0.2, {"w": w(v(0.0, 0.04, 0.55), v(0.1, 0.995, 0.0), v(-0.5, 0.05, 0.86), BOW_POLE), "dr": 0.15, "yaw": -0.55}),
				k(0.36, {"w": w(v(-0.05, 0.08, 0.62), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": 0.4, "yaw": -0.78, "stop": true}),
				k(0.48, {"w": w(v(-0.04, 0.07, 0.61), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": -1.0, "o": o(v(-0.13, 0.09, 0.0), v(0.95, 0.0, -0.25), STRING_POLE, v(0.2, 0.3, 0.93)), "yaw": -0.74}),
			], {"arrow": [0.1, 0.4]})
		2:  # arco inclinado: puxada alta até a maçã do rosto, o corpo um pouco para trás
			return _m("inclinado", 0.55, [
				k(0.2, {"w": w(v(0.02, 0.06, 0.52), v(0.4, 0.92, 0.0), v(-0.6, 0.2, 0.77), BOW_POLE), "dr": 0.12, "yaw": -0.6, "lean": -0.06}),
				k(0.38, {"w": w(v(-0.06, 0.12, 0.62), v(0.42, 0.9, 0.05), v(0.0, 0.0, 1.0), BOW_POLE), "dr": 0.46, "yaw": -0.86, "lean": -0.06, "head": -0.04, "stop": true}),
				k(0.52, {"w": w(v(-0.05, 0.11, 0.61), v(0.42, 0.9, 0.05), v(0.0, 0.0, 1.0), BOW_POLE), "dr": -1.0, "o": o(v(-0.16, 0.14, -0.04), v(0.95, 0.0, -0.2), STRING_POLE, v(0.2, 0.4, 0.9)), "yaw": -0.8, "lean": -0.05}),
			], {"arrow": [0.12, 0.44]})
	# puxada completa até o queixo, solta e a mão segue para trás da orelha
	return _m("completo", 0.55, [
		k(0.18, {"w": w(v(0.02, 0.02, 0.5), v(0.1, 0.995, 0.0), v(-0.712, 0.072, 0.699), BOW_POLE), "dr": 0.1, "yaw": -0.6}),
		k(0.36, {"w": w(v(-0.07, 0.08, 0.64), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": 0.45, "yaw": -0.85, "stop": true}),
		k(0.5, {"w": w(v(-0.07, 0.08, 0.64), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": -1.0, "o": o(v(-0.14, 0.09, -0.02), v(0.98, -0.06, -0.19), STRING_POLE, v(0.2, 0.3, 0.93)), "yaw": -0.85}),
		k(0.7, {"w": w(v(-0.02, 0.06, 0.62), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": -1.0, "o": o(v(-0.15, 0.0, 0.0), v(0.85, -0.06, -0.2), v(-1.0, -0.6, -0.4), v(0.2, -0.2, 0.96)), "yaw": -0.8}),
	], {"arrow": [0.12, 0.42]})

## Azagaia (na mão direita): some da mão no arremesso e volta outra da aljava; gume natural em todas as chaves
## (o pulso não dobra entre a guarda e o preparo atrás do ombro).
static func _javelin_basic(variant: int) -> Dictionary:
	match variant % 3:
		1:  # de lado: a azagaia recua na altura do quadril e sai rasante
			return _m("lateral", 0.55, [
				k(0.36, {"w": w(v(-0.4, -0.22, -0.12), v(0.15, 0.1, 0.98), null, v(-0.4, -1.0, -0.4)), "yaw": -0.65, "hip": -0.2, "cr": 0.06, "stop": true}),
				k(0.5, {"w": w(v(-0.12, -0.12, 0.42), v(0.05, 0.12, 0.99), null, v(-0.7, -0.8, 0.0)), "yaw": 0.25, "lean": 0.12, "cr": 0.06}),
				k(0.68, {"w": w(v(0.08, -0.3, 0.32), v(0.4, -0.3, 0.86), null, v(-0.5, -1.0, 0.0)), "yaw": 0.5, "lean": 0.15, "cr": 0.04}),
			], {"throw": [0.5, 0.95]})
		2:  # com pulinho: passo à frente e arremesso por cima do ombro
			var ks := [
				k(0.36, {"w": w(v(-0.34, 0.24, -0.22), v(0.05, 0.3, 0.95), null, v(-0.5, -0.3, -1.0)), "yaw": -0.7, "lean": -0.1, "hop": 0.04, "stop": true}),
				k(0.5, {"w": w(v(-0.12, 0.32, 0.22), v(0.0, 0.25, 0.97), null, v(-0.7, -0.5, -0.2)), "yaw": 0.35, "lean": 0.15, "hop": 0.0, "fz": 0.08}),
				k(0.68, {"w": w(v(0.04, -0.28, 0.36), v(0.3, -0.3, 0.9), null, v(-0.5, -1.0, -0.35)), "yaw": 0.5, "lean": 0.2, "fz": 0.08}),
			]
			_step(ks, "l", 0.0, 0.2, 0.2, 0.38, 0.8)
			return _m("pulinho", 0.6, ks, {"throw": [0.51, 0.95]})
	return _m("por_cima", 0.55, [
		k(0.38, {"w": w(v(-0.32, 0.2, -0.18), v(0.05, 0.25, 0.97), null, v(-0.5, -0.3, -1.0)), "yaw": -0.6, "stop": true}),
		k(0.5, {"w": w(v(-0.14, 0.3, 0.2), v(0.0, 0.2, 0.98), null, v(-0.7, -0.5, -0.2)), "yaw": 0.3, "lean": 0.1}),
		k(0.7, {"w": w(v(0.02, -0.3, 0.35), v(0.302, -0.302, 0.905), null, v(-0.5, -1.0, -0.35)), "yaw": 0.45, "lean": 0.15}),
	], {"throw": [0.52, 0.95]})

# ---------------- habilidades ----------------
## Categoria que empresta o movimento quando a categoria não tem um próprio para o tipo.
const FALLBACK := {"two": "one", "spear": "two", "staff": "wand", "javelin": "one", "bow": "javelin", "wand": "one", "one": "wand", "claw": "one"}

## Movimento de uma habilidade pelo tipo (effect.kind), adaptado à categoria da arma. opts: "variant" (ordem entre
## as habilidades da classe do mesmo tipo), "full" (cone de volta inteira), "hits", "projectiles", "lateral",
## "back", "cast_ms" e "shield" (o personagem tem escudo).
static func skill(kind: String, cat: String, opts: Dictionary) -> Dictionary:
	var m := _skill(kind, cat, opts)
	var c := cat
	var guard := 0
	while m.is_empty() and guard < 4:
		c = FALLBACK.get(c, "one")
		m = _skill(kind, c, opts)
		guard += 1
	if m.is_empty():
		m = _skill(kind, "one", opts)
	if m.is_empty():
		m = _skill("spell", "wand", opts)
	m["kind"] = kind
	return m

static func _skill(kind: String, cat: String, opts: Dictionary) -> Dictionary:
	match kind:
		"strike":
			return _strike(cat, opts)
		"cone_strike":
			return _cone(cat, opts)
		"line_strike":
			return _line(cat, opts)
		"aoe_strike":
			return _whirl(cat, opts)
		"charge":
			return _charge(cat)
		"dash":
			return _dash(cat, opts)
		"pull":
			return _pull(cat, opts)
		"spell":
			return _spell(cat, opts)
		"aoe_spell":
			return _aoe_spell(cat)
		"ground_aoe":
			return _ground(cat)
		"delayed_aoe":
			return _delayed(cat)
		"debuff":
			return _debuff(cat)
		"heal":
			return _heal(cat)
		"party_heal":
			return _party_heal(cat, opts)
		"resurrect":
			return _resurrect(cat)
		"buff_self":
			return _buff_self(cat, opts)
		"party_buff":
			return _party_buff(cat, opts)
		"aura_damage":
			return _aura(cat)
		"taunt_area":
			return _taunt(cat, opts)
		"shield_self":
			return _shield_self(cat, opts)
		"shield_ally":
			return _shield_ally(cat)
		"guard_ally":
			return _guard_ally(cat, opts)
	return {}

## Punho fechado encostado no peito (do lado do coração), cotovelo para fora.
static func _fist_chest() -> Array:
	return o(v(0.03, -0.17, 0.23), v(0.0, 0.0, -1.0), v(0.9, -0.5, 0.1), v(-0.6, 0.0, 0.0))

## Mão aberta estendida à frente, palma para a frente e dedos para cima (para um aliado).
static func _palm_out(x := 0.16, y := -0.04, z := 0.46) -> Array:
	return o(v(x, y, z), v(0.0, -0.6, 0.8), v(0.7, -0.7, -0.2), v(0.0, 0.8, 0.6))

## strike: golpe forte — preparo grande atrás da cabeça, passo à frente e o golpe até embaixo (v0); a segunda
## habilidade do tipo na classe sobe de baixo para cima pelo outro lado, mais rápida (v1). Arco: disparo
## carregado que segura a puxada (v0, com tempo de conjuração) ou tiro rápido com passo (v1); azagaia: arremesso
## com o corpo inteiro.
static func _strike(cat: String, opts: Dictionary) -> Dictionary:
	var v1 := int(opts.get("variant", 0)) % 2 == 1
	var ks: Array = []
	match cat:
		"bow":
			if not v1:
				ks = [
					k(0.2, {"w": w(v(0.02, 0.03, 0.5), v(0.1, 0.995, 0.0), v(-0.7, 0.07, 0.7), BOW_POLE), "dr": 0.15, "yaw": -0.6, "cr": 0.04}),
					k(0.42, {"w": w(v(-0.08, 0.09, 0.65), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": 0.52, "yaw": -0.92, "lean": -0.05, "cr": 0.07, "head": 0.02, "stop": true}),
					k(0.54, {"w": w(v(-0.07, 0.09, 0.64), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": -1.0, "o": o(v(-0.2, 0.12, -0.08), v(0.9, 0.0, -0.4), STRING_POLE, v(0.1, 0.5, 0.85)), "yaw": -0.88, "lean": -0.14, "hop": 0.035}),
					k(0.74, {"w": w(v(-0.02, 0.06, 0.6), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": -1.0, "o": o(v(-0.18, 0.02, -0.02), v(0.85, -0.1, -0.3), v(-1.0, -0.6, -0.4), v(0.2, -0.1, 0.96)), "yaw": -0.8, "lean": -0.05, "hop": 0.0}),
				]
				return _m("disparo_carregado", 0.8, ks, {"hold": 0.42, "arrow": [0.1, 0.5]})
			ks = [
				k(0.16, {"w": w(v(0.0, 0.04, 0.54), v(0.1, 0.995, 0.0), v(-0.5, 0.05, 0.86), BOW_POLE), "dr": 0.2, "yaw": -0.5}),
				k(0.32, {"w": w(v(-0.06, 0.08, 0.63), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": 0.46, "yaw": -0.82, "fz": 0.08, "stop": true}),
				k(0.42, {"w": w(v(-0.05, 0.07, 0.62), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": -1.0, "o": o(v(-0.15, 0.1, -0.03), v(0.95, 0.0, -0.25), STRING_POLE, v(0.2, 0.35, 0.9)), "yaw": -0.8, "lean": 0.06, "fz": 0.1}),
				k(0.66, {"w": w(v(-0.02, 0.06, 0.6), v(0.12, 0.993, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "yaw": -0.7, "fz": 0.08}),
			]
			_step(ks, "l", 0.0, 0.2, 0.14, 0.32, 0.72)
			return _m("tiro_com_passo", 0.62, ks, {"arrow": [0.08, 0.38]})
		"javelin":
			ks = [
				k(0.4, {"w": w(v(-0.36, 0.26, -0.24), v(0.05, 0.3, 0.95), null, v(-0.5, -0.3, -1.0)), "yaw": -0.85, "lean": -0.15, "cr": 0.04, "stop": true}),
				k(0.55, {"w": w(v(-0.12, 0.34, 0.24), v(0.0, 0.2, 0.98), null, v(-0.7, -0.5, -0.2)), "yaw": 0.4, "lean": 0.2, "fz": 0.13, "cr": 0.08}),
				k(0.72, {"w": w(v(0.06, -0.32, 0.36), v(0.3, -0.3, 0.9), null, v(-0.5, -1.0, -0.35)), "yaw": 0.55, "lean": 0.3, "fz": 0.14, "cr": 0.1}),
			]
			_step(ks, "l", 0.0, 0.26, 0.22, 0.42, 0.8)
			return _m("arremesso_forte", 0.75, ks, {"throw": [0.56, 0.95]})
		"two", "spear", "staff":
			if cat == "spear":
				return _line("spear", {"variant": 0})
			if not v1:
				ks = [
					k(0.32, {"w": w(v(-0.06, 0.42, 0.14), v(0.0, 0.6, -0.8), null, v(-0.9, 0.3, 0.1)), "g": 1.0, "lean": -0.18, "head": -0.08, "stop": true}),
					k(0.52, {"w": w(v(-0.02, -0.22, 0.48), v(0.0, -0.7, 0.71), null, v(-0.6, -1.0, 0.0)), "g": 1.0, "lean": 0.42, "cr": 0.18, "fz": 0.12}),
					k(0.68, {"w": w(v(-0.02, -0.36, 0.44), v(0.0, -0.9, 0.44), null, v(-0.5, -1.0, 0.1)), "g": 1.0, "lean": 0.46, "cr": 0.2, "fz": 0.14}),
					k(0.84, {"w": w(v(-0.06, -0.28, 0.4), v(0.0, -0.55, 0.84), null, v(-0.6, -1.0, 0.0)), "g": 1.0, "lean": 0.24, "cr": 0.1, "fz": 0.08}),
				]
				_step(ks, "l", 0.0, 0.24, 0.22, 0.42, 0.82)
				return _m("golpe_ao_chao", 0.8, ks)
			ks = [
				k(0.3, {"w": w(v(0.1, -0.36, 0.36), v(0.45, -0.85, 0.25), null, v(-0.4, -1.0, 0.3)), "g": 1.0, "yaw": 0.5, "lean": 0.22, "cr": 0.12, "stop": true}),
				k(0.48, {"w": w(v(-0.1, 0.0, 0.42), v(-0.35, 0.65, 0.67), null, v(-0.8, -0.6, 0.0)), "g": 1.0, "yaw": -0.1, "cr": 0.03}),
				k(0.62, {"w": w(v(-0.22, 0.28, 0.14), v(-0.45, 0.8, -0.4), null, v(-0.9, 0.2, 0.0)), "g": 1.0, "yaw": -0.5, "lean": -0.14, "hop": 0.04, "head": -0.1}),
				k(0.8, {"w": w(v(-0.18, 0.12, 0.2), v(-0.2, 0.9, 0.3), null, v(-0.9, -0.2, 0.0)), "g": 1.0, "yaw": -0.25, "hop": 0.0, "cr": 0.04}),
			]
			return _m("corte_ascendente", 0.75, ks)
		"wand":
			return {}
	if not v1:
		ks = [
			k(0.3, {"w": w(v(-0.18, 0.36, -0.08), v(-0.2, 0.5, -0.85), null, v(-1.0, 0.25, 0.0)), "yaw": -0.6, "hip": -0.18, "lean": -0.12, "head": -0.06, "stop": true}),
			k(0.5, {"w": w(v(-0.04, -0.06, 0.48), v(0.45, -0.75, 0.5), null, v(-1.0, -0.5, 0.1)), "yaw": 0.3, "hip": 0.1, "lean": 0.3, "cr": 0.12, "fz": 0.12}),
			k(0.66, {"w": w(v(0.1, -0.4, 0.34), v(0.45, -0.88, 0.15), null, v(-0.7, -0.8, 0.2)), "yaw": 0.45, "lean": 0.36, "cr": 0.14, "fz": 0.14}),
			k(0.82, {"w": w(v(-0.12, -0.3, 0.3), v(0.2, 0.4, 0.9), null, v(-0.6, -1.0, 0.0)), "yaw": 0.15, "lean": 0.15, "cr": 0.08, "fz": 0.1}),
		]
		if not opts.get("shield", false):
			ks.append(k(0.3, {"o": o(v(0.3, -0.05, 0.36), v(-0.2, -0.6, 0.8), v(0.6, -1.0, -0.2))}))
			ks.append(k(0.56, {"o": o(v(0.36, -0.24, -0.04), v(0.0, -0.4, -0.9), v(0.5, -1.0, -0.5))}))
		_step(ks, "l", 0.0, 0.26, 0.22, 0.4, 0.8)
		return _m("golpe_forte", 0.75, ks)
	ks = [
		k(0.28, {"w": w(v(0.1, -0.36, 0.28), v(0.4, -0.85, 0.3), null, v(-0.6, -1.0, 0.3)), "yaw": 0.5, "hip": 0.18, "lean": 0.22, "cr": 0.12, "fz": 0.04, "stop": true}),
		k(0.46, {"w": w(v(-0.12, 0.02, 0.47), v(-0.3, 0.7, 0.65), null, v(-1.0, -0.4, 0.0)), "yaw": -0.1, "lean": 0.02, "cr": 0.03}),
		k(0.6, {"w": w(v(-0.26, 0.3, 0.16), v(-0.4, 0.82, -0.4), null, v(-1.0, 0.3, 0.0)), "yaw": -0.5, "lean": -0.14, "head": -0.12, "hop": 0.05, "cr": 0.0}),
		k(0.78, {"w": w(v(-0.22, 0.12, 0.2), v(-0.2, 0.9, 0.3), null, v(-1.0, -0.2, 0.0)), "yaw": -0.25, "hop": 0.0, "cr": 0.05}),
	]
	return _m("corte_ascendente", 0.7, ks)

## cone_strike: varrida larga — a arma vai bem para trás à direita e passa varrendo a frente toda até a esquerda,
## com a base aberta e o corpo baixo. Lança: três estocadas abrindo em leque (golpes repetidos) ou a roda de
## volta inteira (cone de 360°); azagaia: varre o braço soltando as azagaias em leque.
static func _cone(cat: String, opts: Dictionary) -> Dictionary:
	var ks: Array = []
	match cat:
		"spear":
			if opts.get("full", false):
				ks = [
					k(0.16, {"w": w(v(0.02, -0.3, 0.22), v(-0.55, 0.06, 0.83), null, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.3, "yaw": -0.5, "cr": 0.1, "spin": 0.0, "stop": true}),
					k(0.4, {"w": w(v(0.02, -0.28, 0.24), v(-0.62, 0.05, 0.78), null, v(-0.8, -0.6, -0.1)), "g": 1.0, "two": 0.3, "yaw": -0.45, "hop": 0.05, "cr": 0.04, "spin": PI}),
					k(0.62, {"w": w(v(0.02, -0.3, 0.24), v(-0.55, 0.05, 0.83), null, v(-0.8, -0.6, 0.0)), "g": 1.0, "two": 0.3, "yaw": -0.4, "hop": 0.0, "cr": 0.12, "spin": TAU, "stop": true}),
					k(1.0, {"spin": TAU}),
				]
				return _m("roda", 0.8, ks)
			ks = [
				k(0.2, {"w": w(v(-0.04, -0.33, 0.02), v(-0.5, 0.15, 0.85), null, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.34, "yaw": -0.45, "cr": 0.06}),
				k(0.31, {"w": w(v(0.02, -0.31, 0.24), v(-0.38, 0.1, 0.92), null, v(-0.9, -0.5, -0.1)), "g": 1.0, "two": 0.26, "yaw": -0.2, "lean": 0.2, "cr": 0.08}),
				k(0.41, {"w": w(v(-0.18, -0.33, 0.0), v(0.05, 0.15, 0.99), null, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.48, "yaw": -0.1, "lean": 0.08}),
				k(0.51, {"w": w(v(-0.04, -0.31, 0.26), v(0.05, 0.1, 0.99), null, v(-0.9, -0.5, -0.1)), "g": 1.0, "two": 0.25, "yaw": 0.1, "lean": 0.22, "cr": 0.08}),
				k(0.61, {"w": w(v(-0.14, -0.33, 0.02), v(0.5, 0.15, 0.85), null, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.48, "yaw": 0.25, "lean": 0.08}),
				k(0.71, {"w": w(v(0.0, -0.31, 0.22), v(0.45, 0.1, 0.89), null, v(-0.9, -0.5, 0.0)), "g": 1.0, "two": 0.26, "yaw": 0.4, "lean": 0.2, "cr": 0.08}),
			]
			_wide(ks, 0.16, 0.8)
			return _m("muralha", 0.8, ks)
		"javelin":
			ks = [
				k(0.3, {"w": w(v(-0.4, 0.1, -0.1), v(0.1, 0.2, 0.97), null, v(-0.5, -0.3, -1.0)), "yaw": -0.7, "cr": 0.04, "stop": true}),
				k(0.45, {"w": w(v(-0.2, 0.12, 0.36), v(-0.3, 0.1, 0.95), null, v(-0.7, -0.6, -0.2)), "yaw": -0.2, "lean": 0.1, "cr": 0.06}),
				k(0.55, {"w": w(v(0.0, 0.1, 0.42), v(0.05, 0.1, 0.99), null, v(-0.8, -0.6, 0.0)), "yaw": 0.15, "lean": 0.12, "cr": 0.06}),
				k(0.66, {"w": w(v(0.18, 0.06, 0.34), v(0.45, 0.05, 0.89), null, v(-0.7, -0.7, 0.2)), "yaw": 0.5, "lean": 0.12, "cr": 0.05}),
			]
			_wide(ks, 0.2, 0.78)
			return _m("leque", 0.7, ks, {"throw": [0.46, 0.92]})
		"bow", "staff", "wand":
			return {}
		"two":
			ks = [
				k(0.3, {"w": w(v(-0.38, -0.22, 0.08), v(-0.55, 0.1, -0.83), null, v(-0.4, -1.0, -0.3)), "g": 1.0, "yaw": -0.8, "hip": -0.25, "cr": 0.1, "stop": true}),
				k(0.5, {"w": w(v(-0.06, -0.24, 0.4), v(0.85, 0.0, 0.52), null, v(-0.6, -1.0, 0.0)), "g": 1.0, "yaw": 0.05, "cr": 0.14, "lean": 0.15}),
				k(0.66, {"w": w(v(0.26, -0.24, 0.32), v(0.4, 0.0, -0.92), null, v(-0.4, -1.0, 0.3)), "g": 1.0, "yaw": 0.8, "hip": 0.25, "cr": 0.12}),
			]
			_wide(ks, 0.18, 0.82)
			return _m("varrida_larga", 0.75, ks)
	ks = [
		k(0.3, {"w": w(v(-0.46, -0.12, -0.1), v(-0.4, 0.05, -0.91), null, v(-0.3, -1.0, -0.2)), "yaw": -0.75, "hip": -0.25, "cr": 0.08, "lean": 0.05, "stop": true}),
		k(0.48, {"w": w(v(-0.12, -0.18, 0.46), v(0.9, 0.0, 0.43), null, v(-0.6, -1.0, 0.0)), "yaw": 0.0, "hip": 0.0, "cr": 0.13, "lean": 0.16}),
		k(0.64, {"w": w(v(0.32, -0.14, 0.26), v(0.35, 0.0, -0.94), null, v(-0.4, -1.0, 0.3)), "yaw": 0.75, "hip": 0.25, "cr": 0.1, "lean": 0.08}),
	]
	if not opts.get("shield", false):
		ks.append(k(0.3, {"o": o(v(0.34, -0.1, 0.32), v(0.0, -1.0, 0.2), v(0.6, -1.0, 0.0))}))
		ks.append(k(0.64, {"o": o(v(0.38, -0.22, -0.1), v(0.0, -0.5, -1.0), v(0.6, -1.0, -0.4))}))
	_wide(ks, 0.16, 0.82)
	return _m("varrida_larga", 0.7, ks)

## line_strike: estocada — a arma recua junto do quadril e vai reta à frente com o passo e o corpo atrás dela.
## A segunda do tipo na classe (Linha Partida) é a estocada dupla, mais curta. Arco: o arco empurrado à frente
## com o passo e a flecha que atravessa; machado e martelo empurram a cabeça da arma rente ao chão.
static func _line(cat: String, opts: Dictionary) -> Dictionary:
	var v1 := int(opts.get("variant", 0)) % 2 == 1
	var ks: Array = []
	match cat:
		"spear":
			if v1:
				ks = [
					k(0.2, {"w": w(v(-0.2, -0.33, -0.06), v(0.12, 0.2, 0.97), SPEAR_E0, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.55, "yaw": -0.5}),
					k(0.34, {"w": w(v(-0.13, -0.31, 0.24), v(0.06, 0.12, 0.99), SPEAR_E1, v(-1.0, -0.3, 0.0)), "g": 1.0, "two": 0.25, "yaw": 0.1, "lean": 0.2, "fz": 0.06}),
					k(0.46, {"w": w(v(-0.16, -0.33, 0.0), v(0.1, 0.18, 0.98), SPEAR_E0, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.45, "yaw": -0.3, "lean": 0.1, "fz": 0.04}),
					k(0.6, {"w": w(v(-0.12, -0.3, 0.28), v(0.06, 0.1, 0.993), SPEAR_E1, v(-1.0, -0.3, 0.0)), "g": 1.0, "two": 0.22, "yaw": 0.15, "lean": 0.28, "fz": 0.12, "cr": 0.1}),
					k(0.76, {"w": w(v(-0.12, -0.3, 0.27), v(0.06, 0.1, 0.993), SPEAR_E1, v(-1.0, -0.3, 0.0)), "g": 1.0, "two": 0.23, "yaw": 0.12, "lean": 0.25, "fz": 0.11, "cr": 0.09}),
				]
				_step(ks, "l", 0.0, 0.26, 0.48, 0.6, 0.84)
				return _m("estocada_dupla", 0.65, ks)
			ks = [
				k(0.36, {"w": w(v(-0.26, -0.32, -0.16), v(0.12, 0.18, 0.976), SPEAR_E0, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.58, "yaw": -0.75, "cr": 0.08, "stop": true}),
				k(0.55, {"w": w(v(-0.12, -0.3, 0.3), v(0.06, 0.1, 0.993), SPEAR_E1, v(-1.0, -0.3, 0.0)), "g": 1.0, "two": 0.22, "yaw": 0.15, "lean": 0.32, "cr": 0.14, "fz": 0.16}),
				k(0.75, {"w": w(v(-0.12, -0.3, 0.29), v(0.06, 0.1, 0.993), SPEAR_E1, v(-1.0, -0.3, 0.0)), "g": 1.0, "two": 0.23, "yaw": 0.12, "lean": 0.3, "cr": 0.13, "fz": 0.15}),
			]
			_step(ks, "l", 0.0, 0.34, 0.4, 0.55, 0.8)
			return _m("estocada_longa", 0.75, ks)
		"bow":
			ks = [
				k(0.25, {"w": w(v(0.04, -0.02, 0.5), v(0.1, 0.99, 0.05), v(-0.4, 0.0, 0.9), BOW_POLE), "dr": 0.15, "yaw": -0.6, "cr": 0.06}),
				k(0.45, {"w": w(v(-0.06, 0.06, 0.66), v(0.08, 0.996, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": 0.5, "yaw": -0.9, "lean": 0.18, "fz": 0.12, "cr": 0.1, "stop": true}),
				k(0.56, {"w": w(v(-0.05, 0.05, 0.65), v(0.08, 0.996, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "dr": -1.0, "o": o(v(-0.16, 0.08, -0.04), v(0.95, 0.0, -0.3), STRING_POLE, v(0.2, 0.3, 0.93)), "yaw": -0.86, "lean": 0.24, "fz": 0.14, "cr": 0.1}),
				k(0.76, {"w": w(v(-0.02, 0.04, 0.6), v(0.1, 0.995, 0.0), v(0.0, 0.0, 1.0), BOW_POLE), "yaw": -0.7, "lean": 0.12, "fz": 0.1, "cr": 0.06}),
			]
			_step(ks, "l", 0.0, 0.28, 0.3, 0.45, 0.8)
			return _m("flecha_que_atravessa", 0.7, ks, {"arrow": [0.12, 0.5]})
		"two":
			ks = [
				k(0.32, {"w": w(v(-0.18, -0.24, 0.34), v(0.1, 0.05, 0.99), null, v(-0.5, -1.0, -0.4)), "g": 1.0, "two": -0.14, "yaw": -0.5, "cr": 0.1, "stop": true}),
				k(0.52, {"w": w(v(-0.05, -0.22, 0.54), v(0.0, 0.0, 1.0), null, v(-0.6, -1.0, 0.0)), "g": 1.0, "two": -0.14, "yaw": 0.15, "lean": 0.35, "cr": 0.16, "fz": 0.16}),
				k(0.72, {"w": w(v(-0.05, -0.23, 0.53), v(0.0, -0.02, 1.0), null, v(-0.6, -1.0, 0.0)), "g": 1.0, "two": -0.14, "yaw": 0.12, "lean": 0.32, "cr": 0.15, "fz": 0.15}),
			]
			_step(ks, "l", 0.0, 0.3, 0.38, 0.52, 0.8)
			return _m("investida_da_lamina", 0.7, ks)
		"staff", "wand", "javelin":
			return {}
	if v1:
		ks = [
			k(0.22, {"w": w(v(-0.26, -0.16, 0.04), v(0.0, 0.75, 0.66), null, v(-0.6, -1.0, -0.4)), "yaw": -0.35, "cr": 0.05}),
			k(0.36, {"w": w(v(-0.06, -0.12, 0.5), v(0.0, 0.3, 0.95), null, v(-0.7, -0.8, 0.0)), "yaw": 0.15, "lean": 0.2, "fz": 0.08}),
			k(0.48, {"w": w(v(-0.22, -0.16, 0.14), v(0.0, 0.7, 0.7), null, v(-0.6, -1.0, -0.3)), "yaw": -0.2, "lean": 0.1, "fz": 0.06}),
			k(0.62, {"w": w(v(-0.04, -0.12, 0.52), v(0.0, 0.3, 0.95), null, v(-0.7, -0.8, 0.0)), "yaw": 0.2, "lean": 0.26, "fz": 0.12, "cr": 0.08}),
		]
		_step(ks, "l", 0.0, 0.26, 0.48, 0.62, 0.84)
		return _m("estocada_dupla", 0.6, ks)
	ks = [
		k(0.32, {"w": w(v(-0.28, -0.16, 0.02), v(0.0, 0.8, 0.6), null, v(-0.6, -1.0, -0.4)), "yaw": -0.5, "hip": -0.18, "cr": 0.06, "stop": true}),
		k(0.5, {"w": w(v(-0.05, -0.14, 0.52), v(0.0, 0.3, 0.95), null, v(-0.7, -0.8, 0.0)), "yaw": 0.2, "lean": 0.25, "cr": 0.1, "fz": 0.14}),
		k(0.7, {"w": w(v(-0.05, -0.15, 0.5), v(0.0, 0.3, 0.95), null, v(-0.7, -0.8, 0.0)), "yaw": 0.15, "lean": 0.22, "cr": 0.1, "fz": 0.13}),
	]
	if not opts.get("shield", false):
		ks.append(k(0.32, {"o": o(v(0.3, -0.08, 0.3), v(0.0, -0.8, 0.5), v(0.6, -1.0, -0.2))}))
		ks.append(k(0.5, {"o": o(v(0.34, -0.2, -0.08), v(0.0, -0.4, -0.9), v(0.5, -1.0, -0.5))}))
	_step(ks, "l", 0.0, 0.3, 0.36, 0.5, 0.8)
	return _m("estocada", 0.65, ks)

## aoe_strike: giro com a arma estendida — uma volta inteira com um pulinho, a arma aberta para fora à direita
## (vai na frente do giro) e a outra mão (ou o escudo) aberta para equilibrar.
static func _whirl(cat: String, opts: Dictionary) -> Dictionary:
	var ks: Array = []
	match cat:
		"two", "spear", "staff":
			var two := cat == "two"
			ks = [
				k(0.16, {"w": w(v(-0.34, -0.2, 0.1), v(-0.55, 0.15, -0.82), null, v(-0.4, -1.0, -0.3)), "g": 1.0, "yaw": -0.45, "cr": 0.1, "spin": 0.0, "stop": true}),
				k(0.4, {"w": w(v(-0.36, -0.12, 0.2), v(-0.6, 0.05, 0.8), null, v(-0.5, -1.0, 0.0)), "g": 1.0, "yaw": -0.05, "hop": 0.06, "cr": 0.02, "spin": PI}),
				k(0.62, {"w": w(v(-0.36, -0.14, 0.2), v(-0.6, 0.0, 0.8), null, v(-0.5, -1.0, 0.0)), "g": 1.0, "yaw": 0.0, "hop": 0.0, "cr": 0.12, "spin": TAU, "stop": true}),
				k(1.0, {"spin": TAU}),
			]
			return _m("giro" if two else "giro_haste", 0.8, ks)
		"bow", "wand", "javelin":
			return {}
	ks = [
		k(0.16, {"w": w(v(-0.36, -0.14, -0.02), v(-0.5, 0.0, -0.86), null, v(-0.4, -1.0, -0.3)), "yaw": -0.45, "cr": 0.1, "spin": 0.0, "stop": true}),
		k(0.4, {"w": w(v(-0.5, -0.08, 0.14), v(-0.42, 0.05, 0.9), null, v(-0.5, -1.0, 0.0)), "yaw": -0.05, "hop": 0.06, "cr": 0.02, "spin": PI}),
		k(0.62, {"w": w(v(-0.48, -0.1, 0.12), v(-0.42, 0.0, 0.9), null, v(-0.5, -1.0, 0.0)), "yaw": 0.0, "hop": 0.0, "cr": 0.12, "spin": TAU, "stop": true}),
		k(0.8, {"w": w(v(-0.3, -0.15, 0.25), v(0.1, 0.4, 0.91), null, v(-0.6, -1.0, 0.0)), "cr": 0.06}),
		k(1.0, {"spin": TAU}),
	]
	if opts.get("shield", false):
		ks.append(k(0.4, {"o": o(v(0.56, -0.08, 0.12), v(0.0, 0.0, -1.0), v(0.4, -1.0, -0.3))}))
	else:
		ks.append(k(0.4, {"o": o(v(0.6, -0.06, 0.1), v(0.0, -1.0, 0.2), v(0.4, -1.0, -0.3))}))
	return _m("giro", 0.8, ks)

## charge: investida — agacha, lança-se à frente (o servidor leva o personagem até o alvo e as pernas ficam no
## salto, sem a passada), golpeia ao chegar e se recompõe.
static func _charge(cat: String) -> Dictionary:
	var ks: Array = []
	var weapon_keys := {}
	match cat:
		"spear":
			ks = [
				k(0.22, {"w": w(v(-0.22, -0.34, -0.1), v(0.12, 0.2, 0.97), SPEAR_E0, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.55, "cr": 0.14, "lean": 0.2, "yaw": -0.4, "stop": true}),
				k(0.4, {"w": w(v(-0.14, -0.3, 0.22), v(0.06, 0.1, 0.99), SPEAR_E1, v(-1.0, -0.3, 0.0)), "g": 1.0, "two": 0.3, "lean": 0.45, "cr": 0.04, "yaw": 0.05, "hop": 0.06}),
				k(0.58, {"w": w(v(-0.12, -0.3, 0.3), v(0.06, 0.1, 0.993), SPEAR_E1, v(-1.0, -0.3, 0.0)), "g": 1.0, "two": 0.22, "lean": 0.35, "cr": 0.12, "hop": 0.0, "yaw": 0.15, "fz": 0.1}),
			]
		_:
			ks = [
				k(0.22, {"w": w(v(-0.28, -0.16, 0.02), v(0.0, 0.8, 0.6), null, v(-0.6, -1.0, -0.4)), "cr": 0.14, "lean": 0.2, "yaw": -0.4, "stop": true}),
				k(0.4, {"w": w(v(-0.1, -0.14, 0.4), v(0.0, 0.4, 0.92), null, v(-0.7, -0.8, 0.0)), "lean": 0.45, "cr": 0.04, "hop": 0.06}),
				k(0.58, {"w": w(v(-0.05, -0.14, 0.52), v(0.0, 0.3, 0.95), null, v(-0.7, -0.8, 0.0)), "lean": 0.35, "cr": 0.12, "hop": 0.0, "yaw": 0.15, "fz": 0.1}),
			]
	ks.append(k(0.4, {"lf": v(0.0, 0.2, 0.22), "rf": v(0.0, 0.08, -0.26)}))
	ks.append(k(0.58, {"lf": v(0.0, 0.0, 0.26), "rf": v(0.0, 0.0, -0.08)}))
	ks.append(k(0.8, {"lf": v(0.0, 0.0, 0.26), "rf": v(0.0, 0.0, -0.08)}))
	ks.append(k(0.9, {"lf": v(0.0, 0.06, 0.13), "rf": v(0.0, 0.0, -0.04)}))
	return _m("investida", 0.75, ks, {"force_legs": true, "lock": true})

## dash: salto rápido — para trás (Passo de Recuo: agacha, pula com as pernas encolhidas mantendo o arco à
## frente e cai firme) ou de lado (Passo Lateral: inclina para o lado do salto, pernas abertas no ar).
static func _dash(cat: String, opts: Dictionary) -> Dictionary:
	var ks: Array = []
	if opts.get("lateral", false):
		ks = [
			k(0.18, {"cr": 0.12, "roll": 0.08, "fx": 0.03, "stop": true}),
			k(0.42, {"cr": 0.0, "hop": 0.12, "roll": -0.28, "lean": 0.05, "lf": v(0.06, 0.12, 0.0), "rf": v(-0.14, 0.05, 0.0)}),
			k(0.62, {"cr": 0.14, "hop": 0.0, "roll": -0.1, "lf": v(0.04, 0.0, 0.0), "rf": v(-0.06, 0.0, 0.0)}),
			k(0.82, {"cr": 0.05, "roll": 0.0, "lf": v(0.02, 0.04, 0.0), "rf": v(-0.03, 0.0, 0.0)}),
		]
		if cat == "javelin" or cat == "one":
			ks.append(k(0.42, {"o": o(v(0.54, 0.0, 0.12), v(0.0, 0.0, -1.0), v(0.4, -1.0, -0.3))}))
		return _m("passo_lateral", 0.55, ks, {"force_legs": true, "lock": true})
	ks = [
		k(0.2, {"cr": 0.12, "lean": 0.12, "stop": true}),
		k(0.42, {"cr": 0.0, "hop": 0.14, "lean": -0.12, "head": 0.04, "lf": v(0.0, 0.12, -0.06), "rf": v(0.0, 0.16, 0.06)}),
		k(0.62, {"cr": 0.15, "hop": 0.0, "lean": 0.08, "lf": v(0.0, 0.0, 0.02), "rf": v(0.0, 0.0, -0.02)}),
		k(0.84, {"cr": 0.05, "lean": 0.02}),
	]
	if cat == "bow":
		ks.append(k(0.3, {"w": w(v(0.1, -0.1, 0.48), v(0.1, 0.99, 0.1), v(-0.4, 0.0, 0.9), BOW_POLE)}))
		ks.append(k(0.62, {"w": w(v(0.08, -0.06, 0.5), v(0.1, 0.99, 0.1), v(-0.3, 0.0, 0.95), BOW_POLE)}))
	return _m("passo_de_recuo", 0.55, ks, {"force_legs": true, "lock": true})

## pull: puxão para trás — estende a arma (e a outra mão, aberta) como quem agarra, e puxa tudo de volta ao peito
## jogando o peso para trás.
static func _pull(cat: String, opts: Dictionary) -> Dictionary:
	var ks := [
		k(0.25, {"w": w(v(-0.06, -0.04, 0.52), v(0.1, 0.85, 0.5), null, v(-0.7, -0.7, 0.0)), "yaw": 0.1, "lean": 0.16, "fz": 0.06}),
		k(0.5, {"w": w(v(-0.26, -0.24, -0.06), v(0.0, 0.75, 0.66), null, v(-0.6, -1.0, -0.4)), "yaw": -0.35, "lean": -0.16, "fz": -0.08, "cr": 0.07, "stop": true}),
		k(0.74, {"w": w(v(-0.26, -0.25, -0.04), v(0.0, 0.74, 0.67), null, v(-0.6, -1.0, -0.4)), "yaw": -0.3, "lean": -0.12, "fz": -0.06, "cr": 0.06}),
	]
	if opts.get("shield", false):
		ks.append(k(0.25, {"o": o(v(0.1, -0.06, 0.46), v(-0.95, 0.0, 0.3), v(0.8, -0.6, 0.0), v(0.0, 0.3, 1.0)), "oc": 0.9}))
		ks.append(k(0.5, {"o": o(v(0.12, -0.16, 0.26), v(0.0, 0.0, -1.0), v(1.0, -0.4, 0.2), v(-1.0, 0.0, 0.0)), "oc": 0.9}))
	else:
		ks.append(k(0.25, {"o": o(v(0.1, -0.06, 0.5), v(0.0, -0.4, 0.9), v(0.7, -0.7, 0.0), v(0.0, 0.0, 1.0)), "oc": 0.3}))
		ks.append(k(0.5, {"o": o(v(0.14, -0.2, 0.2), v(0.0, -0.3, -0.95), v(0.8, -0.8, -0.2)), "oc": 1.0}))
	_wide(ks, 0.2, 0.8, 0.04)
	return _m("puxao", 0.72, ks)

## spell: arremesso mágico — o foco junta força atrás, no ombro, e dispara à frente com a outra mão empurrando
## (v0); a segunda magia da classe (Fio Incandescente) risca um fio da esquerda para a direita e só então aponta
## (v1). Cajado: a mão livre arremessa enquanto o cajado aponta.
static func _spell(cat: String, opts: Dictionary) -> Dictionary:
	var v1 := int(opts.get("variant", 0)) % 2 == 1
	var ks: Array = []
	match cat:
		"staff":
			if v1:
				ks = [
					k(0.25, {"w": w(v(-0.02, -0.18, 0.28), v(0.6, 0.6, 0.5), null, v(-0.9, -0.5, -0.2)), "g": 1.0, "two": 0.3, "yaw": 0.35}),
					k(0.45, {"w": w(v(-0.3, -0.18, 0.22), v(-0.6, 0.6, 0.5), null, v(-0.8, -0.6, -0.2)), "g": 1.0, "two": 0.3, "yaw": -0.35}),
					k(0.62, {"w": w(v(-0.12, -0.34, 0.24), v(0.06, 0.45, 0.89), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "yaw": 0.1, "lean": 0.14, "fz": 0.05}),
					k(0.8, {"w": w(v(-0.12, -0.34, 0.23), v(0.06, 0.46, 0.89), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "yaw": 0.08, "lean": 0.12, "fz": 0.04}),
				]
				return _m("fio", 0.75, ks)
			ks = [
				k(0.3, {"w": w(v(-0.24, -0.22, 0.12), v(0.05, 0.95, 0.3), null, v(-0.5, -1.0, -0.35)), "g": 0.0, "o": o(v(0.24, 0.08, 0.04), v(-0.5, 0.2, 0.85), v(0.8, -0.4, -0.5), v(0.0, 1.0, 0.0)), "oc": 0.4, "yaw": 0.4, "lean": -0.04, "stop": true}),
				k(0.48, {"w": w(v(-0.24, -0.24, 0.1), v(0.05, 0.95, 0.3), null, v(-0.5, -1.0, -0.35)), "g": 0.0, "o": o(v(0.08, 0.0, 0.52), v(0.0, -0.3, 0.95), v(0.7, -0.7, -0.2), v(0.0, 0.9, 0.3)), "oc": 0.0, "yaw": -0.3, "lean": 0.16, "fz": 0.08}),
				k(0.68, {"g": 0.0, "o": o(v(0.08, -0.01, 0.51), v(0.0, -0.3, 0.95), v(0.7, -0.7, -0.2), v(0.0, 0.9, 0.3)), "yaw": -0.26, "lean": 0.14, "fz": 0.07}),
			]
			_step(ks, "l", 0.0, 0.18, 0.32, 0.48, 0.8)
			return _m("arremesso", 0.62, ks)
		"wand", "one":
			if v1:
				ks = [
					k(0.25, {"w": w(v(0.1, 0.0, 0.36), v(0.6, 0.1, 0.8), null, v(-0.7, -0.6, -0.4)), "yaw": 0.35}),
					k(0.45, {"w": w(v(-0.34, 0.0, 0.34), v(-0.6, 0.1, 0.8), null, v(-0.6, -0.8, -0.2)), "yaw": -0.35}),
					k(0.62, {"w": w(v(-0.08, 0.0, 0.5), v(0.05, 0.05, 1.0), null, v(-0.7, -0.8, -0.1)), "yaw": 0.1, "lean": 0.15, "fz": 0.05}),
					k(0.8, {"w": w(v(-0.08, -0.01, 0.49), v(0.05, 0.04, 1.0), null, v(-0.7, -0.8, -0.1)), "yaw": 0.08, "lean": 0.12, "fz": 0.04}),
				]
				ks.append(k(0.45, {"o": o(v(0.24, -0.12, 0.28), v(0.0, -1.0, 0.2), v(0.6, -1.0, -0.2)), "oc": 0.2}))
				return _m("fio", 0.75, ks)
			ks = [
				k(0.3, {"w": w(v(-0.24, 0.12, 0.02), v(0.0, 0.85, 0.5), null, v(-0.9, -0.4, -0.2)), "o": o(v(0.12, -0.1, 0.32), v(-0.5, 0.0, 0.85), v(0.7, -0.7, -0.2), v(0.0, 1.0, 0.0)), "oc": 0.3, "yaw": -0.4, "cr": 0.04, "stop": true}),
				k(0.48, {"w": w(v(-0.08, -0.02, 0.5), v(0.05, 0.05, 1.0), null, v(-0.7, -0.8, -0.1)), "o": o(v(0.1, -0.06, 0.48), v(0.0, 0.0, 1.0), v(0.7, -0.7, -0.2), v(0.0, 1.2, 0.0)), "oc": 0.0, "yaw": 0.15, "lean": 0.15, "fz": 0.06}),
				k(0.66, {"w": w(v(-0.08, -0.03, 0.49), v(0.05, 0.04, 1.0), null, v(-0.7, -0.8, -0.1)), "yaw": 0.12, "lean": 0.12, "fz": 0.05}),
			]
			return _m("disparo", 0.6, ks)
	return {}

## aoe_spell (em volta de si): o foco sobe com as duas mãos e desce com força até o chão aos pés, o corpo
## agachando junto (cajado: o pé do cajado bate no chão).
static func _aoe_spell(cat: String) -> Dictionary:
	var ks: Array = []
	match cat:
		"staff":
			ks = [
				k(0.3, {"w": w(v(-0.05, 0.22, 0.22), v(0.0, 0.98, 0.15), null, v(-0.9, -0.2, -0.2)), "g": 1.0, "two": 0.3, "head": -0.15, "lean": -0.06, "stop": true}),
				k(0.5, {"w": w(v(-0.08, -0.26, 0.32), v(0.0, 0.98, 0.12), null, v(-0.7, -0.8, -0.2)), "sl": 0.86, "g": 1.0, "two": 0.17, "cr": 0.2, "lean": 0.18, "head": 0.08}),
				k(0.74, {"w": w(v(-0.08, -0.28, 0.32), v(0.0, 0.98, 0.12), null, v(-0.7, -0.8, -0.2)), "sl": 0.86, "g": 1.0, "two": 0.17, "cr": 0.18, "lean": 0.16}),
			]
			_wide(ks, 0.4, 0.82)
			return _m("cajado_no_chao", 0.75, ks)
		"wand", "one":
			ks = [
				k(0.3, {"w": w(v(-0.12, 0.42, 0.1), v(0.0, 0.95, 0.3), null, v(-1.0, 0.2, 0.0)), "o": o(v(0.14, 0.4, 0.1), v(-0.9, 0.0, 0.3), v(1.0, 0.2, 0.0), v(0.0, 1.0, 0.0)), "oc": 0.1, "head": -0.15, "lean": -0.06, "stop": true}),
				k(0.5, {"w": w(v(-0.12, -0.48, 0.32), v(0.0, -0.95, 0.3), null, v(-0.6, -1.0, 0.1)), "o": o(v(0.14, -0.44, 0.32), v(0.0, -1.0, 0.0), v(0.6, -1.0, 0.1), v(0.0, 0.0, 1.0)), "cr": 0.22, "lean": 0.35}),
				k(0.74, {"w": w(v(-0.12, -0.46, 0.32), v(0.0, -0.95, 0.3), null, v(-0.6, -1.0, 0.1)), "o": o(v(0.14, -0.43, 0.32), v(0.0, -1.0, 0.0), v(0.6, -1.0, 0.1), v(0.0, 0.0, 1.0)), "cr": 0.2, "lean": 0.32}),
			]
			_wide(ks, 0.4, 0.82)
			return _m("foco_ao_chao", 0.75, ks)
	return {}

## ground_aoe (num ponto à distância): o foco sobe e desce apontando o chão lá adiante, o corpo indo atrás
## (cajado com as duas mãos). Arco: chuva para o alto, o arco inclinado para o céu; azagaia: arremesso em parábola.
static func _ground(cat: String) -> Dictionary:
	var ks: Array = []
	match cat:
		"bow":
			ks = [
				k(0.25, {"w": w(v(0.04, 0.12, 0.46), v(0.1, 0.62, -0.78), v(-0.3, 0.75, 0.55), BOW_POLE), "dr": 0.15, "yaw": -0.5, "lean": -0.1}),
				k(0.45, {"w": w(v(-0.02, 0.28, 0.5), v(0.1, 0.6, -0.79), v(0.0, 0.79, 0.6), BOW_POLE), "dr": 0.44, "yaw": -0.75, "lean": -0.2, "head": -0.25, "stop": true}),
				k(0.56, {"w": w(v(-0.02, 0.27, 0.49), v(0.1, 0.6, -0.79), v(0.0, 0.79, 0.6), BOW_POLE), "dr": -1.0, "o": o(v(-0.12, 0.16, 0.02), v(0.95, 0.0, -0.3), STRING_POLE, v(0.1, 0.6, 0.8)), "yaw": -0.72, "lean": -0.22, "head": -0.25}),
				k(0.76, {"yaw": -0.5, "lean": -0.1, "head": -0.1}),
			]
			return _m("chuva", 0.7, ks, {"arrow": [0.12, 0.5]})
		"javelin":
			ks = [
				k(0.36, {"w": w(v(-0.34, 0.12, -0.24), v(0.05, 0.6, 0.8), null, v(-0.5, -0.3, -1.0)), "yaw": -0.6, "lean": -0.15, "stop": true}),
				k(0.52, {"w": w(v(-0.14, 0.4, 0.18), v(0.0, 0.65, 0.76), null, v(-0.8, -0.2, -0.3)), "yaw": 0.25, "lean": 0.0, "head": -0.15}),
				k(0.68, {"w": w(v(0.0, -0.1, 0.38), v(0.2, -0.2, 0.95), null, v(-0.6, -1.0, -0.2)), "yaw": 0.4, "lean": 0.1}),
			]
			return _m("parabola", 0.7, ks, {"throw": [0.53, 0.95]})
		"staff":
			ks = [
				k(0.32, {"w": w(v(-0.12, 0.14, 0.1), v(0.0, 0.85, -0.5), null, v(-0.9, -0.2, -0.2)), "g": 1.0, "two": 0.32, "lean": -0.1, "head": -0.1, "stop": true}),
				k(0.52, {"w": w(v(-0.1, -0.3, 0.28), v(0.05, -0.1, 0.99), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "lean": 0.2, "cr": 0.06}),
				k(0.72, {"w": w(v(-0.1, -0.31, 0.27), v(0.05, -0.12, 0.99), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "lean": 0.18, "cr": 0.06}),
			]
			return _m("aponta_o_chao", 0.7, ks)
		"wand", "one":
			ks = [
				k(0.32, {"w": w(v(-0.16, 0.38, 0.0), v(0.0, 0.85, -0.5), null, v(-1.0, 0.2, -0.1)), "lean": -0.1, "head": -0.1, "stop": true}),
				k(0.52, {"w": w(v(-0.08, -0.06, 0.48), v(0.0, -0.55, 0.83), null, v(-0.8, -0.6, -0.1)), "o": o(v(0.12, -0.1, 0.42), v(0.0, -0.6, 0.8), v(0.7, -0.7, -0.2), v(0.0, 0.6, 0.8)), "oc": 0.1, "lean": 0.2, "cr": 0.06}),
				k(0.72, {"w": w(v(-0.08, -0.07, 0.47), v(0.0, -0.56, 0.83), null, v(-0.8, -0.6, -0.1)), "lean": 0.18, "cr": 0.06}),
			]
			return _m("aponta_o_chao", 0.7, ks)
	return {}

## delayed_aoe (com tempo de conjuração): o foco sobe bem alto com as duas mãos, o corpo arqueado para trás,
## e segura juntando força; quando sai, desce com tudo apontando o lugar lá na frente.
static func _delayed(cat: String) -> Dictionary:
	var ks: Array = []
	match cat:
		"staff":
			ks = [
				k(0.4, {"w": w(v(-0.08, 0.26, 0.06), v(0.0, 0.97, -0.25), null, v(-0.9, 0.0, -0.3)), "g": 1.0, "two": 0.3, "lean": -0.2, "head": -0.25, "cr": 0.02, "stop": true}),
				k(0.58, {"w": w(v(-0.1, -0.3, 0.3), v(0.05, 0.05, 0.99), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "lean": 0.26, "cr": 0.1, "fz": 0.08}),
				k(0.8, {"w": w(v(-0.1, -0.31, 0.29), v(0.05, 0.04, 0.99), null, v(-1.0, -0.5, -0.1)), "g": 1.0, "two": 0.3, "lean": 0.24, "cr": 0.09, "fz": 0.07}),
			]
			_step(ks, "l", 0.0, 0.22, 0.46, 0.58, 0.84)
			return _m("forja_no_alto", 0.8, ks, {"hold": 0.4})
		"wand", "one":
			ks = [
				k(0.4, {"w": w(v(-0.08, 0.46, 0.04), v(0.0, 0.95, -0.3), null, v(-1.0, 0.3, 0.0)), "o": o(v(0.1, 0.42, 0.04), v(-1.0, 0.0, 0.0), v(1.0, 0.3, 0.0), v(0.0, 1.0, 0.0)), "oc": 0.1, "lean": -0.18, "head": -0.25, "cr": 0.02, "stop": true}),
				k(0.58, {"w": w(v(-0.06, -0.02, 0.5), v(0.0, -0.35, 0.94), null, v(-0.8, -0.6, -0.1)), "o": o(v(0.1, -0.04, 0.46), v(0.0, -0.3, 0.95), v(0.7, -0.7, -0.2), v(0.0, 0.9, 0.3)), "oc": 0.0, "lean": 0.25, "cr": 0.1, "fz": 0.08}),
				k(0.8, {"w": w(v(-0.06, -0.03, 0.49), v(0.0, -0.36, 0.93), null, v(-0.8, -0.6, -0.1)), "o": o(v(0.1, -0.05, 0.45), v(0.0, -0.3, 0.95), v(0.7, -0.7, -0.2), v(0.0, 0.9, 0.3)), "lean": 0.23, "cr": 0.09, "fz": 0.07}),
			]
			_step(ks, "l", 0.0, 0.22, 0.46, 0.58, 0.84)
			return _m("forja_no_alto", 0.8, ks, {"hold": 0.4})
	return {}

## debuff: aponta o alvo e torce a mão (marca). Arco: a mão da corda aponta, o arco fica baixo do lado.
static func _debuff(cat: String) -> Dictionary:
	var ks: Array = []
	if cat == "bow":
		ks = [
			k(0.2, {"dr": -1.0, "w": w(v(0.22, -0.4, 0.14), v(0.0, 0.862, 0.507), v(-0.049, -0.506, 0.861), v(0.5, -1.0, -0.35))}),
			k(0.32, {"o": o(v(-0.2, 0.05, 0.42), v(0.2, -0.9, 0.3), v(-0.8, -0.6, -0.2), v(0.0, 0.0, 1.0)), "pt": 1.0, "oc": 0.9, "yaw": 0.15, "lean": 0.06}),
			k(0.46, {"o": o(v(-0.16, 0.04, 0.5), v(0.9, 0.2, 0.3), v(-0.8, -0.6, -0.2), v(0.0, 0.0, 1.0)), "pt": 1.0, "oc": 0.9}),
			k(0.58, {"o": o(v(-0.16, 0.05, 0.5), v(0.2, 0.9, 0.3), v(-0.8, -0.6, -0.2), v(0.0, 0.0, 1.0)), "pt": 1.0, "oc": 0.9, "yaw": 0.18, "lean": 0.08, "stop": true}),
			k(0.78, {"w": w(v(0.22, -0.4, 0.14), v(0.0, 0.862, 0.507), v(-0.049, -0.506, 0.861), v(0.5, -1.0, -0.35)), "dr": -1.0, "o": o(v(-0.16, 0.04, 0.5), v(0.2, 0.9, 0.3), v(-0.8, -0.6, -0.2), v(0.0, 0.0, 1.0)), "pt": 1.0, "oc": 0.9, "yaw": 0.15}),
		]
		return _m("marca", 0.7, ks)
	ks = [
		k(0.3, {"o": o(v(0.18, 0.06, 0.42), v(-0.2, -0.9, 0.3), v(0.8, -0.6, -0.2), v(0.0, 0.0, 1.0)), "pt": 1.0, "oc": 0.9, "yaw": -0.15}),
		k(0.46, {"o": o(v(0.15, 0.05, 0.5), v(-0.9, 0.2, 0.3), v(0.8, -0.6, -0.2), v(0.0, 0.0, 1.0)), "pt": 1.0, "oc": 0.9}),
		k(0.6, {"o": o(v(0.15, 0.06, 0.5), v(-0.2, 0.9, 0.3), v(0.8, -0.6, -0.2), v(0.0, 0.0, 1.0)), "pt": 1.0, "oc": 0.9, "yaw": -0.18, "lean": 0.06, "stop": true}),
		k(0.8, {"o": o(v(0.15, 0.05, 0.5), v(-0.2, 0.9, 0.3), v(0.8, -0.6, -0.2), v(0.0, 0.0, 1.0)), "pt": 1.0, "oc": 0.9, "yaw": -0.15}),
	]
	return _m("marca", 0.7, ks)

## heal: foco erguido à frente, na altura da cabeça, e a outra mão aberta para o aliado, sem pressa (o corpo se
## inclina um pouco para ele).
static func _heal(cat: String) -> Dictionary:
	var ks: Array = []
	match cat:
		"staff":
			ks = [
				k(0.4, {"w": w(v(-0.22, -0.02, 0.22), v(0.0, 0.99, 0.12), null, v(-0.9, -0.4, -0.2)), "g": 0.0, "o": _palm_out(0.18, -0.02, 0.46), "oc": 0.0, "head": -0.06, "lean": 0.06, "stop": true}),
				k(0.78, {"w": w(v(-0.22, -0.02, 0.22), v(0.0, 0.99, 0.12), null, v(-0.9, -0.4, -0.2)), "g": 0.0, "o": _palm_out(0.18, -0.01, 0.47), "head": -0.05, "lean": 0.05}),
			]
		"bow", "javelin", "spear", "two":
			return {}
		_:
			ks = [
				k(0.4, {"w": w(v(-0.16, 0.2, 0.26), v(0.05, 0.85, 0.5), null, v(-1.0, 0.0, -0.1)), "o": _palm_out(0.18, -0.02, 0.46), "oc": 0.0, "head": -0.06, "lean": 0.06, "stop": true}),
				k(0.78, {"w": w(v(-0.16, 0.2, 0.26), v(0.05, 0.85, 0.5), null, v(-1.0, 0.0, -0.1)), "o": _palm_out(0.18, -0.01, 0.47), "head": -0.05, "lean": 0.05}),
			]
	return _m("cura", 0.8, ks, {"guard": false, "face": "happy"})

## party_heal: braços abertos ao alto (a arma ou o foco numa mão, a outra aberta), peito para cima.
static func _party_heal(cat: String, opts: Dictionary) -> Dictionary:
	var off := o(v(0.3, 0.38, 0.06), v(-0.3, 0.3, 0.9), v(1.0, 0.3, 0.0), v(0.3, 1.0, 0.0))
	var ks: Array = []
	match cat:
		"staff":
			ks = [
				k(0.45, {"w": w(v(-0.3, 0.24, 0.06), v(-0.2, 0.97, 0.1), null, v(-1.0, 0.0, 0.0)), "g": 0.0, "o": off, "oc": 0.0, "lean": -0.12, "head": -0.3, "stop": true}),
				k(0.8, {"w": w(v(-0.3, 0.24, 0.06), v(-0.2, 0.97, 0.1), null, v(-1.0, 0.0, 0.0)), "g": 0.0, "o": off, "lean": -0.1, "head": -0.26}),
			]
		"two":
			ks = [
				k(0.45, {"w": w(v(-0.3, 0.38, 0.06), v(-0.3, 0.9, 0.3), null, v(-1.0, 0.3, 0.0)), "g": 0.0, "o": off, "oc": 0.0, "lean": -0.12, "head": -0.3, "stop": true}),
				k(0.8, {"w": w(v(-0.3, 0.38, 0.06), v(-0.3, 0.9, 0.3), null, v(-1.0, 0.3, 0.0)), "g": 0.0, "o": off, "lean": -0.1, "head": -0.26}),
			]
		"bow", "javelin", "spear":
			return {}
		_:
			if opts.get("shield", false):
				off = o(v(0.3, 0.36, 0.06), v(-0.9, 0.2, 0.3), v(1.0, 0.3, 0.0), v(0.3, 1.0, 0.0))
			ks = [
				k(0.45, {"w": w(v(-0.3, 0.38, 0.06), v(-0.3, 0.9, 0.3), null, v(-1.0, 0.3, 0.0)), "o": off, "oc": 0.0, "lean": -0.12, "head": -0.3, "stop": true}),
				k(0.8, {"w": w(v(-0.3, 0.38, 0.06), v(-0.3, 0.9, 0.3), null, v(-1.0, 0.3, 0.0)), "o": off, "lean": -0.1, "head": -0.26}),
			]
	return _m("bracos_ao_alto", 0.8, ks, {"guard": false, "face": "happy"})

## resurrect (com tempo de conjuração): ajoelha um pouco (o pé esquerdo à frente, o joelho direito desce) e
## estende as mãos para o caído, segurando; quando sai, levanta erguendo as mãos.
static func _resurrect(cat: String) -> Dictionary:
	var ks: Array = []
	match cat:
		"staff":
			ks = [
				k(0.4, {"w": w(v(-0.24, -0.06, 0.26), v(0.0, 0.99, 0.1), null, v(-0.8, -0.6, -0.2)), "sl": 0.75, "g": 0.0, "o": o(v(0.12, -0.22, 0.42), v(0.0, -0.8, 0.55), v(0.7, -0.7, -0.1), v(0.0, 0.0, 1.0)), "oc": 0.0, "cr": 0.32, "lean": 0.24, "head": 0.1, "stop": true}),
				k(0.6, {"w": w(v(-0.22, 0.1, 0.24), v(0.0, 0.99, 0.1), null, v(-0.9, -0.4, -0.2)), "g": 0.0, "o": o(v(0.14, 0.22, 0.32), v(0.0, 0.4, 0.9), v(0.8, -0.4, -0.2), v(0.0, 1.0, 0.0)), "cr": 0.15, "lean": 0.0, "head": -0.15}),
				k(0.82, {"w": w(v(-0.22, 0.08, 0.22), v(0.0, 0.99, 0.1), null, v(-0.9, -0.4, -0.2)), "g": 0.0, "o": o(v(0.14, 0.2, 0.32), v(0.0, 0.4, 0.9), v(0.8, -0.4, -0.2), v(0.0, 1.0, 0.0)), "cr": 0.05, "head": -0.1}),
			]
		"bow", "javelin", "spear", "two":
			return {}
		_:
			ks = [
				k(0.4, {"w": w(v(-0.12, -0.2, 0.42), v(0.0, -0.3, 0.95), null, v(-0.7, -0.7, -0.1)), "o": o(v(0.12, -0.22, 0.42), v(0.0, -0.8, 0.55), v(0.7, -0.7, -0.1), v(0.0, 0.0, 1.0)), "oc": 0.0, "cr": 0.32, "lean": 0.24, "head": 0.1, "stop": true}),
				k(0.6, {"w": w(v(-0.14, 0.24, 0.3), v(0.0, 0.9, 0.4), null, v(-0.9, -0.3, -0.2)), "o": o(v(0.14, 0.22, 0.32), v(0.0, 0.4, 0.9), v(0.8, -0.4, -0.2), v(0.0, 1.0, 0.0)), "cr": 0.15, "lean": 0.0, "head": -0.15}),
				k(0.82, {"w": w(v(-0.14, 0.22, 0.28), v(0.0, 0.9, 0.4), null, v(-0.9, -0.3, -0.2)), "o": o(v(0.14, 0.2, 0.32), v(0.0, 0.4, 0.9), v(0.8, -0.4, -0.2), v(0.0, 1.0, 0.0)), "cr": 0.05, "head": -0.1}),
			]
	ks.append(k(0.2, {"lf": v(0.0, 0.07, 0.13), "rf": v(0.0, 0.0, -0.05)}))
	ks.append(k(0.4, {"lf": v(0.0, 0.0, 0.26), "rf": v(0.0, 0.0, -0.16)}))
	ks.append(k(0.62, {"lf": v(0.0, 0.0, 0.26), "rf": v(0.0, 0.0, -0.16)}))
	ks.append(k(0.86, {"lf": v(0.0, 0.06, 0.12), "rf": v(0.0, 0.05, -0.08)}))
	return _m("ajoelha_e_ergue", 0.8, ks, {"hold": 0.4, "guard": false})

## buff_self: punho fechado no peito e postura firme (base aberta, um pouco agachado, queixo erguido); a arma fica
## baixa do lado (duas mãos: a mão de cima sai do cabo; lança: fincada em pé no chão).
static func _buff_self(cat: String, opts: Dictionary) -> Dictionary:
	var ks: Array = []
	var weapon := w(v(-0.26, -0.4, 0.14), v(-0.15, -0.55, 0.82), null, v(-0.6, -1.0, -0.2))
	var extra := {}
	match cat:
		"two":
			weapon = w(v(-0.24, -0.36, 0.12), v(-0.1, -0.7, 0.7), null, v(-0.6, -1.0, -0.2))
			extra = {"g": 0.0}
		"spear":
			weapon = w(v(-0.24, -0.2, 0.2), v(0.0, 0.98, 0.18), null, v(-0.5, -1.0, -0.35))
			extra = {"g": 0.0, "sl": 0.62}
		"staff":
			weapon = w(v(-0.24, -0.2, 0.2), v(0.0, 0.98, 0.18), null, v(-0.5, -1.0, -0.35))
			extra = {"g": 0.0}
		"bow":
			weapon = w(v(0.22, -0.4, 0.14), v(0.0, 0.862, 0.507), v(-0.049, -0.506, 0.861), v(0.5, -1.0, -0.35))
			extra = {"dr": -1.0}
	var k1 := {"o": o(v(0.2, -0.1, 0.36), v(-0.3, -0.3, -0.9), v(0.8, -0.6, 0.0), v(-0.6, 0.0, 0.0)), "oc": 0.8}
	var k2 := {"w": weapon, "o": _fist_chest(), "oc": 1.0, "cr": 0.1, "lean": -0.06, "head": -0.1, "stop": true}
	var k3 := {"w": weapon, "o": _fist_chest(), "oc": 1.0, "cr": 0.1, "lean": -0.05, "head": -0.08}
	for d in [k2, k3]:
		for key in extra.keys():
			d[key] = extra[key]
	if cat == "bow":
		k1["dr"] = -1.0
	if opts.get("shield", false) and cat == "one":
		var chest := w(v(0.02, -0.15, 0.25), v(0.1, 0.95, 0.2), null, v(-0.9, -0.5, 0.1))
		k1 = {"w": w(v(-0.22, -0.04, 0.36), v(0.0, 0.9, 0.4), null, v(-0.8, -0.6, 0.0))}
		k2 = {"w": chest, "cr": 0.1, "lean": -0.06, "head": -0.1, "stop": true}
		k3 = {"w": chest, "cr": 0.1, "lean": -0.05, "head": -0.08}
	ks = [k(0.24, k1), k(0.42, k2), k(0.78, k3)]
	_wide(ks, 0.3, 0.84)
	return _m("punho_no_peito", 0.75, ks, {"guard": false, "face": "angry"})

## party_buff: abaixa a arma e a ergue ao alto num impulso (sobe na ponta dos pés), o peito aberto e a cabeça erguida
## para ela; a outra mão fecha do lado do corpo (varinha e cetro: aberta, abençoando o grupo; cajado e lança: erguidos
## deitados acima da cabeça com as duas mãos).
static func _party_buff(cat: String, opts: Dictionary) -> Dictionary:
	var ks: Array = []
	var low := w(v(-0.24, -0.34, 0.2), v(0.0, 0.3, 0.95), null, v(-0.6, -1.0, -0.3))
	var weapon := w(v(-0.12, 0.42, 0.14), v(0.0, 0.85, 0.5), null, v(-1.0, 0.25, 0.0))
	var extra := {}
	match cat:
		"two":
			low = w(v(-0.1, -0.3, 0.3), v(0.0, 0.2, 0.98), null, v(-0.6, -1.0, 0.0))
			weapon = w(v(-0.08, 0.46, 0.2), v(0.0, 0.85, 0.53), null, v(-1.0, 0.3, 0.0))
			extra = {"g": 1.0}
		"staff", "spear":
			# o cajado (ou a haste) erguido deitado acima da cabeça com as duas mãos
			low = w(v(-0.2, -0.2, 0.26), v(0.98, 0.1, 0.15), null, v(-0.6, -1.0, -0.2))
			weapon = w(v(-0.16, 0.42, 0.12), v(0.98, 0.15, 0.1), null, v(-1.0, 0.1, -0.1))
			extra = {"g": 1.0, "two": 0.32}
		"wand":
			weapon = w(v(-0.12, 0.44, 0.14), v(0.0, 0.95, 0.3), null, v(-1.0, 0.25, 0.0))
		"javelin":
			weapon = w(v(-0.12, 0.4, 0.12), v(0.1, 0.85, 0.5), null, v(-1.0, 0.25, 0.0))
		"bow":
			low = w(v(0.22, -0.4, 0.14), v(0.0, 0.862, 0.507), v(-0.049, -0.506, 0.861), v(0.5, -1.0, -0.35))
			weapon = w(v(0.12, 0.38, 0.14), v(0.1, 0.99, 0.0), v(0.0, 0.0, 1.0), v(1.0, 0.25, 0.0))
			extra = {"dr": -1.0}
	var k1 := {"w": low, "cr": 0.08, "lean": 0.1, "head": 0.05}
	var k2 := {"w": weapon, "cr": 0.0, "hop": 0.03, "lean": -0.12, "head": -0.3, "stop": true}
	var k3 := {"w": weapon, "hop": 0.0, "lean": -0.08, "head": -0.24}
	for d in [k1, k2, k3]:
		for key in extra.keys():
			d[key] = extra[key]
	ks = [k(0.18, k1), k(0.4, k2), k(0.76, k3)]
	if cat == "one" and not opts.get("shield", false):
		ks.append(k(0.4, {"o": o(v(0.26, -0.42, 0.1), v(-1.0, 0.0, 0.0), v(0.6, -1.0, -0.3)), "oc": 1.0}))
	elif cat == "wand":
		ks.append(k(0.4, {"o": o(v(0.34, -0.12, 0.24), v(0.0, -0.4, 0.9), v(0.6, -1.0, -0.3), v(0.2, 0.6, 0.4)), "oc": 0.0}))
	return _m("arma_ao_alto", 0.75, ks, {"guard": false, "face": "happy"})

## aura_damage: abre os braços para os lados, corpo tenso — base larga, agachado, tremendo de leve.
static func _aura(cat: String) -> Dictionary:
	var ks := [
		k(0.35, {"w": w(v(-0.6, -0.02, 0.1), v(-0.3, 0.2, 0.93), null, v(-0.3, -1.0, -0.3)), "o": o(v(0.6, -0.02, 0.1), v(0.0, -1.0, 0.1), v(0.3, -1.0, -0.3)), "oc": 0.25, "cr": 0.16, "lean": 0.12, "head": 0.06, "stop": true}),
		k(0.47, {"yaw": 0.05, "roll": 0.02}),
		k(0.57, {"yaw": -0.05, "roll": -0.02}),
		k(0.67, {"yaw": 0.04, "roll": 0.02}),
		k(0.78, {"w": w(v(-0.59, -0.02, 0.11), v(-0.3, 0.2, 0.93), null, v(-0.3, -1.0, -0.3)), "o": o(v(0.59, -0.02, 0.11), v(0.0, -1.0, 0.1), v(0.3, -1.0, -0.3)), "oc": 0.25, "cr": 0.15, "lean": 0.11, "yaw": 0.0, "roll": 0.0}),
	]
	if cat == "two" or cat == "spear" or cat == "staff":
		ks[0]["g"] = 0.0
		ks[4]["g"] = 0.0
	_wide(ks, 0.28, 0.84, 0.09)
	return _m("bracos_abertos", 0.8, ks)

## taunt_area: brado — bate a arma no escudo (ou no peito) duas vezes e abre o peito com a cabeça erguida.
static func _taunt(cat: String, opts: Dictionary) -> Dictionary:
	var ks: Array = []
	var shield: bool = opts.get("shield", false)
	var front := o(v(0.04, -0.1, 0.33), v(0.0, 0.0, -1.0), v(1.0, -0.4, 0.2), v(-1.0, 0.0, 0.0))
	var up := w(v(-0.32, 0.12, 0.08), v(0.2, 0.8, -0.55), null, v(-1.0, 0.0, 0.0))
	var hit := w(v(-0.12, -0.04, 0.32), v(0.85, 0.3, 0.42), null, v(-1.0, -0.4, 0.0)) if shield else w(v(-0.06, -0.16, 0.24), v(0.0, 0.9, 0.3), null, v(-0.9, -0.5, 0.0))
	ks = [
		k(0.2, {"w": up, "o": front if shield else _fist_chest(), "oc": 0.9}),
		k(0.3, {"w": hit, "lean": 0.04}),
		k(0.38, {"w": up, "lean": 0.0}),
		k(0.46, {"w": hit, "lean": 0.04}),
		k(0.64, {"w": w(v(-0.54, 0.16, 0.06), v(-0.3, 0.9, 0.2), null, v(-1.0, 0.0, -0.1)), "o": o(v(0.54, 0.16, 0.06), v(0.0, 0.0, 1.0) if not shield else v(0.0, 0.0, -1.0), v(1.0, 0.0, -0.1)), "oc": 0.9, "lean": -0.2, "head": -0.32, "cr": 0.08, "stop": true}),
		k(0.86, {"w": w(v(-0.53, 0.16, 0.07), v(-0.3, 0.9, 0.2), null, v(-1.0, 0.0, -0.1)), "o": o(v(0.53, 0.16, 0.07), v(0.0, 0.0, 1.0) if not shield else v(0.0, 0.0, -1.0), v(1.0, 0.0, -0.1)), "lean": -0.18, "head": -0.28, "cr": 0.08}),
	]
	if cat == "two" or cat == "spear" or cat == "staff":
		for i in ks.size():
			ks[i]["g"] = 0.0
	_wide(ks, 0.5, 0.88, 0.08)
	return _m("brado", 0.8, ks, {"face": "angry"})

## shield_self: guarda firme — o escudo ou o antebraço livre à frente do peito, agachado atrás dele e a arma
## recolhida (duas mãos: o cabo atravessado à frente, como bloqueio).
static func _shield_self(cat: String, opts: Dictionary) -> Dictionary:
	var ks: Array = []
	var block := o(v(-0.02, -0.02, 0.34), v(0.0, 0.0, -1.0), v(1.0, -0.4, 0.2), v(-1.0, 0.0, 0.0))
	var ready := w(v(-0.3, -0.3, 0.12), v(0.0, 0.85, 0.5), null, v(-0.6, -1.0, -0.4))
	var extra := {}
	match cat:
		"two":
			var bar := w(v(-0.16, -0.06, 0.3), v(-1.0, 0.12, 0.0), null, v(-0.5, -1.0, -0.2))
			ks = [
				k(0.3, {"w": bar, "g": 1.0, "cr": 0.14, "lean": 0.1, "head": 0.05, "stop": true}),
				k(0.78, {"w": bar, "g": 1.0, "cr": 0.13, "lean": 0.09, "head": 0.04}),
			]
			_wide(ks, 0.2, 0.84)
			return _m("cabo_atravessado", 0.75, ks, {"guard": false})
		"staff", "spear":
			ready = w(v(-0.26, -0.22, 0.16), v(0.0, 0.98, 0.18), null, v(-0.5, -1.0, -0.35))
			extra = {"g": 0.0}
		"wand":
			ready = w(v(-0.22, -0.2, 0.2), v(0.0, 0.9, 0.4), null, v(-0.6, -1.0, -0.3))
			block = o(v(0.02, 0.02, 0.36), v(0.0, 0.0, 1.0), v(1.0, -0.4, 0.2), v(-1.0, 0.0, 0.0))
		"bow":
			extra = {"dr": -1.0}
	if not opts.get("shield", false) and cat in ["one", "javelin"]:
		block = o(v(0.0, 0.02, 0.34), v(0.0, 0.0, -1.0), v(1.0, -0.4, 0.2), v(-1.0, 0.0, 0.0))
	var k2 := {"o": block, "oc": 0.9, "w": ready, "cr": 0.13, "lean": 0.12, "yaw": -0.15, "head": 0.06, "stop": true}
	var k3 := {"o": block, "oc": 0.9, "w": ready, "cr": 0.12, "lean": 0.11, "yaw": -0.14, "head": 0.05}
	if cat == "bow":
		k2.erase("w")
		k3.erase("w")
	for d in [k2, k3]:
		for key in extra.keys():
			d[key] = extra[key]
	ks = [k(0.32, k2), k(0.78, k3)]
	_wide(ks, 0.22, 0.84)
	return _m("guarda_firme", 0.75, ks, {"guard": false})

## shield_ally: o foco risca um círculo à frente do peito (o selo) e a outra mão o empurra para o aliado, com meio
## passo na direção dele (cajado: atravessado à frente como barreira, depois a mão empurra).
static func _shield_ally(cat: String) -> Dictionary:
	var ks: Array = []
	var push := _palm_out(0.14, 0.0, 0.5)
	if cat == "staff" or cat == "spear" or cat == "two":
		var held := w(v(-0.22, -0.04, 0.2), v(0.0, 0.99, 0.12), null, v(-0.9, -0.4, -0.2))
		ks = [
			k(0.3, {"w": w(v(-0.12, -0.1, 0.34), v(0.95, 0.25, 0.2), null, v(-0.7, -0.7, 0.0)), "g": 1.0, "two": 0.32, "lean": 0.04}),
			k(0.6, {"w": held, "g": 0.0, "o": push, "oc": 0.0, "fz": 0.06, "lean": 0.08, "stop": true}),
			k(0.82, {"w": held, "g": 0.0, "o": push, "fz": 0.06, "lean": 0.07}),
		]
	else:
		var near := w(v(-0.2, -0.12, 0.24), v(0.0, 0.9, 0.4), null, v(-0.8, -0.6, -0.2))
		ks = [
			k(0.18, {"w": w(v(-0.1, 0.06, 0.42), v(0.0, 0.5, 0.87), null, v(-0.8, -0.6, -0.1))}),
			k(0.28, {"w": w(v(-0.26, -0.02, 0.38), v(-0.4, 0.4, 0.82), null, v(-0.7, -0.7, -0.2))}),
			k(0.38, {"w": w(v(-0.12, -0.14, 0.44), v(0.0, 0.2, 0.98), null, v(-0.7, -0.7, -0.1))}),
			k(0.48, {"w": w(v(0.02, -0.02, 0.4), v(0.4, 0.4, 0.82), null, v(-0.8, -0.5, 0.0))}),
			k(0.62, {"w": near, "o": push, "oc": 0.0, "fz": 0.06, "lean": 0.08, "stop": true}),
			k(0.82, {"w": near, "o": push, "fz": 0.06, "lean": 0.07}),
		]
	_step(ks, "l", 0.03, 0.16, 0.5, 0.62, 0.86)
	return _m("selo_ao_aliado", 0.8, ks, {"guard": false})

## guard_ally (Juramento): ergue a lâmina em pé diante do rosto e então estende o escudo (ou a mão aberta)
## para o aliado com um passo, a arma baixando.
static func _guard_ally(cat: String, opts: Dictionary) -> Dictionary:
	var ks: Array = []
	var shield: bool = opts.get("shield", false)
	var hand := o(v(0.18, -0.02, 0.46), v(-1.0, 0.0, 0.3), v(0.9, -0.5, 0.0), v(0.0, 0.2, 1.0)) if shield else _palm_out(0.14, -0.02, 0.48)
	if cat == "two":
		var down := w(v(-0.06, -0.18, 0.3), v(0.0, -0.95, 0.3), null, v(-0.7, -0.7, 0.0))
		ks = [
			k(0.28, {"w": w(v(-0.05, 0.02, 0.3), v(0.0, 0.95, 0.3), null, v(-0.8, -0.6, 0.0)), "g": 1.0, "head": 0.04}),
			k(0.58, {"w": down, "g": 0.0, "o": hand, "oc": 0.0, "fz": 0.06, "lean": 0.06, "stop": true}),
			k(0.82, {"w": down, "g": 0.0, "o": hand, "fz": 0.06, "lean": 0.05}),
		]
	else:
		var low := w(v(-0.25, -0.38, 0.14), v(0.0, -0.4, 0.92), null, v(-0.6, -1.0, -0.2))
		ks = [
			k(0.3, {"w": w(v(-0.06, 0.04, 0.28), v(0.0, 0.95, 0.3), null, v(-0.8, -0.6, 0.0)), "head": 0.04}),
			k(0.58, {"w": low, "o": hand, "oc": 0.0 if not shield else 0.9, "fz": 0.08, "lean": 0.08, "stop": true}),
			k(0.82, {"w": low, "o": hand, "fz": 0.07, "lean": 0.07}),
		]
	_step(ks, "l", 0.04, 0.16, 0.42, 0.58, 0.86)
	return _m("juramento", 0.8, ks, {"guard": false})

# ---------------- opções a partir dos dados ----------------
## Opções do movimento de uma habilidade (data/skills.json): variante pela ordem de desbloqueio entre as
## habilidades da mesma classe com o mesmo tipo, e o que muda a forma do golpe.
static func skill_opts(skill_id: String, skills: Dictionary) -> Dictionary:
	var s: Dictionary = skills.get(skill_id, {})
	var eff: Dictionary = s.get("effect", {})
	var kind := str(eff.get("kind", ""))
	var opts := {"kind": kind, "skill": skill_id, "variant": 0}
	var same := []
	for id in skills.keys():
		var other: Dictionary = skills[id]
		if str(other.get("classId", "")) == str(s.get("classId", "")) and str(other.get("effect", {}).get("kind", "")) == kind:
			same.append([int(other.get("unlockLevel", 0)), str(id)])
	same.sort()
	for i in same.size():
		if same[i][1] == skill_id:
			opts["variant"] = i
	if float(eff.get("angleDeg", 0.0)) >= 300.0:
		opts["full"] = true
	if int(eff.get("hits", 0)) > 1:
		opts["hits"] = int(eff["hits"])
	if int(eff.get("projectiles", 0)) > 0:
		opts["projectiles"] = int(eff["projectiles"])
	if bool(eff.get("lateral", false)):
		opts["lateral"] = true
	if float(eff.get("distance", 0.0)) < 0.0:
		opts["back"] = true
	if float(s.get("castMs", 0.0)) > 0.0:
		opts["cast_ms"] = float(s["castMs"])
	return opts
