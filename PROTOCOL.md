# Forward test of @zero_en3kas — pre-registered protocol

**Written 2026-09-17, before a single call was logged.** Nothing in this document may be
changed once logging starts. If something here turns out to be badly chosen, the fix is to
say so in the results and run a second, separate test — not to edit this file.

That rule is the entire point. Deciding what counts as a hit *after* seeing the outcome is
how every trading record in existence gets to be 90% accurate.

---

## 1. The question

He states a 90–100% accuracy rate. Establishing 90% against a 40% break-even takes
**5 calls made in advance** (`engine/power.js`). His 98 public posts from 2021–2025 contain
**2**. The claim has never been tested. This tests it.

**Null hypothesis:** his forward calls resolve no better than levels placed at random the
same distance away, i.e. the hit rate is indistinguishable from the null model already
implemented in `engine/null-models.js`.

**What would falsify it:** a hit rate whose 95% Wilson interval sits entirely above the
matched null's rate.

---

## 2. What gets logged

Every public post from the account during the window, regardless of content. Not a
selection — the rate of each class is itself a finding.

Each entry records the **verbatim text**, the post's timestamp, its id, and a
classification with a written reason. Raw text is kept so every judgement can be
re-examined, including by someone who disagrees with it.

### Classes (exactly four)

| class | definition |
|---|---|
| `forward_call` | Names an instrument **and** a level or direction **and** refers to a future time. The outcome must not yet be knowable when posted. |
| `retrospective` | A chart marked up after the move, or a claim about what already happened. Not scoreable. |
| `promo` | Course, indicator, channel, or subscription content. |
| `ambiguous` | Anything that cannot be assigned to the above without guessing. |

**The hard rule:** if a post could be read as either forward or retrospective, it is
`ambiguous`. Ambiguous posts are excluded from the primary score and **reported as a
count**. That count matters: a record made mostly of unfalsifiable posts is itself the
answer, whatever the hit rate on the rest.

Classification happens **before** the outcome is known, and the log records the timestamp
of classification separately from the post's own timestamp.

---

## 3. How a call is scored

Fixed thresholds, identical to those used elsewhere in this repo so his live calls and his
backtested rules face one standard:

| parameter | value |
|---|---|
| horizon | **5 trading sessions** from the post |
| touch | price trades within **0.1%** of the level |
| reversal | penetration **≤ 0.5%** and excursion **≥ 1.0%** within 5 sessions of the touch |

These implement his own words — *"زيرو انعكاس ومن أول لمسة"*, zero reversal from the first
touch — rather than a looser "price went near it eventually."

### Outcomes

- **hit** — every level in the call was touched and reversed
- **partial** — some but not all
- **miss** — horizon elapsed with none reversed
- **unresolved** — horizon still open
- **not_scored** — not a forward call

A `partial` is never rounded up. A call naming three levels where one works is not a
success; that is how a scattergun becomes a 90% record.

If he states his own stop and target, those are used instead and the fact is recorded.

---

## 4. The benchmark

A hit rate alone cannot settle anything — any level in a moving market gets touched. Each
resolved call is therefore also scored against a **matched null**: the same instrument, the
same session, the same distance from spot, the level displaced at random on the same side
(`engine/null-models.js`). The comparison is his rate against that rate, with a 95% Wilson
interval on both.

---

## 5. Stopping rule

Fixed in advance so the test cannot be stopped at a flattering moment.

- Run for **30 calendar days** from the first logged post.
- At the end, report whatever there is — including "too few forward calls to score", which
  is a legitimate and informative result.
- If **5 or more** forward calls resolve before day 30, the 90% claim is already testable
  and the interim result is reported then. The log still runs to day 30.
- The test is **not** extended because the answer is unwelcome, and **not** cut short
  because it is welcome.

---

## 6. Known limitations, stated now rather than discovered later

1. **I cannot read his account automatically.** X returns HTTP 402 to `WebFetch`; the
   public embed endpoint is rate-limited and serves a cached, months-stale sample (its
   newest entry was 2025-09-24 while he was posting through 2026). Paginating his timeline
   with rotating guest tokens would circumvent X's access controls and is not being done.
   **The posts must be pasted in by hand.** This is the one manual step.
2. **Selection bias is the main threat, and it now runs through a human.** Whoever pastes
   the posts decides what gets logged. Mitigation: paste *everything* from the account in
   the window, not the interesting ones — and the `promo`/`retrospective` counts in the
   final table are the check on whether that happened.
3. **Price data is SPX daily only** on the current plan. Calls on Bitcoin, gold, TASI or
   individual stocks can be logged and classified but **not resolved**, and are reported
   as such. Intraday calls cannot be resolved at their own granularity.
4. **30 days is enough to test a 90% claim and nowhere near enough to test a real edge.**
   A 50% edge needs 151 calls. Nothing here can establish a small edge; it can only
   establish whether the large claim survives.
5. **Discretionary skill is not tested.** If his edge is judgement rather than rules, a
   forward log of his published calls measures the published calls — which is all anyone
   paying 450 SAR can act on anyway.

---

## 7. What gets published

`forward-log/calls.json` — every entry, verbatim, committed to git so the history is
tamper-evident. Each commit is a timestamp no one can backdate.

At day 30: the counts by class, the resolved hit rate with its interval, the matched null's
rate, and the verdict — including "not enough evidence", which remains the most likely
outcome and is not a failure of the test.
