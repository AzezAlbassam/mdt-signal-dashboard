#!/usr/bin/env python3
"""Study 15 §1: measure the 2026-10-12 @t38p_flow chart from the screenshot.

  python3 -I scripts/study15-measure.py data/study15/chart-2026-10-12.png data/study15/SP_SPX_1m.json \
      > data/study15/chart-measure.json   [DEBUG=<dir> writes measure-overlay.png]

Needs Pillow and numpy only. Coordinates are pixels of the 2360x1640 screenshot.
"""
import json, os, sys
from datetime import datetime, timezone, timedelta
import numpy as np
from PIL import Image, ImageDraw

png, bars_path = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(png).convert('RGB')).astype(int)
H, W, _ = a.shape
R, G, B = a[..., 0], a[..., 1], a[..., 2]
mx, mn = a.max(2), a.min(2)

# ---- pixel classes (colours sampled from the image) ----
white = (mn >= 140) & (mx - mn <= 22)                                    # down candles, wicks
blue = (B >= 135) & (B <= 215) & (B - R >= 25) & (G >= R) & (R >= 80)    # up candles
candle = white | blue
lineyel = (R >= 200) & (G >= 150) & (B <= 130) & (R - B >= 90)           # line and bright bubbles
dimyel = (R >= 110) & (R < 200) & (G >= 85) & (B <= 80) & (R - B >= 60)  # dim bubbles
purple = (B >= 100) & (R >= 60) & (G <= 80) & (B - G >= 50)
lblue = (B >= 215) & (G >= 160) & (R >= 120) & (R <= 190)                # trade marks, "+$" text, dots
red = (R >= 180) & (G <= 140) & (B <= 140) & (R - G >= 60)               # hand-drawn circles
blend = (R >= 150) & (G >= 120) & (R - B >= 50) & ~candle                # a translucent bubble over a candle
objects = candle | lineyel | dimyel | purple | lblue | red | blend

# ---- 1. price axis: centre of each label's text rows, least squares ----
AX0, AX1 = 2200, 2360
txt = (mn[:, AX0:AX1] >= 70) & (mx[:, AX0:AX1] - mn[:, AX0:AX1] <= 30)
clusters = []
for y in np.where(txt.sum(1) > 0)[0]:
    if clusters and y <= clusters[-1][1] + 3: clusters[-1][1] = int(y)
    else: clusters.append([int(y), int(y)])
# Read by eye: 7826 is the first complete label; labels step 2 points down; 7802 is under the
# current-price box. A label is a cluster 22-25 px tall starting at the axis text column (x 2235).
labels = []
for y0, y1 in clusters:
    xs = np.where(txt[y0:y1 + 1].any(0))[0] + AX0
    if 22 <= y1 - y0 + 1 <= 25 and xs.min() == 2235 and xs.max() <= 2310:
        labels.append((y0 + y1) / 2)
step = np.median(np.diff(labels))
prices = [7826 - 2 * round((y - labels[0]) / step) for y in labels]
b, a0 = np.polyfit(prices, labels, 1)            # y = a0 + b*price
resid = [float(y - (a0 + b * p)) for y, p in zip(labels, prices)]
if max(abs(r) for r in resid) > 3: sys.exit('axis label off the fit by more than 3 px; stop (§1.1)')
price = lambda y: (y - a0) / b
ypix = lambda p: a0 + b * p

# ---- plot extent: the bands' fill ends at the last bar ----
fill_any = (~objects) & (R >= 19) & (R <= 70) & (B <= 40)
col_fill = fill_any[150:1500].sum(0)
X_END = int(max(x for x in range(1900) if col_fill[x] > 50))
X_START = int(min(x for x in range(1900) if col_fill[x] > 50))

# ---- light-blue components: trade triangles, "+$" text, dot markers (blue wicks are 1-3 px wide) ----
from collections import deque
def components(mask, x_max):
    seen = np.zeros_like(mask); comps = []
    for y in range(150, 1500):
        for x in range(0, x_max):
            if mask[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True; pts = []
                while q:
                    yy, xx = q.popleft(); pts.append((yy, xx))
                    for ny, nx in ((yy + 1, xx), (yy - 1, xx), (yy, xx + 1), (yy, xx - 1)):
                        if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; q.append((ny, nx))
                ys = [p[0] for p in pts]; xs = [p[1] for p in pts]
                comps.append(dict(n=len(pts), x0=min(xs), x1=max(xs), y0=min(ys), y1=max(ys), ys=ys))
    return comps
lb_comps = [c for c in components(lblue, X_END + 60) if c['x1'] - c['x0'] + 1 >= 5]

# ---- 2. candles ----
Y0, Y1 = 150, 1500
DASH = (1261, 1269)                                # dashed current-price line (rows 1264-1266)
# rows below 1420 hold the drawing button and the 'Today' pill, never a candle
cm = candle.copy(); cm[:Y0] = False; cm[1420:] = False; cm[:, X_END + 15:] = False
cm[DASH[0]:DASH[1] + 1] = False
colcount = cm.sum(0)
runs = []
for x in range(W):
    if colcount[x] > 0:
        if runs and x == runs[-1][1] + 1: runs[-1][1] = x
        else: runs.append([x, x])
# Grid x = x0 + k*dx from the clean runs (one candle each: 14-20 px wide), indexed by the gaps
# between neighbours so a hidden candle does not shift the rest.
clean = [(r[0] + r[1]) / 2 for r in runs if 14 <= r[1] - r[0] + 1 <= 20 and r[0] > 1]
d = np.diff(clean); dx0 = float(np.median(d[(d > 12) & (d < 35)]))
kk = [0]
for g in d: kk.append(kk[-1] + max(1, int(round(g / dx0))))
dx, x0g = np.polyfit(kk, clean, 1)
kmin = int(np.floor((0 - x0g) / dx + 0.5))          # the slot whose centre is nearest the left edge
kmax = int(np.floor((X_END - x0g) / dx + 0.5))
grid_resid = np.array(clean) - (x0g + dx * np.array(kk))

occluder = lineyel | dimyel | purple | lblue | red | blend
def vertical_extent(cols, y_start, step):
    """Follow candle pixels from y_start in direction step through columns `cols`, allowing
    gaps of <= 2 px, the dashed price-line band and anything drawn over the wick (the line,
    bubbles, marks); return the last candle row reached."""
    y, last, gap = y_start, y_start, 0
    while Y0 <= y < Y1:
        if DASH[0] <= y <= DASH[1] or occluder[y, cols].any(): y += step; continue
        if candle[y, cols].any(): last, gap = y, 0
        else:
            gap += 1
            if gap > 2: break
        y += step
    return last

cands = []
for kk_ in range(kmin, kmax + 1):
    c0 = x0g + dx * kk_
    xa, xb = int(round(c0 - 6)), int(round(c0 + 6))
    if xb < 0: continue
    xa = max(0, xa)
    slot = cm[:, xa:xb + 1]
    rowcount = slot.sum(1)
    thick = np.where(rowcount >= min(6, xb - xa + 1))[0]
    if not len(thick): continue        # body hidden (under a bubble row): not measured
    # largest contiguous block of body rows
    blocks, st = [], thick[0]
    for i in range(1, len(thick) + 1):
        if i == len(thick) or thick[i] > thick[i - 1] + 2:
            blocks.append((st, thick[i - 1])); st = thick[i] if i < len(thick) else None
    bt, bb = max(blocks, key=lambda b_: b_[1] - b_[0])
    wick = list(range(max(0, int(round(c0)) - 3), int(round(c0)) + 4))
    hi = vertical_extent(wick, int(bt), -1)
    lo = vertical_extent(wick, int(bb), +1)
    body_cols = slice(xa, xb + 1)
    is_blue = blue[bt:bb + 1, body_cols].sum() > white[bt:bb + 1, body_cols].sum()
    flags = []
    if c0 - 8.5 < X_START: flags.append('cut by the left edge')
    if DASH[0] - 2 <= lo <= DASH[0]: flags.append('low at price line')
    if DASH[1] <= hi <= DASH[1] + 2: flags.append('high at price line')
    for c in lb_comps:
        if c['x0'] <= xb + 4 and c['x1'] >= xa - 4 and c['y0'] <= lo + 6 and c['y1'] >= hi - 6:
            flags.append('trade mark/label/dot')
    # an end that stops at something drawn over it may be hidden under it
    near = lambda y, mask: mask[max(0, y - 5):y + 6, xa:xb + 1].any()
    if near(hi, lineyel | dimyel | purple | blend) or near(lo, lineyel | dimyel | purple | blend): flags.append('bubble/line')
    if red[Y0:Y1, max(0, xa - 2):xb + 3].any(): flags.append('red circle')
    cands.append(dict(k=kk_ - kmin, cx=round(float(c0), 2), hi_y=int(hi), lo_y=int(lo), body_top_y=int(bt), body_bot_y=int(bb),
                      up=bool(is_blue), flags=sorted(set(flags))))
x0g = x0g + dx * kmin
k = np.array([c['k'] for c in cands])
for c in cands:
    c['high'] = round(price(c['hi_y']), 3); c['low'] = round(price(c['lo_y']), 3)
    if c['body_top_y'] is not None:
        top, bot = price(c['body_top_y']), price(c['body_bot_y'])
        c['open'], c['close'] = (round(bot, 3), round(top, 3)) if c['up'] else (round(top, 3), round(bot, 3))
last_k = int(k.max())

cands[-1]['flags'] = sorted(set(cands[-1]['flags'] + ['last (forming)']))

# ---- 3. time axis: align to SP:SPX bars of m minutes anchored at 09:30 ET ----
raw = json.load(open(bars_path))['bars']
ET = timezone(timedelta(hours=-4))  # EDT on 2026-10-12
day = [x for x in raw if datetime.fromtimestamp(x['t'], ET).strftime('%Y-%m-%d') == '2026-10-12']
open_t = int(datetime(2026, 10, 12, 9, 30, tzinfo=ET).timestamp())
close_t = int(datetime(2026, 10, 12, 16, 0, tzinfo=ET).timestamp())
rth = [x for x in day if open_t <= x['t'] < close_t]

def resample(m):
    out = {}
    for x in rth:
        i = (x['t'] - open_t) // (60 * m)
        o = out.get(i)
        if o is None: out[i] = dict(i=i, t=open_t + i * 60 * m, o=x['o'], h=x['h'], l=x['l'], c=x['c'], v=x['v'], n=1)
        else: o['h'] = max(o['h'], x['h']); o['l'] = min(o['l'], x['l']); o['c'] = x['c']; o['v'] += x['v']; o['n'] += 1
    return [out[i] for i in sorted(out)]

use = [c for c in cands if not c['flags']]
fits = []
for m in (1, 2, 3, 5, 10, 15):
    bars = resample(m)
    for s in range(0, len(bars) - last_k):
        err = [abs(c['high'] - bars[s + c['k']]['h']) for c in use] + [abs(c['low'] - bars[s + c['k']]['l']) for c in use]
        fits.append((float(np.mean(err)), m, s))
fits.sort()
best, runner = fits[0], next(f for f in fits[1:] if (f[1], f[2]) != fits[0][1:])
mae, M, S = best
gate = mae <= 0.35
bars = resample(M)
for c in cands:
    bb = bars[S + c['k']]
    c['bar_start_et'] = datetime.fromtimestamp(bb['t'], ET).strftime('%H:%M')
    c['spx'] = dict(o=bb['o'], h=bb['h'], l=bb['l'], c=bb['c'])

# ---- 4. the yellow line ----
# Thin (2-10 px) runs of line-yellow. Bubble rows sit at strike prices; the tracker is seeded
# at the left-most column with exactly one thin run away from every strike row, then follows the
# nearest run, allowing a jump that grows with the number of columns the line was hidden for.
strike_rows = [ypix(p_) for p_ in range(7790, 7830, 5)]
line_y = {}
prev, prev_x = None, None
for x in range(X_START, X_END + 1):
    col = lineyel[Y0:Y1, x]
    rs, start = [], None
    for i, v in enumerate(col):
        if v and start is None: start = i
        if (not v or i == len(col) - 1) and start is not None:
            end = i if v else i - 1
            rs.append((start + Y0, end + Y0)); start = None
    rs = [(s0, s1) for s0, s1 in rs if 2 <= s1 - s0 + 1 <= 10]
    if not rs: continue
    if prev is None:
        far = [r for r in rs if min(abs((r[0] + r[1]) / 2 - sr) for sr in strike_rows) > 25]
        if len(rs) != 1 or len(far) != 1: continue
        pick = far[0]
    else:
        pick = min(rs, key=lambda r: abs((r[0] + r[1]) / 2 - prev))
        if abs((pick[0] + pick[1]) / 2 - prev) > 6 + 3 * (x - prev_x): continue
    yc = (pick[0] + pick[1]) / 2
    line_y[x] = yc; prev, prev_x = yc, x
for c in cands:
    xs = [line_y[x] for x in range(int(c['cx'] - 2), int(c['cx'] + 3)) if x in line_y]
    c['line_n'] = len(xs)
    c['line'] = round(price(float(np.median(xs))), 3) if len(xs) >= 3 else None

# ---- 5. band edges: the four dotted edges sit on the fill boundaries ----
# Fill levels by the red channel on non-object pixels: background ~10, outer fill ~28,
# inner fill ~45. Gridline rows are slightly brighter everywhere and are skipped.
# objects grown by 3 px, so the soft halo around a bubble or candle never reads as fill
obj3 = objects.copy()
for dy in range(-3, 4):
    for dx_ in range(-3, 4):
        obj3 |= np.roll(np.roll(objects, dy, 0), dx_, 1)
grid_rows = set()
for p in range(7790, 7830, 2):
    yg = int(round(ypix(p)))
    for yy in range(yg - 3, yg + 4): grid_rows.add(yy)
def level(x, y):
    if obj3[y, x] or y in grid_rows: return None
    r = R[y, x]
    if r < 19: return 0
    if r < 38: return 1
    if r < 70 and B[y, x] < 40: return 2
    return None
def transitions(x):
    seq = []   # (y, level) runs of >= 6 px
    cur, start, n = None, None, 0
    for y in range(Y0, Y1):
        lv = level(x, y)
        if lv is None: continue
        if lv == cur: n += 1
        else:
            if cur is not None and n >= 6: seq.append((start, last, cur))
            cur, start, n = lv, y, 1
        last = y
    if cur is not None and n >= 6: seq.append((start, last, cur))
    # merge consecutive same-level runs
    m = []
    for r in seq:
        if m and m[-1][2] == r[2]: m[-1] = (m[-1][0], r[1], r[2])
        else: m.append(r)
    return m
edges = {e: [] for e in ('E1', 'E2', 'E3', 'E4')}
def dot_center(x, ya, yb):
    # brightest compact blob between the end of one fill run and the start of the next
    lo_, hi_ = max(Y0, ya - 6), min(Y1, yb + 6)
    rr = R[lo_:hi_, x].astype(float)
    base = np.median(rr)
    ys = [lo_ + i for i, v in enumerate(rr) if v >= base + 12 and not obj3[lo_ + i, x]]
    if not ys or max(ys) - min(ys) > 9: return None
    w = np.array([R[y, x] for y in ys], float)
    return float(np.average(ys, weights=w))
for x in range(0, X_END + 1):
    seq = transitions(x)
    lv = [s[2] for s in seq]
    # expected order top->bottom: 0,1,2,1,0 ; take the boundaries that exist in that order
    pairs = []
    for i in range(len(seq) - 1):
        pairs.append((seq[i][2], seq[i + 1][2], seq[i][1], seq[i + 1][0]))
    seen2 = False
    for a_, b_, ya, yb in pairs:
        name = None
        if a_ == 0 and b_ == 1 and not seen2: name = 'E1'
        elif a_ == 1 and b_ == 2: name = 'E2'; seen2 = True
        elif a_ == 2 and b_ == 1: name = 'E3'
        elif a_ == 1 and b_ == 0 and seen2: name = 'E4'
        if name and yb - ya <= 14:
            yc = dot_center(x, ya, yb)
            if yc is not None: edges[name].append((x, yc))
# group per-column dot pixels into dots (blobs along x), centre = mean
dots = {}
for e, pts in edges.items():
    blobs = []
    for x, y in pts:
        if blobs and x - blobs[-1][-1][0] <= 1 and abs(y - blobs[-1][-1][1]) <= 3: blobs[-1].append((x, y))
        else: blobs.append([(x, y)])
    ds = [(float(np.mean([p[0] for p in bl])), float(np.mean([p[1] for p in bl])), len(bl)) for bl in blobs if 2 <= len(bl) <= 12]
    # nothing inside a "+$" pill or around a mark counts (their grey borders are not objects)
    ds = [d_ for d_ in ds if not any(c['x0'] - 30 <= d_[0] <= c['x1'] + 30 and c['y0'] - 22 <= d_[1] <= c['y1'] + 22 for c in lb_comps)]
    # a dot more than 5 px off the running median of its edge's dots within +-60 px is not on it
    keep = []
    for x_, y_, n_ in ds:
        nb = [yy for xx, yy, _ in ds if abs(xx - x_) <= 60]
        if len(nb) >= 3 and abs(y_ - np.median(nb)) <= 5: keep.append((x_, y_, n_))
    dots[e] = keep
for c in cands:
    for e in edges:
        ys = [d[1] for d in dots[e] if abs(d[0] - c['cx']) <= dx / 2]
        c[e] = round(price(float(np.median(ys))), 3) if ys else None
        c[e + '_n'] = len(ys)

# ---- 6. bubble rows and trade marks (descriptive) ----
bub = lineyel | dimyel | purple
rows_out = []
for strike in range(7790, 7830, 5):
    yc = ypix(strike)
    band = slice(int(yc - 22), int(yc + 23))
    hs = []
    for x in range(0, X_END + 12):
        col = bub[band, x]
        # POST-HOC (description only): 30 px, not 22 — the line ~24 px off a row was read as 3 px bubbles
        if col.sum() >= 3 and (x not in line_y or abs(line_y[x] - yc) > 30):
            ys = np.where(col)[0]
            hs.append((x, int(ys.max() - ys.min() + 1), float(ys.mean() + band.start), bool(purple[band, x].sum() > col.sum() / 2)))
    if len(hs) < 20: continue
    heights = [h[1] for h in hs]
    rows_out.append(dict(strike=strike, y_center=round(float(np.median([h[2] for h in hs])), 1),
                         price_center=round(price(float(np.median([h[2] for h in hs]))), 2),
                         colour='purple' if np.mean([h[3] for h in hs]) > 0.5 else 'yellow',
                         x_first=hs[0][0], x_last=hs[-1][0], height_first_px=heights[0] if heights else None,
                         height_at_end_px=int(np.max(heights[-15:])), height_max_px=int(max(heights)),
                         x_of_max=int(hs[int(np.argmax(heights))][0])))

marks = []
for c in lb_comps:
    bw, bh = c['x1'] - c['x0'] + 1, c['y1'] - c['y0'] + 1
    if 18 <= bw <= 40 and 15 <= bh <= 40:
        fill = c['n'] / (bw * bh)
        kind = 'down (hollow)' if fill < 0.35 else 'up (filled)'
        tip = c['y1'] if kind.startswith('down') else c['y0']   # the vertex the triangle points with
        xc = (c['x0'] + c['x1']) / 2
        kk_ = int(round((xc - x0g) / dx))
        marks.append(dict(kind=kind, x=xc, tip_y=int(tip), tip_price=round(price(tip), 2), k=kk_,
                          bar_start_et=datetime.fromtimestamp(bars[S + kk_]['t'], ET).strftime('%H:%M') if 0 <= S + kk_ < len(bars) else None,
                          bbox=[c['x0'], c['y0'], c['x1'], c['y1']], fill=round(fill, 2)))

# the hollow entry triangles are drawn in a greyer blue that overlaps the up-candle colour:
# find them by shape (a 26-40 px wide, mostly empty component)
bluish = (B > 150) & (B - R > 40)
bluish1 = bluish.copy()          # anti-aliasing breaks the thin outline; close 1 px gaps
for dy in (-1, 0, 1):
    for dx_ in (-1, 0, 1):
        bluish1 |= np.roll(np.roll(bluish, dy, 0), dx_, 1)
for c in components(bluish1, X_END + 60):
    c['n'] = int(bluish[c['y0']:c['y1'] + 1, c['x0']:c['x1'] + 1].sum())
    bw, bh = c['x1'] - c['x0'] + 1, c['y1'] - c['y0'] + 1
    fill = c['n'] / (bw * bh)
    if 26 <= bw <= 42 and 20 <= bh <= 42 and fill < 0.45 and not any(abs(m['x'] - (c['x0'] + c['x1']) / 2) < 10 and abs(m['tip_y'] - c['y0']) < 30 for m in marks):
        xc = (c['x0'] + c['x1']) / 2
        kk_ = int(round((xc - x0g) / dx))
        marks.append(dict(kind='down (hollow)', x=xc, tip_y=int(c['y1']), tip_price=round(price(c['y1']), 2), k=kk_,
                          bar_start_et=datetime.fromtimestamp(bars[S + kk_]['t'], ET).strftime('%H:%M') if 0 <= S + kk_ < len(bars) else None,
                          bbox=[c['x0'], c['y0'], c['x1'], c['y1']], fill=round(fill, 2)))
marks.sort(key=lambda m: m['x'])

# axis check: the faint horizontal gridline nearest each 2-point level, against the label fit
grid_check = []
for p_ in range(7796, 7828, 2):
    yg = ypix(p_)
    rows = range(int(yg) - 6, int(yg) + 7)
    sc = [np.mean(R[y_, X_START:X_END][~objects[y_, X_START:X_END]]) for y_ in rows]
    grid_check.append(round(float(rows[int(np.argmax(sc))] - yg), 2))

out = dict(
    source=png, image_size=[W, H],
    axis=dict(labels=[dict(y=y, price=p) for y, p in zip(labels, prices)], px_per_point=round(float(b), 4) * -1,
              y_of_7800=round(float(ypix(7800)), 2), residual_px=[round(r, 2) for r in resid],
              dashed_price_line_y=1265, dashed_price_line_price=round(price(1265), 2),
              gridline_minus_fit_px=grid_check),
    plot=dict(x_end=X_END, candle_dx_px=round(float(dx), 3), candle_x0=round(float(x0g), 2), candles=len(cands), last_k=last_k,
              grid_resid_max_px=round(float(np.abs(grid_resid).max()), 2)),
    alignment=dict(bar_minutes=M, start_bar=S, start_et=datetime.fromtimestamp(bars[S]['t'], ET).strftime('%H:%M'),
                   mae_points=round(mae, 4), used_candles=len(use), gate_0_35=gate,
                   runner_up=dict(bar_minutes=runner[1], start_bar=runner[2], mae_points=round(runner[0], 4)),
                   best_per_bar_size={str(m): dict(start_bar=min(f for f in fits if f[1] == m)[2], mae=round(min(f for f in fits if f[1] == m)[0], 4))
                                      if any(f[1] == m for f in fits) else 'fewer bars than candles' for m in (1, 2, 3, 5, 10, 15)}),
    candles=cands, bubble_rows=rows_out, trade_marks=marks,
    line_columns=len(line_y), dots={e: len(v) for e, v in dots.items()},
)
print(json.dumps(out, indent=1, default=float))

dbg = os.environ.get('DEBUG')
if dbg:
    im = Image.open(png).convert('RGB'); d = ImageDraw.Draw(im)
    for x, y in line_y.items(): d.point((x, y), fill=(0, 255, 0))
    colours = dict(E1=(255, 0, 0), E2=(255, 128, 0), E3=(0, 200, 255), E4=(255, 0, 255))
    for e, ds in dots.items():
        for x, y, n in ds: d.ellipse((x - 3, y - 3, x + 3, y + 3), outline=colours[e])
    for c in cands:
        col = (255, 60, 60) if c['flags'] else (60, 255, 60)
        d.line((c['cx'], c['hi_y'] - 8, c['cx'], c['hi_y'] - 3), fill=col, width=2)
        d.line((c['cx'], c['lo_y'] + 3, c['cx'], c['lo_y'] + 8), fill=col, width=2)
        d.text((c['cx'] - 6, 1480 + (c['k'] % 3) * 14), str(c['k']), fill=(200, 200, 200))
    im.save(os.path.join(dbg, 'measure-overlay.png'))
