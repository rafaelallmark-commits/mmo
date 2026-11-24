extends RefCounted
## Créditos e licenças (D151): créditos do jogo e dos modelos VRM, a licença do Godot Engine e os componentes
## de terceiros que vêm com ele, lidos do próprio motor (Engine.get_license_text, get_copyright_info e
## get_license_info). A tela "Créditos e licenças" do título mostra estes textos, e a release grava o mesmo
## conteúdo em LICENCAS-TERCEIROS.txt, que vai dentro de cada pacote (--licenses=arquivo).
## Os textos do jogo são parágrafos de uma linha só: na tela o RichTextLabel quebra as linhas sozinho, e no
## arquivo _wrap os quebra em 100 colunas. Os textos das licenças vão como o motor os entrega.

const FILE_NAME := "LICENCAS-TERCEIROS.txt"
const FILE_WIDTH := 100

## Créditos do jogo (resumo de docs/CREDITOS.md; o crédito do Seed-san é obrigatório pela licença VRM).
static func game_text(version: String) -> String:
	var v: Dictionary = Engine.get_version_info()
	return "\n".join(PackedStringArray([
		"CINZAS DO MERIDIANO · versão %s" % version,
		"",
		"Um MMORPG original: o mundo, a história e os personagens dela, as missões, a interface, o código, o ícone, os efeitos sonoros e a música foram criados para o jogo. Os sons e a música são sintetizados do zero — nada foi gravado, baixado ou tirado de bancos de sons. Só os modelos 3D dos personagens vêm de fora (abaixo).",
		"",
		"MODELOS DE PERSONAGEM (VRM)",
		"Os personagens jogáveis e os NPCs usam dois modelos de exemplo publicados pelo VRM Consortium no repositório da especificação VRM (vrm-c/vrm-specification, pasta samples), modificados pelo jogo em tempo de execução (materiais, cores, peças ocultas, animação e equipamento):",
		"  • Seed-san — Seed-san model by VirtualCast, Inc. — VRM Public License 1.0",
		"  • VRM1_Constraint_Twist_Sample — © 2022 pixiv Inc. — VRM Public License 1.0",
		"Licença: https://vrm.dev/licenses/1.0/ — os metadados de cada arquivo permitem o uso como avatar por qualquer pessoa, o uso comercial, a redistribuição e a modificação.",
		"",
		"MOTOR",
		"Feito com o Godot Engine %d.%d (https://godotengine.org), licença MIT. A licença do motor, os componentes de terceiros que vêm com ele e os textos das licenças estão nesta tela (abas Godot Engine, Terceiros e Licenças) e no arquivo %s, que acompanha cada pacote do jogo." % [int(v.get("major", 4)), int(v.get("minor", 3)), FILE_NAME],
		"",
		"AUTORIDADES CERTIFICADORAS",
		"Para conferir o certificado do servidor, o jogo usa a lista de autoridades certificadoras da Mozilla (Mozilla Contributors, Mozilla Public License 2.0; texto completo em Licenças), a mesma \"CA certificates\" do Godot listada em Terceiros, numa versão mais nova que vai junto do jogo (certs/ca-certificates.crt).",
	]))

## Licença do Godot Engine (MIT/Expat), com o aviso de direitos que ela exige, e a frase de atribuição que a
## licença do FreeType (FTL) pede na documentação de quem o distribui.
static func engine_text() -> String:
	var ft_years := _first_copyright("The FreeType Project", "1996-2023, ").get_slice(",", 0).strip_edges()
	return "\n".join(PackedStringArray([
		"Este jogo usa o Godot Engine (https://godotengine.org), disponível sob a licença MIT (Expat):",
		"",
		Engine.get_license_text().strip_edges(),
		"",
		"O Godot inclui bibliotecas de terceiros, todas listadas com os direitos e a licença de cada uma em Terceiros e com os textos completos em Licenças. Entre elas:",
		"",
		"Portions of this software are copyright © %s The FreeType Project (www.freetype.org). All rights reserved." % ft_years,
		"",
		"ENet: Copyright (c) %s, licença MIT (Expat)." % _first_copyright("ENet", "2002-2024, Lee Salzman"),
		"",
		"Mbed TLS: Copyright The Mbed TLS Contributors. Licensed under the Apache License, Version 2.0 (the \"License\"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0 (texto completo em Licenças).",
	]))

## Primeira linha de direitos de um componente do motor ("anos, titular"), ou o padrão se ele não existir.
static func _first_copyright(component: String, fallback: String) -> String:
	for c in Engine.get_copyright_info():
		if str(c.get("name", "")) == component:
			var parts: Array = c.get("parts", [])
			var lines: Array = parts[0].get("copyright", []) if not parts.is_empty() else []
			if not lines.is_empty():
				return str(lines[0])
	return fallback

## Componentes de terceiros do motor: nome, direitos e licença de cada parte (e os arquivos, quando o
## componente tem partes com licenças diferentes).
static func components_text() -> String:
	var out := PackedStringArray([
		"Componentes de terceiros incluídos no Godot Engine e, portanto, neste jogo, com os direitos e a licença de cada parte. Os textos completos das licenças estão em Licenças.",
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

## Tudo junto, para o arquivo que vai nos pacotes (as seções 2, 3 e 4 são as abas Godot Engine, Terceiros e
## Licenças da tela).
static func full_text(version: String) -> String:
	return "\n".join(PackedStringArray([
		"CINZAS DO MERIDIANO %s — créditos e licenças de terceiros" % version,
		"(o mesmo conteúdo da tela \"Créditos e licenças\" do menu inicial do jogo)",
		"",
		"1. CRÉDITOS DO JOGO",
		"",
		_wrap(game_text(version)),
		"",
		"2. GODOT ENGINE",
		"",
		_wrap(engine_text()),
		"",
		"3. COMPONENTES DE TERCEIROS DO GODOT ENGINE (Terceiros)",
		"",
		_wrap(components_text()),
		"",
		"4. TEXTOS DAS LICENÇAS (Licenças)",
		"",
		licenses_text(),
	]))

## Quebra as linhas com mais de `width` colunas nos espaços, mantendo o recuo (e o dos itens com •).
static func _wrap(text: String, width := FILE_WIDTH) -> String:
	var out := PackedStringArray()
	for line in text.split("\n"):
		var indent := ""
		while indent.length() < line.length() and line[indent.length()] == " ":
			indent += " "
		var cont := indent + ("  " if line.strip_edges().begins_with("•") else "")
		var cur := line
		while cur.length() > width:
			var cut := cur.rfind(" ", width)
			if cut <= cont.length():
				break
			out.append(cur.substr(0, cut))
			cur = cont + cur.substr(cut + 1)
		out.append(cur)
	return "\n".join(out)

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
