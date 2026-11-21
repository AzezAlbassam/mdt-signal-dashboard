# Latest N-PORT holdings of a fund from SEC. Usage: SEC_USER_AGENT=... python3 -I nport.py mf.json SMH [SOXX ...]
# mf.json = https://www.sec.gov/files/company_tickers_mf.json. Prints one JSON line per fund.
import json,sys,re,time,urllib.request,os,xml.etree.ElementTree as ET
UA=os.environ['SEC_USER_AGENT']
def get(u):
    time.sleep(0.2); return urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':UA}),timeout=60).read()
d=json.load(open(sys.argv[1])); f=d['fields']; bysym={r[f.index('symbol')]:r for r in d['data']}
for sym in sys.argv[2:]:
    r=bysym.get(sym)
    if not r: print(json.dumps({'fund':sym,'err':'not in SEC fund list'})); continue
    cik,sid=r[0],r[1]
    atom=get(f'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={sid}&type=NPORT-P&dateb=&owner=include&count=10&output=atom').decode()
    acc=re.search(r'<accession-number>([^<]+)',atom); filed=re.search(r'<filing-date>([^<]+)',atom)
    if not acc: print(json.dumps({'fund':sym,'series':sid,'err':'no NPORT-P'})); continue
    x=ET.fromstring(get(f'https://www.sec.gov/Archives/edgar/data/{cik}/{acc.group(1).replace("-","")}/primary_doc.xml'))
    ns={'n':x.tag.split('}')[0][1:]}
    t=lambda e,p:(e.findtext(p,namespaces=ns) or '').strip()
    hold=[]
    for e in x.iterfind('.//n:invstOrSec',ns):
        idf=e.find('n:identifiers',ns); ids={}
        if idf is not None:
            for c in idf: ids[c.tag.split('}')[1]]=c.get('value')
        hold.append({'name':t(e,'n:name'),'title':t(e,'n:title'),'cusip':t(e,'n:cusip'),'isin':ids.get('isin'),'ticker':ids.get('ticker'),
                     'pct':float(t(e,'n:pctVal') or 0),'usd':float(t(e,'n:valUSD') or 0),'asset':t(e,'n:assetCat'),'country':t(e,'n:invCountry')})
    print(json.dumps({'fund':sym,'series':sid,'filed':filed.group(1),'as_of':t(x,'.//n:repPdDate'),'net_assets':float(t(x,'.//n:netAssets') or 0),'holdings':hold}))
