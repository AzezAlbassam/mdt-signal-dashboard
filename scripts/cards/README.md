# Cards for the tweets (owner picked the "paper" template on 2026-11-11)

- `portfolio.html?k=port`: trades card (open position, closed trades). `?k=perf`: performance line.
  The trades, weights, dates and the daily curve are written in the file; update them for each portfolio update.
- `templates.html?t=A|B|C|D&k=chart|port`: the four templates shown to the owner; B (paper) is the one in use.
- `node scripts/cards/render.cjs <out-dir>` writes port.png and perf.png (1080x1350 at 2x).
- Footer: X logo + @AzizzUnited, no data-source line on the image. Numbers are fetched the same day and recorded in the tweet doc facts.

## New identity for portfolio cards (owner, 2026-11-21: new colours, font and design, nothing like the beige card)
- `portfolio-update.html?theme=a|b|c`: one data-driven card. A = Midnight (flat navy, mint, Readex Pro),
  B = Coastal (light, teal band, ticker badges, Alexandria), C = Forest (deep green, lime, Tajawal + Big Shoulders
  Display, the total as the hero). 3-4 positions fill the card; 5+ switch to compact rows.
- `node scripts/cards/render-portfolio.cjs <theme> <out.png> [data.json]` (data shape = the default in the HTML:
  pill, title {pre, em, post}, sub, rows [{t, name, kind new|add|trim|exit, big, bl, note}], total {label, value},
  date). It fails on page errors, fonts that did not load, or anything outside the card.
- The owner picks one theme; it then becomes the only one used for his portfolio updates.
