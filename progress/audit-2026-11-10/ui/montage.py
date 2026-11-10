# Splits a tall screenshot into side-by-side columns so it can be read at native scale.
import sys
from PIL import Image
src, colh, maxcols = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1500, int(sys.argv[3]) if len(sys.argv) > 3 else 4
im = Image.open(src); w, h = im.size
n = -(-h // colh); out = []
for start in range(0, n, maxcols):
    cols = min(maxcols, n - start)
    m = Image.new('RGB', (cols * (w + 8), min(colh, h)), (255, 0, 255))
    for i in range(cols):
        y = (start + i) * colh
        m.paste(im.crop((0, y, w, min(h, y + colh))), (i * (w + 8), 0))
    f = src.replace('.png', f'.m{start // maxcols + 1}.png'); m.save(f); out.append(f)
print(h, ' '.join(out))
