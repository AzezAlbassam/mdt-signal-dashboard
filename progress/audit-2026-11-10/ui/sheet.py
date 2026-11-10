import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f) for f in files]
W = sum(i.size[0] for i in ims) + 8 * (len(ims) - 1); H = max(i.size[1] for i in ims)
m = Image.new('RGB', (W, H), (255, 0, 255)); x = 0
for i in ims: m.paste(i, (x, 0)); x += i.size[0] + 8
m.save(out); print(out, m.size)
