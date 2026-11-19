# The latest videos of a YouTube channel from its public RSS feed (title, date, description with the
# uploader's own chapter times). Video pages and captions are blocked for this cloud session; the feed is not.
#   python3 -I scripts/ideas/yt-feed.py <channel_id> [since YYYY-MM-DD]
# QuMoney (@qumoney89, the owner's favourite channel): UCDJymsvTvznW9kkDiKrgnrw
import sys, urllib.request, xml.etree.ElementTree as ET

cid, since = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else '')
xml = urllib.request.urlopen(f'https://www.youtube.com/feeds/videos.xml?channel_id={cid}', timeout=30).read()
ns = {'a': 'http://www.w3.org/2005/Atom', 'm': 'http://search.yahoo.com/mrss/', 'yt': 'http://www.youtube.com/xml/schemas/2015'}
for e in ET.fromstring(xml).findall('a:entry', ns):
    day = e.find('a:published', ns).text[:10]
    if day < since:
        continue
    vid = e.find('yt:videoId', ns).text
    views = e.find('m:group/m:community/m:statistics', ns)
    print(f"== {day} https://youtu.be/{vid} views={views.get('views') if views is not None else '?'}")
    print(e.find('a:title', ns).text)
    print((e.find('m:group/m:description', ns).text or '').strip()[:1500], '\n')
