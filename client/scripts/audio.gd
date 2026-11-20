extends Node
## Som e música de CINZAS DO MERIDIANO (autoload "Sfx", carregado depois de Net).
## Todos os sons são originais, sintetizados por tools/audio/gerar_sons.py em client/audio/.
##
## Efeitos (pools de AudioStreamPlayer e AudioStreamPlayer3D: vários sons se sobrepõem; o tom varia
## um pouco a cada vez; volume, variação e limite de repetição por som na tabela SOUNDS):
##   Sfx.play("hit_blade", posicao)       # no mundo 3D: atenua com a distância do ouvinte
##   Sfx.play("loot_coins")               # sem posição: toca direto (interface, o próprio jogador)
##   Sfx.ui("ui_click")                   # atalho para sons de interface
##   Sfx.warn("valve")                    # avisos do chefe: "valve" (primeiro toque), "line" (segundo
##                                        # toque), "gate" (comporta descendo), "alarm" (apito)
## Música (sequenciador generativo: só agenda notas pré-gravadas sobre um bordão em laço; nada é
## sintetizado em tempo real):
##   Sfx.set_zone("estrada_velha")        # clima base do mapa: cidade "town", caça "explore", calabouço "dungeon"
##   Sfx.set_mood("title")                # força o clima base: explore, combat, boss, town, dungeon, title
##   Sfx.combat_ping()                    # o jogador local lutou agora: "combat" até ~6 s sem luta
##   Sfx.set_boss(true, fase)             # luta contra o Custódio: "boss" (na fase 3 entra o apito)
## Volume (0..1, salvo em user://settings.cfg, seção "som"):
##   Sfx.set_volume("master" | "music" | "sfx", v), Sfx.get_volume(tipo), Sfx.save_settings()
## Em modo headless (driver de áudio Dummy) tudo roda igual, só que sem saída de som.

const SFX_DIR := "res://audio/sfx/"
const MUSIC_DIR := "res://audio/music/"
const SETTINGS_PATH := "user://settings.cfg"
const COMBAT_HOLD_MS := 6000          # volta ao clima base depois de 6 s sem luta
const HEAR_DISTANCE := 48.0           # além disso, sons do mundo nem tocam
const POOL_UI := 10
const POOL_WORLD := 28
const POOL_NOTES := 14
const POOL_DRONES := 3                # o atual, o que está saindo e um livre (trocas rápidas de clima)
const SILENT_DB := -80.0

## nome: [volume dB, variação de tom (±), intervalo mínimo entre repetições (s), variantes, vozes ao mesmo tempo]
const SOUNDS := {
	"footstep_dirt": [-10.5, 0.10, 0.0, 3, 6],
	"footstep_stone": [-10.0, 0.08, 0.0, 3, 6],
	"swing_light": [-2.0, 0.10, 0.03, 1, 4],
	"swing_heavy": [-2.0, 0.08, 0.03, 1, 4],
	"hit_blade": [1.5, 0.08, 0.03, 1, 5],
	"hit_blunt": [-2.5, 0.08, 0.03, 1, 5],
	"hit_flesh": [0.5, 0.10, 0.03, 1, 5],
	"bow_release": [1.0, 0.06, 0.03, 1, 3],
	"arrow_hit": [-0.5, 0.08, 0.03, 1, 4],
	"javelin_throw": [0.5, 0.06, 0.03, 1, 3],
	"spell_cast": [-0.5, 0.06, 0.05, 1, 3],
	"spell_fire": [0.0, 0.06, 0.05, 1, 3],
	"spell_impact": [-1.5, 0.08, 0.04, 1, 4],
	"heal_chime": [0.0, 0.03, 0.08, 1, 3],
	"shield_up": [-0.5, 0.04, 0.08, 1, 2],
	"buff": [0.0, 0.04, 0.08, 1, 2],
	"debuff": [-0.5, 0.05, 0.08, 1, 2],
	"monster_hurt": [-1.0, 0.12, 0.08, 1, 3],
	"monster_die": [0.0, 0.10, 0.05, 1, 3],
	"player_hurt": [-1.0, 0.08, 0.3, 1, 2],
	"player_die": [-2.5, 0.0, 0.5, 1, 1],
	"level_up": [6.5, 0.0, 0.5, 1, 2],
	"quest_done": [5.0, 0.0, 0.5, 1, 1],
	"loot_coins": [2.0, 0.06, 0.06, 1, 2],
	"loot_item": [-1.0, 0.06, 0.06, 1, 2],
	"potion": [-1.5, 0.04, 0.2, 1, 1],
	"ui_click": [-7.0, 0.05, 0.03, 1, 2],
	"ui_open": [-5.0, 0.04, 0.05, 1, 2],
	"ui_close": [-5.5, 0.04, 0.05, 1, 2],
	"ui_error": [-2.5, 0.0, 0.25, 1, 1],
	"refine_ok": [4.0, 0.0, 0.3, 1, 1],
	"refine_fail": [2.5, 0.0, 0.3, 1, 1],
	"portal": [4.0, 0.03, 0.4, 1, 2],
	"bell_warn_1": [4.0, 0.0, 0.8, 1, 1],
	"bell_warn_2": [5.5, 0.0, 0.8, 1, 1],
	"gate_rumble": [0.5, 0.03, 1.0, 1, 1],
	"alarm_pulse": [2.5, 0.0, 0.6, 1, 1],
	"steam_vent": [6.0, 0.03, 1.0, 1, 2],
}
const DEFAULT_SOUND := [-4.0, 0.05, 0.03, 1, 3]

# ---------------- música ----------------
## Notas pré-gravadas: semitons acima de Ré 3 -> arquivo. As que faltam saem do vizinho com pitch_scale.
const BELLS := {0: "bell_d3", 3: "bell_f3", 5: "bell_g3", 7: "bell_a3", 8: "bell_bb3", 10: "bell_c4", 12: "bell_d4",
	14: "bell_e4", 15: "bell_f4", 17: "bell_g4", 19: "bell_a4", 22: "bell_c5", 24: "bell_d5"}
const FLUTES := {12: "flute_d4", 14: "flute_e4", 15: "flute_f4", 17: "flute_g4", 19: "flute_a4", 22: "flute_c5", 24: "flute_d5"}
const SCALES := {
	"dorian": [0, 2, 3, 5, 7, 9, 10],
	"aeolian": [0, 2, 3, 5, 7, 8, 10],
	"phrygian": [0, 1, 3, 5, 7, 8, 10],
	"mixolydian": [0, 2, 4, 5, 7, 9, 10],
}
## Climas. bpm em semínimas (o relógio anda em colcheias, 8 por compasso). deg: faixa da melodia em graus da
## escala a partir de Ré 3. perc: [arquivo, colcheias do compasso, chance, dB, tom, a cada N compassos].
## motif: "intro" (abertura: primeiro e segundo toque com os sinos de aviso) ou "bells" (o mesmo desenho,
## baixinho, nos sinos da música). ostinato: figura grave de sinos sobre a progressão "prog" (graus).
const MOODS := {
	"title": {"drone": "drone_explore", "drone_db": -6.0, "bpm": 60, "scale": "dorian", "deg": [5, 12],
		"bell_p": 0.1, "bell_db": -6.0, "flute_p": 0.3, "flute_db": -8.0, "perc": [], "motif": "intro", "motif_every": 16},
	"town": {"drone": "drone_town", "drone_db": -6.5, "bpm": 66, "scale": "mixolydian", "deg": [7, 14],
		"bell_p": 0.08, "bell_db": -6.5, "flute_p": 0.45, "flute_db": -5.5,
		"perc": [["perc_tick", [0, 4], 0.2, -14.5, 1.0, 1]]},
	"explore": {"drone": "drone_explore", "drone_db": -3.5, "bpm": 72, "scale": "dorian", "deg": [4, 12],
		"bell_p": 0.1, "bell_db": -4.5, "flute_p": 0.22, "flute_db": -5.5, "perc": []},
	"combat": {"drone": "drone_combat", "drone_db": -7.5, "bpm": 112, "scale": "aeolian", "deg": [3, 10],
		"bell_p": 0.05, "bell_db": -11.5, "ostinato": true, "ost_db": -9.5, "prog": [0, 0, 5, 6], "flute_p": 0.0,
		"perc": [["perc_tank", [0, 3, 6], 0.85, -7.5, 1.0, 1], ["perc_anvil", [2, 6], 0.6, -13.5, 1.0, 1],
			["perc_tick", [1, 3, 5, 7], 0.55, -17.5, 1.0, 1], ["perc_chain", [4], 0.3, -16.5, 1.0, 1],
			["perc_gong", [0], 1.0, -11.5, 1.0, 4]]},
	"dungeon": {"drone": "drone_dungeon", "drone_db": -4.0, "bpm": 56, "scale": "phrygian", "deg": [0, 9],
		"bell_p": 0.06, "bell_db": -10.0, "flute_p": 0.06, "flute_db": -12.0,
		"perc": [["perc_tick", [0, 1, 2, 3, 4, 5, 6, 7], 0.04, -21.0, 1.5, 1], ["perc_gong", [0], 0.6, -13.0, 0.9, 8]],
		"motif": "bells", "motif_every": 8},
	"boss": {"drone": "drone_boss", "drone_db": -7.5, "bpm": 100, "scale": "phrygian", "deg": [0, 9],
		"bell_p": 0.04, "bell_db": -12.5, "ostinato": true, "ost_db": -10.5, "prog": [0, 0, 1, 0], "flute_p": 0.0,
		"perc": [["perc_gong", [0], 1.0, -10.5, 1.0, 2], ["perc_tank", [0, 3, 4, 6], 0.9, -8.5, 0.92, 1],
			["perc_anvil", [2, 6], 0.75, -14.5, 0.95, 1], ["perc_tick", [1, 3, 5, 7], 0.75, -18.5, 1.0, 1],
			["perc_chain", [2, 6], 0.35, -18.5, 0.9, 1]],
		"motif": "bells", "motif_every": 4},
}
## Sabor de cada mapa: clima base e ajustes que valem enquanto o clima tocando é o base.
## verb: quanto de reverberação o barramento SFX ganha (túneis e câmaras ecoam mais).
const ZONES := {
	"pedrambar": {"base": "town", "verb": 0.04},
	"vau_de_nacar": {"base": "town", "scale": "dorian", "verb": 0.04},
	"estrada_velha": {"base": "explore", "verb": 0.03},
	"brejo_bombas": {"base": "explore", "scale": "aeolian", "bpm": 66, "flute_p": 0.32, "deg": [2, 10], "verb": 0.05},
	"oficina_soterrada": {"base": "explore", "scale": "aeolian", "verb": 0.12,
		"perc": [["perc_anvil", [0], 0.4, -13.5, 1.0, 2], ["perc_tick", [3, 6], 0.25, -15.5, 1.0, 1]]},
	"galerias_eco": {"base": "explore", "scale": "phrygian", "echo": true, "bell_p": 0.08, "flute_p": 0.12, "verb": 0.2},
	"canais_eclusa": {"base": "explore", "scale": "aeolian", "bpm": 64, "verb": 0.12,
		"perc": [["perc_gong", [0], 0.5, -12.5, 1.0, 4]]},
	"ultima_eclusa": {"base": "dungeon", "verb": 0.22},
	"arena_prova": {"base": "dungeon", "motif": "", "verb": 0.1},
}

var volumes := {"master": 0.9, "music": 0.7, "sfx": 0.9}
const BUSES := {"master": "Master", "music": "Music", "sfx": "SFX"}

var listener_pos := Vector3.ZERO
var _listener_on := false
var _ui: Array = []
var _world: Array = []
var _notes: Array = []
var _drones: Array = []
var _next := {"ui": 0, "world": 0, "notes": 0}
var _streams := {}
var _last := {}
var _later: Array = []          # [ms, nome, posição, dB, tom]: efeitos agendados
var _missing_warned := false
var _reverb: AudioEffectReverb

var _zone := ""
var _base := ""
var _mood := ""
var _combat_until := 0
var _boss := false
var _boss_phase := 1
var _cfg := {}
var _step := 0
var _acc := 0.0
var _clock_us := 0
var _deg := 0
var _phrase: Array = []
var _phrase_t := 0
var _ost: Array = []
var _queue: Array = []          # [colcheia, caminho, dB, tom]: notas agendadas (ecos, motivo)
var _drone: AudioStreamPlayer = null   # bordão do clima atual
var _drone_name := ""
var _dirty := false             # volumes mudaram e ainda não foram salvos

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_ensure_buses()
	for i in POOL_UI:
		_ui.append(_player(false, "SFX"))
	for i in POOL_WORLD:
		_world.append(_player(true, "SFX"))
	for i in POOL_NOTES:
		_notes.append(_player(false, "Music"))
	for i in POOL_DRONES:
		_drones.append(_player(false, "Music"))
	load_settings()
	get_tree().node_added.connect(_on_node_added)

## Ao fechar o jogo: salva volumes ainda não salvos (ex.: janela fechada com Opções aberta), para tudo e
## dá ao mixer um instante para soltar os sons que estavam tocando (o AudioServer libera as reproduções
## na thread de áudio; sem a espera o Godot acusa vazamento). Os filhos saem da árvore antes do pai e
## já pararam sozinhos, então a espera vale sempre que algum som foi carregado nesta sessão.
func _exit_tree() -> void:
	if _dirty:
		save_settings()
	for pool in [_ui, _world, _notes, _drones]:
		for p in pool:
			p.stop()
	if not _streams.is_empty():
		OS.delay_msec(150)

# ---------------- efeitos ----------------
## Toca um efeito. world_pos (Vector3) = no mundo 3D; null = direto, sem posição.
func play(snd: String, world_pos = null, volume_db := 0.0, pitch := 1.0) -> void:
	var d: Array = SOUNDS.get(snd, DEFAULT_SOUND)
	var now := Time.get_ticks_msec()
	if now - int(_last.get(snd, -1000000)) < int(float(d[2]) * 1000.0):
		return
	var at_world := world_pos is Vector3
	var wp := Vector3.ZERO
	if at_world:
		wp = world_pos
		if _listener_on and wp.distance_to(listener_pos) > HEAR_DISTANCE:
			return
	var pool: Array = _world if at_world else _ui
	if _busy(pool, snd) >= int(d[4]):
		return
	var s := _sfx_stream(snd, int(d[3]))
	if s == null:
		return
	_last[snd] = now
	var p = _pick(pool, "world" if at_world else "ui")
	p.stop()
	p.stream = s
	p.volume_db = float(d[0]) + volume_db
	p.pitch_scale = maxf(0.05, pitch * (1.0 + randf_range(-float(d[1]), float(d[1]))))
	p.set_meta("snd", snd)
	if at_world:
		(p as AudioStreamPlayer3D).global_position = wp
	p.play()

## Como play(), mas daqui a `delay` segundos (ex.: o impacto logo depois do golpe cortar o ar).
func play_later(delay: float, snd: String, world_pos = null, volume_db := 0.0, pitch := 1.0) -> void:
	_later.append([Time.get_ticks_msec() + int(delay * 1000.0), snd, world_pos, volume_db, pitch])

## Som de interface (sem posição).
func ui(snd: String, volume_db := 0.0) -> void:
	play(snd, null, volume_db)

## Avisos de perigo do chefe (ouvidos por todos na câmara, sem posição).
func warn(kind: String) -> void:
	match kind:
		"line", "bell2":
			play("bell_warn_2")
		"gate", "gates":
			play("gate_rumble")
		"alarm":
			play("alarm_pulse")
		_:
			play("bell_warn_1")

## Ouvinte dos sons 3D (world.gd atualiza a cada quadro; além de HEAR_DISTANCE nada toca).
func set_listener(pos: Vector3) -> void:
	listener_pos = pos
	_listener_on = true

func clear_listener() -> void:
	_listener_on = false

# ---------------- música ----------------
## Zona atual: escolhe o clima base (cidade, caça, calabouço) e o eco do barramento de efeitos.
func set_zone(map_id: String) -> void:
	_zone = map_id
	_base = String(ZONES.get(map_id, {}).get("base", "explore")) if map_id != "" else ""
	_boss = false
	_boss_phase = 1
	_combat_until = 0
	_mood = "-"   # reaplica o clima: o sabor da zona pode ter mudado
	if _reverb:
		_reverb.wet = float(ZONES.get(map_id, {}).get("verb", 0.04))

## Força o clima base ("explore", "combat", "boss", "town", "dungeon" ou "title").
func set_mood(mood: String) -> void:
	if MOODS.has(mood):
		_base = mood

## O jogador local está lutando: clima de combate até COMBAT_HOLD_MS depois da última luta.
func combat_ping() -> void:
	_combat_until = Time.get_ticks_msec() + COMBAT_HOLD_MS

## Luta contra o Custódio em andamento (fase 1–3).
func set_boss(active: bool, phase := 1) -> void:
	_boss = active
	_boss_phase = phase

func stop_music() -> void:
	_base = ""

func current_mood() -> String:
	return _mood

func _wanted_mood() -> String:
	if _base == "":
		return ""
	if _boss:
		return "boss"
	if Time.get_ticks_msec() < _combat_until and not (_base in ["town", "title"]):
		return "boss" if _zone == "ultima_eclusa" else "combat"
	return _base

func _process(delta: float) -> void:
	if not _later.is_empty():
		var now := Time.get_ticks_msec()
		var i := 0
		while i < _later.size():
			var e: Array = _later[i]
			if now >= int(e[0]):
				_later.remove_at(i)
				play(String(e[1]), e[2], float(e[3]), float(e[4]))
			else:
				i += 1
	var want := _wanted_mood()
	if want != _mood:
		_apply_mood(want)
	_note_offs()
	# relógio real (monotônico), não o delta do quadro: sem v-sync o Godot suaviza o delta e o
	# andamento sairia errado (mesmo motivo de D49 no movimento)
	var now_us := Time.get_ticks_usec()
	var dt := clampf(float(now_us - _clock_us) / 1000000.0, 0.0, 0.25) if _clock_us > 0 else delta
	_clock_us = now_us
	if _cfg.is_empty():
		return
	_acc = minf(_acc + dt, 1.0)
	var step_len := 30.0 / float(_cfg["bpm"])
	while _acc >= step_len:
		_acc -= step_len
		_tick()
		_step += 1

func _apply_mood(m: String) -> void:
	_mood = m
	_queue.clear()
	_phrase = []
	if m == "":
		_cfg = {}
		_fade_drone("")
		return
	var cfg: Dictionary = MOODS[m].duplicate(true)
	var z: Dictionary = ZONES.get(_zone, {})
	if String(z.get("base", "")) == m:
		for k in z.keys():
			if not (k in ["base", "verb"]):
				cfg[k] = z[k]
	_cfg = cfg
	_step = 0
	_acc = 0.0
	_deg = int((int(cfg["deg"][0]) + int(cfg["deg"][1])) / 2)
	if cfg.get("ostinato", false):
		_ost = [[[0, 0], [3, 4], [6, 7]], [[0, 0], [3, 2], [5, 4], [6, 7]], [[0, 0], [2, 0], [3, 4], [6, 2]]].pick_random()
	_fade_drone(String(cfg["drone"]))

## Uma colcheia do relógio da música.
func _tick() -> void:
	var c := _cfg
	var s := _step % 8
	var bar := _step / 8
	for q in _queue.duplicate():
		if int(q[0]) <= _step:
			_queue.erase(q)
			_note(String(q[1]), float(q[2]), float(q[3]))
	var every := int(c.get("motif_every", 0))
	if every > 0 and s == 0 and bar % every == 0:
		_motif(String(c.get("motif", "")))
	for h in c.get("perc", []):
		if s in h[1] and bar % maxi(1, int(h[5])) == 0 and randf() < float(h[2]):
			_note(MUSIC_DIR + String(h[0]) + ".wav", float(h[3]) + randf_range(-1.5, 0.0), float(h[4]) * randf_range(0.97, 1.03))
	if c.get("ostinato", false):
		var prog: Array = c.get("prog", [0])
		var root := int(prog[bar % prog.size()])
		for o in _ost:
			if int(o[0]) == s:
				_bell(_semi(root + int(o[1])), float(c.get("ost_db", -12.0)) + (0.0 if s == 0 else -3.0))
	if randf() < float(c.get("bell_p", 0.0)) * (1.4 if s % 2 == 0 else 0.5):
		var semi := _walk()
		var db := float(c["bell_db"]) + randf_range(-4.0, 0.0)
		_bell(semi, db)
		if c.get("echo", false):
			var r := _nearest(BELLS, semi)
			_queue.append([_step + 3, MUSIC_DIR + String(r[0]) + ".wav", db - 7.0, float(r[1])])
			_queue.append([_step + 6, MUSIC_DIR + String(r[0]) + ".wav", db - 13.0, float(r[1])])
	if s == 0 and _phrase.is_empty() and randf() < float(c.get("flute_p", 0.0)):
		_phrase = _make_phrase()
		_phrase_t = 0
	_play_phrase()
	if _mood == "boss" and _boss_phase >= 3 and s == 0 and bar % 2 == 0:
		play("alarm_pulse", null, -4.0)

## Primeiro toque (um sino grave) e depois o segundo toque (duas batidas mais agudas): na abertura,
## com os próprios sinos de aviso, um compasso e meio depois (quando o primeiro já se apagou); no
## calabouço e no chefe, baixinho nos sinos da música, meio compasso depois.
func _motif(kind: String) -> void:
	match kind:
		"intro":
			_note(SFX_DIR + "bell_warn_1.wav", -1.0, 1.0)
			_queue.append([_step + 12, SFX_DIR + "bell_warn_2.wav", -2.0, 1.0])
		"bells":
			var db := float(_cfg.get("bell_db", -14.0)) - 1.0
			_bell(0, db + 2.0)
			var r := _nearest(BELLS, 7)
			_queue.append([_step + 4, MUSIC_DIR + String(r[0]) + ".wav", db, float(r[1])])
			_queue.append([_step + 5, MUSIC_DIR + String(r[0]) + ".wav", db + 1.0, float(r[1])])

func _semi(deg: int) -> int:
	var sc: Array = SCALES.get(String(_cfg.get("scale", "dorian")), SCALES["dorian"])
	return int(sc[posmod(deg, sc.size())]) + 12 * floori(float(deg) / float(sc.size()))

## Passeio da melodia pelos graus da escala (passos curtos, saltos raros), dentro da faixa do clima.
func _walk() -> int:
	var lo := int(_cfg["deg"][0])
	var hi := int(_cfg["deg"][1])
	var r := randf()
	var mv := -3
	if r < 0.32:
		mv = 1
	elif r < 0.64:
		mv = -1
	elif r < 0.78:
		mv = 2
	elif r < 0.9:
		mv = -2
	elif r < 0.95:
		mv = 4
	_deg += mv
	if _deg > hi:
		_deg = hi - (_deg - hi)
	if _deg < lo:
		_deg = lo + (lo - _deg)
	_deg = clampi(_deg, lo, hi)
	return _semi(_deg)

## Frase de flauta: 3 a 5 notas por graus vizinhos, terminando longa.
func _make_phrase() -> Array:
	var n := (SCALES.get(String(_cfg.get("scale", "dorian")), SCALES["dorian"]) as Array).size()
	var notes := []
	var count := randi_range(3, 5)
	var at := 0
	var deg := randi_range(n, n + 4)
	for i in count:
		var dur: int = [2, 2, 3, 4].pick_random() if i < count - 1 else [4, 6].pick_random()
		notes.append([at, _semi(deg), dur])
		at += dur
		deg = clampi(deg + [-2, -1, -1, 1, 1, 2].pick_random(), n, 2 * n)
	return notes

func _play_phrase() -> void:
	if _phrase.is_empty():
		return
	var step_s := 30.0 / float(_cfg["bpm"])
	while not _phrase.is_empty() and int(_phrase[0][0]) <= _phrase_t:
		var nt: Array = _phrase.pop_front()
		var r := _nearest(FLUTES, int(nt[1]))
		_note(MUSIC_DIR + String(r[0]) + ".wav", float(_cfg.get("flute_db", -14.0)) + randf_range(-2.0, 0.0), float(r[1]), step_s * float(nt[2]) + 0.05)
	_phrase_t += 1

func _nearest(table: Dictionary, semi: int) -> Array:
	var best := -1000
	for k in table.keys():
		if absi(semi - int(k)) < absi(semi - best):
			best = int(k)
	return [table[best], pow(2.0, float(semi - best) / 12.0)]

func _bell(semi: int, db: float) -> void:
	var r := _nearest(BELLS, semi)
	_note(MUSIC_DIR + String(r[0]) + ".wav", db, float(r[1]))

## Toca uma nota num canal livre da música; dur_s > 0 corta com fade depois desse tempo.
func _note(path: String, db: float, pitch := 1.0, dur_s := 0.0) -> void:
	var s := _load(path)
	if s == null:
		return
	var p: AudioStreamPlayer = _pick(_notes, "notes")
	_kill_tween(p)
	p.stop()
	p.stream = s
	p.volume_db = db
	p.pitch_scale = maxf(0.05, pitch)
	p.set_meta("off", Time.get_ticks_msec() + int(dur_s * 1000.0) if dur_s > 0.0 else 0)
	p.play()

func _note_offs() -> void:
	var now := Time.get_ticks_msec()
	for p in _notes:
		var off := int(p.get_meta("off", 0))
		if off > 0 and now >= off:
			p.set_meta("off", 0)
			if p.playing:
				_fade(p, SILENT_DB, 0.18, true)

## Troca o bordão com crossfade de potência constante: o atual desce enquanto o novo sobe e a soma
## fica no mesmo volume, sem buraco no meio. Mesmo bordão: só o volume se ajusta. Um bordão que ainda
## está saindo de uma troca recente (ex.: combate ↔ caça) volta a subir de onde está, sem recomeçar;
## um novo começa num ponto qualquer do laço, num canal livre (ou no que já está mais baixo).
func _fade_drone(drone: String) -> void:
	var target := float(_cfg.get("drone_db", -14.0))
	if drone == _drone_name and drone != "" and _drone != null:
		_fade(_drone, target, 2.0)
		return
	if _drone != null:
		_fade(_drone, SILENT_DB, 3.0, true)
	_drone = null
	_drone_name = drone
	if drone == "":
		return
	var s := _load(MUSIC_DIR + drone + ".wav")
	if s == null:
		return
	_ensure_loop(s)
	var p: AudioStreamPlayer = null
	for d in _drones:
		if d.playing and d.stream == s:
			p = d
			break
	if p == null:
		p = _quietest(_drones)
		_kill_tween(p)
		p.stop()
		p.stream = s
		p.volume_db = SILENT_DB
		p.play(randf() * 4.0)
	_drone = p
	_fade(p, target, 3.0)

## Canal livre do grupo ou, se todos estiverem tocando, o mais baixo (o que já quase sumiu).
func _quietest(pool: Array) -> AudioStreamPlayer:
	var best: AudioStreamPlayer = null
	for p in pool:
		if not p.playing:
			return p
		if best == null or p.volume_db < best.volume_db:
			best = p
	return best

## Os bordões já vêm com o ponto de laço no WAV; se o importador não o leu, liga o laço aqui.
func _ensure_loop(s: AudioStream) -> void:
	var w := s as AudioStreamWAV
	if w and w.loop_mode == AudioStreamWAV.LOOP_DISABLED:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		w.loop_end = int(round(w.get_length() * float(w.mix_rate)))

## Leva o volume do canal até `db` em `time` s interpolando a potência (curva seno²), não os dB: dois
## canais que se cruzam com o mesmo tempo somam sempre a mesma potência (crossfade sem buraco).
## db <= -60 é silêncio; stop_after para o canal no fim.
func _fade(p: AudioStreamPlayer, db: float, time: float, stop_after := false) -> void:
	_kill_tween(p)
	var a := db_to_linear(p.volume_db)
	var b := 0.0 if db <= -60.0 else db_to_linear(db)
	var tw := create_tween()
	tw.tween_method(_set_power.bind(p, a * a, b * b), 0.0, 1.0, time)
	if stop_after:
		tw.tween_callback(p.stop)
	p.set_meta("tw", tw)

func _set_power(u: float, p: AudioStreamPlayer, p0: float, p1: float) -> void:
	var w := sin(u * PI * 0.5)
	p.volume_db = linear_to_db(sqrt(maxf(1e-8, lerpf(p0, p1, w * w))))

func _kill_tween(p: Node) -> void:
	if not p.has_meta("tw"):
		return
	var tw = p.get_meta("tw")
	if tw is Tween and (tw as Tween).is_valid():
		(tw as Tween).kill()
	p.remove_meta("tw")

# ---------------- volume ----------------
func set_volume(kind: String, v: float) -> void:
	if volumes.has(kind):
		volumes[kind] = clampf(v, 0.0, 1.0)
		_dirty = true
		_apply_volumes()

func get_volume(kind: String) -> float:
	return float(volumes.get(kind, 1.0))

func load_settings() -> void:
	var cfg := ConfigFile.new()
	if cfg.load(SETTINGS_PATH) == OK:
		for k in volumes.keys():
			volumes[k] = clampf(float(cfg.get_value("som", k, volumes[k])), 0.0, 1.0)
	_apply_volumes()

func save_settings() -> void:
	var cfg := ConfigFile.new()
	cfg.load(SETTINGS_PATH)   # preserva outras seções, se houver
	for k in volumes.keys():
		cfg.set_value("som", k, volumes[k])
	if cfg.save(SETTINGS_PATH) == OK:
		_dirty = false

## Curva quadrática: o meio do controle soa como "metade do volume".
func _apply_volumes() -> void:
	for k in volumes.keys():
		var i := AudioServer.get_bus_index(BUSES[k])
		if i < 0:
			continue
		var v := float(volumes[k])
		AudioServer.set_bus_mute(i, v <= 0.001)
		AudioServer.set_bus_volume_db(i, linear_to_db(maxf(v * v, 0.0001)))

# ---------------- infraestrutura ----------------
## Cria os barramentos "Music" e "SFX" (se o projeto não tiver), com compressor e eco no SFX e um
## limitador no Master para muitos sons juntos não estourarem.
func _ensure_buses() -> void:
	for bus_name in ["Music", "SFX"]:
		if AudioServer.get_bus_index(bus_name) < 0:
			AudioServer.add_bus()
			var i := AudioServer.bus_count - 1
			AudioServer.set_bus_name(i, bus_name)
			AudioServer.set_bus_send(i, "Master")
	var sfx := AudioServer.get_bus_index("SFX")
	if AudioServer.get_bus_effect_count(sfx) == 0:
		# só segura o acúmulo de muitos sons juntos (o detector é de pico: limiar alto, ataque que deixa
		# passar o transiente); um som sozinho passa intacto
		var comp := AudioEffectCompressor.new()
		comp.threshold = -6.0
		comp.ratio = 2.5
		comp.attack_us = 3000.0
		comp.release_ms = 200.0
		AudioServer.add_bus_effect(sfx, comp)
		_reverb = AudioEffectReverb.new()
		_reverb.room_size = 0.55
		_reverb.damping = 0.55
		_reverb.spread = 0.6
		_reverb.predelay_msec = 35.0
		_reverb.hipass = 0.15
		_reverb.dry = 1.0
		_reverb.wet = 0.04
		AudioServer.add_bus_effect(sfx, _reverb)
	var master := AudioServer.get_bus_index("Master")
	if AudioServer.get_bus_effect_count(master) == 0 and ClassDB.class_exists("AudioEffectHardLimiter"):
		var lim = ClassDB.instantiate("AudioEffectHardLimiter")
		lim.set("ceiling_db", -0.5)
		AudioServer.add_bus_effect(master, lim)

func _player(world: bool, bus: String) -> Node:
	var p: Node
	if world:
		var p3 := AudioStreamPlayer3D.new()
		p3.unit_size = 4.0
		p3.max_db = 6.0
		p3.max_distance = HEAR_DISTANCE
		p3.attenuation_model = AudioStreamPlayer3D.ATTENUATION_INVERSE_DISTANCE
		p3.attenuation_filter_cutoff_hz = 6000.0
		p3.attenuation_filter_db = -14.0
		p3.panning_strength = 0.8
		p = p3
	else:
		p = AudioStreamPlayer.new()
	p.set("bus", bus)
	add_child(p)
	return p

## Canal livre do pool (ou o mais antigo, se todos estiverem tocando).
func _pick(pool: Array, key: String):
	var n := pool.size()
	var start := int(_next[key])
	for k in n:
		var i := (start + k) % n
		if not pool[i].playing:
			_next[key] = (i + 1) % n
			return pool[i]
	_next[key] = (start + 1) % n
	return pool[start]

func _busy(pool: Array, snd: String) -> int:
	var c := 0
	for p in pool:
		if p.playing and String(p.get_meta("snd", "")) == snd:
			c += 1
	return c

func _sfx_stream(snd: String, variants: int) -> AudioStream:
	var file := snd
	if variants > 1:
		var k := randi() % variants
		if k > 0:
			file = "%s_%d" % [snd, k + 1]
	return _load(SFX_DIR + file + ".wav")

func _load(path: String) -> AudioStream:
	if _streams.has(path):
		return _streams[path]
	var s: AudioStream = null
	if ResourceLoader.exists(path):
		s = load(path) as AudioStream
	if s == null and not _missing_warned:
		_missing_warned = true
		push_warning("Sfx: som ausente (%s). Importe o projeto: godot --headless --path client --import" % path)
	_streams[path] = s
	return s

## Todo botão da interface faz um clique (exceto os marcados com a meta "sfx_silent").
func _on_node_added(n: Node) -> void:
	if n is BaseButton and not n.has_meta("sfx_silent"):
		var b := n as BaseButton
		if not b.pressed.is_connected(_on_button):
			b.pressed.connect(_on_button)

func _on_button() -> void:
	ui("ui_click")
