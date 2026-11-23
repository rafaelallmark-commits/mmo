extends RefCounted
## Monta a descrição de itens em BBCode. Cada requisito não atendido aparece em vermelho.
## Só os atributos permanentes contam (o servidor aplica a mesma regra).

const RED := "#ff5a4f"
const OK := "#cfc8b8"
const ATTR_ORDER := ["str", "spi", "tal", "agi", "vit"]

static func rarity_color(defs: Dictionary, rarity: String) -> String:
	return defs.get("rarities", {}).get(rarity, {}).get("color", "#ffffff")

static func rarity_name(defs: Dictionary, rarity: String) -> String:
	return defs.get("rarities", {}).get(rarity, {}).get("name", rarity)

static func item_name(defs: Dictionary, inst: Dictionary) -> String:
	var d: Dictionary = defs["items"].get(inst.get("defId", ""), {})
	var n: String = d.get("name", "?")
	if int(inst.get("enh", 0)) > 0:
		n += " +%d" % int(inst["enh"])
	if int(inst.get("qty", 1)) > 1:
		n += " x%d" % int(inst["qty"])
	return n

static func avg_damage(d: Dictionary) -> float:
	if not d.has("damage"):
		return 0.0
	return (float(d["damage"][0]) + float(d["damage"][1])) / 2.0

static func slot_of(d: Dictionary) -> String:
	var s = d.get("slot", null)
	if s == null:
		return ""
	return str(s)

## Requisitos pendentes (lista de textos) para o personagem.
static func missing_requirements(defs: Dictionary, d: Dictionary, ch: Dictionary) -> Array:
	var out := []
	if int(ch.get("level", 1)) < int(d.get("level", 1)):
		out.append("Nível %d exigido. Seu nível atual é %d." % [int(d["level"]), int(ch["level"])])
	var classes = d.get("classes", null)
	if classes != null and not (ch.get("classId", "") in classes):
		out.append("Classe não permitida.")
	var perm: Dictionary = ch.get("permanent", {})
	var req: Dictionary = d.get("req", {})
	for a in ATTR_ORDER:
		if req.has(a) and int(perm.get(a, 0)) < int(req[a]):
			out.append("%s %d" % [defs["attributes"][a]["name"], int(req[a])])
	return out

static func describe(defs: Dictionary, inst: Dictionary, ch: Dictionary, compare_with = null) -> String:
	var d: Dictionary = defs["items"].get(inst.get("defId", ""), {})
	if d.is_empty():
		return "Item desconhecido"
	var t := ""
	t += "[b][color=%s]%s[/color][/b]\n" % [rarity_color(defs, d.get("rarity", "common")), item_name(defs, inst)]
	t += "[color=#9a927f]%s · %s[/color]\n" % [rarity_name(defs, d.get("rarity", "common")).capitalize(), defs.get("families", {}).get(d.get("family", ""), d.get("family", ""))]
	var slot := slot_of(d)
	if slot != "":
		var hands := ""
		if d.get("kind", "") == "weapon":
			hands = " · " + ("Duas mãos (ocupa a mão secundária)" if int(d.get("hands", 1)) == 2 else "Uma mão")
		t += "Espaço: %s%s\n" % [defs.get("slots", {}).get(slot, slot), hands]
	# refino: +weaponDamagePct% no dano da arma e +defensePct% na defesa e no poder mágico da peça, por grau
	var enh := int(inst.get("enh", 0))
	var enh_cfg: Dictionary = defs.get("enhance", {})
	var dmg_mul := 1.0 + float(enh_cfg.get("weaponDamagePct", 0)) * enh / 100.0
	var def_mul := 1.0 + float(enh_cfg.get("defensePct", 0)) * enh / 100.0
	var enh_note := " [color=#9fd3d1](+%d)[/color]" % enh if enh > 0 else ""
	if d.has("damage"):
		var kind := "mágico" if d.get("damageType", "phys") == "magic" else "físico"
		var lo := int(floor(float(d["damage"][0]) * dmg_mul))
		var hi := int(floor(float(d["damage"][1]) * dmg_mul))
		t += "Dano %s: %d–%d%s  ·  intervalo %.2f s  ·  alcance %s m\n" % [kind, lo, hi, enh_note, float(d.get("attackIntervalMs", 1000)) / 1000.0, str(d.get("range", 2.5))]
	if d.has("crit"):
		t += "Crítico: +%s%%\n" % str(d["crit"])
	if d.has("magicPower"):
		t += "Poder mágico: %d%s\n" % [int(round(float(d["magicPower"]) * def_mul)), enh_note]
	if d.has("healBonusPct"):
		t += "Cura: +%d%%\n" % int(d["healBonusPct"])
	if d.has("defense"):
		t += "Defesa: %d%s\n" % [int(round(float(d["defense"]) * def_mul)), enh_note]
	if d.has("bonusHp"):
		t += "Vida máxima: +%d\n" % int(d["bonusHp"])
	if d.has("bonusMp"):
		t += "Mana máxima: +%d\n" % int(d["bonusMp"])
	if d.has("blockPct"):
		t += "Bloqueio: %d%% dos golpes de monstro\n" % int(d["blockPct"])
	if d.has("mres"):
		t += "Resistência mágica: %d\n" % int(d["mres"])
	if d.has("evasion"):
		t += "Evasão: +%d\n" % int(d["evasion"])
	if d.has("accuracy"):
		t += "Precisão: +%d\n" % int(d["accuracy"])
	if d.has("bonusAttrs"):
		for a in d["bonusAttrs"].keys():
			t += "+%d %s (não conta para requisitos)\n" % [int(d["bonusAttrs"][a]), defs["attributes"][a]["name"]]
	if d.get("questItem", false):
		# material de coleta das secundárias: só cai com a missão ativa e sai da bolsa na entrega
		t += "[color=#9fd3d1]Item de missão: sai da bolsa na entrega. Não se vende, troca, descarta nem vai para o depósito.[/color]\n"
	if d.has("use"):
		var u: Dictionary = d["use"]
		if u.has("healHp"):
			t += "Uso: recupera %d de vida\n" % int(u["healHp"])
		if u.has("healMp"):
			t += "Uso: recupera %d de mana\n" % int(u["healMp"])
	# requisitos
	var lvl_ok := int(ch.get("level", 1)) >= int(d.get("level", 1))
	t += "[color=%s]Nível mínimo: %d[/color]\n" % [OK if lvl_ok else RED, int(d.get("level", 1))]
	var classes = d.get("classes", null)
	if classes != null:
		var names := []
		for c in classes:
			names.append(defs["classes"][c]["name"])
		var cls_ok: bool = ch.get("classId", "") in classes
		t += "[color=%s]Classe: %s[/color]\n" % [OK if cls_ok else RED, ", ".join(names)]
	var req: Dictionary = d.get("req", {})
	var perm: Dictionary = ch.get("permanent", {})
	for a in ATTR_ORDER:
		if req.has(a):
			var cur := int(perm.get(a, 0))
			var ok := cur >= int(req[a])
			t += "[color=%s]%s %d (você: %d)[/color]\n" % [OK if ok else RED, defs["attributes"][a]["name"], int(req[a]), cur]
	# comparação com o equipado no mesmo espaço
	if compare_with != null and typeof(compare_with) == TYPE_DICTIONARY and not compare_with.is_empty():
		var e: Dictionary = defs["items"].get(compare_with.get("defId", ""), {})
		t += "\n[color=#9a927f]Comparado a %s:[/color]\n" % e.get("name", "?")
		t += _delta("Dano médio", avg_damage(d), avg_damage(e))
		t += _delta("Defesa", float(d.get("defense", 0)), float(e.get("defense", 0)))
		t += _delta("Bloqueio (%)", float(d.get("blockPct", 0)), float(e.get("blockPct", 0)))
		t += _delta("Poder mágico", float(d.get("magicPower", 0)), float(e.get("magicPower", 0)))
	return t

static func _delta(label: String, a: float, b: float) -> String:
	if a == 0.0 and b == 0.0:
		return ""
	var diff := a - b
	var col := "#6fd06a" if diff > 0 else ("#ff5a4f" if diff < 0 else "#cfc8b8")
	return "[color=%s]%s: %+.1f[/color]\n" % [col, label, diff]
