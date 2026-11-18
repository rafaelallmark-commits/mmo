extends Node
## Conexão WebSocket com o servidor de zona. Protocolo: JSON, uma mensagem por quadro.
## Cada requisição leva um "rid"; a resposta { t:"res", rid } chama o callback registrado.

signal connected
signal disconnected(reason: String)
signal message(msg: Dictionary)

var ws: WebSocketPeer
var url := ""
var state := "idle" # idle | connecting | open | closed
var _rid := 0
var _callbacks := {}

func connect_to(u: String) -> void:
	url = u
	ws = WebSocketPeer.new()
	ws.inbound_buffer_size = 4 * 1024 * 1024
	ws.outbound_buffer_size = 256 * 1024
	_callbacks.clear()
	var err := ws.connect_to_url(u)
	if err != OK:
		state = "closed"
		disconnected.emit("Não foi possível abrir a conexão (%d)." % err)
		return
	state = "connecting"

func close() -> void:
	if ws and state in ["connecting", "open"]:
		ws.close()

func is_open() -> bool:
	return state == "open"

func _process(_delta: float) -> void:
	if ws == null or not (state in ["connecting", "open"]):
		return
	ws.poll()
	var s := ws.get_ready_state()
	if s == WebSocketPeer.STATE_OPEN:
		if state == "connecting":
			state = "open"
			connected.emit()
		while ws.get_available_packet_count() > 0:
			var text := ws.get_packet().get_string_from_utf8()
			var msg = JSON.parse_string(text)
			if typeof(msg) != TYPE_DICTIONARY:
				continue
			if msg.get("t", "") == "res":
				var rid = str(msg.get("rid", ""))
				if _callbacks.has(rid):
					var cb: Callable = _callbacks[rid]
					_callbacks.erase(rid)
					if cb.is_valid():
						cb.call(msg)
			message.emit(msg)
	elif s == WebSocketPeer.STATE_CLOSED:
		state = "closed"
		var reason := ws.get_close_reason()
		if reason == "":
			reason = "Conexão encerrada (código %d)." % ws.get_close_code()
		disconnected.emit(reason)

## Envia uma requisição. Retorna o rid usado.
func request(t: String, payload: Dictionary = {}, cb: Callable = Callable()) -> String:
	_rid += 1
	var rid := "c%d" % _rid
	var msg := payload.duplicate()
	msg["t"] = t
	msg["rid"] = rid
	if cb.is_valid():
		_callbacks[rid] = cb
	if state == "open":
		ws.send_text(JSON.stringify(msg))
	return rid
