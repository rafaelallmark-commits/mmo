"""Gera a tabela WPOSES de client/scripts/vrm_character.gd a partir das poses abaixo, conferindo cada
uma no modelo do braço (imprime alcance, cotovelo e punho) e calculando o gume/palma quando "auto".
Uso: python3 tools/poses/gerar_wposes.py  → escreve tools/poses/wposes.gd para colar no script.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from braco import *
def V(v): return "Vector3(%.3f, %.3f, %.3f)" % tuple(v)
FAM = {}
def P(fam, side='r', tilt=0.0, roll=0.0, wfam='x'):
    return dict(side=side, tilt=tilt, roll=roll, wfam=wfam)
CFG = {
 'spear_2h': P('spear_2h', tilt=0.4),
 'staff_2h': P('staff_2h', tilt=0.2),
 'axe_2h': P('axe_2h', tilt=0.15, roll=-1.571),
 'sword_2h': P('sword_2h', tilt=0.15, roll=-1.571),
 'javelin': P('javelin', tilt=0.3),
 'bow': P('bow', side='l', wfam='bow'),
 'wand': P('wand', tilt=1.3),
 'scepter': P('scepter', tilt=0.0),
}
SPEC = {
 'spear_2h': {
  'relaxed': dict(p=(-0.22,-0.2,0.24), a=(0,0.97,0.24), extra={'plant':0.425}),
  'walk': dict(p=(-0.22,-0.18,0.22), a=(0,0.97,0.24), extra={'slide':0.62,'swing':0.04}),
  'guard': dict(p=(-0.16,-0.37,0.04), a=(0.12,0.22,0.97), yaw=-0.45, lean=0.1, pole=(-0.8,-0.6,-0.2), two=0.5),
  'run': dict(p=(-0.2,-0.45,0.05), a=(0,0.34,0.94), extra={'swing':0.13}),
  'attack': [
    dict(t=0.3, p=(-0.2,-0.34,-0.08), a=(0.12,0.2,0.97), yaw=-0.6, lean=0.05, pole=(-0.8,-0.6,-0.2), two=0.55),
    dict(t=0.5, p=(-0.06,-0.32,0.24), a=(0.05,0.12,0.99), yaw=0.1, lean=0.22, pole=(-1,-0.3,0), two=0.25),
    dict(t=0.7, p=(-0.06,-0.32,0.22), a=(0.05,0.12,0.99), yaw=0.08, lean=0.2, pole=(-1,-0.3,0), two=0.27),
  ]},
 'staff_2h': {
  'relaxed': dict(p=(-0.24,-0.2,0.18), a=(-0.05,0.98,0.2), pole=(-0.4,-1,-0.6), extra={'plant':0.395}),
  'walk': dict(p=(-0.24,-0.18,0.18), a=(-0.05,0.98,0.2), pole=(-0.4,-1,-0.6), extra={'slide':0.62,'swing':0.04}),
  'guard': dict(p=(-0.15,-0.38,0.1), a=(0.12,0.62,0.78), yaw=-0.25, two=0.42),
  'run': dict(p=(-0.2,-0.45,0.05), a=(0,0.36,0.93), extra={'swing':0.12}),
  'attack': [
    dict(t=0.35, p=(-0.18,-0.2,0.12), a=(0.05,0.92,0.38), yaw=-0.3, two=0.42),
    dict(t=0.52, p=(-0.12,-0.36,0.22), a=(0.08,0.5,0.86), yaw=0.1, lean=0.1, pole=(-1,-0.5,-0.1), two=0.3),
    dict(t=0.75, p=(-0.12,-0.35,0.21), a=(0.08,0.52,0.85), yaw=0.08, lean=0.08, pole=(-1,-0.5,-0.1), two=0.3),
  ]},
 'axe_2h': {
  'relaxed': dict(p=(-0.13,0.0,0.2), a=(-0.1,0.45,-0.89), pole=(0,-1,0.6)),
  'walk': dict(p=(-0.13,0.0,0.2), a=(-0.1,0.45,-0.89), pole=(0,-1,0.6)),
  'guard': dict(p=(-0.034,-0.194,0.395), a=(-0.12,0.88,0.45), yaw=-0.2, two=-0.28),
  'run': dict(p=(-0.13,0.0,0.2), a=(-0.1,0.45,-0.89), pole=(0,-1,0.6)),
  'attack': [
    dict(t=0.35, p=(-0.12,0.18,0.02), a=(-0.15,0.45,-0.88), yaw=-0.3, lean=-0.1, pole=(-0.8,-0.3,0.3), two=-0.28),
    dict(t=0.52, p=(0.0,-0.08,0.44), a=(0.05,-0.3,0.95), yaw=0.15, lean=0.2, pole=(-0.3,-1,-0.6), two=-0.11, extra={'slide':-0.02}),
    dict(t=0.7, p=(0.03,-0.36,0.28), a=(0.05,-0.9,0.42), yaw=0.2, lean=0.3, pole=(-0.3,-1,-0.4), two=-0.11, extra={'slide':-0.02}),
  ]},
 'javelin': {
  'relaxed': dict(p=(-0.24,-0.47,0.1), a=(0,0.55,0.84)),
  'walk': dict(p=(-0.24,-0.47,0.1), a=(0,0.55,0.84), extra={'swing':0.05}),
  'guard': dict(p=(-0.2,-0.3,0.22), a=(0.06,0.35,0.94), yaw=-0.3, pole=(-0.8,-0.6,-0.2)),
  'run': dict(p=(-0.2,-0.45,0.05), a=(0,0.3,0.95), extra={'swing':0.13}),
  'attack': [
    dict(t=0.38, p=(-0.32,0.2,-0.18), a=(0.05,0.25,0.97), yaw=-0.6, pole=(-0.5,-0.3,-1)),
    dict(t=0.5, p=(-0.14,0.3,0.2), a=(0.0,0.2,0.98), yaw=0.3, lean=0.1, pole=(-0.7,-0.5,-0.2)),
    dict(t=0.7, p=(0.02,-0.3,0.35), a=(0.3,-0.3,0.9), yaw=0.45, lean=0.15),
  ]},
 'bow': {
  'relaxed': dict(p=(0.22,-0.43,0.12), a=(0,0.85,0.5)),
  'walk': dict(p=(0.22,-0.43,0.12), a=(0,0.85,0.5), extra={'swing':0.05}),
  'guard': dict(p=(0.12,-0.3,0.32), a=(0.15,0.95,0.25), yaw=-0.3, extra={'draw':0.0}),
  'run': dict(p=(0.21,-0.44,0.08), a=(0,0.8,0.6), extra={'swing':0.1}),
  'attack': [
    dict(t=0.18, p=(0.02,0.02,0.5), a=(0.1,0.99,0.0), yaw=-0.6, pole=(1,0,-0.3), extra={'draw':0.1}),
    dict(t=0.36, p=(-0.07,0.08,0.64), a=(0.12,0.99,0.0), e=(0,0,1), yaw=-0.85, pole=(1,0,-0.3), extra={'draw':0.45}),
    dict(t=0.5, p=(-0.07,0.08,0.64), a=(0.12,0.99,0.0), e=(0,0,1), yaw=-0.85, pole=(1,0,-0.3), off=[(-0.14,0.09,-0.02),(0.2,0.3,0.93),(0.0,0.9,-0.3),(-1,-0.4,-0.6)]),
    dict(t=0.7, p=(-0.02,0.06,0.62), a=(0.12,0.99,0.0), e=(0,0,1), yaw=-0.8, pole=(1,0,-0.3), off=[(-0.15,0.0,0.0),(0.2,-0.2,0.95),(0.0,0.9,-0.3),(-1,-0.6,-0.4)]),
  ]},
 'wand': {
  'relaxed': dict(p=(-0.22,-0.5,0.12), a=(0,-0.6,0.8)),
  'walk': dict(p=(-0.22,-0.5,0.12), a=(0,-0.6,0.8), extra={'swing':0.06}),
  'guard': dict(p=(-0.14,-0.22,0.34), a=(0.05,0.25,0.97), pole=(-0.6,-1,-0.3)),
  'run': dict(p=(-0.2,-0.45,0.05), a=(0,-0.5,0.86), extra={'swing':0.13}),
  'attack': [
    dict(t=0.38, p=(-0.26,0.08,-0.02), a=(0.0,0.95,0.3), yaw=-0.3, pole=(-0.8,-0.6,-0.2)),
    dict(t=0.5, p=(-0.1,-0.06,0.45), a=(0.05,0.08,0.99), yaw=0.2, lean=0.08, pole=(-0.6,-1,-0.3)),
    dict(t=0.7, p=(-0.1,-0.08,0.43), a=(0.05,0.06,0.99), yaw=0.18, lean=0.06, pole=(-0.6,-1,-0.3)),
  ]},
 'scepter': {
  'relaxed': dict(p=(-0.22,-0.42,0.18), a=(0,0.85,0.5)),
  'walk': dict(p=(-0.22,-0.42,0.18), a=(0,0.85,0.5), extra={'swing':0.05}),
  'guard': dict(p=(-0.14,-0.22,0.3), a=(0.0,0.95,0.3), pole=(-0.6,-1,-0.3)),
  'run': dict(p=(-0.2,-0.45,0.05), a=(0,0.6,0.8), extra={'swing':0.13}),
  'attack': [
    dict(t=0.38, p=(-0.16,0.22,0.3), a=(0,0.75,0.66), yaw=-0.1, pole=(-1,0.6,-0.2)),
    dict(t=0.55, p=(-0.12,-0.2,0.38), a=(0,0.7,0.71), yaw=0.1, lean=0.06, pole=(-0.8,0.3,-0.3)),
    dict(t=0.75, p=(-0.12,-0.21,0.37), a=(0,0.7,0.71), yaw=0.1, lean=0.05, pole=(-0.8,0.3,-0.3)),
  ]},
}
import copy
SPEC['sword_2h'] = copy.deepcopy(SPEC['axe_2h'])
SPEC['sword_2h']['guard']['two'] = -0.11
SPEC['sword_2h']['attack'][0]['two'] = -0.11
# preparo da espada de duas mãos "do teto": mãos acima do ombro direito e lâmina quase em pé, um pouco
# para trás (à vista por cima da cabeça). Copiado do machado, a lâmina deitava atrás da cabeça e, de
# frente, só se via a mão junto ao rosto.
SPEC['sword_2h']['attack'][0].update(p=(-0.15,0.12,0.06), a=(-0.12,0.86,-0.5))
out=["const WPOSES := {"]
for fam,sp in SPEC.items():
    c=CFG[fam]; sgn=1 if c['side']=='l' else -1
    print("==",fam)
    lines=[]
    def ent(name, d, key=False):
        pole=d.get('pole',(0.5*sgn,-1.0,-0.35))
        if 'e' in d:
            e,reach,flex,dev=pose(name, d['p'], d['a'], d['e'], side=c['side'], fam=c['wfam'], tilt=c['tilt'], roll=c['roll'], pole=pole, yaw=d.get('yaw',0.0), lean=d.get('lean',0.0), auto=False, two=d.get('two'))
        else:
            e,reach,flex,dev=pose(name, d['p'], d['a'], None, side=c['side'], fam=c['wfam'], tilt=c['tilt'], roll=c['roll'], pole=pole, yaw=d.get('yaw',0.0), lean=d.get('lean',0.0), auto=True, two=d.get('two'))
        f=[]
        if key: f.append('"t": %.2f' % d['t'])
        f.append('"p": '+V(d['p'])); f.append('"a": '+V(n(d['a']))); f.append('"e": '+V(e)); f.append('"pole": '+V(pole))
        for k in ('yaw','lean','two'):
            if k in d: f.append('"%s": %.3f' % (k,d[k]))
        for k,v in d.get('extra',{}).items(): f.append('"%s": %.3f' % (k,v))
        if 'off' in d:
            o=d['off']; f.append('"off": [%s, %s, %s, %s]' % (V(o[0]),V(n(o[1])),V(n(o[2])),V(o[3])))
        return "{"+", ".join(f)+"}"
    out.append('\t"%s": {' % fam)
    for st in ('relaxed','walk','guard','run'):
        out.append('\t\t"%s": %s,' % (st, ent(st, sp[st])))
    out.append('\t\t"attack": [')
    for i,k in enumerate(sp['attack']):
        out.append('\t\t\t%s,' % ent('atk%.2f'%k['t'], k, key=True))
    out.append('\t\t],')
    out.append('\t},')
out.append('}')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'wposes.gd'),'w').write("\n".join(out)+"\n")
