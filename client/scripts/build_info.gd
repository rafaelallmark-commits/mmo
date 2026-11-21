extends RefCounted
## O que a release grava no projeto na hora de exportar (release.yml, seção [cinzas] do project.godot): a
## versão inteira do cliente, o servidor padrão do campo "Servidor" e a página onde baixar a versão nova.
## Rodando pelo editor nada disso existe e valem os padrões daqui.

const LOCAL_SERVER := "ws://127.0.0.1:7777"

## Versão deste cliente com o sufixo inteiro (ex.: 0.4.0-teste.2), de cinzas/versao (D150). config/version
## fica só com a parte numérica, que é o que o Info.plist do macOS e o recurso de versão do .exe aceitam.
## Pelo editor: "dev".
static func version() -> String:
	var v := str(ProjectSettings.get_setting("cinzas/versao", "")).strip_edges()
	if v == "":
		v = str(ProjectSettings.get_setting("application/config/version", "")).strip_edges()
	return v if v != "" else "dev"

## Servidor do campo "Servidor" para quem nunca digitou outro: cinzas/servidor_padrao (variável
## SERVIDOR_PADRAO do repositório) ou o servidor local.
static func default_server() -> String:
	var s := str(ProjectSettings.get_setting("cinzas/servidor_padrao", "")).strip_edges()
	return s if s != "" else LOCAL_SERVER

## Onde baixar a versão nova (D152): cinzas/pagina_download, que a release grava (variável PAGINA_DOWNLOAD do
## repositório; sem ela, a página de Releases). Sem a configuração, a página do jogo no domínio de um servidor
## wss:// (https://DOMÍNIO/, deploy/site). Vazio quando não há para onde mandar (servidor local).
static func download_page(server_url: String) -> String:
	var p := str(ProjectSettings.get_setting("cinzas/pagina_download", "")).strip_edges()
	if p != "":
		return p
	if server_url.begins_with("wss://"):
		var host := server_url.get_slice("://", 1).get_slice("/", 0)
		if host != "":
			return "https://%s/" % host
	return ""
