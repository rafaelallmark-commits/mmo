extends Node3D
## Animação procedural de personagens e monstros: andar (pernas e braços alternados,
## joelhos dobrando, corpo subindo e descendo), respiração parado e golpe do braço da arma.
## As articulações são registradas por art.gd ao montar o modelo.

var legs: Array = []     # [pivô, fase]
var knees: Array = []    # [pivô, fase]
var arms: Array = []     # [pivô, fase]
var tail: Node3D = null
var body: Node3D = null
var head: Node3D = null
var weapon_arm: Node3D = null
var weapon_elbow: Node3D = null
var stride := 0.65
var step_speed := 9.0
var moving := false
var _amp := 0.0
var _t := 0.0
var _attack := -1.0
var _idle_arm := 0.0

func _ready() -> void:
	_t = randf() * TAU
	if weapon_arm:
		_idle_arm = weapon_arm.rotation.x

func set_moving(m: bool) -> void:
	moving = m

func play_attack() -> void:
	_attack = 0.0

func _process(delta: float) -> void:
	_amp = lerpf(_amp, 1.0 if moving else 0.0, clampf(delta * 8.0, 0.0, 1.0))
	_t += delta * (step_speed if moving else 2.0)
	for l in legs:
		l[0].rotation.x = sin(_t + l[1]) * stride * _amp
	for k in knees:
		k[0].rotation.x = maxf(0.0, sin(_t + k[1] + 1.2)) * 1.1 * _amp
	for a in arms:
		if a[0] == weapon_arm and _attack >= 0.0:
			continue
		var base := _idle_arm if a[0] == weapon_arm else 0.0
		a[0].rotation.x = base - sin(_t + a[1]) * 0.55 * _amp + sin(_t * 0.5) * 0.03 * (1.0 - _amp)
	if body:
		body.position.y = absf(sin(_t)) * 0.05 * _amp + sin(_t * 0.5) * 0.012 * (1.0 - _amp)
		body.rotation.x = 0.08 * _amp
	if head:
		head.rotation.x = -0.06 * _amp + sin(_t * 0.5) * 0.02 * (1.0 - _amp)
	if tail:
		tail.rotation.y = sin(_t * 1.5) * (0.5 if moving else 0.2)
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
