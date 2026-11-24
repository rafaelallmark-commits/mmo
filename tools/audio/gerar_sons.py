#!/usr/bin/env python3
"""Síntese de todos os sons e blocos de música de CINZAS DO MERIDIANO.

Nada é gravado nem baixado: cada efeito e cada nota é calculado aqui, com numpy, a partir de
osciladores, ruído filtrado, parciais inarmônicas com decaimento exponencial (sinos e metais),
corda de Karplus-Strong (arco), pulso glotal com formantes (grunhidos) e uma reverberação curta
por convolução com resposta sintética.

Uso:   python3 tools/audio/gerar_sons.py
Saída: client/audio/sfx/*.wav    efeitos (passos, golpes, magias, interface, avisos do chefe)
       client/audio/music/*.wav  blocos do sequenciador generativo de client/scripts/audio.gd
                                 (sinos e flauta nota a nota, bordões em laço, percussão de metal)
Formato: WAV mono, PCM 16 bits, 22050 Hz. Os bordões levam um bloco "smpl" com o ponto de laço,
que o importador do Godot lê ("Detect From WAV") para repetir sem emenda.
Determinístico: a semente de cada som vem do nome (zlib.crc32), então duas execuções geram
arquivos idênticos byte a byte. Requer só Python 3 e numpy.
"""
import math
import os
import struct
import sys
import zlib

import numpy as np

SR = 22050
NYQ = SR / 2.0
TAU = 2.0 * math.pi
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = {'sfx': os.path.join(ROOT, 'client', 'audio', 'sfx'), 'music': os.path.join(ROOT, 'client', 'audio', 'music')}
MAX_BYTES = 6_000_000      # orçamento de client/audio
LOOP = 8.0                 # duração dos bordões em laço (s)


# ============================================================== utilidades
def n_of(sec):
    return max(1, int(round(sec * SR)))


def t_of(n):
    return np.arange(n, dtype=np.float64) / SR


def rng_for(name):
    return np.random.default_rng(zlib.crc32(name.encode('utf-8')))


def unit(x):
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return x / m if m > 1e-12 else x


def note_hz(name):
    """'D3', 'Bb3', 'F#4' -> Hz (Lá 4 = 440 Hz)."""
    pc = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[name[0].upper()]
    i = 1
    while name[i] in '#b':
        pc += 1 if name[i] == '#' else -1
        i += 1
    midi = 12 * (int(name[i:]) + 1) + pc
    return 440.0 * 2.0 ** ((midi - 69) / 12.0)


def place(dst, src, at):
    """Soma src em dst a partir de `at` segundos (o que passar do fim é cortado)."""
    i = int(round(at * SR))
    if i >= len(dst):
        return dst
    m = min(len(src), len(dst) - i)
    dst[i:i + m] += src[:m]
    return dst


def fit(x, dur, fout=0.03):
    """Corta (ou completa com silêncio) na duração exata e suaviza o fim."""
    n = n_of(dur)
    y = x[:n].copy() if len(x) >= n else np.concatenate([x, np.zeros(n - len(x))])
    b = min(n, n_of(fout))
    if b > 1:
        y[-b:] *= np.cos(np.linspace(0.0, math.pi / 2.0, b)) ** 2
    return y


def soft_clip(x, drive=1.5):
    """Saturação suave (tanh) de um sinal de pico 1."""
    return np.tanh(drive * unit(x)) / math.tanh(drive)


# ============================================================== filtros
def _pow2(n):
    return 1 << (int(n) - 1).bit_length()


def _ramp(f, a, b):
    """0 abaixo de a, 1 acima de b, meia onda de cosseno entre os dois."""
    if b <= a:
        return (f >= a).astype(np.float64)
    return 0.5 - 0.5 * np.cos(math.pi * np.clip((f - a) / (b - a), 0.0, 1.0))


def _band_gain(lo, hi, soft):
    def gain(f):
        g = np.ones_like(f)
        if lo > 0:
            g *= _ramp(f, lo * (1.0 - soft), lo)
        if hi < NYQ:
            g *= 1.0 - _ramp(f, hi, min(NYQ, hi * (1.0 + soft)))
        return g
    return gain


def band(x, lo=0.0, hi=NYQ, soft=0.35):
    """Passa-faixa estático de fase zero (no espectro, com folga para não dar a volta)."""
    n = len(x)
    size = _pow2(n + 4096)
    spec = np.fft.rfft(x, size) * _band_gain(lo, hi, soft)(np.fft.rfftfreq(size, 1.0 / SR))
    return np.fft.irfft(spec, size)[:n]


def lowpass(x, fc, soft=0.35):
    return band(x, 0.0, fc, soft)


def highpass(x, fc, soft=0.35):
    return band(x, fc, NYQ, soft)


def band_circ(x, lo=0.0, hi=NYQ, soft=0.35):
    """O mesmo filtro, mas circular: preserva um laço sem emenda."""
    n = len(x)
    spec = np.fft.rfft(x) * _band_gain(lo, hi, soft)(np.fft.rfftfreq(n, 1.0 / SR))
    return np.fft.irfft(spec, n)


def svf(x, fc, q=0.707, mode='bp'):
    """Filtro de estado variável (topologia TPT); fc pode variar amostra a amostra."""
    n = len(x)
    fc = np.clip(np.broadcast_to(np.asarray(fc, dtype=np.float64), (n,)), 20.0, SR * 0.45)
    g = np.tan(math.pi * fc / SR)
    k = 1.0 / q
    a1 = 1.0 / (1.0 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    xs, A1, A2, A3 = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    lp = [0.0] * n
    bp = [0.0] * n
    ic1 = ic2 = 0.0
    for i in range(n):
        v3 = xs[i] - ic2
        v1 = A1[i] * ic1 + A2[i] * v3
        v2 = ic2 + A2[i] * ic1 + A3[i] * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        lp[i] = v2
        bp[i] = v1
    lp = np.asarray(lp)
    bp = np.asarray(bp)
    if mode == 'lp':
        return lp
    if mode == 'bp':
        return bp * k          # ganho 1 no centro
    return x - k * bp - lp     # 'hp'


def dc_block(x, r=0.997):
    """Remove nível DC sem atrasar transientes (filtro causal de um polo)."""
    xs = x.tolist()
    out = [0.0] * len(xs)
    px = py = 0.0
    for i, v in enumerate(xs):
        py = v - px + r * py
        px = v
        out[i] = py
    return np.asarray(out)


# ============================================================== fontes
def white(rng, n):
    return rng.standard_normal(n)


def colored(rng, n, slope, circular=False):
    """Ruído com espectro 1/f^slope (0.5 = rosa, 1 = marrom), desvio padrão 1."""
    w = rng.standard_normal(n)
    size = n if circular else _pow2(n + 4096)
    spec = np.fft.rfft(w, size)
    f = np.maximum(np.fft.rfftfreq(size, 1.0 / SR), 18.0)
    y = np.fft.irfft(spec * (f / 1000.0) ** (-slope), size)[:n]
    return y / (np.std(y) + 1e-12)


def env_perc(n, attack, tau):
    t = t_of(n)
    e = np.exp(-t / tau)
    if attack > 0:
        e *= np.minimum(1.0, t / attack)
    return e


def env_ahr(n, attack, hold, release):
    """Sobe em `attack`, segura `hold`, desce em `release` (curvas de cosseno)."""
    t = t_of(n)
    return _ramp(t, 0.0, attack) * (1.0 - _ramp(t, attack + hold, attack + hold + release))


def bump(n, peak, width):
    return np.exp(-0.5 * ((t_of(n) - peak) / width) ** 2)


def phase_of(freq, n):
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), (n,))
    return TAU * np.cumsum(f) / SR


def glide(n, f0, f1, tau):
    """Frequência que vai de f0 a f1 com constante de tempo tau."""
    return f1 + (f0 - f1) * np.exp(-t_of(n) / tau)


def thump(n, f0, f1, ftau, atau):
    """Pancada grave: seno que despenca de tom (bombo, corpo, chão)."""
    return np.sin(phase_of(glide(n, f0, f1, ftau), n)) * env_perc(n, 0.0008, atau)


def modal(n, f0, modes, rng, detune=0.0012):
    """Parciais com decaimento exponencial: modes = [(razão, amplitude, tau), ...].
    Cada parcial é um par levemente desafinado (batimento lento, como num metal real)."""
    t = t_of(n)
    out = np.zeros(n)
    for ratio, amp, tau in modes:
        f = f0 * ratio
        if f >= NYQ * 0.92:
            continue
        ph = rng.uniform(0.0, TAU)
        d = detune * rng.uniform(0.4, 1.0)
        e = np.exp(-t / tau)
        out += amp * e * (0.6 * np.sin(TAU * f * (1.0 - d) * t + ph) + 0.4 * np.sin(TAU * f * (1.0 + d) * t + 1.7 * ph))
    return out


def saw(phase, fmax, rolloff=1.0):
    """Dente de serra de banda limitada (soma de harmônicos até ~0,8 Nyquist)."""
    out = np.zeros_like(phase)
    for k in range(1, max(1, int(NYQ * 0.8 / fmax)) + 1):
        out += np.sin(k * phase) / k ** rolloff
    return out


def pings(rng, n, count, t0, t1, f_lo, f_hi, tau=0.05):
    """Brilhos agudos espalhados no tempo (faíscas de magia, moedas)."""
    out = np.zeros(n)
    for _ in range(count):
        at = rng.uniform(t0, t1)
        m = n_of(tau * 6)
        f = rng.uniform(f_lo, f_hi)
        p = modal(m, f, [(1.0, 1.0, tau), (2.13, 0.35, tau * 0.5)], rng) * rng.uniform(0.4, 1.0)
        place(out, p, at)
    return out


def grains(rng, n, count, t0, spread, decay, g_min=0.002, g_max=0.007):
    """Rajada de micro-estalos (cascalho, entulho, crepitar)."""
    out = np.zeros(n)
    for _ in range(count):
        at = t0 + min(spread * 4.0, rng.exponential(spread))
        m = n_of(rng.uniform(g_min, g_max))
        g = white(rng, m) * np.exp(-t_of(m) / (m / SR / 2.5))
        place(out, rng.uniform(0.25, 1.0) * math.exp(-(at - t0) / decay) * g, at)
    return out


def whoosh(rng, dur, f_lo, f_hi, peak=0.4, q=1.3, body=0.0):
    """Deslocamento de ar: ruído num passa-faixa que sobe e desce junto com a intensidade."""
    n = n_of(dur)
    u = t_of(n) / dur
    rise = np.sin(0.5 * math.pi * np.clip(u / peak, 0.0, 1.0)) ** 2
    fall = np.cos(0.5 * math.pi * np.clip((u - peak) / (1.0 - peak), 0.0, 1.0)) ** 2
    env = np.where(u < peak, rise, fall)
    y = unit(svf(white(rng, n), f_lo + (f_hi - f_lo) * env, q=q) * env)
    if body > 0:
        y = y + body * unit(lowpass(white(rng, n), 300.0) * env)
    return y


def pluck(f0, dur, rng, damping=0.994):
    """Corda dedilhada (Karplus-Strong)."""
    n = n_of(dur)
    period = max(2, int(round(SR / f0)))
    buf = rng.uniform(-1.0, 1.0, period).tolist()
    out = [0.0] * n
    j = 0
    for i in range(n):
        cur = buf[j]
        nxt = buf[(j + 1) % period]
        out[i] = cur
        buf[j] = damping * 0.5 * (cur + nxt)
        j = (j + 1) % period
    return np.asarray(out)


def voice(rng, n, f0, formants, breath=0.25, jitter=0.02, rough=0.0):
    """Pulso glotal (dente de serra) com formantes: grunhidos e suspiros sem palavras.
    formants = [(fc ou curva, largura, ganho), ...]"""
    f0 = np.broadcast_to(np.asarray(f0, dtype=np.float64), (n,))
    jit = 1.0 + jitter * unit(lowpass(white(rng, n), 30.0))
    src = saw(phase_of(f0 * jit, n), float(np.max(f0)))
    if rough > 0:
        src *= 1.0 + rough * np.sin(phase_of(f0 * 0.5, n))   # sub-harmônico: rosnado
    src = unit(src) + breath * unit(white(rng, n))
    out = np.zeros(n)
    for fc, bw, g in formants:
        fc = np.broadcast_to(np.asarray(fc, dtype=np.float64), (n,))
        out += g * svf(src, fc, q=float(np.mean(fc)) / bw)
    return out


# ============================================================== sinos
# Parciais de um sino de igreja em relação ao tom de golpe: bordão (hum), prima, terça menor
# (a cor melancólica do sino), quinta, nominal e as parciais altas que somem logo.
BELL_MINOR = [(0.5, 0.40, 1.00), (1.0, 0.60, 0.80), (1.19, 0.48, 0.62), (1.505, 0.24, 0.44),
              (2.0, 0.66, 0.40), (2.52, 0.18, 0.26), (2.66, 0.22, 0.24), (3.01, 0.18, 0.19),
              (4.07, 0.12, 0.12), (5.42, 0.08, 0.08), (6.83, 0.05, 0.06)]
BELL_MAJOR = [(r if r != 1.19 else 1.26, a, k) for r, a, k in BELL_MINOR]  # sino de terça maior (festivo)
# parciais altas de um sino grande (razão, amplitude, tau em s): o brilho que se ouve de longe
BELL_UPPER = [(5.42, 1.0, 1.6), (6.83, 0.8, 1.3), (8.24, 0.6, 1.0), (9.87, 0.45, 0.8), (11.6, 0.3, 0.6), (13.5, 0.2, 0.45)]


def bell(f0, dur, rng, decay=1.6, major=False, strike=0.25, hum=1.0, bright=1.0):
    n = n_of(dur)
    modes = []
    for ratio, amp, k in (BELL_MAJOR if major else BELL_MINOR):
        a = amp * (hum if ratio < 0.9 else 1.0) * (bright ** (ratio - 2.0) if ratio > 2.0 else 1.0)
        modes.append((ratio, a, decay * k))
    y = unit(modal(n, f0, modes, rng, detune=0.0009))
    m = min(n, n_of(0.04))
    click = band(white(rng, m), min(NYQ * 0.7, f0 * 3.0), min(NYQ * 0.95, f0 * 14.0)) * env_perc(m, 0.0005, 0.005)
    y[:m] += strike * unit(click)
    return lowpass(y, min(NYQ * 0.9, f0 * 18.0))


# ============================================================== reverberação
_IR = {}


def impulse(rt60, damp=0.45, predelay=0.012, seed=7):
    """Resposta ao impulso sintética: ruído com decaimento por faixa (agudos morrem antes)."""
    key = (rt60, damp, predelay, seed)
    if key in _IR:
        return _IR[key]
    rng = np.random.default_rng(seed)
    n = n_of(min(rt60 * 1.15, 4.5))
    t = t_of(n)
    w = rng.standard_normal(n)
    lo = lowpass(w, 450.0)
    hi = highpass(w, 3200.0)
    mid = w - lo - hi
    ir = (lo * np.exp(-6.9 * t / (rt60 * 1.15)) + mid * np.exp(-6.9 * t / rt60)
          + hi * np.exp(-6.9 * t / (rt60 * damp)))
    ir *= _ramp(t, predelay, predelay + 0.02)
    for _ in range(6):   # primeiras reflexões
        i = n_of(predelay + rng.uniform(0.002, 0.025))
        if i < n:
            ir[i] += rng.uniform(0.6, 1.4) * (1.0 if rng.random() < 0.5 else -1.0) * float(np.std(ir)) * 8.0
    ir /= math.sqrt(float(np.sum(ir ** 2)))
    _IR[key] = ir
    return ir


def reverb(x, rt60=0.6, wet=0.12, damp=0.45, predelay=0.012):
    """Soma uma cauda de sala (convolução por FFT). O resultado fica mais longo que a entrada."""
    ir = impulse(rt60, damp, predelay)
    n = len(x) + len(ir) - 1
    size = _pow2(n)
    tail = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:n]
    out = wet * tail
    out[:len(x)] += x
    return out


def reverb_circ(x, rt60=1.5, wet=0.3, damp=0.45):
    """Reverberação circular para laços (a cauda do fim volta no começo)."""
    ir = impulse(rt60, damp)
    k = np.zeros(len(x))
    m = min(len(ir), len(x))
    k[:m] = ir[:m]
    return x + wet * np.fft.irfft(np.fft.rfft(x) * np.fft.rfft(k), len(x))


# ============================================================== acabamento
def short_rms_db(x, win=0.05):
    w = n_of(win)
    if len(x) <= w:
        return 20.0 * math.log10(math.sqrt(float(np.mean(x ** 2))) + 1e-12)
    c = np.concatenate([[0.0], np.cumsum(x ** 2)])
    return 20.0 * math.log10(math.sqrt(float(np.max(c[w:] - c[:-w]) / w)) + 1e-12)


def _k_gain(f):
    """Ponderação parecida com a K (ITU-R BS.1770): graves pesam menos, agudos um pouco mais."""
    return _ramp(f, 40.0, 140.0) * (1.0 + 0.5 * _ramp(f, 1200.0, 3000.0))


def loudness_db(x, win=0.1):
    """Volume percebido de curto prazo: RMS máximo em janelas de 100 ms do sinal ponderado."""
    n = len(x)
    size = _pow2(n + 4096)
    weighted = np.fft.irfft(np.fft.rfft(x, size) * _k_gain(np.fft.rfftfreq(size, 1.0 / SR)), size)[:n]
    return short_rms_db(weighted, win)


def limit(x, ceiling=0.92):
    """Limitador suave: abaixo do joelho não mexe; acima, curva tanh até o teto."""
    knee = 0.65 * ceiling
    a = np.abs(x)
    y = x.copy()
    over = a > knee
    y[over] = np.sign(x[over]) * (knee + (ceiling - knee) * np.tanh((a[over] - knee) / (ceiling - knee)))
    return y


def finish(x, dur, target=-14.0, fout=0.04):
    """Corta na duração, tira DC e normaliza pelo volume percebido (no máx. 3 dB de limitação)."""
    y = fit(dc_block(x), dur, fout)
    i = min(len(y), n_of(0.0015))
    if i > 1:
        y[:i] *= np.linspace(0.0, 1.0, i)
    g = 10.0 ** ((target - loudness_db(y)) / 20.0)
    g = min(g, 10.0 ** ((-0.8 + 3.0) / 20.0) / (float(np.max(np.abs(y))) + 1e-12))
    return limit(y * g)


def finish_loop(x, target=-22.0):
    """Laço: tira DC sem quebrar a emenda (filtro circular) e normaliza pelo volume ponderado médio."""
    y = band_circ(x, 28.0, NYQ)
    spec = np.fft.rfft(y) * _k_gain(np.fft.rfftfreq(len(y), 1.0 / SR))
    level = math.sqrt(float(np.mean(np.fft.irfft(spec, len(y)) ** 2))) + 1e-12
    y *= 10.0 ** (target / 20.0) / level
    g = min(1.0, 10.0 ** (2.2 / 20.0) / (float(np.max(np.abs(y))) + 1e-12))
    return limit(y * g)


def loop_seam(make, dur=LOOP, xfade=1.0, pre=0.5):
    """Para camadas não periódicas (filtro que varia no tempo): gera dur + xfade segundos e
    funde o excesso do fim no começo (crossfade de potência constante): o fim emenda no início."""
    n_l, n_x, n_p = n_of(dur), n_of(xfade), n_of(pre)
    raw = make(n_p + n_l + n_x, n_p)[n_p:]
    out = raw[:n_l].copy()
    k = np.linspace(0.0, 1.0, n_x)
    out[:n_x] = raw[:n_x] * np.sin(k * math.pi / 2.0) + raw[n_l:n_l + n_x] * np.cos(k * math.pi / 2.0)
    return out


def qf(f):
    """Arredonda a frequência para fechar um número inteiro de ciclos no laço."""
    return round(f * LOOP) / LOOP


def lfo(t, cycles, depth, phase=0.0):
    """Modulação lenta periódica no laço (número inteiro de ciclos)."""
    return 1.0 + depth * np.sin(TAU * cycles * t / LOOP + phase)


def drone_tone(t, rng, f, amps, beat=1, cycles=1, depth=0.3):
    """Tom sustentado (palheta/órgão) com um gêmeo desafinado: batimento lento e periódico."""
    f = qf(f)
    fb = f + beat / LOOP
    p1 = rng.uniform(0, TAU)
    p2 = rng.uniform(0, TAU)
    y = np.zeros_like(t)
    for k, a in enumerate(amps, start=1):
        if k * fb < NYQ * 0.8:
            y += a * (np.sin(TAU * k * f * t + k * p1) + 0.8 * np.sin(TAU * k * fb * t + k * p2))
    return y * lfo(t, cycles, depth, rng.uniform(0, TAU))


# ============================================================== efeitos
def fx_footstep_dirt(rng, v):
    n = n_of(0.2)
    heel = thump(n, 105.0 + 10.0 * v, 52.0, 0.02, 0.026)
    crunch = band(grains(rng, n, 16 + 4 * v, 0.003, 0.026, 0.05), 450.0 + 120.0 * v, 3600.0)
    scuff = band(white(rng, n), 700.0, 2600.0) * env_perc(n, 0.006, 0.035)
    y = 0.6 * unit(heel) + unit(crunch) + 0.22 * unit(scuff)
    return reverb(lowpass(y, 5000.0), 0.3, 0.05)


def fx_footstep_stone(rng, v):
    n = n_of(0.18)
    click = band(white(rng, n), 1500.0 + 300.0 * v, 6500.0) * env_perc(n, 0.0006, 0.005)
    knock = modal(n, 900.0 + 140.0 * v, [(1.0, 1.0, 0.025), (1.73, 0.6, 0.016), (2.51, 0.35, 0.01)], rng)
    body = thump(n, 150.0, 85.0, 0.015, 0.03)
    grit = band(grains(rng, n, 10 + 2 * v, 0.004, 0.02, 0.04), 1200.0, 5000.0)   # areia sob a sola
    scuff = band(white(rng, n), 2000.0, 7000.0) * bump(n, 0.05 + 0.01 * v, 0.022)
    y = 0.35 * unit(click) + 0.7 * unit(knock) + 0.6 * unit(body) + 0.4 * unit(grit) + 0.2 * unit(scuff)
    return reverb(y, 0.5, 0.1)


def fx_swing_light(rng):
    return reverb(whoosh(rng, 0.24, 500.0, 2400.0, 0.35, q=1.6), 0.3, 0.05)


def fx_swing_heavy(rng):
    return reverb(whoosh(rng, 0.4, 260.0, 1300.0, 0.45, q=1.2, body=0.6), 0.35, 0.06)


def fx_javelin_throw(rng):
    n = n_of(0.42)
    y = whoosh(rng, 0.42, 380.0, 1900.0, 0.3, q=1.5, body=0.3)
    y *= 1.0 + 0.3 * np.sin(TAU * 28.0 * t_of(n))      # a haste girando
    return reverb(y, 0.35, 0.05)


def fx_hit_blade(rng):
    n = n_of(0.34)
    ring = modal(n, 2150.0, [(1.0, 1.0, 0.09), (1.58, 0.7, 0.07), (2.43, 0.5, 0.05), (3.12, 0.35, 0.035)], rng, 0.004)
    shk = highpass(white(rng, n), 3000.0) * env_perc(n, 0.0005, 0.012)
    body = thump(n, 170.0, 70.0, 0.03, 0.05)
    flesh = band(white(rng, n), 250.0, 1400.0) * env_perc(n, 0.002, 0.04)
    y = 0.55 * unit(ring) + 0.7 * unit(shk) + 0.9 * unit(body) + 0.45 * unit(flesh)
    return reverb(soft_clip(y, 1.6), 0.4, 0.08)


def fx_hit_blunt(rng):
    n = n_of(0.36)
    boom = thump(n, 120.0, 46.0, 0.05, 0.09)
    knock = band(white(rng, n), 200.0, 1200.0) * env_perc(n, 0.001, 0.035)
    clank = modal(n, 520.0, [(1.0, 1.0, 0.16), (2.6, 0.6, 0.1), (4.3, 0.35, 0.06)], rng, 0.003)
    y = unit(boom) + 0.6 * unit(knock) + 0.5 * unit(clank)
    return reverb(soft_clip(y, 2.0), 0.45, 0.08)


def fx_hit_flesh(rng):
    n = n_of(0.26)
    body = thump(n, 190.0, 72.0, 0.025, 0.045)
    squelch = band(white(rng, n), 300.0, 1500.0) * env_perc(n, 0.003, 0.06) * (1.0 + 0.5 * np.sin(TAU * 38.0 * t_of(n)))
    crack = band(white(rng, n), 2500.0, 6000.0) * env_perc(n, 0.0005, 0.006)
    y = unit(body) + 0.6 * unit(squelch) + 0.2 * unit(crack)
    return reverb(soft_clip(y, 1.5), 0.35, 0.06)


def fx_bow_release(rng):
    n = n_of(0.45)
    string = pluck(98.0, 0.45, rng, 0.992) * env_perc(n, 0.001, 0.12)
    thwip = place(np.zeros(n), whoosh(rng, 0.2, 1500.0, 5200.0, 0.2, q=1.8), 0.005)
    limb = modal(n, 420.0, [(1.0, 1.0, 0.03), (2.3, 0.5, 0.02)], rng)
    y = 0.8 * unit(string) + 0.5 * unit(thwip) + 0.3 * unit(limb)
    return reverb(y, 0.4, 0.07)


def fx_arrow_hit(rng):
    n = n_of(0.3)
    t = t_of(n)
    wood = modal(n, 360.0, [(1.0, 1.0, 0.035), (2.45, 0.6, 0.022), (3.9, 0.3, 0.012)], rng)
    body = thump(n, 140.0, 60.0, 0.02, 0.035)
    shaft = np.sin(TAU * 1250.0 * t) * env_perc(n, 0.002, 0.07) * (1.0 + 0.6 * np.sin(TAU * 42.0 * t))
    click = band(white(rng, n), 2000.0, 7000.0) * env_perc(n, 0.0003, 0.003)
    y = 0.9 * unit(wood) + 0.7 * unit(body) + 0.18 * unit(shaft) + 0.4 * unit(click)
    return reverb(y, 0.35, 0.06)


def fx_spell_cast(rng):
    dur = 0.6
    n = n_of(dur)
    t = t_of(n)
    u = t / dur
    env = _ramp(u, 0.0, 0.7) * (1.0 - _ramp(u, 0.72, 0.95))
    rush = svf(white(rng, n), 400.0 + 3200.0 * u ** 1.5, q=2.2) * env
    f = 330.0 * 2.0 ** np.minimum(u / 0.7, 1.0)
    tone = (np.sin(phase_of(f, n)) + np.sin(phase_of(f * 1.007, n)) + 0.3 * np.sin(phase_of(f * 2.0, n))) * env
    sparkle = pings(rng, n, 8, 0.32, 0.55, 2500.0, 6000.0, 0.04)
    release = place(np.zeros(n), thump(n_of(0.15), 170.0, 90.0, 0.03, 0.05), 0.42)
    y = 0.7 * unit(rush) + 0.45 * unit(tone) + 0.3 * unit(sparkle) + 0.5 * unit(release)
    return reverb(y, 0.6, 0.12)


def fx_spell_fire(rng):
    n = n_of(0.9)
    whoomph = lowpass(colored(rng, n, 1.0), 420.0) * env_perc(n, 0.03, 0.3)
    roar = band(white(rng, n), 300.0, 2500.0) * env_perc(n, 0.02, 0.22)
    crackle = band(grains(rng, n, 70, 0.02, 0.2, 0.3, 0.0005, 0.002), 1500.0, 6000.0)
    hiss = highpass(white(rng, n), 3500.0) * env_perc(n, 0.01, 0.15)
    y = 0.7 * unit(whoomph) + 0.8 * unit(roar) + 0.6 * unit(crackle) + 0.25 * unit(hiss)
    return reverb(soft_clip(y, 1.4), 0.5, 0.08)


def fx_spell_impact(rng):
    n = n_of(0.7)
    body = thump(n, 100.0, 38.0, 0.05, 0.12)
    burst = band(white(rng, n), 900.0, 6500.0) * env_perc(n, 0.001, 0.035)
    ring = modal(n, 660.0, [(1.0, 1.0, 0.22), (1.53, 0.7, 0.18), (2.35, 0.5, 0.12), (3.1, 0.3, 0.08)], rng, 0.003)
    flutter = 1.0 + 0.8 * unit(lowpass(white(rng, n), 40.0))
    sizzle = highpass(white(rng, n), 2500.0) * env_perc(n, 0.01, 0.18) * flutter
    y = 0.8 * unit(body) + 0.8 * unit(burst) + 0.6 * unit(ring) + 0.4 * unit(sizzle)
    return reverb(soft_clip(y, 1.5), 0.6, 0.12)


GLASS = [(1.0, 1.0, 0.5), (2.0, 0.35, 0.25), (3.0, 0.12, 0.12), (4.2, 0.05, 0.08)]


def chime(rng, n, f, tau=0.5, attack=0.004):
    return modal(n, f, [(r, a, k * tau / 0.5) for r, a, k in GLASS], rng) * np.minimum(1.0, t_of(n) / attack)


def fx_heal_chime(rng):
    n = n_of(1.25)
    t = t_of(n)
    y = np.zeros(n)
    for i, nm in enumerate(['D5', 'A5', 'D6', 'F#6']):
        place(y, chime(rng, n, note_hz(nm)) * (1.0 - 0.12 * i), 0.07 * i)
    pad = (np.sin(TAU * 1760.0 * t) + np.sin(TAU * 2349.3 * t)) * (1.0 + 0.4 * np.sin(TAU * 7.0 * t)) * bump(n, 0.4, 0.25)
    y = unit(y) + 0.08 * unit(pad)
    return reverb(y, 1.1, 0.25)


def fx_shield_up(rng):
    n = n_of(0.8)
    t = t_of(n)
    shing = modal(n, 1900.0, [(1.0, 1.0, 0.12), (1.48, 0.7, 0.1), (2.21, 0.45, 0.07), (2.97, 0.3, 0.05)], rng, 0.003)
    hum = (np.sin(TAU * 110.0 * t) + 0.5 * np.sin(TAU * 220.0 * t) + 0.25 * np.sin(TAU * 330.0 * t))
    hum *= env_ahr(n, 0.08, 0.2, 0.45) * (1.0 + 0.15 * np.sin(TAU * 6.0 * t))
    sweep = place(np.zeros(n), whoosh(rng, 0.5, 700.0, 2600.0, 0.35, q=2.0), 0.0)
    y = 0.6 * unit(shing) + 0.7 * unit(hum) + 0.3 * unit(sweep)
    return reverb(y, 0.7, 0.15)


def fx_buff(rng):
    n = n_of(0.8)
    t = t_of(n)
    f = 440.0 * 2.0 ** np.minimum(t / 0.35, 1.0) * (1.0 + 0.006 * _ramp(t, 0.3, 0.45) * np.sin(TAU * 6.0 * t))
    ph = phase_of(f, n)
    tri = np.sin(ph) - np.sin(3 * ph) / 9.0 + np.sin(5 * ph) / 25.0
    tone = tri * env_ahr(n, 0.02, 0.35, 0.4)
    ring = place(np.zeros(n), chime(rng, n_of(0.45), 880.0, 0.3) + chime(rng, n_of(0.45), 1318.5, 0.3), 0.35)
    sparkle = pings(rng, n, 6, 0.15, 0.6, 1800.0, 5000.0, 0.04)
    y = 0.6 * unit(tone) + 0.35 * unit(ring) + 0.25 * unit(sparkle)
    return reverb(y, 0.8, 0.2)


def fx_debuff(rng):
    n = n_of(0.8)
    t = t_of(n)
    f1 = 280.0 + 340.0 * np.exp(-t / 0.25)
    wob = 1.0 + 0.03 * np.sin(TAU * 11.0 * t)
    a = saw(phase_of(f1 * wob, n), 620.0, 1.6)
    b = saw(phase_of(f1 * 1.06 * wob, n), 660.0, 1.6)
    tone = lowpass(a + b, 2500.0) * env_ahr(n, 0.02, 0.35, 0.4)
    murk = lowpass(colored(rng, n, 1.0), 300.0) * env_ahr(n, 0.05, 0.3, 0.4)
    y = 0.8 * unit(tone) + 0.4 * unit(murk)
    return reverb(y, 0.7, 0.15)


def fx_monster_hurt(rng):
    n = n_of(0.38)
    f0 = glide(n, 190.0, 100.0, 0.12)
    v = voice(rng, n, f0, [(650.0, 110.0, 1.0), (1080.0, 140.0, 0.6), (2500.0, 250.0, 0.25)], 0.35, 0.03, 0.5)
    rasp = band(white(rng, n), 800.0, 3500.0)
    env = env_perc(n, 0.012, 0.12)
    y = (unit(v) + 0.3 * unit(rasp)) * env * (1.0 + 0.25 * np.sin(TAU * 32.0 * t_of(n)))
    return reverb(soft_clip(y, 1.3), 0.4, 0.07)


def fx_monster_die(rng):
    n = n_of(1.1)
    t = t_of(n)
    k = np.minimum(t / 0.6, 1.0)
    f0 = 150.0 * (55.0 / 150.0) ** k
    v = voice(rng, n, f0, [(700.0 - 300.0 * k, 120.0, 1.0), (1100.0 - 400.0 * k, 150.0, 0.55), (2400.0, 260.0, 0.2)], 0.4, 0.035, 0.6)
    v *= env_ahr(n, 0.02, 0.2, 0.4)
    rasp = band(white(rng, n), 600.0, 3000.0) * env_ahr(n, 0.02, 0.15, 0.3)
    fall = place(np.zeros(n), unit(thump(n_of(0.4), 90.0, 40.0, 0.06, 0.1)) + 0.5 * unit(lowpass(white(rng, n_of(0.4)), 500.0) * env_perc(n_of(0.4), 0.001, 0.05)), 0.42)
    debris = band(grains(rng, n, 40, 0.45, 0.12, 0.25), 600.0, 3000.0)
    y = unit(v) + 0.25 * unit(rasp) + 0.8 * unit(fall) + 0.25 * unit(debris)
    return reverb(soft_clip(y, 1.3), 0.6, 0.12)


def fx_player_hurt(rng):
    n = n_of(0.42)
    body = thump(n, 150.0, 65.0, 0.025, 0.05)
    v = voice(rng, n, glide(n, 235.0, 185.0, 0.08), [(750.0, 120.0, 1.0), (1200.0, 150.0, 0.5), (2700.0, 300.0, 0.2)], 0.9, 0.02)
    v *= env_ahr(n, 0.012, 0.05, 0.12)
    exhale = band(white(rng, n), 900.0, 2800.0) * bump(n, 0.07, 0.04)
    y = 0.8 * unit(body) + 0.4 * unit(v) + 0.3 * unit(exhale)
    return reverb(y, 0.4, 0.06)


def fx_player_die(rng):
    n = n_of(2.1)
    t = t_of(n)
    k = np.minimum(t / 0.7, 1.0)
    v = voice(rng, n, 210.0 * (120.0 / 210.0) ** k, [(800.0 - 300.0 * k, 130.0, 1.0), (1250.0 - 400.0 * k, 160.0, 0.5), (2600.0, 300.0, 0.15)], 0.9, 0.025)
    v *= env_ahr(n, 0.03, 0.25, 0.5)
    fall_n = n_of(0.6)
    fall = unit(thump(fall_n, 100.0, 38.0, 0.08, 0.12)) + 0.5 * unit(lowpass(white(rng, fall_n), 500.0) * env_perc(fall_n, 0.001, 0.06))
    knell = lowpass(bell(note_hz('D3'), 1.6, rng, 1.4, strike=0.1), 1500.0)
    y = 0.45 * unit(v)
    place(y, 0.8 * unit(fall), 0.5)
    place(y, 0.6 * unit(knell), 0.62)
    return reverb(y, 1.6, 0.25)


def fx_level_up(rng):
    n = n_of(2.3)
    y = np.zeros(n)
    for i, nm in enumerate(['A4', 'D5', 'F#5', 'A5', 'D6']):
        place(y, bell(note_hz(nm), 1.6, rng, 0.9, True, 0.2, 0.5) * (0.85 + 0.04 * i), 0.1 * i + (0.02 if i == 4 else 0.0))
    for nm in ['D5', 'F#5', 'A5']:
        place(y, 0.45 * bell(note_hz(nm), 1.6, rng, 1.1, True, 0.1, 0.4), 0.62)
    place(y, 0.2 * unit(pings(rng, n_of(1.0), 10, 0.0, 0.7, 2500.0, 6000.0, 0.06)), 0.55)
    return reverb(y, 1.6, 0.28)


def fx_quest_done(rng):
    n = n_of(1.7)
    y = np.zeros(n)
    place(y, 0.8 * bell(note_hz('G4'), 0.9, rng, 0.7, True, 0.2, 0.5), 0.0)
    place(y, 0.85 * bell(note_hz('A4'), 0.9, rng, 0.7, True, 0.2, 0.5), 0.12)
    place(y, bell(note_hz('D5'), 1.5, rng, 1.1, True, 0.25, 0.6), 0.26)
    place(y, 0.18 * unit(pings(rng, n_of(0.8), 6, 0.0, 0.5, 2500.0, 5500.0, 0.05)), 0.3)
    return reverb(y, 1.3, 0.25)


def fx_loot_coins(rng):
    n = n_of(0.6)
    pouch = unit(lowpass(white(rng, n), 600.0) * env_perc(n, 0.001, 0.02)) + 0.6 * unit(thump(n, 120.0, 80.0, 0.02, 0.03))
    y = 0.45 * unit(pouch)
    at = 0.01
    for i in range(10):
        f = rng.uniform(2900.0, 4300.0)
        c = modal(n_of(0.2), f, [(1.0, 1.0, 0.05), (1.34, 0.6, 0.04), (2.11, 0.4, 0.03), (2.73, 0.25, 0.02)], rng, 0.002)
        place(y, unit(c) * (1.0 - 0.07 * i) * rng.uniform(0.6, 1.0), at)
        at += rng.exponential(0.035) + 0.006
    return reverb(y, 0.4, 0.08)


def fx_loot_item(rng):
    n = n_of(0.42)
    env = np.zeros(n)
    for _ in range(4):
        env += bump(n, rng.uniform(0.02, 0.2), rng.uniform(0.015, 0.04)) * rng.uniform(0.5, 1.0)
    rustle = band(white(rng, n), 700.0, 4200.0) * env
    clink = place(np.zeros(n), modal(n_of(0.2), 2300.0, [(1.0, 1.0, 0.06), (2.76, 0.4, 0.03)], rng), 0.06)
    base = thump(n, 140.0, 70.0, 0.02, 0.025)
    y = 0.8 * unit(rustle) + 0.35 * unit(clink) + 0.5 * unit(base)
    return reverb(y, 0.35, 0.06)


def fx_potion(rng):
    n = n_of(0.95)
    m = n_of(0.08)
    pop = unit(np.sin(phase_of(glide(m, 900.0, 350.0, 0.01), m)) * env_perc(m, 0.0005, 0.015)) + 0.5 * unit(band(white(rng, m), 1000.0, 4000.0) * env_perc(m, 0.0003, 0.005))
    y = place(np.zeros(n), 0.7 * unit(pop), 0.0)
    for i, at in enumerate([0.18, 0.33, 0.47, 0.6]):
        b = n_of(0.12)
        tb = t_of(b)
        f0 = rng.uniform(280.0, 520.0)
        bubble = np.sin(phase_of(f0 * (1.0 + 12.0 * tb), b)) * env_perc(b, 0.003, 0.045)
        gulp = thump(b, 180.0, 120.0, 0.04, 0.05)
        place(y, (0.7 * unit(bubble) + 0.35 * unit(gulp)) * (1.0 - 0.1 * i), at)
    slosh = lowpass(white(rng, n), 900.0) * bump(n, 0.4, 0.2)
    sparkle = place(np.zeros(n), chime(rng, n_of(0.25), 2349.3, 0.12) + chime(rng, n_of(0.25), 3136.0, 0.1), 0.72)
    y = y + 0.18 * unit(slosh) + 0.2 * unit(sparkle)
    return reverb(y, 0.4, 0.06)


def fx_ui_click(rng):
    n = n_of(0.07)
    tick = modal(n, 1850.0, [(1.0, 1.0, 0.012), (2.3, 0.5, 0.007)], rng)
    snap = band(white(rng, n), 2000.0, 6000.0) * env_perc(n, 0.0003, 0.002)
    low = np.sin(TAU * 420.0 * t_of(n)) * env_perc(n, 0.0005, 0.006)
    return unit(tick) + 0.6 * unit(snap) + 0.3 * unit(low)


def fx_ui_open(rng):
    n = n_of(0.3)
    swish = whoosh(rng, 0.22, 400.0, 2200.0, 0.7, q=1.2)
    knock = modal(n_of(0.1), 210.0, [(1.0, 1.0, 0.03), (2.6, 0.4, 0.015)], rng)
    ting = modal(n_of(0.15), 2400.0, [(1.0, 1.0, 0.08), (2.76, 0.3, 0.04)], rng)
    y = place(np.zeros(n), 0.6 * swish, 0.0)
    place(y, 0.7 * unit(knock), 0.16)
    place(y, 0.2 * unit(ting), 0.17)
    return reverb(y, 0.3, 0.05)


def fx_ui_close(rng):
    n = n_of(0.26)
    y = place(np.zeros(n), 0.7 * unit(modal(n_of(0.1), 190.0, [(1.0, 1.0, 0.03), (2.6, 0.4, 0.015)], rng)), 0.0)
    place(y, 0.6 * whoosh(rng, 0.2, 450.0, 2000.0, 0.25, q=1.2), 0.02)
    return reverb(y, 0.3, 0.05)


def fx_ui_error(rng):
    n = n_of(0.36)
    y = np.zeros(n)
    for at in (0.0, 0.14):
        m = n_of(0.11)
        sq = lambda f: sum(np.sin(TAU * f * k * t_of(m)) / k for k in (1, 3, 5, 7))
        place(y, (sq(196.0) + sq(207.65)) * env_ahr(m, 0.004, 0.05, 0.035), at)
    return reverb(lowpass(y, 1400.0), 0.3, 0.05)


ANVIL = [(1.0, 1.0, 0.5), (2.76, 0.6, 0.25), (5.4, 0.35, 0.12), (8.93, 0.15, 0.06)]


def anvil(rng, n, f0, damp=1.0):
    ring = modal(n, f0, [(r, a, k * damp) for r, a, k in ANVIL], rng, 0.002)
    m = min(n, n_of(0.01))
    strike = np.zeros(n)
    strike[:m] = band(white(rng, m), 2000.0, 8000.0) * env_perc(m, 0.0002, 0.002)
    return unit(ring) + 0.5 * unit(strike)


def fx_refine_ok(rng):
    n = n_of(1.4)
    y = 0.8 * unit(anvil(rng, n, 1150.0))
    for i, nm in enumerate(['A5', 'D6', 'F#6']):
        place(y, 0.45 * unit(chime(rng, n_of(1.0), note_hz(nm), 0.45)), 0.18 + 0.1 * i)
    place(y, 0.15 * unit(pings(rng, n_of(0.8), 8, 0.0, 0.5, 3000.0, 6500.0, 0.05)), 0.35)
    return reverb(y, 1.0, 0.2)


def fx_refine_fail(rng):
    n = n_of(1.2)
    y = 0.8 * unit(lowpass(anvil(rng, n, 700.0, 0.4), 2500.0))
    y += 0.6 * unit(thump(n, 110.0, 50.0, 0.04, 0.07))
    for i, nm in enumerate(['A4', 'F4', 'D4']):
        place(y, (0.5 - 0.08 * i) * unit(lowpass(bell(note_hz(nm), 0.8, rng, 0.5, strike=0.1), 2200.0)), 0.2 + 0.18 * i)
    place(y, 0.15 * unit(band(white(rng, n_of(0.5)), 1200.0, 5000.0) * env_perc(n_of(0.5), 0.01, 0.25)), 0.1)
    return reverb(y, 0.9, 0.18)


def fx_portal(rng):
    n = n_of(1.8)
    t = t_of(n)
    u = np.minimum(t / 0.9, 1.0)
    rise = svf(white(rng, n), 300.0 + 3600.0 * u ** 1.6, q=1.8) * bump(n, 0.55, 0.3)
    gl = 2.0 ** np.minimum(t / 0.8, 1.0)
    gliss = np.zeros(n)
    for base in (220.0, 277.2, 330.0):
        ph = phase_of(base * gl, n)
        ph2 = phase_of(base * gl * 1.004, n)
        gliss += np.sin(ph) + np.sin(ph2) + 0.3 * np.sin(2.0 * ph)
    gliss *= env_ahr(n, 0.2, 0.4, 0.6)
    y = 0.6 * unit(rise) + 0.35 * unit(gliss)
    place(y, 0.5 * unit(bell(note_hz('D5'), 1.0, rng, 0.8, True, 0.15, 0.4)), 0.78)
    place(y, 0.15 * unit(pings(rng, n_of(0.9), 10, 0.0, 0.7, 2000.0, 5000.0, 0.06)), 0.8)
    return reverb(y, 1.8, 0.35)


def fx_bell_warn_1(rng):
    """Primeiro toque: um sino fundo, debaixo da terra (Ré 2), com eco de caverna."""
    n = n_of(4.2)
    f0 = note_hz('D2')
    b = bell(f0, 4.2, rng, 3.4, strike=0.45, hum=0.55, bright=1.4)
    upper = modal(n, f0, BELL_UPPER, rng, 0.0015)
    clank = modal(n, f0 * 13.0, [(1.0, 1.0, 0.04), (1.41, 0.6, 0.03), (2.2, 0.3, 0.02)], rng, 0.004)
    knock = lowpass(white(rng, n), 260.0) * env_perc(n, 0.002, 0.05)
    rumble = lowpass(colored(rng, n, 1.0), 90.0) * bump(n, 0.6, 0.8)
    y = unit(b) + 0.55 * unit(upper) + 0.3 * unit(clank) + 0.3 * unit(knock) + 0.1 * unit(rumble)
    return reverb(y, 3.2, 0.45, 0.35, 0.03)


def fx_bell_warn_2(rng):
    """Segundo toque: o mesmo sino mais agudo (Lá 2), duas batidas, mais urgente."""
    n = n_of(3.3)
    f0 = note_hz('A2')
    y = np.zeros(n)
    for at, g in ((0.0, 0.85), (0.42, 1.0)):
        b = unit(bell(f0, 3.0, rng, 2.4, strike=0.5, hum=0.6, bright=1.4)) + 0.5 * unit(modal(n_of(3.0), f0, BELL_UPPER, rng, 0.0015))
        clank = modal(n_of(0.2), f0 * 12.0, [(1.0, 1.0, 0.035), (1.41, 0.6, 0.025)], rng, 0.004)
        place(y, g * unit(b), at)
        place(y, 0.22 * g * unit(clank), at)
    return reverb(y, 2.6, 0.4, 0.35, 0.025)


def fx_gate_rumble(rng):
    """Comporta de eclusa descendo: ronco grave, metal raspando, correntes e o baque no fim."""
    n = n_of(3.0)
    rumble = lowpass(colored(rng, n, 1.0), 140.0) * env_ahr(n, 0.25, 2.0, 0.6)
    src = white(rng, n)
    grind = sum(svf(src, f, q=12.0) for f in (220.0, 347.0, 512.0, 790.0, 1240.0))
    jitter = np.clip(0.5 + unit(lowpass(white(rng, n), 14.0)), 0.0, 1.5)
    grind = grind * jitter * env_ahr(n, 0.3, 1.9, 0.4)
    chains = np.zeros(n)
    for _ in range(7):
        c = modal(n_of(0.15), rng.uniform(600.0, 950.0), [(1.0, 1.0, 0.04), (2.4, 0.5, 0.02)], rng, 0.004)
        place(chains, unit(c) * rng.uniform(0.4, 1.0), rng.uniform(0.2, 2.4))
    stop_n = n_of(0.45)
    stop = unit(thump(stop_n, 70.0, 35.0, 0.1, 0.2)) + 0.6 * unit(lowpass(white(rng, stop_n), 400.0) * env_perc(stop_n, 0.001, 0.08))
    y = 0.8 * unit(rumble) + 0.75 * unit(grind) + 0.4 * unit(chains)
    place(y, 0.9 * unit(stop), 2.55)
    return reverb(soft_clip(y, 1.3), 2.0, 0.3, 0.4, 0.02)


def fx_steam_vent(rng):
    """Válvula da eclusa prestes a ventilar (docs/02 §5.3): o assobio de vapor cresce por 3 s e estoura."""
    n = n_of(3.4)
    t = t_of(n)
    build = np.clip(t / 3.0, 0.0, 1.0)
    cut = 1.0 - _ramp(t, 3.0, 3.12)
    hiss = svf(white(rng, n), 1500.0 + 2500.0 * build, q=1.2) * (0.12 + build ** 1.5) * cut
    f = 700.0 * 2.0 ** build * (1.0 + 0.015 * np.sin(TAU * 6.0 * t))
    ph = phase_of(f, n)
    whistle = (np.sin(ph) + 0.3 * np.sin(2.0 * ph)) * build ** 2.5 * cut
    m = n_of(0.4)
    burst = unit(band(white(rng, m), 300.0, 6000.0) * env_perc(m, 0.002, 0.12)) + 0.6 * unit(lowpass(white(rng, m), 400.0) * env_perc(m, 0.003, 0.08))
    y = 0.7 * unit(hiss) + 0.22 * unit(whistle)
    place(y, 0.9 * unit(burst), 3.0)
    return reverb(y, 1.6, 0.25)


def fx_alarm_pulse(rng):
    """Apito de vapor da eclusa: dois pulsos."""
    n = n_of(1.35)
    y = np.zeros(n)
    f0 = note_hz('Bb4')
    for at in (0.0, 0.55):
        m = n_of(0.5)
        tm = t_of(m)
        f = f0 * (1.0 - 0.08 * np.exp(-tm / 0.03))
        ph = phase_of(f, m)
        tone = sum(a * np.sin(k * ph) for k, a in enumerate([1.0, 0.5, 0.33, 0.2, 0.12], start=1))
        breath = band(white(rng, m), f0 * 1.5, f0 * 3.0)
        place(y, (unit(tone) + 0.15 * unit(breath)) * env_ahr(m, 0.04, 0.3, 0.1), at)
    return reverb(lowpass(y, 3200.0), 1.2, 0.25)


# ============================================================== música
MUSIC_BELLS = ['D3', 'F3', 'G3', 'A3', 'Bb3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'C5', 'D5']
MUSIC_FLUTE = ['D4', 'E4', 'F4', 'G4', 'A4', 'C5', 'D5']


def mus_bell(rng, nm):
    """Sino de carrilhão (terça menor); os graves soam mais e por mais tempo."""
    f0 = note_hz(nm)
    dur = 2.6 if f0 < 230.0 else (2.3 if f0 < 420.0 else 2.0)
    y = bell(f0, dur + 0.5, rng, 1.5 * (293.66 / f0) ** 0.45, strike=0.18, hum=0.7, bright=0.9)
    return reverb(y, 1.4, 0.22), dur


def mus_flute(rng, nm, dur=1.7):
    """Flauta de madeira soprada: vibrato que entra devagar, sopro no ataque e ar no som."""
    f0 = note_hz(nm)
    n = n_of(dur)
    t = t_of(n)
    rate = 5.0 + 0.3 * np.sin(TAU * 0.4 * t + rng.uniform(0, TAU))
    vib = 0.0055 * _ramp(t, 0.22, 0.6) * np.sin(TAU * np.cumsum(rate) / SR)
    f = f0 * (1.0 + vib - 0.012 * np.exp(-t / 0.035))
    ph = phase_of(f, n)
    jitter = unit(lowpass(white(rng, n), 12.0))
    tone = np.sin(ph) + 0.2 * np.sin(2 * ph + 0.4) + 0.075 * np.sin(3 * ph + 1.1) + 0.025 * np.sin(4 * ph + 2.0)
    env = env_ahr(n, 0.09, dur - 0.09 - 0.38, 0.38) * (1.0 + 0.04 * np.sin(TAU * 0.7 * t))
    air = band(white(rng, n), f0 * 2.0, min(NYQ * 0.9, f0 * 9.0))
    air /= np.std(air) + 1e-12
    breath = env * (0.35 + 1.6 * np.exp(-t / 0.05))
    near = svf(white(rng, n), f0, q=8.0)
    near /= np.std(near) + 1e-12
    y = env * tone * (1.0 + 0.03 * jitter) + 0.13 * breath * air + 0.1 * env * near
    y = lowpass(y, min(NYQ * 0.9, f0 * 10.0))
    return reverb(y, 1.2, 0.2)


def perc_anvil(rng):
    return reverb(anvil(rng, n_of(0.7), 820.0), 0.6, 0.12)


def perc_tick(rng):
    n = n_of(0.3)
    y = modal(n, 1650.0, [(1.0, 1.0, 0.12), (2.76, 0.5, 0.05), (4.2, 0.25, 0.03)], rng, 0.002)
    m = n_of(0.005)
    y[:m] += 0.6 * np.max(np.abs(y)) * unit(band(white(rng, m), 3000.0, 8000.0))
    return reverb(y, 0.5, 0.1)


def perc_gong(rng):
    """Gongo grave: parciais de placa que florescem (os agudos crescem e depois somem)."""
    n = n_of(3.2)
    t = t_of(n)
    f0 = note_hz('D2') * (1.0 - 0.01 * (1.0 - np.exp(-t / 0.5)))
    y = np.zeros(n)
    for ratio, amp, tau, bloom in [(1.0, 1.0, 2.6, 0.02), (1.47, 0.6, 2.0, 0.08), (1.98, 0.7, 1.7, 0.15),
                                   (2.41, 0.6, 1.4, 0.2), (2.94, 0.5, 1.1, 0.25), (3.46, 0.4, 0.9, 0.3),
                                   (4.02, 0.3, 0.7, 0.3), (4.6, 0.22, 0.5, 0.3), (5.3, 0.15, 0.4, 0.3), (6.1, 0.1, 0.3, 0.3)]:
        e = (1.0 - np.exp(-t / bloom)) * np.exp(-t / tau)
        y += amp * e * np.sin(phase_of(f0 * ratio, n) + rng.uniform(0, TAU))
    mallet = lowpass(white(rng, n), 300.0) * env_perc(n, 0.002, 0.03)
    return reverb(unit(y) + 0.3 * unit(mallet), 1.8, 0.2)


def perc_tank(rng):
    """Tanque de metal golpeado: estrondo grave e o anel do metal."""
    n = n_of(1.0)
    boom = thump(n, 90.0, 48.0, 0.15, 0.25)
    ring = modal(n, 190.0, [(1.0, 1.0, 0.4), (2.28, 0.6, 0.3), (3.75, 0.4, 0.2), (5.43, 0.25, 0.12)], rng, 0.003)
    click = band(white(rng, n), 1500.0, 6000.0) * env_perc(n, 0.0003, 0.004)
    y = unit(boom) + 0.35 * unit(ring) + 0.2 * unit(click)
    return reverb(soft_clip(y, 1.6), 0.8, 0.12)


def perc_chain(rng):
    n = n_of(0.5)
    y = np.zeros(n)
    for _ in range(8):
        c = modal(n_of(0.08), rng.uniform(2500.0, 6000.0), [(1.0, 1.0, 0.02), (1.6, 0.5, 0.012)], rng, 0.004)
        place(y, unit(c) * rng.uniform(0.4, 1.0), rng.uniform(0.0, 0.2))
    rattle = band(white(rng, n), 3000.0, 7000.0) * env_ahr(n, 0.005, 0.12, 0.1)
    return reverb(y + 0.3 * unit(rattle), 0.5, 0.1)


def drone_explore(rng):
    """Vento sobre a estrada e um bordão oco em Ré (Ré 2, Lá 2, Ré 3)."""
    n = n_of(LOOP)
    t = t_of(n)

    def wind(m, pre):
        tt = (np.arange(m) - pre) / SR
        fc = 520.0 + 260.0 * np.sin(TAU * tt / LOOP + 0.3) + 140.0 * np.sin(TAU * 3.0 * tt / LOOP + 1.1)
        return svf(colored(rng, m, 0.5), fc, q=1.1) * (0.75 + 0.25 * np.sin(TAU * 2.0 * tt / LOOP + 2.0))
    air = loop_seam(wind)
    rumble = band_circ(colored(rng, n, 1.0, True), 25.0, 160.0) * lfo(t, 1, 0.3, 1.0)
    hollow = [1.0, 0.35, 0.18, 0.08, 0.04]
    tones = (drone_tone(t, rng, note_hz('D2'), hollow, 1, 1, 0.25) + 0.7 * drone_tone(t, rng, note_hz('A2'), hollow, 1, 2, 0.3)
             + 0.45 * drone_tone(t, rng, note_hz('D3'), hollow, 2, 3, 0.35))
    y = unit(air) + 0.25 * unit(rumble) + 0.6 * unit(band_circ(tones, 0.0, 1400.0))
    return reverb_circ(y, 1.6, 0.25)


def drone_town(rng):
    """Cidade: órgão de palheta morno em quintas (Ré 3, Lá 3, Ré 4) e uma brisa leve."""
    n = n_of(LOOP)
    t = t_of(n)
    reed = [1.0, 0.55, 0.38, 0.25, 0.16, 0.1, 0.06, 0.04]
    tones = (drone_tone(t, rng, note_hz('D3'), reed, 1, 1, 0.2) + 0.75 * drone_tone(t, rng, note_hz('A3'), reed, 2, 2, 0.25)
             + 0.4 * drone_tone(t, rng, note_hz('D4'), reed, 1, 3, 0.3) + 0.5 * drone_tone(t, rng, note_hz('D2'), [1.0, 0.3], 1, 1, 0.2))
    breeze = band_circ(colored(rng, n, 0.5, True), 300.0, 1600.0) * lfo(t, 2, 0.4, 0.5)
    y = unit(band_circ(tones, 0.0, 1300.0)) + 0.18 * unit(breeze)
    return reverb_circ(y, 1.4, 0.22)


def drone_combat(rng):
    """Combate: bordão grave e áspero (Ré 1, Ré 2, Lá 2, um Si bemol tenso) e chiado de vapor."""
    n = n_of(LOOP)
    t = t_of(n)
    rough = [1.0, 0.6, 0.45, 0.35, 0.27, 0.2, 0.15, 0.11, 0.08, 0.06]
    tones = (drone_tone(t, rng, note_hz('D2'), rough, 2, 2, 0.3) + 0.7 * drone_tone(t, rng, note_hz('A2'), rough, 3, 3, 0.35)
             + 0.35 * drone_tone(t, rng, note_hz('Bb2'), rough, 1, 1, 0.6) + 0.5 * drone_tone(t, rng, note_hz('D1'), [1.0, 0.2], 1, 2, 0.2))
    steam = band_circ(white(rng, n), 2200.0, 7000.0) * lfo(t, 3, 0.6, 0.2)
    rumble = band_circ(colored(rng, n, 1.0, True), 25.0, 200.0) * lfo(t, 2, 0.4)
    y = unit(band_circ(tones, 0.0, 1300.0)) + 0.12 * unit(steam) + 0.35 * unit(rumble)
    return reverb_circ(y, 1.2, 0.2)


def drone_dungeon(rng):
    """Calabouço: ronco subterrâneo, Ré 1 profundo e canos que cantam ao longe."""
    n = n_of(LOOP)
    t = t_of(n)
    rumble = band_circ(colored(rng, n, 1.0, True), 20.0, 110.0) * lfo(t, 1, 0.35, 0.4)
    sub = drone_tone(t, rng, note_hz('D1'), [1.0, 0.4, 0.15], 1, 1, 0.2) + 0.4 * drone_tone(t, rng, note_hz('D2'), [1.0, 0.3], 1, 2, 0.4)
    pipes = np.zeros(n)
    for f, c in ((233.1, 1), (377.4, 2), (611.0, 3), (452.0, 1)):
        pipes += drone_tone(t, rng, f, [1.0, 0.2], 1, c, 0.9) * rng.uniform(0.5, 1.0)
    tunnel = band_circ(colored(rng, n, 0.5, True), 220.0, 420.0) * lfo(t, 2, 0.5, 2.2)
    y = 0.8 * unit(rumble) + 0.45 * unit(sub) + 0.4 * unit(pipes) + 0.5 * unit(tunnel)
    return reverb_circ(y, 2.6, 0.35, 0.35)


def drone_boss(rng):
    """Chefe: aglomerado grave e dissonante (Lá 1, Ré 2, Mi bemol 2) com trêmulo e metal raspando."""
    n = n_of(LOOP)
    t = t_of(n)
    rough = [1.0, 0.55, 0.4, 0.3, 0.22, 0.16, 0.12, 0.09]
    tones = (drone_tone(t, rng, note_hz('D2'), rough, 2, 2, 0.25) + 0.75 * drone_tone(t, rng, note_hz('Eb2'), rough, 3, 3, 0.35)
             + 0.8 * drone_tone(t, rng, note_hz('A1'), rough, 1, 1, 0.2))
    tremolo = 1.0 + 0.18 * np.sin(TAU * 16.0 * t / LOOP)
    scrape = band_circ(white(rng, n), 2000.0, 3200.0) * np.clip(0.4 + unit(band_circ(white(rng, n), 0.0, 6.0)), 0.0, 1.4)
    rumble = band_circ(colored(rng, n, 1.0, True), 20.0, 150.0) * lfo(t, 1, 0.3)
    y = unit(band_circ(tones, 0.0, 1300.0)) * tremolo + 0.15 * unit(scrape) + 0.45 * unit(rumble)
    return reverb_circ(y, 2.0, 0.28, 0.4)


# ============================================================== catálogo
# nome: (função, duração em s). Variantes "_2", "_3" dos passos dão variedade (o jogo sorteia).
SFX = {
    'footstep_dirt': (lambda r: fx_footstep_dirt(r, 0), 0.2),
    'footstep_dirt_2': (lambda r: fx_footstep_dirt(r, 1), 0.2),
    'footstep_dirt_3': (lambda r: fx_footstep_dirt(r, 2), 0.2),
    'footstep_stone': (lambda r: fx_footstep_stone(r, 0), 0.18),
    'footstep_stone_2': (lambda r: fx_footstep_stone(r, 1), 0.18),
    'footstep_stone_3': (lambda r: fx_footstep_stone(r, 2), 0.18),
    'swing_light': (fx_swing_light, 0.3),
    'swing_heavy': (fx_swing_heavy, 0.48),
    'hit_blade': (fx_hit_blade, 0.36),
    'hit_blunt': (fx_hit_blunt, 0.4),
    'hit_flesh': (fx_hit_flesh, 0.3),
    'bow_release': (fx_bow_release, 0.45),
    'arrow_hit': (fx_arrow_hit, 0.3),
    'javelin_throw': (fx_javelin_throw, 0.48),
    'spell_cast': (fx_spell_cast, 0.75),
    'spell_fire': (fx_spell_fire, 0.95),
    'spell_impact': (fx_spell_impact, 0.8),
    'heal_chime': (fx_heal_chime, 1.3),
    'shield_up': (fx_shield_up, 0.85),
    'buff': (fx_buff, 0.85),
    'debuff': (fx_debuff, 0.85),
    'monster_hurt': (fx_monster_hurt, 0.42),
    'monster_die': (fx_monster_die, 1.1),
    'player_hurt': (fx_player_hurt, 0.42),
    'player_die': (fx_player_die, 2.1),
    'level_up': (fx_level_up, 2.3),
    'quest_done': (fx_quest_done, 1.7),
    'loot_coins': (fx_loot_coins, 0.65),
    'loot_item': (fx_loot_item, 0.42),
    'potion': (fx_potion, 0.95),
    'ui_click': (fx_ui_click, 0.07),
    'ui_open': (fx_ui_open, 0.3),
    'ui_close': (fx_ui_close, 0.26),
    'ui_error': (fx_ui_error, 0.36),
    'refine_ok': (fx_refine_ok, 1.4),
    'refine_fail': (fx_refine_fail, 1.2),
    'portal': (fx_portal, 1.8),
    'bell_warn_1': (fx_bell_warn_1, 4.2),
    'bell_warn_2': (fx_bell_warn_2, 3.3),
    'gate_rumble': (fx_gate_rumble, 3.0),
    'alarm_pulse': (fx_alarm_pulse, 1.35),
    'steam_vent': (fx_steam_vent, 3.4),
}

MUSIC = {}
for _nm in MUSIC_BELLS:
    MUSIC['bell_' + _nm.lower()] = ('bell', _nm)
for _nm in MUSIC_FLUTE:
    MUSIC['flute_' + _nm.lower()] = ('flute', _nm)
for _nm, _fn, _d in [('perc_anvil', perc_anvil, 0.7), ('perc_tick', perc_tick, 0.3), ('perc_gong', perc_gong, 3.2),
                     ('perc_tank', perc_tank, 1.0), ('perc_chain', perc_chain, 0.5)]:
    MUSIC[_nm] = ('perc', _fn, _d)
for _nm, _fn in [('drone_explore', drone_explore), ('drone_town', drone_town), ('drone_combat', drone_combat),
                 ('drone_dungeon', drone_dungeon), ('drone_boss', drone_boss)]:
    MUSIC[_nm] = ('drone', _fn)


# ============================================================== WAV
def write_wav(path, x, loop=False):
    """WAV PCM 16 bits mono; com loop=True acrescenta o bloco 'smpl' (laço do início ao fim)."""
    pcm = np.clip(np.round(x * 32767.0), -32768, 32767).astype('<i2').tobytes()
    body = struct.pack('<4sIHHIIHH', b'fmt ', 16, 1, 1, SR, SR * 2, 2, 16)
    body += struct.pack('<4sI', b'data', len(pcm)) + pcm
    if loop:
        frames = len(x)
        # fabricante, produto, período (ns), nota MIDI, fração, formato SMPTE, deslocamento, nº de laços, dados
        smpl = struct.pack('<9I', 0, 0, int(round(1e9 / SR)), 60, 0, 0, 0, 1, 0)
        # laço: id, tipo (0 = para a frente), início, fim (exclusivo, como o Godot usa), fração, repetições (0 = sempre)
        smpl += struct.pack('<6I', 0, 0, 0, frames, 0, 0)
        body += struct.pack('<4sI', b'smpl', len(smpl)) + smpl
    data = struct.pack('<4sI4s', b'RIFF', 4 + len(body), b'WAVE') + body
    with open(path, 'wb') as f:
        f.write(data)
    return len(data)


def main():
    for d in OUT.values():
        os.makedirs(d, exist_ok=True)
    total = 0
    rows = []
    for name, (fn, dur) in SFX.items():
        y = finish(fn(rng_for(name)), dur)
        size = write_wav(os.path.join(OUT['sfx'], name + '.wav'), y)
        total += size
        rows.append(('sfx', name, len(y) / SR, short_rms_db(y), size))
    for name, spec in MUSIC.items():
        rng = rng_for(name)
        loop = False
        if spec[0] == 'bell':
            y, dur = mus_bell(rng, spec[1])
            y = finish(y, dur, fout=0.35)
        elif spec[0] == 'flute':
            y = finish(mus_flute(rng, spec[1]), 1.7, fout=0.2)
        elif spec[0] == 'perc':
            y = finish(spec[1](rng), spec[2], fout=0.08)
        else:
            y = finish_loop(spec[1](rng))
            loop = True
        size = write_wav(os.path.join(OUT['music'], name + '.wav'), y, loop)
        total += size
        rows.append(('music', name, len(y) / SR, short_rms_db(y), size))
    for kind, name, dur, rms, size in rows:
        print('%-6s %-18s %5.2f s  %6.1f dB  %7d bytes' % (kind, name, dur, rms, size))
    print('total: %d arquivos, %.2f MB (limite %.1f MB)' % (len(rows), total / 1e6, MAX_BYTES / 1e6))
    if total > MAX_BYTES:
        print('ERRO: client/audio passou do orçamento de tamanho.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
