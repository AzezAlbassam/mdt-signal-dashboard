import sys
from PIL import Image
src, x, y, w, h = sys.argv[1], *map(int, sys.argv[2:6]); z = float(sys.argv[6]) if len(sys.argv) > 6 else 2
im = Image.open(src).crop((x, y, x + w, y + h)); im = im.resize((int(w * z), int(h * z)), Image.LANCZOS)
f = src.replace('.png', f'.z{x}_{y}.png'); im.save(f); print(f)
