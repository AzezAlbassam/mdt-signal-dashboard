# Cards for the tweets

**Design in use for EVERY designed image: identity C "Forest" (owner, 2026-11-24: «مب قلنا غيرنا تصميم صورنا؟»).** The beige
"paper" template below is retired for new images; its files stay for the history. Render any card with
`node scripts/cards/render-portfolio.cjs <out.png> scripts/cards/data/<date>-<name>.json` (data: pill, title {pre, em,
post}, sub, rows [{t, name, kind, tag, big, bl, note}], total {label, value}, foot). Example:
`data/2026-11-24-nvidia-return.json`.

## Retired: the "paper" template (owner's pick on 2026-11-11, replaced on 2026-11-21/24)

- `portfolio.html?k=port`: trades card (open position, closed trades). `?k=perf`: performance line.
  The trades, weights, dates and the daily curve are written in the file; update them for each portfolio update.
- `templates.html?t=A|B|C|D&k=chart|port`: the four templates shown to the owner; B (paper) is the one in use.
- `node scripts/cards/render.cjs <out-dir>` writes port.png and perf.png (1080x1350 at 2x).
- Footer: X logo + @AzizzUnited, no data-source line on the image. Numbers are fetched the same day and recorded in the tweet doc facts.

## Portfolio cards: identity C "Forest" (owner, 2026-11-21: "this design from today on"; nothing like the beige card)
- `portfolio-update.html`: one data-driven card. Deep green, lime accent, Tajawal for Arabic and Big Shoulders Display
  for tickers and numbers, the portfolio's total return as the hero, positions as a ruled list, tags by action
  (new lime, add aqua, trim amber, exit coral). 3-4 positions fill the card; 5+ switch to compact rows. Options A and
  B are in git history (commit f67e3e5).
- `node scripts/cards/render-portfolio.cjs <out.png> [data.json]` (data shape = the default in the HTML: pill,
  title {pre, em, post}, sub, rows [{t, name, kind new|add|trim|exit, big, bl, note}], total {label, value}, date).
  It fails on page errors, a font that did not load, or anything outside the card.
- Use it for every portfolio update the owner sends; the old portfolio.html / fund-1120.html / avgdown.html paper
  cards are retired for his portfolio.
