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

## The hand-drawn card: the design in use (2026-11-25)

The owner's design for EVERY designed image since 2026-11-25: marker and crayons on a ruled notebook page (ivory paper, printed blue lines, a red margin), the stocks' logos in
colour, and ONE doodle top-left of what the company makes (he picked option A of three, asked for the logos, then on
2026-11-25 had the pencil mascot, stars and planet removed: «ما لهم علاقة»; nothing unrelated to the stock is drawn). The one exception is the broker-style performance image of the
portfolio update, which stays as it is. Forest (`portfolio-update.html`) and the beige paper template are retired.

    node scripts/cards/sketch/render-sketch.cjs scripts/cards/sketch/data/story-nvda.json out.png

- Layouts (`kind` in the data file): `story` (a hero number and up to four rows: a stock's story, or the portfolio's
  trades card), `bars` (few bars, one highlighted, an optional callout sticker), `line` (one price or series line with
  marked points). 1080x1350.
- Logos: `logo` on the card and on each row is a TradingView logoid (the news tool's relatedSymbols carry it). Save it
  once: `curl -s -o scripts/cards/sketch/logos/<logoid>.svg https://s3-symbol-logo.tradingview.com/<logoid>--big.svg`.
  A stock is shown with its logo beside its ticker, never by name alone.
- The doodle: `icon` in the data file, by what the company makes: `chip` (Nvidia, AMD), `memory` (Micron, SK Hynix: an
  HBM stack), `storage` (SanDisk), `server` (Nebius, CoreWeave: cloud and AI data centres), `rocket` (Rocket Lab,
  SpaceX), `ai` (Anthropic, AI software), `metal` (gold, silver, miners), `market` (an index or the whole market),
  `wallet` (his own portfolio). `data/icons.json` renders them all. A company none of them fits gets a NEW doodle
  (add a function to DOODLE in sketch.html, same style: ink outline, crayon fill), never an unrelated one; with no
  `icon` the corner stays empty.
- Line marks carry `dx`, `dy` (where the label sits from its point), `arrow` and `patch`: the renderer checks overflow,
  not overlaps, so LOOK at the render and move a label that sits on the line or on another label.
- A row gets a small up or down arrow only with `arrow`, for values that are moves (not for a position's size).
- `rough.js` is roughjs 4.6.6 (MIT), vendored so a render needs no install. Every number on a card is in the post's facts.
