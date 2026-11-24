extends Node3D
## Animação procedural de personagens e monstros: andar/correr com a passada sincronizada à
## velocidade real (sem patinar), joelhos dobrando, corpo subindo e descendo e inclinando nas
## curvas, respiração parado, susto ao apanhar e golpe do braço da arma.
## As articulações são registradas por art.gd ao montar o modelo.

var legs: Array = []     # [pivô, fase]
var knees: Array = []    # [pivô, fase]
var arms: Array = []     # [pivô, fase]
var tail: Node3D = null
var body: Node3D = null
var head: Node3D = null
var weapon_arm: Node3D = null
var weapon_elbow: Node3D = null
var stride := 0.65       # amplitude das pernas (rad)
var step_speed := 9.0    # compatibilidade: ritmo quando só se sabe "andando/parado"
var cycle_len := 1.6     # metros (no tamanho do modelo) por ciclo completo de passos
var moving := false
var speed := 0.0
var accel := 0.0
var turn := 0.0
var _amp := 0.0
var _t := 0.0
var _phase := 0.0
var _attack := -1.0
var _hurt := -1.0
var _windup := -1.0      # preparando um golpe avisado (mecânica do monstro): tempo decorrido
var _windup_len := 1.0
var _idle_arm := 0.0
var _lean_s := 0.0
var _lean_f := 0.0
var _body_y := 0.0

func _ready() -> void:
	_t = randf() * TAU
	if weapon_arm:
		_idle_arm = weapon_arm.rotation.x
	if body:
		_body_y = body.position.y

func set_moving(m: bool) -> void:
	moving = m
	speed = 3.0 if m else 0.0

func set_motion(p_speed: float, p_accel: float, p_turn: float) -> void:
	speed = p_speed
	accel = p_accel
	turn = p_turn
	moving = p_speed > 0.15

func play_attack(_crit := false) -> void:
	_attack = 0.0

func play_hurt() -> void:
	_hurt = 0.0

## O monstro prepara um golpe avisado: recua o corpo e treme cada vez mais até o golpe, que sai no fim.
func play_windup(secs: float) -> void:
	_windup = 0.0
	_windup_len = maxf(0.2, secs)

## O golpe avisado foi cancelado (o monstro foi atordoado ou caiu).
func cancel_windup() -> void:
	_windup = -1.0

func _process(delta: float) -> void:
	var sc := maxf(0.2, scale.x)
	var v := speed / sc
	_amp = lerpf(_amp, smoothstep(0.04, 0.6, v) + clampf(absf(turn) * 0.15, 0.0, 0.4) * (1.0 - _amp), clampf(delta * 8.0, 0.0, 1.0))
	_t += delta
	_phase += TAU * v * delta / cycle_len + absf(turn) * delta * 1.2
	var run := smoothstep(1.5, 3.5, v)
	var amp := stride * (1.0 + 0.25 * run)
	for l in legs:
		l[0].rotation.x = sin(_phase + l[1]) * amp * _amp
	for k in knees:
		k[0].rotation.x = maxf(0.0, sin(_phase + k[1] + 1.2)) * (1.1 + 0.5 * run) * _amp
	for a in arms:
		if a[0] == weapon_arm and _attack >= 0.0:
			continue
		var base := _idle_arm if a[0] == weapon_arm else 0.0
		a[0].rotation.x = base - sin(_phase + a[1]) * 0.55 * _amp + sin(_t * 1.2) * 0.03 * (1.0 - _amp)
	_lean_s = lerpf(_lean_s, clampf(-turn * speed * 0.02, -0.25, 0.25), clampf(delta * 6.0, 0.0, 1.0))
	_lean_f = lerpf(_lean_f, clampf(accel * 0.01, -0.1, 0.1), clampf(delta * 6.0, 0.0, 1.0))
	var hurt := 0.0
	if _hurt >= 0.0:
		_hurt += delta
		hurt = smoothstep(0.0, 0.07, _hurt) * (1.0 - smoothstep(0.07, 0.35, _hurt))
		if _hurt > 0.35:
			_hurt = -1.0
	if body:
		body.position.y = _body_y + absf(sin(_phase)) * (0.05 + 0.03 * run) * _amp + sin(_t * 1.6) * 0.012 * (1.0 - _amp)
		body.rotation.x = (0.08 + 0.1 * run) * _amp + _lean_f - 0.25 * hurt
		body.rotation.z = _lean_s
		body.scale = Vector3(1.0 + 0.1 * hurt, 1.0 - 0.12 * hurt, 1.0 + 0.1 * hurt)
	if _windup >= 0.0:
		_windup += delta
		var w := clampf(_windup / _windup_len, 0.0, 1.0)
		if body:
			body.rotation.x -= 0.32 * smoothstep(0.0, 0.3, w)
			body.rotation.z += sin(_t * 38.0) * 0.05 * w
		if w >= 1.0:
			_windup = -1.0
			play_attack()
	if head:
		head.rotation.x = -0.06 * _amp + sin(_t * 0.8) * 0.02 * (1.0 - _amp) + 0.2 * hurt
	if tail:
		tail.rotation.y = sin(_t * (3.0 if moving else 1.5)) * (0.5 if moving else 0.2)
	if _attack >= 0.0 and weapon_arm:
		_attack += delta
		var k := clampf(_attack / 0.38, 0.0, 1.0)
		# ergue (0–35%) e desce com força (35–100%)
		var lift := smoothstep(0.0, 0.35, k)
		var swing := smoothstep(0.35, 0.75, k)
		weapon_arm.rotation.x = _idle_arm - 2.6 * lift + 3.0 * swing * lift
		if weapon_elbow:
			weapon_elbow.rotation.x = -0.6 * lift * (1.0 - swing)
		if body:
			body.rotation.y = 0.35 * lift - 0.6 * swing * lift
		if k >= 1.0:
			_attack = -1.0
			if body:
				body.rotation.y = 0.0
			if weapon_elbow:
				weapon_elbow.rotation.x = 0.0
	elif _attack >= 0.0:
		# monstros sem braço de arma: dão um bote para a frente
		_attack += delta
		var k2 := clampf(_attack / 0.35, 0.0, 1.0)
		if body:
			body.rotation.x += sin(k2 * PI) * 0.35
			body.position.z = sin(k2 * PI) * 0.18
		if k2 >= 1.0:
			_attack = -1.0
			if body:
				body.position.z = 0.0
