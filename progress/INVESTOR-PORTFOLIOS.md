# Investor portfolios (versioned prompt)

The scheduled task «محافظ المستثمرين» (daily 23:53 Riyadh, bound to the audit session, which has this repository and
the card renderer) sends a pointer to this file. Change the steps here.
2026-11-27: the donut card is the default (owner); the text follows his own short edit; cards stay PNG.
2026-11-26: created. Owner: «فكرة نظيف محافظ كبار المستثمرين بس تكون بنفس تصميمنا بالضبط … تتاكد ١٠٠٪ من دقتها وفي
نفس اليوم نغرد فيها ما نتاخر». First post written by hand the same day: tweets/2026-11-26-burry.

2026-11-27 (owner): every post is checked by two independent verifier subagents before it is saved or sent.
---

Daily run: if a famous investor disclosed his portfolio today, draft a post with the holdings card the same day. Nobody
is watching: do not ask questions. Do NOT post on X. Most days nothing is disclosed: then reply in one line.

1. D = today's date in Asia/Riyadh. In /home/user/mdt-signal-dashboard: B=claude/tradingview-analysis-indicator-oc7eqv;
   `git fetch -q origin $B && git merge -q --no-edit origin/$B`. Load ArtifactData and WebSearch with ToolSearch, and
   TradingView's get-news and get-news-story ("+Trading_view news"). Read meta/positions and meta/style of the tweets page
   https://claude.ai/artifact/HxfJc8duiX3H6fcVbp6HNY, and the tweets docs of the last 14 days.
2. Look for a disclosure in the last 24 hours:
   a. 13F at the SEC (always on and after the deadlines: 14 Feb, 15 May, 14 Aug, 14 Nov, or the next business day; any
      day otherwise, they can file early): `curl -s -H "User-Agent: $SEC_USER_AGENT" https://data.sec.gov/submissions/CIK<cik>.json`
      for Berkshire Hathaway 0001067983, Pershing Square 0001336528, Duquesne Family Office 0001536411, Appaloosa
      0001656456, Baupost 0001061768, Himalaya Capital 0001709323, ARK 0001697748. A 13F-HR filed today or yesterday counts.
   b. The investor's own post (Burry's Substack Cassandra Unchained, Ackman on X, Buffett's letter): WebSearch (mode
      standard, up to 3 queries, e.g. "Michael Burry portfolio <month day>") and get-news. It counts only when two
      independent outlets report it; read at least one in full (get-news-story on the Seeking Alpha or Reuters item).
   If nothing new, or a tweets doc of the last 14 days already covers it: reply «ما فيه محافظ جديدة اليوم» and stop.
3. The facts, only what the source states:
   - 13F: download the filing's information table (the filing index at https://www.sec.gov/Archives/edgar/data/<cik>/<accession without dashes>/
     lists it), sum value by issuer, take the top positions by value and their share of the 13F total, and compare with the
     previous 13F (new, sold out, added, cut by more than 20%). Say it covers US-listed holdings at the quarter's end and is
     filed up to 45 days later.
   - Own post: the holdings and actions as reported, with no weights unless the source gives them.
   Never fill a gap from memory; if a part cannot be confirmed, leave it off the card and say so in checked.
4. The card (the owner, 2026-11-27, on the first one: «العجله مع النسب وشعار كل شركة اجمل وابسط»): kind "donut" like
   data/sample-tepper-donut.json, the top 6 holdings by weight with their logos and a grey «الباقي» slice, the investor's name and
   «الباقي» = 100 minus the UNROUNDED top six (never 100 minus rounded figures), number of holdings in the sub line, and the investor's REAL photo in the centre (the owner, 2026-11-27: «ابي صورته الصدقية»):
   a freely licensed photo from Wikimedia Commons (search the File namespace, read its licence with prop=imageinfo&iiprop=extmetadata,
   download the original from upload.wikimedia.org once into scripts/cards/sketch/photos/<name>.jpg), set center.photo, center.focus
   (the face's position) and center.credit «Photo: <author>, <licence>, Wikimedia Commons». No free photo: a news photo with its
   source on the card (the owner's choice, 2026-11-27: «صورة من الأخبار مع المصدر»): a news or markets account's post on X
   about him (WebSearch with allowed_domains ["x.com"], then the syndication URL; the photo is on pbs.twimg.com, add ?name=large),
   LOOK to be sure it is him, crop square around the face into photos/<name>.jpg, and credit the photographer and outlet
   as the post gives them (e.g. «Photo: Scott Mlyn | CNBC»). Never an AI image. EVERY investor card has his photo: the
   owner, 2026-11-27: «مب قلنا تظيف صوره اي واحد ننزل محفظته». Use it whenever the source gives weights (a 13F always does). Only when no weights are
   published, fall back to kind "holdings" like data/2026-11-26-burry.json
   (tag with the investor's name and best-known label, a title that says the one thing that changed, hero = one number
   from the source such as cash share or the top position's weight, groups such as «أكبر مراكزه», «جديد», «باع»,
   «قلّل»; for a 13F with weights, put the weight in the item's t, e.g. "AAPL 22%"). Logos: the logoid from TradingView
   (get-news relatedSymbols, or the company's name in kebab case), saved once as scripts/cards/sketch/logos/<logoid>.svg
   from https://s3-symbol-logo.tradingview.com/<logoid>--big.svg. Render with
   `NODE_PATH=$(npm root -g) node scripts/cards/sketch/render-sketch.cjs <data> <out.png>`, LOOK at it, fix anything cut or
   crowded (fewer items per group, or a `pair`), keep it as the PNG (never convert to JPEG: X recompresses it and a JPEG is compressed twice) and upload it with the Artifact tool
   (url = the page, asset: true).
5. The text, written the way the owner cut the first one himself (2026-11-27, tweets/2026-11-27-tepper): 3-4 short lines of
   facts only, every stock as its ticker in Latin letters (MU, AVGO), never its Arabic name: who and his top position with its weight and what he did with it, the biggest other change, what he sold
   out of, and «ترا هذي محفظته نهاية <month>، وأعلنها يوم <filing date>» for a 13F. No opinion line, no question, no
   emoji, no disclaimer. Real Saudi dialect. Never contradict meta/positions or mock a stock he holds. Every claim in
   facts with its source; re-read every ticker and name against the facts before saving (a held stock must never appear
   as sold).
5b. TWO-VERIFIER CHECK (the owner, 2026-11-27: «قبل ترسلي اي تغريده فيه اكثر من موظف يتاكد من دقه كل معلومه»): before saving or sending ANY post, start at least two verifier subagents with the Agent tool, in parallel and independent of each other. Give each only: the final text, the card's data file (or every number and name on each image), the facts with their sources, and the earlier posts the text refers to. Each must (1) re-fetch every number, name, ticker and date from the primary source itself (SEC filing, TradingView, the outlet), not from the facts; (2) check every line of the text against the image and against the other lines (a stock shown as held must never also appear as sold; a date word such as «أمس» must match today in Riyadh); (3) try to refute each claim and return a list: claim, verdict (confirmed / wrong / cannot verify), the correct value and its source. Fix everything any verifier marks wrong, drop or reword anything that cannot be verified, and if a fix changes a number or a name, run both verifiers again. Save only when both confirm every claim; put their verdicts in the doc's `checked` field, and say in the reply that two verifiers confirmed it.
6. Save tweets/<D>-inv (status draft, family "investor-portfolios", idea, idea_sentence, stance_check, title, text,
   tickers, facts, photos, links [], createdAt, checked). Commit and push the data file and new logos («Card data: …» with
   the session's trailers).
7. Reply in Saudi dialect: who and what changed in one line, the text in a code block, the page link.
