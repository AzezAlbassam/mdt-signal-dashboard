# Public likes and replies of X posts, from X's embed endpoint (no login, no API key). It does not give views
# or reposts; those stay manual. Needs the host cdn.syndication.twimg.com allowed in the environment.
#   python3 -I scripts/ideas/x-counts.py <tweet url or id> ...   -> one JSON line per post
import json, re, sys, time, urllib.request

for arg in sys.argv[1:]:
    m = re.search(r'(\d{15,})', arg)
    if not m:
        continue
    tid = m.group(1)
    req = urllib.request.Request(f'https://cdn.syndication.twimg.com/tweet-result?id={tid}&lang=en&token=4', headers={'User-Agent': 'Mozilla/5.0'})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=20))
        print(json.dumps({'id': tid, 'likes': d.get('favorite_count'), 'replies': d.get('conversation_count'), 'created_at': d.get('created_at')}))
    except Exception as e:  # deleted, protected, or the host refused
        print(json.dumps({'id': tid, 'error': str(e)[:120]}))
    time.sleep(1)
