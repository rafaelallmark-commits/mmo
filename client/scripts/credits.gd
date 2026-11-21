extends RefCounted
## Créditos e licenças (D151): créditos do jogo e dos modelos VRM, a licença do Godot Engine e os componentes
## de terceiros que vêm com ele, lidos do próprio motor (Engine.get_license_text, get_copyright_info e
## get_license_info). A tela "Créditos e licenças" do título mostra estes textos, e a release grava o mesmo
## conteúdo em LICENCAS-TERCEIROS.txt, que vai dentro de cada pacote (--licenses=arquivo).

const FILE_NAME := "LICENCAS-TERCEIROS.txt"

## Créditos do jogo (resumo de docs/CREDITOS.md; o crédito do Seed-san é obrigatório pela licença VRM).
static func game_text(version: String) -> String:
	var v: Dictionary = Engine.get_version_info()
	return "\n".join(PackedStringArray([
		"CINZAS DO MERIDIANO · versão %s" % version,
		"",
		"Um MMORPG original: mundo, história, personagens, missões, interface, código, ícone, efeitos sonoros e",
		"música foram criados para o jogo. Os sons e a música são sintetizados do zero — nada foi gravado, baixado",
		"ou tirado de bancos de sons.",
		"",
		"MODELOS DE PERSONAGEM (VRM)",
		"Os personagens jogáveis e os NPCs usam dois modelos de exemplo publicados pelo VRM Consortium no",
		"repositório da especificação VRM (vrm-c/vrm-specification, pasta samples), modificados pelo jogo em tempo",
		"de execução (materiais, cores, peças ocultas, animação e equipamento):",
		"  • Seed-san — Seed-san model by VirtualCast, Inc. — VRM Public License 1.0",
		"  • VRM1_Constraint_Twist_Sample — © 2022 pixiv Inc. — VRM Public License 1.0",
		"Licença: https://vrm.dev/licenses/1.0/ — os metadados de cada arquivo permitem o uso como avatar por",
		"qualquer pessoa, o uso comercial, a redistribuição e a modificação.",
		"",
		"MOTOR",
		"Feito com o Godot Engine %d.%d (https://godotengine.org), licença MIT. A licença do motor, os componentes" % [int(v.get("major", 4)), int(v.get("minor", 3))],
		"de terceiros que vêm com ele e os textos das licenças estão nas outras abas desta tela e no arquivo",
		"%s, que acompanha cada pacote do jogo." % FILE_NAME,
	]))

## Licença do Godot Engine (MIT/Expat), com o aviso de direitos que ela exige.
static func engine_text() -> String:
	return "Este jogo usa o Godot Engine, disponível sob a licença MIT (Expat):\n\n" + Engine.get_license_text().strip_edges()

## Componentes de terceiros do motor: nome, direitos e licença de cada parte (e os arquivos, quando o
## componente tem partes com licenças diferentes).
static func components_text() -> String:
	var out := PackedStringArray([
		"Componentes de terceiros incluídos no Godot Engine e, portanto, neste jogo, com os direitos e a licença de",
		"cada parte. Os textos completos das licenças estão na aba Licenças (ou na seção 4 do arquivo).",
	])
	for c in Engine.get_copyright_info():
		var parts: Array = c.get("parts", [])
		out.append("")
		out.append(str(c.get("name", "")))
		for part in parts:
			if parts.size() > 1:
				out.append("    Arquivos: " + ", ".join(PackedStringArray(part.get("files", []))))
			for line in part.get("copyright", []):
				out.append("    Copyright © " + str(line))
			out.append("    Licença: " + str(part.get("license", "")))
	return "\n".join(out)

## Textos completos das licenças citadas pelos componentes, em ordem alfabética.
static func licenses_text() -> String:
	var info: Dictionary = Engine.get_license_info()
	var names := info.keys()
	names.sort()
	var out := PackedStringArray()
	for n in names:
		out.append("==== %s ====" % n)
		out.append("")
		out.append(str(info[n]).strip_edges())
		out.append("")
	return "\n".join(out)

## Tudo junto, para o arquivo que vai nos pacotes.
static func full_text(version: String) -> String:
	return "\n".join(PackedStringArray([
		"CINZAS DO MERIDIANO %s — créditos e licenças de terceiros" % version,
		"(o mesmo conteúdo da tela \"Créditos e licenças\" do menu inicial do jogo)",
		"",
		"1. CRÉDITOS DO JOGO",
		"",
		game_text(version),
		"",
		"2. GODOT ENGINE",
		"",
		engine_text(),
		"",
		"3. COMPONENTES DE TERCEIROS DO GODOT ENGINE",
		"",
		components_text(),
		"",
		"4. TEXTOS DAS LICENÇAS",
		"",
		licenses_text(),
	]))

## Grava o arquivo de licenças (UTF-8 com BOM, para o Bloco de Notas e o TextEdit acertarem os acentos).
static func write_file(path: String, version: String) -> Error:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		var err := FileAccess.get_open_error()
		printerr("não foi possível gravar %s: %s" % [path, error_string(err)])
		return err
	f.store_buffer(PackedByteArray([0xEF, 0xBB, 0xBF]))
	f.store_string(full_text(version) + "\n")
	f.close()
	return OK
