# Cards for the tweets (owner picked the "paper" template on 2026-11-11)

- `portfolio.html?k=port`: trades card (open position, closed trades). `?k=perf`: performance line.
  The trades, weights, dates and the daily curve are written in the file; update them for each portfolio update.
- `templates.html?t=A|B|C|D&k=chart|port`: the four templates shown to the owner; B (paper) is the one in use.
- `node scripts/cards/render.cjs <out-dir>` writes port.png and perf.png (1080x1350 at 2x).
- Footer: X logo + @AzizzUnited, no data-source line on the image. Numbers are fetched the same day and recorded in the tweet doc facts.
