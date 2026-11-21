extends SceneTree
## Gera os ícones do jogo a partir de client/assets/icon/icon.svg (desenho original; docs/CREDITOS.md) com o
## rasterizador SVG do próprio Godot (o ImageMagick e o Pillow não leem SVG). Cada tamanho é desenhado direto
## do vetor, sem reduzir uma imagem grande. Saídas:
##   client/assets/icon/icon_256.png   ícone do projeto (config/icon: janela, barra de tarefas, Linux)
##   client/assets/icon/icon_1024.png  ícone do .app do macOS (application/icon do preset; o Godot monta o .icns)
##   client/assets/icon/icon.ico       ícone do .exe do Windows (application/icon do preset), com os tamanhos
##                                     que a exportação do Godot 4.3 lê: 16, 32, 48, 64, 128 e 256 (PNG)
##   deploy/site/icone.png             ícone da página do jogo (128)
## A pasta client/assets/icon tem um .gdignore: o editor não importa estes arquivos (o ícone do projeto vai
## para o pacote como está, e as exportações de Windows e macOS leem os arquivos do disco).
## Uso, na raiz do repositório (o PNG do Godot é determinístico: duas execuções dão os mesmos bytes):
##   godot --headless --path client --script "$PWD/tools/icone/gerar_icone.gd"

const SVG := "client/assets/icon/icon.svg"
const SVG_SIZE := 256.0
const ICO_SIZES := [16, 32, 48, 64, 128, 256]

func _init() -> void:
	var root := ProjectSettings.globalize_path("res://").path_join("..").simplify_path()
	var svg := FileAccess.get_file_as_string(root.path_join(SVG))
	if svg == "":
		printerr("não foi possível ler %s" % root.path_join(SVG))
		quit(1)
		return
	var ok := true
	ok = _save_png(svg, 256, root.path_join("client/assets/icon/icon_256.png")) and ok
	ok = _save_png(svg, 1024, root.path_join("client/assets/icon/icon_1024.png")) and ok
	ok = _save_png(svg, 128, root.path_join("deploy/site/icone.png")) and ok
	var entries := []
	for size in ICO_SIZES:
		var img := _render(svg, size)
		if img == null:
			ok = false
			break
		entries.append([size, img.save_png_to_buffer()])
	if ok:
		ok = _write(root.path_join("client/assets/icon/icon.ico"), _ico(entries))
	quit(0 if ok else 1)

func _render(svg: String, size: int) -> Image:
	var img := Image.new()
	var err := img.load_svg_from_string(svg, size / SVG_SIZE)
	if err != OK or img.is_empty():
		printerr("falha ao desenhar o SVG em %d px: %s" % [size, error_string(err)])
		return null
	if img.get_width() != size or img.get_height() != size:
		img.resize(size, size, Image.INTERPOLATE_LANCZOS)
	img.convert(Image.FORMAT_RGBA8)
	return img

func _save_png(svg: String, size: int, path: String) -> bool:
	var img := _render(svg, size)
	return img != null and _write(path, img.save_png_to_buffer())

## Arquivo .ico: cabeçalho, uma entrada de 16 bytes por tamanho e as imagens em PNG (aceito desde o
## Windows Vista). Largura e altura 256 se gravam como 0.
func _ico(entries: Array) -> PackedByteArray:
	var head := StreamPeerBuffer.new()
	head.big_endian = false
	head.put_u16(0)  # reservado
	head.put_u16(1)  # tipo: ícone
	head.put_u16(entries.size())
	var offset := 6 + 16 * entries.size()
	for e in entries:
		var size: int = e[0]
		var png: PackedByteArray = e[1]
		head.put_u8(0 if size >= 256 else size)
		head.put_u8(0 if size >= 256 else size)
		head.put_u8(0)   # sem paleta
		head.put_u8(0)   # reservado
		head.put_u16(1)  # planos de cor
		head.put_u16(32) # bits por pixel
		head.put_u32(png.size())
		head.put_u32(offset)
		offset += png.size()
	var out := head.data_array
	for e in entries:
		out.append_array(e[1])
	return out

func _write(path: String, bytes: PackedByteArray) -> bool:
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		printerr("não foi possível gravar %s: %s" % [path, error_string(FileAccess.get_open_error())])
		return false
	f.store_buffer(bytes)
	f.close()
	print("gravado: %s (%d bytes)" % [path, bytes.size()])
	return true
