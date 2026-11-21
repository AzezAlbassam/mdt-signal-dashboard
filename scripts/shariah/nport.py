# Latest N-PORT holdings of each fund, from SEC.
#   SEC_USER_AGENT="Name email" python3 -I scripts/shariah/nport.py <company_tickers_mf.json> <FUND ...>  > nport-latest.jsonl
# company_tickers_mf.json = https://www.sec.gov/files/company_tickers_mf.json. One JSON line per fund:
# {fund, series, cik, accession, filed, as_of, net_assets, holdings:[{name, title, lei, cusip, isin, ticker, pct, usd,
#   balance, units, cur, asset, issuer, country, collateral, on_loan}]} or {fund, err}.
import json, re, sys, time, urllib.request, os, xml.etree.ElementTree as ET

UA = os.environ['SEC_USER_AGENT']
def get(u):
    for i in range(3):
        try:
            time.sleep(0.2)
            return urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA}), timeout=60).read()
        except Exception:
            if i == 2: raise
            time.sleep(2 + 3 * i)

d = json.load(open(sys.argv[1])); f = d['fields']; bysym = {r[f.index('symbol')]: r for r in d['data']}
for sym in sys.argv[2:]:
    r = bysym.get(sym)
    if not r: print(json.dumps({'fund': sym, 'err': 'not in SEC fund list'})); continue
    cik, sid = r[0], r[1]
    try:
        atom = get(f'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={sid}&type=NPORT-P&dateb=&owner=include&count=10&output=atom').decode()
        acc = re.search(r'<accession-number>([^<]+)', atom); filed = re.search(r'<filing-date>([^<]+)', atom)
        if not acc: print(json.dumps({'fund': sym, 'series': sid, 'err': 'no NPORT-P'})); continue
        x = ET.fromstring(get(f'https://www.sec.gov/Archives/edgar/data/{cik}/{acc.group(1).replace("-", "")}/primary_doc.xml'))
    except Exception as e:
        print(json.dumps({'fund': sym, 'series': sid, 'err': f'fetch failed: {str(e)[:80]}'})); continue
    ns = {'n': x.tag.split('}')[0][1:]}
    t = lambda e, p: (e.findtext(p, namespaces=ns) or '').strip()
    num = lambda s: float(s) if re.fullmatch(r'-?\d+(\.\d+)?([eE]-?\d+)?', s or '') else None
    hold = []
    for e in x.iterfind('.//n:invstOrSec', ns):
        ids = {}
        idf = e.find('n:identifiers', ns)
        if idf is not None:
            for c in idf: ids[c.tag.split('}')[1]] = c.get('value')
        sl = e.find('n:securityLending', ns)
        flags = {c.tag.split('}')[1]: (c.text or '').strip() for c in sl} if sl is not None else {}
        hold.append({'name': t(e, 'n:name'), 'title': t(e, 'n:title'), 'lei': t(e, 'n:lei'), 'cusip': t(e, 'n:cusip'),
                     'isin': ids.get('isin'), 'ticker': ids.get('ticker'), 'pct': num(t(e, 'n:pctVal')), 'usd': num(t(e, 'n:valUSD')),
                     'balance': num(t(e, 'n:balance')), 'units': t(e, 'n:units'), 'cur': t(e, 'n:curCd'), 'asset': t(e, 'n:assetCat'),
                     'issuer': t(e, 'n:issuerCat'), 'country': t(e, 'n:invCountry'),
                     # cash collateral from securities lending is reported either as a Y flag or as a condition block
                     'collateral': flags.get('isCashCollateral') == 'Y' or 'cashCollateralCondition' in flags,
                     'on_loan': flags.get('isLoanByFund') == 'Y'})
    print(json.dumps({'fund': sym, 'series': sid, 'cik': cik, 'accession': acc.group(1), 'filed': filed.group(1),
                      'as_of': t(x, './/n:repPdDate'), 'net_assets': num(t(x, './/n:netAssets')), 'holdings': hold}), flush=True)
