"""Modelo do braço do corpo de referência (rapaz VRM, centro dos ombros na origem, +Z frente,
+X esquerda, +Y cima) usado para conferir as poses guiadas pela arma (WPOSES) antes de levá-las ao
jogo: alcance do ombro ao punho, flexão do cotovelo pelo polo e flexão/desvio do punho.

Mesmo cálculo de vrm_character.gd: base da arma a partir do eixo e do gume, base da mão pela
empunhadura (tilt/roll de GRIPS), punho = ponto de pega − deslocamento da pega na mão, IK de dois
ossos com polo. "auto" escolhe o gume/palma para os dedos seguirem o antebraço (punho neutro).
Limites anatômicos aproximados: flexão +60/−50°, desvio radial (+) até 20°, ulnar (−) até 35°.
"""
import numpy as np, math
np.set_printoptions(precision=3, suppress=True)
L1, L2, GX, PY, SH = 0.264, 0.228, 0.085, 0.030, 0.1465
def n(v): v=np.array(v,float); return v/np.linalg.norm(v)
def rotY(t): c,s=math.cos(t),math.sin(t); return np.array([[c,0,s],[0,1,0],[-s,0,c]])
def rotX(t): c,s=math.cos(t),math.sin(t); return np.array([[1,0,0],[0,c,-s],[0,s,c]])
def axang(ax,t):
    ax=n(ax); K=np.array([[0,-ax[2],ax[1]],[ax[2],0,-ax[0]],[-ax[1],ax[0],0]])
    return np.eye(3)+math.sin(t)*K+(1-math.cos(t))*K@K
def shoulders(yaw, lean):
    out={}
    for side,x in (('l',SH),('r',-SH)):
        v=np.array([x,0.0,0.0])
        # lean about spine pivot (y=-0.31)
        piv=np.array([0,-0.31,0])
        v=piv+rotX(-lean).T@(v-piv) if False else piv+ (rotX(lean)@(v-piv))
        v=rotY(yaw)@v
        out[side]=v
    return out
def w_in_hand(fam, side, tilt, roll):
    sgn=1.0 if side=='l' else -1.0
    if fam=='bow':
        b=np.array([[0,0,1],[1,0,0],[0,1,0]],float)  # columns (0,1,0),(0,0,1),(1,0,0)
        b=np.column_stack([(0,1,0),(0,0,1),(1,0,0)]).astype(float)
    else:
        b=np.column_stack([(1,0,0),(0,0,1),(0,-1,0)]).astype(float)
    return axang((0,1,0),tilt*sgn)@b@axang((0,1,0),roll)
def wframe(a,e):
    y=n(a); z=np.array(e,float); z=z-y*y.dot(z)
    if np.linalg.norm(z)<1e-3: z=np.array([0,0,1.0])-y*y[2]
    z=n(z); return np.column_stack([np.cross(y,z),y,z])
def solve(S, w, pole):
    d=np.linalg.norm(w-S); dd=min(max(d,0.01),(L1+L2)*0.999); nn=(w-S)/d
    pp=np.array(pole,float); pp=pp-nn*nn.dot(pp); pp=n(pp)
    aa=(L1*L1-L2*L2+dd*dd)/(2*dd); h=math.sqrt(max(0,L1*L1-aa*aa))
    E=S+nn*aa+pp*h; W=S+nn*dd
    return E,W,d
def pose(label, p, a, e, side='r', fam='x', tilt=0.0, roll=0.0, pole=None, yaw=0.0, lean=0.0, auto=False, two=None, opole=None, verbose=True):
    sgn=1.0 if side=='l' else -1.0
    p=np.array(p,float); a=n(a)
    if pole is None: pole=(0.5*sgn,-1.0,-0.35)
    sh=shoulders(yaw,lean); S=sh[side]
    M=w_in_hand(fam,side,tilt,roll)
    e=np.array(e,float) if e is not None else np.array([sgn*0.0,0,1.0])
    for it in range(6 if auto else 1):
        Wr=wframe(a,e); R=Wr@np.linalg.inv(M)
        F=R@np.array([sgn,0,0]); T=R@np.array([0,0,1.0]); P=R@np.array([0,-1.0,0])
        wrist=p-R@np.array([GX*sgn,-PY,0])
        E,W,d=solve(S,wrist,pole)
        f=n(W-E)
        if auto:
            f0=F-a*a.dot(F); fd=f-a*a.dot(f)
            ang=math.atan2(np.dot(np.cross(n(f0),n(fd)),a), np.dot(n(f0),n(fd)))
            e=axang(a,ang)@(Wr[:,2])
    flex=math.degrees(math.atan2(-f.dot(P),f.dot(F))); dev=math.degrees(math.atan2(-f.dot(T),f.dot(F)))
    up=n(E-S); elbow=math.degrees(math.acos(np.clip(np.dot(up,f),-1,1)))
    Wr=wframe(a,e)
    out=f"{label:22s} reach {d:.3f}/{L1+L2:.3f} elbow {elbow:5.1f} flex {flex:+5.1f} dev {dev:+5.1f} | E {E} wrist {wrist} | e {Wr[:,2]}"
    if two is not None:
        q=p+a*two; So=sh['l' if side=='r' else 'r']
        dq=np.linalg.norm(q-So)
        out+=f"\n{'':22s} off-hand pt {q} dist from shoulder {dq:.3f} (max ~{L1+L2+GX:.3f})"
    if verbose: print(out)
    return Wr[:,2], d, flex, dev
