extends RefCounted
## Paleta da interface: cinza de fuligem com destaques âmbar e nácar.

const BG := Color("#1b1714")
const PANEL := Color("#231e1a")
const BORDER := Color("#5a4a36")
const AMBER := Color("#e3a548")
const NACRE := Color("#9fd3d1")
const TEXT := Color("#e8e1d3")
const MUTED := Color("#9a927f")
const RED := Color("#ff5a4f")
const GREEN := Color("#6fd06a")
const HP := Color("#c4413a")
const MP := Color("#3f7fd0")
const XP := Color("#d8b24a")

static func panel_style(alpha := 0.94) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(PANEL, alpha)
	s.border_color = BORDER
	s.set_border_width_all(1)
	s.set_corner_radius_all(4)
	s.set_content_margin_all(12)
	return s

static func bar_style(c: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = c
	s.set_corner_radius_all(2)
	return s

static func bar_bg() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color("#0e0c0a")
	s.border_color = BORDER
	s.set_border_width_all(1)
	s.set_corner_radius_all(2)
	return s
