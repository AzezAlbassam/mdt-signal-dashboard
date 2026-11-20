# X stats task (for a Claude session on the owner's iMac, with Claude in Chrome)

A cloud session cannot open x.com (blocked, and it has no login). A Claude session on the owner's iMac with the
Claude in Chrome extension can, using his own signed-in Chrome. Run this as a scheduled task there (every 2 days).

---

Open x.com/AzizzUnited in Chrome (Claude in Chrome, a new tab). For every post of the last 14 days, read its link,
views, likes, reposts and replies from the post itself (open the post if the timeline hides a number). Then open the
tweets page https://claude.ai/artifact/HxfJc8duiX3H6fcVbp6HNY database (ArtifactData, collection "tweets"): match each
post to the doc whose text it starts with (the first line is enough), and update that doc with
perf {url, views, likes, reposts, replies, at: now} and status "posted" (pin every write with if_version). Posts with no
matching doc: list them in the reply, do not create docs. Do not like, reply, follow or post anything on X.
Finish with a short table in Saudi dialect: post, views, likes.
