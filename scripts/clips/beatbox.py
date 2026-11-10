# A beatbox loop synthesised from scratch (so the rights are the user's): a lip-bass "boom", a "pf" snare,
# "ts" hi-hats, a "k" click and a hummed "mmm" bass line, at 96 BPM, with a short room echo.
#   python3 -I beatbox.py <seconds> <out.wav>
import sys, wave
import numpy as np

SR = 44100
dur = float(sys.argv[1]); out = sys.argv[2]
rng = np.random.default_rng(7)
N = int(SR * dur)
mix = np.zeros(N)

def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.minimum(1, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)

def band(x, lo, hi):  # brick-wall band-pass via FFT, fine for short one-shots
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))

def boom():  # lip bass drum: pitch-dropping sine + breathy low noise
    n = int(0.32 * SR); t = np.arange(n) / SR
    f = 55 + 95 * np.exp(-t / 0.045)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.003, 0.11)
    air = band(rng.standard_normal(n), 60, 400) * env(n, 0.002, 0.03) * 0.35
    return 0.95 * tone + air

def pf():  # "pf / kh" snare: burst of mid noise with a little 190 Hz body
    n = int(0.22 * SR); t = np.arange(n) / SR
    noise = band(rng.standard_normal(n), 900, 5200) * env(n, 0.004, 0.06)
    body = np.sin(2 * np.pi * 190 * t) * env(n, 0.002, 0.035) * 0.4
    return 0.55 * noise / (np.abs(noise).max() + 1e-9) + body

def ts(length=0.06):  # "ts" hi-hat
    n = int(length * SR)
    x = band(rng.standard_normal(n), 6000, 14000) * env(n, 0.002, length / 3)
    return 0.22 * x / (np.abs(x).max() + 1e-9)

def k():  # tongue click
    n = int(0.03 * SR)
    x = band(rng.standard_normal(n), 2500, 7000) * env(n, 0.0005, 0.006)
    return 0.3 * x / (np.abs(x).max() + 1e-9)

def hum(freq, length):  # hummed "mmm" bass: a few harmonics, slow vibrato, soft edges
    n = int(length * SR); t = np.arange(n) / SR
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t)
    ph = 2 * np.pi * np.cumsum(freq * vib) / SR
    x = np.sin(ph) + 0.45 * np.sin(2 * ph) + 0.2 * np.sin(3 * ph) + 0.08 * np.sin(4 * ph)
    e = np.minimum(1, t / 0.04) * np.minimum(1, (length - t) / 0.08)
    return 0.16 * x * e

def put(x, at):
    i = int(at * SR)
    if i >= N: return
    j = min(N, i + len(x)); mix[i:j] += x[: j - i]

style = sys.argv[3] if len(sys.argv) > 3 else 'boombap'
S = {
  'boombap': dict(bpm=96, swing=0.0, kick=[[1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0],[1,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0]], snare=[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                  hat=[1,0,1,0,1,0,1,0,1,0,1,1,1,0,1,0], click=[0,0,0,1,0,0,0,0,0,0,0,0,0,1,0,0], bass=[55.0,55.0,65.41,49.0], melody=None, rolls=False),
  'lofi':    dict(bpm=78, swing=0.33, kick=[[1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0],[1,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0]], snare=[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                  hat=[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0], click=[0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0], bass=[73.42,61.74,55.0,65.41],
                  melody=[(0,293.66,1.5),(6,329.63,0.5),(8,349.23,1.0),(12,329.63,1.0),(16,293.66,1.5),(22,261.63,0.5),(24,246.94,2.0)], rolls=False),
  'trap':    dict(bpm=140, swing=0.0, kick=[[1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,0],[1,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0]],
                  snare=[0]*16+[1]+[0]*15, hat=[1,0,1,0]*8, click=[0]*32, bass=[41.2,41.2,49.0,36.71], melody=None, rolls=True, steps=32),
  'bounce':  dict(bpm=112, swing=0.0, kick=[[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]]*2, snare=[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
                  hat=[0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,1], click=[0,1,0,0,0,0,0,1,0,1,0,0,0,0,0,0], bass=[55.0,73.42,82.41,65.41],
                  melody=[(0,440.0,0.5),(2,493.88,0.5),(4,523.25,1.0),(8,493.88,0.5),(10,440.0,0.5),(12,392.0,1.0)], rolls=False),
}[style]
steps = S.get('steps', 16)
step = 60 / S['bpm'] / 4
bar = steps * step
bars = int(dur / bar) + 1
for b in range(bars):
    t0 = b * bar
    kk = S['kick'][b % len(S['kick'])]
    for s in range(steps):
        t = t0 + s * step + (S['swing'] * step if s % 2 else 0)
        if kk[s]: put(boom(), t)
        if S['snare'][s]: put(pf(), t)
        if S['hat'][s % len(S['hat'])]: put(ts(0.05), t)
        if S['click'][s % len(S['click'])]: put(k(), t)
    if S['rolls'] and b % 2 == 1:  # hi-hat roll into the next bar
        for r in range(6): put(ts(0.03) * 0.8, t0 + bar - 6 * step / 2 + r * step / 2)
    if b >= 1:
        put(hum(S['bass'][b % 4], bar * 0.92), t0)
    if S['melody'] and b >= 2:  # hummed "doo" melody (an octave down, soft) from the third bar
        for st, fr, beats in S['melody']:
            if st < steps: put(hum(fr / 2, beats * 4 * step * 0.9) * 0.55, t0 + st * step)

# small room: two short echoes
for d, g in ((0.043, 0.18), (0.097, 0.1)):
    s = int(d * SR); mix[s:] += g * mix[:-s].copy()

# fade in/out, soft clip, normalise
t = np.arange(N) / SR
mix *= np.minimum(1, t / 0.3) * np.minimum(1, (dur - t) / 1.2)
mix = np.tanh(1.4 * mix); mix /= np.abs(mix).max() + 1e-9; mix *= 0.85
pcm = (mix * 32767).astype(np.int16)
stereo = np.repeat(pcm[:, None], 2, axis=1)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(stereo.tobytes())
print('wrote', out, round(dur, 2), 's')
