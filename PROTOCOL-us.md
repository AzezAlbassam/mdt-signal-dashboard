# Study 2 — the US market, all sectors: pre-registered protocol

**Written 2026-10-07, before any price series for this universe was downloaded.** Study 1
(`PROTOCOL-swing.md`, results in `reports/swing-*.txt`) is finished and stays as it is.
This is the "second, separately labelled run" that study 1's protocol provides for. Nothing
here changes after results exist. A bug found later is fixed, marked post-hoc, and shown
with the numbers before and after.

> **بالعربي:** الدراسة الثانية على السوق الأمريكي بكل قطاعاته. نفس قواعد الدراسة الأولى
> حرفياً (المؤشرات، الدخول، الخروج، الفترات، المقاييس)، والفرق الوحيد هو قائمة الأسهم،
> وتُختار بقاعدة آلية لا باليد. أهم سؤال فيها: هل اختراق كيلتنر (المثبت في الدراسة الأولى)
> ينجح على مئات الأسهم التي لم يرها من قبل؟ هذا اختبار تأكيدي حقيقي، لأن النتيجة لا يمكن
> أن تكون قد أثّرت في اختيار هذه الأسهم.

---

## 1. Questions

**H1 — confirmatory (one test, no multiplicity correction).** Study 1 found one robust rule:
`keltner_break` in Track A. On stocks it has never been tested on, is its Period II edge
over random entry positive?

- Sample: the study 2 universe **minus** every symbol used in study 1 (the 20 US stocks and
  SPY, QQQ, IWM).
- Test: the same permutation test as study 1 (2,000 draws), one-sided, **p < 0.05**.
- Confirmed if p < 0.05 **and** edge > 0. Anything else is reported as "not confirmed",
  including a positive edge with p ≥ 0.05.

**H2 — replication (exploratory).** The full study 1 ranking (Tracks A, B, C, all 33 / 33 /
19 rules) rerun on this universe, with study 1's labels and Holm correction.

**H3 — sectors (descriptive only).** Every rule's edge by TradingView sector. 33 rules × ~20
sectors is ~660 cells; about 33 will look significant at 5% by chance. **No sector claim is
made from this table**; it exists so a reader can see where a rule's edge comes from.

---

## 2. Universe — a mechanical rule, applied to one screener snapshot

From the TradingView screener (`market: america`, `symbol_types: ["stock"]`), snapshot
taken 2026-10-07 and committed as `data/us/universe-snapshot.json`:

1. Primary listing on **NYSE, NASDAQ or NYSE American** (prefix `NYSE:`, `NASDAQ:`, `AMEX:`);
   OTC excluded.
2. Ticker contains no `/` (excludes preferred shares) and matches `^[A-Z.]+$`.
3. **Country = United States** (US-domiciled companies; foreign ADRs and cross-listings
   excluded). If the screener cannot filter by country, ADRs are kept and this is reported.
4. **Market cap ≥ $2 billion** at the snapshot.
5. One share class per company: where two tickers carry the same company description, the
   one with the larger 10-day average volume is kept.

Plus a fixed list of **20 ETFs** for sector and theme coverage (group `etf`):
SPY, QQQ, IWM, DIA, XLK, XLF, XLE, XLV, XLI, XLY, XLP, XLU, XLB, XLRE, XLC, ITA (aerospace &
defense), UFO (space), SMH (semiconductors), XBI (biotech), XOP (oil & gas producers).

Space and aerospace companies enter through rule 4 like everything else; none is added by
hand. Whatever the rule produces is the universe. A symbol the connector cannot serve is
dropped and listed.

**Survivorship bias** is larger here than in study 1: the list is today's ≥ $2B companies.
Rules are judged against random entry on the same symbols, which cancels most of it, but
buy-and-hold in Track C is flattered. Stated now.

---

## 3. Everything else is study 1, unchanged

Indicators and settings (§7), tracks A/B/C with their stops, targets and horizons (§5),
costs (0.10% per side), stop-first on ambiguous bars, next-open entries, periods (I before
2018-01-01, II from 2018-01-01), metrics, permutation and circular-shift nulls, Holm within
each track, verdict labels, the 100-trade "Thin" floor — all exactly as in
`PROTOCOL-swing.md`, using the same code (`engine/indicators.js`, `engine/swing.js`).

Data: daily bars, one page of up to 5,000 per symbol, ending at the last **completed**
session on or before **2026-10-06**; weekly bars built from them as in study 1.

Group labels for breakdowns: TradingView `sector` for stocks, `etf` for the fund list.

---

## 4. Working method (so the study survives session limits)

- Progress is recorded in `progress/US-STUDY.md` and committed after every step and every
  data batch. A new session resumes from that file.
- Downloaded bars are committed as `data/us/bars/<EXCHANGE>_<TICKER>.json.gz`. A symbol with
  a file is never fetched again, so a resumed fetch only does what is missing.
- No result is computed until every symbol is fetched or dropped. The fetch order is the
  universe file's order (market cap, descending) and has no influence on the results.

---

## 5. Output

- `reports/us-A.txt`, `us-B.txt`, `us-C.txt`, `us-H1.txt`, `us-sectors.txt`
- `us.html` — Arabic findings page, generated from `reports/us-results.json`.
- Current signals for the rules labelled Robust, with entry, stop and target, as of the last
  completed session.
